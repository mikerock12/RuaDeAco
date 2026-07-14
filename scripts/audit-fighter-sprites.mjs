// Auditoria dos PNGs dos lutadores: dimensões, alpha binário e padrão de frames.
// Uso: node scripts/audit-fighter-sprites.mjs [--json]
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

const ROOT = new URL('../', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1');

const ANIMATIONS = [
  'idle', 'walk', 'jump', 'crouch', 'light-attack',
  'heavy-attack', 'special', 'hit', 'knockdown', 'victory',
];

// Frames esperados por lutador (mantido em sincronia com src/fighters/visual/*.ts).
const FIGHTERS = [
  { id: 'rafa-mare', frameWidth: 192, frameHeight: 192, frames: 4 },
  { id: 'guto-barba', frameWidth: 256, frameHeight: 256, frames: 4 },
];

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
  return { width, height, pixels };
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

function frameIsEmpty(image, frameIndex, frameWidth) {
  for (let y = 0; y < image.height; y += 1) {
    for (let x = frameIndex * frameWidth; x < (frameIndex + 1) * frameWidth; x += 1) {
      if (image.pixels[(y * image.width + x) * 4 + 3] > 0) return false;
    }
  }
  return true;
}

const results = [];
let failures = 0;

for (const fighter of FIGHTERS) {
  for (const animation of ANIMATIONS) {
    const relative = `public/assets/fighters/${fighter.id}/${animation}.png`;
    const absolute = join(ROOT, relative);
    const entry = { path: relative, issues: [] };
    results.push(entry);

    if (!existsSync(absolute)) {
      entry.issues.push('ARQUIVO AUSENTE');
      failures += 1;
      continue;
    }

    const image = decodePng(await readFile(absolute));
    const alpha = auditAlpha(image);
    entry.width = image.width;
    entry.height = image.height;
    entry.transparentPixels = alpha.transparent;
    entry.opaquePixels = alpha.opaque;
    entry.intermediatePixels = alpha.intermediate;

    const expectedWidth = fighter.frameWidth * fighter.frames;
    if (image.width !== expectedWidth || image.height !== fighter.frameHeight) {
      entry.issues.push(
        `DIMENSÕES FORA DO PADRÃO: ${image.width}x${image.height} (esperado ${expectedWidth}x${fighter.frameHeight})`,
      );
    }
    if (image.width % fighter.frames !== 0) {
      entry.issues.push(`LARGURA NÃO DIVISÍVEL POR ${fighter.frames} FRAMES`);
    } else {
      for (let frame = 0; frame < fighter.frames; frame += 1) {
        if (frameIsEmpty(image, frame, image.width / fighter.frames)) {
          entry.issues.push(`FRAME ${frame} VAZIO`);
        }
      }
    }
    if (alpha.intermediate > 0) {
      const percent = ((alpha.intermediate / (image.width * image.height)) * 100).toFixed(2);
      entry.issues.push(`ALPHA INTERMEDIÁRIO: ${alpha.intermediate} pixels (${percent}%)`);
    }
    if (entry.issues.length > 0) failures += 1;
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const entry of results) {
    const status = entry.issues.length === 0 ? 'OK ' : 'ERRO';
    const dimensions = entry.width ? `${entry.width}x${entry.height}` : '—';
    console.log(`[${status}] ${entry.path} (${dimensions})`);
    if (entry.width) {
      console.log(`       transparentes=${entry.transparentPixels} opacos=${entry.opaquePixels} intermediarios=${entry.intermediatePixels}`);
    }
    for (const issue of entry.issues) console.log(`       - ${issue}`);
  }
  console.log(`\n${results.length} arquivos verificados, ${failures} com problemas.`);
}

process.exitCode = failures > 0 ? 1 : 0;
