// Auditoria dos PNGs e do contrato real usado por manifest/preload/Phaser.
// Uso: node scripts/audit-fighter-sprites.mjs [--json]
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createServer } from 'vite';
import { decodePng, frameBounds, placeholderIssues } from './fighterRasterAnalysis.mjs';

const ROOT = new URL('../', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1');

const FIGHTER_NAMES = {
  'rafa-mare': 'Rafa Maré',
  'guto-barba': 'Guto Barba',
  'astro-riso': 'Astro Riso',
  'dante-sinal': 'Dante Sinal',
  'leo-violeta': 'Léo Violeta',
  'noir-reflexo': 'Noir Reflexo',
};

// Contrato do raster final. O baseline é expresso nas coordenadas locais do
// frame e coincide com a última linha visível do corpo (seis pixels de respiro).
const FIGHTER_RASTER_CONTRACTS = {
  'rafa-mare': { frameWidth: 256, frameHeight: 256, baselineY: 249 },
  'guto-barba': { frameWidth: 288, frameHeight: 288, baselineY: 281 },
  'astro-riso': { frameWidth: 256, frameHeight: 256, baselineY: 249 },
  'dante-sinal': { frameWidth: 256, frameHeight: 256, baselineY: 249 },
  'leo-violeta': {
    frameWidth: 256,
    frameHeight: 256,
    baselineY: 249,
    standingHeightRange: [176, 181],
  },
  'noir-reflexo': {
    frameWidth: 256,
    frameHeight: 256,
    baselineY: 249,
    standingHeightRange: [178, 183],
  },
};
const BODY_MASS_RATIO_TOLERANCE = 0.12;
const ANATOMICAL_SCALE_CONTRACTS = {
  'leo-violeta': {
    'corrida.png': { height: [155, 163], massRatio: [0.91, 1.00] },
    'walk-backward.png': { height: [174, 184], massRatio: [0.84, 0.94] },
    'crouch.png': { height: [145, 156], massRatio: [0.98, 1.09] },
    'forward-light.png': { height: [169, 179], massRatio: [0.95, 1.05] },
    'forward-heavy.png': { height: [157, 167], massRatio: [0.88, 0.98] },
    'olhar-frio.png': { height: [159, 170], massRatio: [0.77, 0.87] },
    'impacto-sombrio.png': { height: [139, 150], massRatio: [0.83, 0.93] },
    'pressao-violeta.png': { height: [181, 191], massRatio: [0.94, 1.04] },
    'air-heavy-forward.png': { height: [146, 157], massRatio: [0.57, 0.67] },
  },
  'noir-reflexo': {
    'corrida.png': { height: [164, 174], massRatio: [0.94, 1.05] },
    'walk-backward.png': { height: [177, 187], massRatio: [0.83, 0.93] },
    'crouch.png': { height: [118, 129], massRatio: [0.82, 0.93] },
    'forward-light.png': { height: [152, 163], massRatio: [0.78, 0.88] },
    'forward-heavy.png': { height: [156, 166], massRatio: [0.83, 0.94] },
    'reflexo-negro.png': { height: [166, 177], massRatio: [0.94, 1.04] },
    'quebra-luz.png': { height: [161, 171], massRatio: [0.86, 0.96] },
    'impacto-solar.png': { height: [170, 181], massRatio: [0.88, 0.98] },
    'air-heavy-forward.png': { height: [126, 136], massRatio: [0.85, 0.96] },
  },
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
      files: [
        ...Object.values(fighter.animations).map((sheet) => ({ ...sheet, rasterKind: 'body' })),
        ...fighter.effects.map((sheet) => ({ ...sheet, rasterKind: 'effect' })),
      ].map((sheet) => {
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

function countUnexpectedGreen(image, strict = false) {
  let count = 0;
  for (let index = 0; index < image.pixels.length; index += 4) {
    const red = image.pixels[index];
    const green = image.pixels[index + 1];
    const blue = image.pixels[index + 2];
    const alpha = image.pixels[index + 3];
    const greenSpill = strict
      ? green >= 24 && green - red >= 8 && green - blue >= 8
      : green >= 80 && green > red * 1.35 && green > blue * 1.15;
    if (alpha > 0 && greenSpill) count += 1;
  }
  return count;
}

function auditFrameAlpha(image, frameIndex, sheet) {
  const bounds = frameBounds(sheet, frameIndex);
  let transparent = 0;
  let opaque = 0;
  let intermediate = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let y = bounds.startY; y <= bounds.endY; y += 1) {
    for (let x = bounds.startX; x <= bounds.endX; x += 1) {
      const alpha = image.pixels[(y * image.width + x) * 4 + 3];
      if (alpha === 0) {
        transparent += 1;
        continue;
      }
      if (alpha === 255) opaque += 1;
      else intermediate += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const empty = opaque + intermediate === 0;
  const bbox = empty
    ? null
    : {
        minX: minX - bounds.startX,
        minY: minY - bounds.startY,
        maxX: maxX - bounds.startX,
        maxY: maxY - bounds.startY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      };

  return {
    frame: frameIndex,
    alpha: { transparent, opaque, intermediate },
    bbox,
    baselineY: bbox?.maxY ?? null,
  };
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
  const rasterContract = FIGHTER_RASTER_CONTRACTS[fighter.id];
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
      rasterKind: sheet.rasterKind,
      textureKey: sheet.key,
      layout: sheet.layout,
      frames: sheet.frames,
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight,
      frameRate: sheet.frameRate,
      repeat: sheet.repeat,
      preload: sheet.preload,
      phaserAnimationKey: sheet.phaserAnimationKey,
      expectedFrameWidth: sheet.frameWidth,
      expectedFrameHeight: sheet.frameHeight,
      expectedBaselineY: sheet.rasterKind === 'body' ? sheet.frameHeight - 7 : null,
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
    if (!rasterContract) {
      entry.issues.push(`CONTRATO RASTER AUSENTE PARA ${fighter.id}`);
    } else if (sheet.frameWidth !== sheet.frameHeight
      || ![rasterContract.frameWidth, 256].includes(sheet.frameWidth)) {
      entry.issues.push(
        `CANVAS NÃO SUPORTADO: ${sheet.frameWidth}x${sheet.frameHeight}`,
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

    const strictGreenAudit = fighter.id === 'leo-violeta' || fighter.id === 'noir-reflexo';
    if ((fighter.id === 'guto-barba' && sheet.rasterKind === 'body') || strictGreenAudit) {
      entry.unexpectedGreenPixels = countUnexpectedGreen(image, strictGreenAudit);
      if (entry.unexpectedGreenPixels > 0) {
        entry.issues.push(`RESÍDUO VERDE: ${entry.unexpectedGreenPixels} pixels`);
      }
    }

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
    entry.frameAudits = [];
    for (let frame = 0; frame < availableFrames; frame += 1) {
      const frameAudit = auditFrameAlpha(image, frame, sheet);
      entry.frameAudits.push(frameAudit);
      if (!frameAudit.bbox) entry.issues.push(`FRAME ${frame} VAZIO`);
      if (sheet.rasterKind === 'body' && frameAudit.alpha.intermediate > 0) {
        entry.issues.push(
          `FRAME ${frame} ALPHA NÃO BINÁRIO: ${frameAudit.alpha.intermediate} pixels intermediários`,
        );
      }
      if (sheet.rasterKind === 'body'
        && frameAudit.baselineY !== entry.expectedBaselineY) {
        entry.issues.push(
          `FRAME ${frame} BASELINE ${String(frameAudit.baselineY)}, ESPERADO ${entry.expectedBaselineY}`,
        );
      }
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

    // Anti-placeholder: hash distinto não prova animação real. Estas
    // verificações rejeitam retângulos uniformes, frames com pouquíssimas
    // cores e pares de poses alterados por poucos pixels.
    entry.issues.push(...placeholderIssues(
      image,
      {
        frames: availableFrames,
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
        layout: sheet.layout,
      },
      sheet.rasterKind,
    ));
  }
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[midpoint - 1] + ordered[midpoint]) / 2
    : ordered[midpoint];
}

// Bbox e baseline sozinhos não detectam um corpo exportado menor no mesmo
// canvas. A mediana de massa opaca protege a escala visual sem confundir a
// altura natural de poses agachadas, aéreas ou derrubadas.
for (const fighter of FIGHTERS) {
  const bodies = results.filter(
    (entry) => entry.fighterId === fighter.id
      && entry.rasterKind === 'body'
      && entry.frameAudits?.length === entry.frames,
  );
  for (const entry of bodies) {
    entry.medianOpaquePixels = median(
      entry.frameAudits.map((frame) => frame.alpha.opaque),
    );
    entry.medianOpaqueHeight = median(
      entry.frameAudits.map(({ bbox }) => (bbox ? bbox.height : 0)),
    );
  }

  const idle = bodies.find(({ file }) => file === 'idle.png');
  const referenceMass = idle?.medianOpaquePixels;
  if (!referenceMass || referenceMass <= 0) {
    for (const entry of bodies) entry.issues.push('MASSA DE REFERÊNCIA IDLE AUSENTE');
    continue;
  }

  const standingHeightRange = FIGHTER_RASTER_CONTRACTS[fighter.id]?.standingHeightRange;
  if (standingHeightRange) {
    const idleHeight = idle.medianOpaqueHeight;
    idle.medianOpaqueHeight = idleHeight;
    const [minimumHeight, maximumHeight] = standingHeightRange;
    if (idleHeight < minimumHeight || idleHeight > maximumHeight) {
      idle.issues.push(
        `ALTURA ERETA MEDIANA ${idleHeight}px, ESPERADO ${minimumHeight}–${maximumHeight}px`,
      );
    }
  }

  for (const entry of bodies) {
    entry.visualMassRatio = entry.medianOpaquePixels / referenceMass;

    const anatomicalContract = ANATOMICAL_SCALE_CONTRACTS[fighter.id]?.[entry.file];
    if (anatomicalContract) {
      const [minimumHeight, maximumHeight] = anatomicalContract.height;
      if (entry.medianOpaqueHeight < minimumHeight
        || entry.medianOpaqueHeight > maximumHeight) {
        entry.issues.push(
          `ESCALA ANATÔMICA: ALTURA MEDIANA ${entry.medianOpaqueHeight}px, `
          + `APROVADO ${minimumHeight}–${maximumHeight}px`,
        );
      }
      const [minimumMass, maximumMass] = anatomicalContract.massRatio;
      if (entry.visualMassRatio < minimumMass || entry.visualMassRatio > maximumMass) {
        entry.issues.push(
          `ESCALA ANATÔMICA: MASSA ${(entry.visualMassRatio * 100).toFixed(1)}% DO IDLE, `
          + `APROVADO ${(minimumMass * 100).toFixed(0)}–${(maximumMass * 100).toFixed(0)}%`,
        );
      }
      continue;
    }

    // Para as demais poses especiais de Léo/Noir, o contrato específico será
    // ampliado apenas após aprovação visual. Não aplique a tolerância ingênua
    // do idle a knockdown/aéreos; as folhas críticas acima já não são puladas.
    if (standingHeightRange) continue;

    if (Math.abs(1 - entry.visualMassRatio) > BODY_MASS_RATIO_TOLERANCE) {
      entry.issues.push(
        `MASSA VISUAL ${(entry.visualMassRatio * 100).toFixed(1)}% DO IDLE, `
        + `TOLERÂNCIA ±${(BODY_MASS_RATIO_TOLERANCE * 100).toFixed(0)}%`,
      );
    }
  }
}

// O relatório versionado é produzido pelo pipeline no mesmo build que monta
// as folhas. Ele vincula fonte e saída por SHA-256, registra o fator único da
// folha e prova que a limpeza conservadora removeu somente ruído de até três
// pixels. As fontes keyed ficam locais; o hash da saída mantém esta evidência
// verificável também no clone limpo usado pelo GitHub Actions.
const cleanupReportPath = join(
  ROOT,
  'scripts',
  'data',
  'leo-noir-pipeline-cleanup-report.json',
);
for (const fighterId of ['leo-violeta', 'noir-reflexo']) {
  const anchor = results.find(
    (entry) => entry.fighterId === fighterId && entry.file === 'idle.png',
  );
  if (!anchor) continue;
  if (!existsSync(cleanupReportPath)) {
    anchor.issues.push('RELATÓRIO DE LIMPEZA DAS FONTES AUSENTE');
    continue;
  }
  let cleanupReport;
  try {
    cleanupReport = JSON.parse(await readFile(cleanupReportPath, 'utf8'));
  } catch (error) {
    anchor.issues.push(
      `RELATÓRIO DE LIMPEZA INVÁLIDO: ${error instanceof Error ? error.message : String(error)}`,
    );
    continue;
  }
  const bodyEntries = results.filter(
    (candidate) => candidate.fighterId === fighterId
      && candidate.rasterKind === 'body'
      && candidate.file?.endsWith('.png'),
  );
  const keyedSourceCount = bodyEntries.filter((entry) => existsSync(
    join(ROOT, 'tmp', 'imagegen', fighterId, 'keyed', entry.file),
  )).length;
  if (keyedSourceCount > 0 && keyedSourceCount !== bodyEntries.length) {
    anchor.issues.push(
      `CONJUNTO DE FONTES KEYED INCOMPLETO: ${keyedSourceCount}/${bodyEntries.length}`,
    );
  }
  for (const entry of bodyEntries) {
    const name = entry.file.slice(0, -4);
    const report = cleanupReport[fighterId]?.[name];
    if (!report) {
      entry.issues.push('AUDITORIA DA FONTE/CÉLULAS AUSENTE');
      continue;
    }
    const keyedPath = join(ROOT, 'tmp', 'imagegen', fighterId, 'keyed', entry.file);
    if (existsSync(keyedPath)) {
      const sourceHash = createHash('sha256').update(await readFile(keyedPath)).digest('hex');
      if (sourceHash !== report.sourceSha256) {
        entry.issues.push('AUDITORIA DA FONTE DESATUALIZADA (SHA-256 DIVERGENTE)');
      }
    }
    const outputPath = join(ROOT, 'public', 'assets', 'fighters', fighterId, entry.file);
    const outputHash = createHash('sha256').update(await readFile(outputPath)).digest('hex');
    if (outputHash !== report.outputSha256) {
      entry.issues.push('AUDITORIA DA SAÍDA DESATUALIZADA (SHA-256 DIVERGENTE)');
    }
    if (!Number.isFinite(report.scaleFactor) || report.scaleFactor <= 0) {
      entry.issues.push(`FATOR ÚNICO DA FOLHA INVÁLIDO: ${String(report.scaleFactor)}`);
    }
    if (!Array.isArray(report.frames) || report.frames.length !== entry.frames) {
      entry.issues.push(
        `AUDITORIA DE CÉLULAS: ${report.frames?.length ?? 0} FRAMES, ESPERADO ${entry.frames}`,
      );
      continue;
    }
    for (let frame = 0; frame < report.frames.length; frame += 1) {
      const cleanup = report.frames[frame];
      if ((cleanup.removedPixels ?? 0) > (cleanup.removedComponents ?? 0) * 3) {
        entry.issues.push(
          `FRAME ${frame} LIMPEZA REMOVEU COMPONENTE SIGNIFICATIVO: `
          + `${cleanup.removedPixels}px`,
        );
      }
      const margins = cleanup.sourceMargins;
      if (!margins || margins.left < 2 || margins.right < 2 || margins.top < 2) {
        entry.issues.push(
          `FRAME ${frame} TOCA LIMITE EXTERNO DA FONTE: ${JSON.stringify(margins)}`,
        );
      }
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
