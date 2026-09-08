// Exportação técnica das artes geradas: recorte, registro e redução nearest-neighbor.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { decodePng } from './fighterRasterAnalysis.mjs';
const source = 'art-source/stages/cozinha-macabra';
const output = 'public/assets/stages/cozinha-macabra';
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
const witch = decodePng(readFileSync(source + '/witch-source.png'));
const witchPixels = Buffer.alloc(640 * 160 * 4);
for (let frame = 0; frame < 4; frame++) for (let y = 0; y < 160; y++) for (let x = 0; x < 160; x++) {
  sample(witch, witchPixels, 640, frame * 160 + x, y,
    (frame % 2) * witch.width / 2 + (x + 0.5) * witch.width / 320,
    Math.floor(frame / 2) * witch.height / 2 + (y + 0.5) * witch.height / 320);
}
save('witch', 640, 160, witchPixels);
const fauna = decodePng(readFileSync(source + '/fauna-source.png'));
// Registro pelo rosto mantém o corpo no mesmo lugar apesar da variação das asas.
// Retângulos explícitos evitam cortar a segunda asa, que cruza a coluna nominal.
const bats = [
  { bounds: [0, 0, 385, 590], anchor: [323, 337] },
  { bounds: [385, 0, 975, 590], anchor: [774, 311] },
  { bounds: [975, 0, 1370, 590], anchor: [1270, 253] },
  { bounds: [1370, 0, 1774, 590], anchor: [1680, 252] },
];
const rats = [
  { bounds: [0, 600, 445, 887], anchor: [386, 704] },
  { bounds: [445, 600, 895, 887], anchor: [841, 724] },
  { bounds: [895, 600, 1337, 887], anchor: [1278, 710] },
  { bounds: [1337, 600, 1774, 887], anchor: [1707, 711] },
];
function atlas(name, frames, height, scale, anchorX, anchorY) {
  const width = 160;
  const pixels = Buffer.alloc(width * height * 4);
  frames.forEach(({ bounds: [left, top, right, bottom], anchor: [ax, ay] }, frame) => {
    for (let y = 0; y < height; y++) for (let x = 0; x < 40; x++) {
      const sx = ax + (x - anchorX) / scale;
      const sy = ay + (y - anchorY) / scale;
      if (sx >= left && sx < right && sy >= top && sy < bottom) sample(fauna, pixels, width, frame * 40 + x, y, sx, sy);
    }
  });
  save(name, width, height, pixels);
}
atlas('bat', bats, 32, 0.05, 27, 15);
atlas('rat', rats, 24, 0.075, 32, 13);
