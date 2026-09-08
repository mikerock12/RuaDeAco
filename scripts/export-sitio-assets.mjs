// Exportação técnica das artes geradas: recorte, registro e redução nearest-neighbor.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { decodePng } from './fighterRasterAnalysis.mjs';
const source = 'art-source/stages/sitio';
const output = 'public/assets/stages/sitio';
mkdirSync(output, { recursive: true });
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const value of body) crc = table[(crc ^ value) & 255] ^ (crc >>> 8);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length); body.copy(result, 4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
function save(name, width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) pixels.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  writeFileSync(output + '/' + name + '.png', png);
  console.log(name + ': ' + width + 'x' + height + ', ' + png.length + ' bytes');
}
function sample(image, target, width, x, y, sx, sy) {
  sx = Math.floor(sx); sy = Math.floor(sy);
  if (sx < 0 || sy < 0 || sx >= image.width || sy >= image.height) return;
  image.pixels.copy(target, (y * width + x) * 4, (sy * image.width + sx) * 4, (sy * image.width + sx) * 4 + 4);
}
const background = decodePng(readFileSync(source + '/background-source.png'));
const bgPixels = Buffer.alloc(640 * 360 * 4);
for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) {
  sample(background, bgPixels, 640, x, y, (x + 0.5) * background.width / 640, (y + 0.5) * background.height / 360);
}
save('background', 640, 360, bgPixels);

function animalRow(file, row, name, targetWidth, targetHeight) {
  const sourceImage = decodePng(readFileSync(source + '/' + file));
  if (sourceImage.colorType !== 6 || !sourceImage.pixels.some((value, index) => index % 4 === 3 && value === 0)) {
    throw new Error(name + ': sprites precisam de alpha transparente');
  }
  const frames = Array.from({ length: 4 }, (_, frame) => {
    const left = Math.round(frame * sourceImage.width / 4);
    const right = Math.round((frame + 1) * sourceImage.width / 4);
    const top = Math.round(row * sourceImage.height / 2);
    const bottom = Math.round((row + 1) * sourceImage.height / 2);
    let minX = right, maxX = left, minY = bottom, maxY = top;
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      if (sourceImage.pixels[(y * sourceImage.width + x) * 4 + 3] < 32) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    if (maxX <= minX || maxY <= minY) throw new Error(name + ': frame vazio');
    return { minX, maxX, minY, maxY };
  });
  const scale = Math.min(targetWidth / Math.max(...frames.map(f => f.maxX - f.minX + 1)),
    targetHeight / Math.max(...frames.map(f => f.maxY - f.minY + 1)));
  const pixels = Buffer.alloc(256 * 48 * 4);
  frames.forEach((f, frame) => {
    const width = Math.round((f.maxX - f.minX + 1) * scale);
    const height = Math.round((f.maxY - f.minY + 1) * scale);
    const left = Math.floor((64 - width) / 2);
    const top = 46 - height;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      sample(sourceImage, pixels, 256, frame * 64 + left + x, top + y,
        f.minX + (x + 0.5) / scale, f.minY + (y + 0.5) / scale);
    }
  });
  save(name, 256, 48, pixels);
}
animalRow('birds-source.png', 0, 'hen', 36, 34);
animalRow('birds-source.png', 1, 'duck', 40, 34);
animalRow('reptiles-source.png', 0, 'snake', 58, 34);
animalRow('reptiles-source.png', 1, 'lizard', 58, 27);
