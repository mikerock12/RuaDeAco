// Rasteriza as grades de texto da arte pixel autoral das finalizações em PNG.
// Nenhuma reamostragem: um caractere = um pixel da textura (exibida em 1:1 no palco 640×360).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const palette = JSON.parse(readFileSync('art-source/stages/sitio-finisher/palette.json', 'utf8'));
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
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  writeFileSync(name, png);
  console.log(name + ': ' + width + 'x' + height + ', ' + png.length + ' bytes');
}

function parseGrid(file) {
  const frames = [];
  let current = null;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('frame ')) { current = []; frames.push(current); continue; }
    if (!current) throw new Error(file + ': linha fora de um bloco frame');
    current.push(line);
  }
  const height = frames[0].length;
  const width = frames[0][0].length;
  for (const [index, frame] of frames.entries()) {
    if (frame.length !== height) throw new Error(`${file}: frame ${index} tem ${frame.length} linhas, esperado ${height}`);
    for (const [row, line] of frame.entries()) {
      if (line.length !== width) throw new Error(`${file}: frame ${index} linha ${row} tem ${line.length} colunas, esperado ${width}`);
      for (const char of line) if (!(char in palette)) throw new Error(`${file}: caractere '${char}' fora da paleta`);
    }
  }
  return { frames, width, height };
}

function rasterize(file, output) {
  const { frames, width, height } = parseGrid(file);
  const sheetWidth = width * frames.length;
  const pixels = Buffer.alloc(sheetWidth * height * 4);
  frames.forEach((frame, index) => {
    frame.forEach((line, y) => {
      [...line].forEach((char, x) => {
        const color = palette[char];
        if (!color) return;
        const offset = ((y * sheetWidth) + index * width + x) * 4;
        pixels[offset] = parseInt(color.slice(1, 3), 16);
        pixels[offset + 1] = parseInt(color.slice(3, 5), 16);
        pixels[offset + 2] = parseInt(color.slice(5, 7), 16);
        pixels[offset + 3] = 255;
      });
    });
  });
  save(output, sheetWidth, height, pixels);
  return { frames: frames.length, width, height };
}

mkdirSync('public/assets/stages/sitio', { recursive: true });
mkdirSync('public/assets/stages/cozinha-macabra', { recursive: true });
rasterize('art-source/stages/sitio-finisher/masked-farmer.txt', 'public/assets/stages/sitio/masked-farmer.png');
rasterize('art-source/stages/sitio-finisher/trident.txt', 'public/assets/stages/sitio/trident.png');
rasterize('art-source/stages/cozinha-macabra/skull-bones.txt', 'public/assets/stages/cozinha-macabra/skull-bones.png');
