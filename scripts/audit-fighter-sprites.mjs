// Auditoria dos PNGs e do contrato real usado por manifest/preload/Phaser.
// Uso: node scripts/audit-fighter-sprites.mjs [--json]
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { createServer } from 'vite';

const ROOT = new URL('../', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1');

const FIGHTER_NAMES = {
  'rafa-mare': 'Rafa Maré',
  'guto-barba': 'Guto Barba',
};

function cleanAssetPath(path) {
  return path.split(/[?#]/, 1)[0];
}

async function loadFighterManifest() {
  const vite = await createServer({
    root: ROOT,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false },
  });

  try {
    const visual = await vite.ssrLoadModule('/src/fighters/visual/index.ts');
    const contract = await vite.ssrLoadModule('/src/assets/spriteSheetContract.ts');
    return visual.FIGHTER_SPRITE_ASSETS.map((fighter) => ({
      id: fighter.fighterId,
      frameWidth: fighter.frameWidth,
      frameHeight: fighter.frameHeight,
      files: [...Object.values(fighter.animations), ...fighter.effects].map((sheet) => {
        const publicPath = cleanAssetPath(sheet.path);
        return {
          ...sheet,
          publicPath,
          file: basename(publicPath),
          preload: {
            method: 'spritesheet',
            ...contract.spriteSheetPreloadConfig(sheet),
          },
          phaserAnimationKey: contract.phaserAnimationKey(sheet.key),
        };
      }),
    }));
  } finally {
    await vite.close();
  }
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error('Assinatura PNG inválida');

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }
  if (bitDepth !== 8) throw new Error(`Bit depth não suportado: ${bitDepth}`);
  if (interlace !== 0) throw new Error('PNG entrelaçado não suportado');
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`Color type não suportado: ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4, 255);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const current = Buffer.from(line);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? current[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      switch (filter) {
        case 1: current[x] = (current[x] + left) & 255; break;
        case 2: current[x] = (current[x] + up) & 255; break;
        case 3: current[x] = (current[x] + ((left + up) >> 1)) & 255; break;
        case 4: current[x] = (current[x] + paeth(left, up, upLeft)) & 255; break;
      }
    }
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4;
      const source = x * channels;
      if (colorType === 6) {
        pixels[target] = current[source];
        pixels[target + 1] = current[source + 1];
        pixels[target + 2] = current[source + 2];
        pixels[target + 3] = current[source + 3];
      } else if (colorType === 2) {
        pixels[target] = current[source];
        pixels[target + 1] = current[source + 1];
        pixels[target + 2] = current[source + 2];
      } else if (colorType === 4) {
        pixels[target] = pixels[target + 1] = pixels[target + 2] = current[source];
        pixels[target + 3] = current[source + 1];
      } else {
        pixels[target] = pixels[target + 1] = pixels[target + 2] = current[source];
      }
    }
    previous = current;
  }
  return { width, height, bitDepth, colorType, interlace, pixels };
}

function auditAlpha(image) {
  let transparent = 0;
  let opaque = 0;
  let intermediate = 0;
  for (let index = 3; index < image.pixels.length; index += 4) {
    const alpha = image.pixels[index];
    if (alpha === 0) transparent += 1;
    else if (alpha === 255) opaque += 1;
    else intermediate += 1;
  }
  return { transparent, opaque, intermediate };
}

function frameBounds(sheet, frameIndex) {
  return sheet.layout === 'vertical'
    ? {
        startX: 0,
        endX: sheet.frameWidth - 1,
        startY: frameIndex * sheet.frameHeight,
        endY: (frameIndex + 1) * sheet.frameHeight - 1,
      }
    : {
        startX: frameIndex * sheet.frameWidth,
        endX: (frameIndex + 1) * sheet.frameWidth - 1,
        startY: 0,
        endY: sheet.frameHeight - 1,
      };
}

function frameIsEmpty(image, frameIndex, sheet) {
  const bounds = frameBounds(sheet, frameIndex);
  for (let y = bounds.startY; y <= bounds.endY; y += 1) {
    for (let x = bounds.startX; x <= bounds.endX; x += 1) {
      if (image.pixels[(y * image.width + x) * 4 + 3] > 0) return false;
    }
  }
  return true;
}

function frameBoundaryContacts(image, frameIndex, sheet) {
  const contacts = [];
  const { startX, endX, startY, endY } = frameBounds(sheet, frameIndex);
  const margin = 4;
  const alphaAt = (x, y) => image.pixels[(y * image.width + x) * 4 + 3];

  for (let y = startY; y <= endY; y += 1) {
    if (Array.from({ length: margin }, (_, offset) => startX + offset)
      .some((x) => alphaAt(x, y) > 0)) {
      contacts.push('esquerdo');
      break;
    }
  }
  for (let y = startY; y <= endY; y += 1) {
    if (Array.from({ length: margin }, (_, offset) => endX - offset)
      .some((x) => alphaAt(x, y) > 0)) {
      contacts.push('direito');
      break;
    }
  }
  for (let x = startX; x <= endX; x += 1) {
    if (Array.from({ length: margin }, (_, offset) => startY + offset)
      .some((y) => alphaAt(x, y) > 0)) {
      contacts.push('superior');
      break;
    }
  }
  return contacts;
}

function canonicalVisiblePixels(image) {
  const pixels = Buffer.from(image.pixels);
  for (let index = 0; index < pixels.length; index += 4) {
    // RGB escondido sob alpha zero não muda a arte visível e não pode
    // mascarar uma duplicata exportada por ferramentas diferentes.
    if (pixels[index + 3] === 0) pixels.fill(0, index, index + 3);
  }
  return pixels;
}

function framePixelHash(image, pixels, frameIndex, sheet) {
  const hash = createHash('sha256');
  const { startX, endX, startY, endY } = frameBounds(sheet, frameIndex);
  for (let y = startY; y <= endY; y += 1) {
    const start = (y * image.width + startX) * 4;
    hash.update(pixels.subarray(start, start + (endX - startX + 1) * 4));
  }
  return hash.digest('hex');
}

const FIGHTERS = await loadFighterManifest();
const results = [];
const manifestKeys = new Map();
const manifestPaths = new Map();
const pixelHashes = new Map();

for (const fighter of FIGHTERS) {
  const fighterDirectory = join(ROOT, 'public', 'assets', 'fighters', fighter.id);
  const expectedNames = new Set(fighter.files.map(({ file }) => file));
  const directoryEntries = existsSync(fighterDirectory)
    ? await readdir(fighterDirectory, { withFileTypes: true })
    : [];

  for (const item of directoryEntries) {
    const relative = `public/assets/fighters/${fighter.id}/${item.name}${item.isDirectory() ? '/' : ''}`;
    if (item.isDirectory()) {
      results.push({
        fighter: FIGHTER_NAMES[fighter.id] ?? fighter.id,
        fighterId: fighter.id,
        file: `${item.name}/`,
        path: relative,
        issues: ['SUBPASTA PROIBIDA'],
      });
    } else if (item.name.toLowerCase().endsWith('.png') && !expectedNames.has(item.name)) {
      results.push({
        fighter: FIGHTER_NAMES[fighter.id] ?? fighter.id,
        fighterId: fighter.id,
        file: item.name,
        path: relative,
        issues: ['PNG ANTIGO OU NÃO REGISTRADO'],
      });
    }
  }

  for (const sheet of fighter.files) {
    const relative = `public/${sheet.publicPath}`;
    const absolute = join(ROOT, relative);
    const entry = {
      fighter: FIGHTER_NAMES[fighter.id] ?? fighter.id,
      fighterId: fighter.id,
      file: sheet.file,
      path: relative,
      textureKey: sheet.key,
      layout: sheet.layout,
      frames: sheet.frames,
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight,
      frameRate: sheet.frameRate,
      repeat: sheet.repeat,
      preload: sheet.preload,
      phaserAnimationKey: sheet.phaserAnimationKey,
      issues: [],
    };
    results.push(entry);

    const expectedPrefix = `assets/fighters/${fighter.id}/`;
    if (!sheet.publicPath.startsWith(expectedPrefix)
      || sheet.publicPath.slice(expectedPrefix.length).includes('/')) {
      entry.issues.push('CAMINHO NÃO É PLANO NA PASTA DO PERSONAGEM');
    }
    if (!['horizontal', 'vertical'].includes(sheet.layout)) {
      entry.issues.push(`ORIENTAÇÃO INVÁLIDA: ${String(sheet.layout)}`);
    }
    if (!Number.isInteger(sheet.frames) || sheet.frames <= 0) {
      entry.issues.push(`FRAMES INVÁLIDO: ${String(sheet.frames)}`);
    }
    if (!Number.isInteger(sheet.frameWidth) || sheet.frameWidth <= 0) {
      entry.issues.push(`frameWidth INVÁLIDO: ${String(sheet.frameWidth)}`);
    }
    if (!Number.isInteger(sheet.frameHeight) || sheet.frameHeight <= 0) {
      entry.issues.push(`frameHeight INVÁLIDO: ${String(sheet.frameHeight)}`);
    }
    if (sheet.frameWidth !== fighter.frameWidth || sheet.frameHeight !== fighter.frameHeight) {
      entry.issues.push(
        `METADADO DIVERGE DO FIGHTER: ${sheet.frameWidth}x${sheet.frameHeight} vs ${fighter.frameWidth}x${fighter.frameHeight}`,
      );
    }
    if (!Number.isFinite(sheet.frameRate) || sheet.frameRate <= 0) {
      entry.issues.push(`frameRate INVÁLIDO: ${String(sheet.frameRate)}`);
    }
    if (!Number.isInteger(sheet.repeat) || sheet.repeat < -1) {
      entry.issues.push(`repeat INVÁLIDO: ${String(sheet.repeat)}`);
    }

    const duplicateKey = manifestKeys.get(sheet.key);
    if (duplicateKey) entry.issues.push(`CHAVE DUPLICADA COM ${duplicateKey}`);
    else manifestKeys.set(sheet.key, relative);
    const duplicatePath = manifestPaths.get(sheet.publicPath);
    if (duplicatePath) entry.issues.push(`CAMINHO DUPLICADO COM ${duplicatePath}`);
    else manifestPaths.set(sheet.publicPath, relative);

    if (!existsSync(absolute)) {
      entry.issues.push('ARQUIVO AUSENTE');
      continue;
    }

    let image;
    try {
      image = decodePng(await readFile(absolute));
    } catch (error) {
      entry.issues.push(`PNG INVÁLIDO: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    const alpha = auditAlpha(image);
    entry.width = image.width;
    entry.height = image.height;
    entry.bitDepth = image.bitDepth;
    entry.colorType = image.colorType;
    entry.interlace = image.interlace;
    entry.transparentPixels = alpha.transparent;
    entry.opaquePixels = alpha.opaque;
    entry.intermediatePixels = alpha.intermediate;
    entry.hasTransparency = alpha.transparent > 0 || alpha.intermediate > 0;

    if (!entry.hasTransparency) entry.issues.push('PNG SEM TRANSPARÊNCIA');

    const visiblePixels = canonicalVisiblePixels(image);
    const pixelHash = createHash('sha256').update(visiblePixels).digest('hex');
    const duplicate = pixelHashes.get(pixelHash);
    if (duplicate) entry.issues.push(`ARTE IDÊNTICA A ${duplicate}`);
    else pixelHashes.set(pixelHash, relative);

    const horizontal = sheet.layout === 'horizontal';
    const vertical = sheet.layout === 'vertical';
    const divisibleByFrames = horizontal
      ? image.width % sheet.frames === 0
      : vertical ? image.height % sheet.frames === 0 : false;
    entry.divisibleByFrames = divisibleByFrames;
    entry.physicalFrameWidth = horizontal
      ? (divisibleByFrames ? image.width / sheet.frames : null)
      : image.width;
    entry.physicalFrameHeight = vertical
      ? (divisibleByFrames ? image.height / sheet.frames : null)
      : image.height;

    if (!divisibleByFrames) {
      entry.issues.push(
        `${horizontal ? 'LARGURA' : 'ALTURA'} NÃO DIVISÍVEL POR ${sheet.frames} FRAMES`,
      );
    }
    if (entry.physicalFrameWidth !== sheet.frameWidth) {
      entry.issues.push(
        `frameWidth ${sheet.frameWidth}, FÍSICO ${String(entry.physicalFrameWidth)}`,
      );
    }
    if (entry.physicalFrameHeight !== sheet.frameHeight) {
      entry.issues.push(
        `frameHeight ${sheet.frameHeight}, FÍSICO ${String(entry.physicalFrameHeight)}`,
      );
    }

    const exactFrameDivision = horizontal
      ? image.width % sheet.frameWidth === 0 && image.height === sheet.frameHeight
      : image.height % sheet.frameHeight === 0 && image.width === sheet.frameWidth;
    const physicalFrames = exactFrameDivision
      ? (horizontal ? image.width / sheet.frameWidth : image.height / sheet.frameHeight)
      : 0;
    entry.physicalFrames = physicalFrames;
    if (physicalFrames !== sheet.frames) {
      entry.issues.push(`FRAMES FÍSICOS ${physicalFrames}, MANIFEST ${sheet.frames}`);
    }
    if (sheet.preload.startFrame < 0 || sheet.preload.endFrame >= physicalFrames) {
      entry.issues.push(
        `INTERVALO PRELOAD ${sheet.preload.startFrame}..${sheet.preload.endFrame} EXCEDE ${physicalFrames} FRAMES`,
      );
    }

    const availableFrames = Math.min(sheet.frames, physicalFrames);
    const frameHashes = new Map();
    for (let frame = 0; frame < availableFrames; frame += 1) {
      if (frameIsEmpty(image, frame, sheet)) entry.issues.push(`FRAME ${frame} VAZIO`);
      const boundaryContacts = frameBoundaryContacts(image, frame, sheet);
      if (boundaryContacts.length > 0) {
        entry.issues.push(`FRAME ${frame} TOCA LIMITE ${boundaryContacts.join('/')}`);
      }
      const frameHash = framePixelHash(image, visiblePixels, frame, sheet);
      const duplicateFrame = frameHashes.get(frameHash);
      if (duplicateFrame !== undefined) {
        entry.issues.push(`FRAME ${frame} IDÊNTICO AO FRAME ${duplicateFrame}`);
      } else {
        frameHashes.set(frameHash, frame);
      }
    }

    // Corpos usam alpha binário; água, gelo e glow podem ser translúcidos.
    if (alpha.intermediate > 0 && !sheet.file.endsWith('-effect.png')) {
      const percent = ((alpha.intermediate / (image.width * image.height)) * 100).toFixed(2);
      entry.issues.push(`ALPHA INTERMEDIÁRIO: ${alpha.intermediate} pixels (${percent}%)`);
    }
  }
}

const failures = results.filter(({ issues }) => issues.length > 0).length;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log('personagem | arquivo | largura | altura | frames | frameWidth | frameHeight | status');
  console.log('--- | --- | ---: | ---: | ---: | ---: | ---: | ---');
  for (const entry of results) {
    const status = entry.issues.length === 0 ? 'OK' : entry.issues.join('; ').replaceAll('|', '/');
    console.log([
      entry.fighter,
      entry.file,
      entry.width ?? '—',
      entry.height ?? '—',
      entry.frames ?? '—',
      entry.frameWidth ?? '—',
      entry.frameHeight ?? '—',
      status,
    ].join(' | '));
  }
  console.log(`\n${results.length} entradas verificadas, ${failures} com problemas.`);
}

process.exitCode = failures > 0 ? 1 : 0;
