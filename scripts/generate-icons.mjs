import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}

function createIcon(size, maskable = false) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  const scale = size / 16;
  const safe = maskable ? 3 : 1;
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    for (let x = 0; x < size; x += 1) {
      const offset = row + 1 + x * 4;
      const gx = Math.floor(x / scale);
      const gy = Math.floor(y / scale);
      const border = gx < safe || gx >= 16 - safe || gy < safe || gy >= 16 - safe;
      const road = gy >= 10 && gy <= 12;
      const letterR = (gx === 5 && gy >= 4 && gy <= 11) || (gy === 4 && gx >= 5 && gx <= 9) || (gy === 7 && gx >= 5 && gx <= 9) || (gx === 9 && gy >= 4 && gy <= 7) || (gx - gy === 2 && gy >= 7 && gy <= 11);
      const line = road && ((gx + gy) % 4 < 2);
      const color = letterR ? [246, 64, 112] : line ? [255, 213, 92] : border ? [5, 7, 17] : road ? [20, 27, 45] : [8, 94 + gy * 5, 139 + gx * 3];
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(pixels, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', createIcon(192));
writeFileSync('public/icons/icon-512.png', createIcon(512));
writeFileSync('public/icons/icon-maskable-512.png', createIcon(512, true));
