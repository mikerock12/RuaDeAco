import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';

const ROOT = new URL('../', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1');

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data) {
  let c = 0xffffffff;
  for (const value of data) c = crcTable[(c ^ value) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const body = Buffer.concat([name, data]);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(body), data.length + 8);
  return result;
}

function encodePng(canvas) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(canvas.width, 0);
  header.writeUInt32BE(canvas.height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = canvas.width * 4;
  const scanlines = Buffer.alloc((stride + 1) * canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    const target = y * (stride + 1);
    scanlines[target] = 0;
    canvas.data.copy(scanlines, target + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const COLORS = {
  transparent: [0, 0, 0, 0],
  ink: [7, 11, 20, 255],
  ink2: [14, 22, 35, 255],
  navy: [12, 27, 51, 255],
  steelDark: [27, 43, 61, 255],
  steel: [73, 102, 124, 255],
  steelLight: [151, 180, 191, 255],
  silver: [210, 226, 224, 255],
  goldDark: [126, 76, 20, 255],
  gold: [229, 170, 52, 255],
  goldLight: [255, 226, 117, 255],
  cyanDark: [8, 70, 103, 255],
  cyan: [31, 185, 219, 255],
  cyanLight: [136, 244, 246, 255],
  ice: [101, 206, 236, 255],
  violet: [110, 56, 153, 255],
  magenta: [235, 50, 158, 255],
  red: [211, 51, 59, 255],
  skinDark: [99, 49, 40, 255],
  skin: [180, 102, 73, 255],
  skinLight: [231, 160, 105, 255],
  gutoSkinDark: [93, 55, 44, 255],
  gutoSkin: [176, 117, 80, 255],
  gutoSkinLight: [222, 166, 111, 255],
  beardDark: [38, 28, 25, 255],
  beard: [99, 68, 44, 255],
  beardLight: [155, 105, 59, 255],
  hoodie: [29, 41, 55, 255],
  hoodieLight: [57, 76, 89, 255],
  asphalt: [26, 32, 43, 255],
  asphaltLight: [54, 61, 68, 255],
  sky: [9, 14, 36, 255],
  sky2: [16, 27, 57, 255],
  water: [7, 42, 68, 255],
  water2: [9, 72, 99, 255],
  window: [246, 195, 75, 255],
  white: [255, 255, 255, 255],
};

function rgba(color) {
  if (Array.isArray(color)) return color;
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const value = Number.parseInt(hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex, 16);
    return [(value >>> 16) & 255, (value >>> 8) & 255, value & 255, 255];
  }
  throw new Error(`Cor inválida: ${color}`);
}

class PixelCanvas {
  constructor(width, height, fill = COLORS.transparent) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 4);
    this.clear(fill);
  }

  clear(color) {
    const [r, g, b, a] = rgba(color);
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = a;
    }
  }

  pixel(x, y, color) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
    const [r, g, b, a] = rgba(color);
    const index = (py * this.width + px) * 4;
    this.data[index] = r;
    this.data[index + 1] = g;
    this.data[index + 2] = b;
    this.data[index + 3] = a;
  }

  rect(x, y, width, height, color) {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.width, Math.round(x + width));
    const y1 = Math.min(this.height, Math.round(y + height));
    for (let py = y0; py < y1; py += 1) for (let px = x0; px < x1; px += 1) this.pixel(px, py, color);
  }

  checker(x, y, width, height, colorA, colorB, size = 2) {
    for (let py = 0; py < height; py += size) {
      for (let px = 0; px < width; px += size) {
        this.rect(x + px, y + py, size, size, ((px / size + py / size) & 1) ? colorA : colorB);
      }
    }
  }

  line(x0, y0, x1, y1, color, thickness = 1) {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const endX = Math.round(x1);
    const endY = Math.round(y1);
    const dx = Math.abs(endX - x);
    const sx = x < endX ? 1 : -1;
    const dy = -Math.abs(endY - y);
    const sy = y < endY ? 1 : -1;
    let error = dx + dy;
    while (true) {
      this.rect(x - Math.floor(thickness / 2), y - Math.floor(thickness / 2), thickness, thickness, color);
      if (x === endX && y === endY) break;
      const e2 = 2 * error;
      if (e2 >= dy) { error += dy; x += sx; }
      if (e2 <= dx) { error += dx; y += sy; }
    }
  }

  polygon(points, color) {
    const ys = points.map(([, y]) => y);
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxY = Math.min(this.height - 1, Math.ceil(Math.max(...ys)));
    for (let y = minY; y <= maxY; y += 1) {
      const nodes = [];
      for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if ((yi < y && yj >= y) || (yj < y && yi >= y)) nodes.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
      }
      nodes.sort((a, b) => a - b);
      for (let i = 0; i + 1 < nodes.length; i += 2) this.rect(Math.ceil(nodes[i]), y, Math.floor(nodes[i + 1]) - Math.ceil(nodes[i]) + 1, 1, color);
    }
  }

  blit(source, targetX, targetY) {
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const sourceIndex = (y * source.width + x) * 4;
        if (source.data[sourceIndex + 3] === 0) continue;
        this.pixel(targetX + x, targetY + y, [
          source.data[sourceIndex], source.data[sourceIndex + 1], source.data[sourceIndex + 2], source.data[sourceIndex + 3],
        ]);
      }
    }
  }

  blitScaled(source, targetX, targetY, scale) {
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const sourceIndex = (y * source.width + x) * 4;
        const color = [source.data[sourceIndex], source.data[sourceIndex + 1], source.data[sourceIndex + 2], source.data[sourceIndex + 3]];
        if (color[3] !== 0) this.rect(targetX + x * scale, targetY + y * scale, scale, scale, color);
      }
    }
  }
}

async function save(relativePath, canvas) {
  const filePath = join(ROOT, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, encodePng(canvas));
  generated.push({ path: relativePath.replaceAll('\\', '/'), width: canvas.width, height: canvas.height });
}

const generated = [];

const GLYPHS = {
  ' ': ['000','000','000','000','000','000','000'],
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  B: ['11110','10001','10001','11110','10001','10001','11110'],
  C: ['01111','10000','10000','10000','10000','10000','01111'],
  D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','10000','11110','10000','10000','11111'],
  F: ['11111','10000','10000','11110','10000','10000','10000'],
  G: ['01111','10000','10000','10111','10001','10001','01111'],
  H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['11111','00100','00100','00100','00100','00100','11111'],
  J: ['00111','00010','00010','00010','10010','10010','01100'],
  K: ['10001','10010','10100','11000','10100','10010','10001'],
  L: ['10000','10000','10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10101','10001','10001','10001'],
  N: ['10001','11001','10101','10011','10001','10001','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'],
  P: ['11110','10001','10001','11110','10000','10000','10000'],
  Q: ['01110','10001','10001','10001','10101','10010','01101'],
  R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01111','10000','10000','01110','00001','00001','11110'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'],
  V: ['10001','10001','10001','10001','10001','01010','00100'],
  W: ['10001','10001','10001','10101','10101','11011','10001'],
  X: ['10001','10001','01010','00100','01010','10001','10001'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'],
  Z: ['11111','00001','00010','00100','01000','10000','11111'],
  0: ['01110','10001','10011','10101','11001','10001','01110'],
  1: ['00100','01100','00100','00100','00100','00100','01110'],
  2: ['01110','10001','00001','00010','00100','01000','11111'],
  3: ['11110','00001','00001','01110','00001','00001','11110'],
  4: ['00010','00110','01010','10010','11111','00010','00010'],
  5: ['11111','10000','10000','11110','00001','00001','11110'],
  6: ['01110','10000','10000','11110','10001','10001','01110'],
  7: ['11111','00001','00010','00100','01000','01000','01000'],
  8: ['01110','10001','10001','01110','10001','10001','01110'],
  9: ['01110','10001','10001','01111','00001','00001','01110'],
  '!': ['1','1','1','1','1','0','1'], '?': ['01110','10001','00001','00010','00100','00000','00100'],
  '.': ['0','0','0','0','0','0','1'], ',': ['0','0','0','0','0','1','1'], ':': ['0','1','0','0','1','0','0'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'], '+': ['00000','00100','00100','11111','00100','00100','00000'],
  '/': ['00001','00010','00010','00100','01000','01000','10000'], '%': ['11001','11010','00100','01000','10110','00110','00000'],
  '(': ['001','010','100','100','100','010','001'], ')': ['100','010','001','001','001','010','100'],
  '[': ['111','100','100','100','100','100','111'], ']': ['111','001','001','001','001','001','111'],
  '<': ['0001','0010','0100','1000','0100','0010','0001'], '>': ['1000','0100','0010','0001','0010','0100','1000'],
  '=': ['00000','11111','00000','11111','00000','00000','00000'], '_': ['00000','00000','00000','00000','00000','00000','11111'],
  "'": ['1','1','0','0','0','0','0'], '"': ['101','101','000','000','000','000','000'],
};

function accented(base, mark) {
  const source = GLYPHS[base];
  const accent = mark === 'acute' ? '00100' : mark === 'grave' ? '01000' : mark === 'tilde' ? '01010' : mark === 'circ' ? '01010' : '10001';
  return [accent, ...source.slice(0, 6)];
}

for (const [letter, base, mark] of [
  ['Á','A','acute'],['À','A','grave'],['Â','A','circ'],['Ã','A','tilde'],['É','E','acute'],['Ê','E','circ'],['Í','I','acute'],
  ['Ó','O','acute'],['Ô','O','circ'],['Õ','O','tilde'],['Ú','U','acute'],['Ü','U','dots'],
]) GLYPHS[letter] = accented(base, mark);
GLYPHS['Ç'] = [...GLYPHS.C.slice(0, 6), '00100'];

async function generateFont() {
  const chars = Object.keys(GLYPHS).sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
  const cellWidth = 7;
  const cellHeight = 9;
  const columns = 16;
  const rows = Math.ceil(chars.length / columns);
  const texture = new PixelCanvas(128, Math.max(64, rows * cellHeight));
  const xmlChars = [];
  chars.forEach((character, index) => {
    const pattern = GLYPHS[character];
    const x = (index % columns) * cellWidth + 1;
    const y = Math.floor(index / columns) * cellHeight + 1;
    const width = Math.max(...pattern.map((row) => row.length));
    pattern.forEach((row, py) => [...row].forEach((value, px) => { if (value === '1') texture.pixel(x + px, y + py, COLORS.white); }));
    xmlChars.push(`    <char id="${character.codePointAt(0)}" x="${x}" y="${y}" width="${width}" height="7" xoffset="0" yoffset="0" xadvance="${width + 1}" page="0" chnl="15"/>`);
  });
  await save('public/assets/fonts/rua-de-aco-pixel.png', texture);
  const xml = `<?xml version="1.0"?>\n<font>\n  <info face="Rua de Aco Pixel" size="8" bold="0" italic="0" charset="" unicode="1" stretchH="100" smooth="0" aa="1" padding="0,0,0,0" spacing="1,1"/>\n  <common lineHeight="8" base="7" scaleW="${texture.width}" scaleH="${texture.height}" pages="1" packed="0"/>\n  <pages><page id="0" file="rua-de-aco-pixel.png"/></pages>\n  <chars count="${xmlChars.length}">\n${xmlChars.join('\n')}\n  </chars>\n  <kernings count="0"/>\n</font>\n`;
  const fontPath = join(ROOT, 'public/assets/fonts/rua-de-aco-pixel.xml');
  await writeFile(fontPath, xml, 'utf8');
}


function drawSkylineFar() {
  const c = new PixelCanvas(320, 180, COLORS.sky);
  c.rect(0,34,320,84,COLORS.sky2);
  for (let y = 8; y < 90; y += 8) c.rect(0,y,320,1, y % 16 === 0 ? '#111d42' : '#0c1735');
  // Stars and moon drawn in square pixel clusters.
  for (const [x,y] of [[12,13],[39,26],[62,9],[93,21],[145,15],[177,29],[206,11],[245,24],[286,8],[306,31]]) {
    c.pixel(x,y,COLORS.steelLight); if ((x+y)%2===0) c.pixel(x+1,y,COLORS.steelLight);
  }
  c.rect(257,12,9,7,COLORS.goldLight); c.rect(255,14,13,3,COLORS.goldLight); c.rect(262,12,6,5,COLORS.sky2);
  const buildings = [
    [0,63,32,57,'#17243b'],[28,48,27,72,'#1a2a45'],[53,70,38,50,'#132139'],[87,39,29,81,'#1d2d47'],
    [113,59,42,61,'#14243e'],[151,46,25,74,'#1d304e'],[173,68,42,52,'#14223b'],[211,51,34,69,'#1c2d49'],
    [242,32,28,88,'#1b2d4a'],[267,60,31,60,'#14243e'],[295,43,25,77,'#1d304d'],
  ];
  buildings.forEach(([x,y,w,h,color], bi) => {
    c.rect(x,y,w,h,color); c.rect(x,y,w,2,COLORS.steelDark); c.rect(x+w-2,y+2,2,h-2,COLORS.ink);
    for (let wy=y+8; wy<y+h-5; wy+=9) for (let wx=x+5; wx<x+w-4; wx+=8) {
      const on = ((wx+wy+bi*7)%5)<2;
      c.rect(wx,wy,3,3,on ? COLORS.window : '#243c56');
      if (on) c.pixel(wx,wy,COLORS.goldLight);
    }
  });
  // Distant bridge with block lights.
  c.rect(0,110,320,4,COLORS.ink); c.rect(0,109,320,1,COLORS.steel);
  for (let x=5;x<320;x+=20) { c.rect(x,105,2,9,COLORS.steelDark); c.rect(x,104,3,2,COLORS.gold); }
  c.rect(0,114,320,66,COLORS.water);
  return c;
}

function drawMidLayer() {
  const c = new PixelCanvas(320,180);
  // Warehouse silhouettes, lamps and dock cranes.
  c.rect(0,89,71,30,'#111c2c'); c.polygon([[0,89],[18,75],[50,75],[71,89]],COLORS.ink2);
  c.rect(8,94,18,19,'#26384a'); c.rect(34,94,27,19,'#202f40');
  c.rect(275,84,45,30,'#111c2c'); c.polygon([[275,84],[293,70],[320,78],[320,84]],COLORS.ink2);
  c.rect(90,58,4,56,COLORS.steelDark); c.rect(91,57,38,3,COLORS.steel); c.line(126,60,126,99,COLORS.steelDark,2); c.line(94,61,125,82,COLORS.steelDark,1);
  c.rect(224,51,4,63,COLORS.steelDark); c.rect(183,51,45,3,COLORS.steel); c.line(185,54,185,99,COLORS.steelDark,2); c.line(187,54,224,80,COLORS.steelDark,1);
  for (const x of [75,157,247]) {
    c.rect(x,72,3,43,COLORS.ink); c.rect(x+1,73,1,42,COLORS.steel);
    c.rect(x-5,71,13,3,COLORS.ink); c.rect(x-3,73,9,3,COLORS.gold); c.rect(x-1,76,5,3,'#685327');
    c.rect(x-8,79,19,1,'#403b29');
  }
  return c;
}

function drawWaterFrames() {
  const strip = new PixelCanvas(320*4,180);
  for (let frame=0;frame<4;frame+=1) {
    const c = new PixelCanvas(320,180);
    c.rect(0,114,320,38,COLORS.water);
    for (let y=116;y<152;y+=4) {
      const shift=(frame*3+y)%12;
      for (let x=-12+shift;x<320;x+=17) {
        const length=4+((x+y+frame*5)%9+9)%9;
        c.rect(x,y,length,1,(y%8===0)?COLORS.water2:COLORS.cyanDark);
        if ((x+y)%3===0) c.rect(x+2,y+1,Math.max(2,length-4),1,'#164f70');
      }
    }
    // Pixel reflections from three lamps.
    for (const [lx,color] of [[77,COLORS.gold],[159,COLORS.goldLight],[249,COLORS.gold]]) {
      for (let y=119;y<149;y+=4) {
        const width=Math.max(2,9-Math.floor((y-119)/5));
        const wobble=((frame+y)%3)-1;
        c.rect(lx-width/2+wobble,y,width,1,color);
      }
    }
    strip.blit(c,frame*320,0);
  }
  return strip;
}

function drawForeground() {
  const c = new PixelCanvas(320,180);
  // Flat, readable fighting floor at y=151.
  c.rect(0,151,320,29,COLORS.ink);
  c.rect(0,151,320,3,COLORS.steelLight);
  c.rect(0,154,320,3,COLORS.steelDark);
  c.rect(0,157,320,23,COLORS.asphalt);
  for (let x=-8;x<328;x+=24) {
    c.polygon([[x,157],[x+15,157],[x+9,180],[x-6,180]], ((x/24)&1)?'#202b36':'#28333e');
    c.rect(x+15,157,1,23,COLORS.ink2);
  }
  c.rect(0,167,320,2,COLORS.goldDark); c.rect(0,169,320,1,COLORS.gold);
  for (let x=7;x<320;x+=20) { c.rect(x,158,2,2,COLORS.steel); c.pixel(x,158,COLORS.silver); }
  // Bollards live at edges only to keep the fighters readable.
  for (const x of [7,302]) {
    c.rect(x,134,10,17,COLORS.ink); c.rect(x+2,136,6,15,COLORS.steelDark); c.rect(x+1,133,8,4,COLORS.steel); c.rect(x+3,134,4,1,COLORS.silver);
  }
  c.rect(0,178,320,2,COLORS.ink2);
  return c;
}

function frameBorder(c,x,y,w,h) {
  c.rect(x,y,w,h,COLORS.ink); c.rect(x+1,y+1,w-2,h-2,COLORS.steel); c.rect(x+2,y+2,w-4,h-4,COLORS.steelLight);
  c.rect(x+3,y+3,w-6,h-6,COLORS.steelDark); c.rect(x+4,y+4,w-8,h-8,COLORS.ink2);
  c.rect(x+2,y+2,4,2,COLORS.gold); c.rect(x+w-6,y+2,4,2,COLORS.gold); c.rect(x+2,y+h-4,4,2,COLORS.goldDark); c.rect(x+w-6,y+h-4,4,2,COLORS.goldDark);
}

async function generateUi() {
  const panel = new PixelCanvas(160,72); frameBorder(panel,0,0,160,72); panel.rect(6,6,148,2,COLORS.navy); panel.rect(7,10,146,1,COLORS.cyanDark); panel.checker(6,62,148,4,COLORS.ink2,COLORS.navy,2);
  await save('public/assets/ui/panel.png',panel);
  const button = new PixelCanvas(128,24); frameBorder(button,0,0,128,24); button.rect(7,7,114,2,COLORS.navy); button.rect(8,16,112,1,COLORS.goldDark); button.pixel(5,5,COLORS.silver); button.pixel(122,5,COLORS.silver);
  await save('public/assets/ui/button.png',button);
  // Faixa compacta de 32px (64px na tela em 2x). Barras de vida/meter são
  // desenhadas dinamicamente pela UIScene; aqui ficam só molduras e bordas,
  // evitando o desalinhamento entre a arte fixa e os segmentos dinâmicos.
  const hud = new PixelCanvas(320,32); hud.rect(0,0,320,2,COLORS.ink); hud.rect(0,2,320,1,COLORS.steel); hud.rect(0,3,320,1,COLORS.silver);
  frameBorder(hud,4,4,20,23); frameBorder(hud,296,4,20,23); frameBorder(hud,146,1,28,17);
  hud.rect(0,29,320,1,COLORS.steel); hud.rect(0,30,320,2,COLORS.ink);
  await save('public/assets/ui/hud-frame.png',hud);
  const selection = new PixelCanvas(64,80); frameBorder(selection,0,0,64,80); selection.rect(5,58,54,16,COLORS.navy); selection.rect(7,60,50,1,COLORS.cyan); selection.rect(4,4,56,52,COLORS.ink);
  await save('public/assets/ui/selection-frame.png',selection);
  const missing = new PixelCanvas(48,48); missing.checker(0,0,48,48,COLORS.magenta,COLORS.ink,4); frameBorder(missing,0,0,48,48);
  const q = GLYPHS['?']; q.forEach((row,y)=>[...row].forEach((value,x)=>{if(value==='1')missing.rect(14+x*3,11+y*3,3,3,COLORS.goldLight);}));
  await save('public/assets/ui/missing-asset.png',missing);
}

await generateFont();
await Promise.all([
  save('public/assets/stages/cais-da-cidade/far.png',drawSkylineFar()),
  save('public/assets/stages/cais-da-cidade/mid.png',drawMidLayer()),
  save('public/assets/stages/cais-da-cidade/water.png',drawWaterFrames()),
  save('public/assets/stages/cais-da-cidade/foreground.png',drawForeground()),
  generateUi(),
]);

console.log(`Assets de pixel art gerados: ${generated.length}`);
for (const item of generated.sort((a,b)=>a.path.localeCompare(b.path))) console.log(`${item.width}x${item.height} | ${item.path}`);

for (const item of generated) {
  const data = await readFile(join(ROOT,item.path));
  const signature = data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const ihdr = data.subarray(12,16).toString('ascii') === 'IHDR';
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (!signature || !ihdr || width !== item.width || height !== item.height) {
    throw new Error(`PNG inválido: ${item.path} (IHDR ${width}x${height})`);
  }
}
console.log(`Validação IHDR concluída: ${generated.length}/${generated.length} PNGs válidos.`);
