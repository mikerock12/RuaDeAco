// Exportação técnica das artes geradas: recorte, registro e redução nearest-neighbor.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { decodePng } from './fighterRasterAnalysis.mjs';
const source = 'art-source/stages/cais-remaster';
const output = 'public/assets/stages/cais-da-cidade/remaster';
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
for (let y = 0; y < 360; y++) for (let x = 0; x < 640; x++) sample(background, bgPixels, 640, x, y, (x + 0.5) * background.width / 640, (y + 0.5) * background.height / 360);
save('background', 640, 360, bgPixels);
for (let band = 0; band < 3; band++) {
  const pixels = Buffer.alloc(512 * 14 * 4);
  for (let y = 0; y < 14; y++) for (let x = 0; x < 512; x++) {
    const offset = ((196 + band * 15 + y) * 640 + 64 + x) * 4;
    bgPixels.copy(pixels, (y * 512 + x) * 4, offset, offset + 4);
  }
  save('water-' + band, 512, 14, pixels);
}
function bounds(image, roi) {
  const [left, top, right, bottom] = roi;
  let minX = right, minY = bottom, maxX = left, maxY = top;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    if (image.pixels[(y * image.width + x) * 4 + 3] < 128) continue;
    minX = Math.min(minX,x); minY = Math.min(minY,y); maxX = Math.max(maxX,x); maxY = Math.max(maxY,y);
  }
  if (maxX <= minX || maxY <= minY) throw Error('Sprite sem alpha definido');
  return { minX, minY, maxX, maxY, width: maxX-minX+1, height: maxY-minY+1 };
}
function exportFrames(file, rois, name, fw, fh, targetWidth, targetHeight, bottomAligned = true) {
  const image = decodePng(readFileSync(source + '/' + file));
  if (image.colorType !== 6 || !image.pixels.some((v,i)=> i%4===3 && v===0)) throw Error(name + ': alpha obrigatório');
  const boxes=rois.map(roi=>bounds(image,roi));
  const scale=Math.min(targetWidth/Math.max(...boxes.map(b=>b.width)),targetHeight/Math.max(...boxes.map(b=>b.height)));
  const pixels=Buffer.alloc(fw*rois.length*fh*4), width=fw*rois.length;
  boxes.forEach((box,frame)=>{
    const centerX=(box.minX+box.maxX)/2;
    const bottom=bottomAligned ? fh-3 : (fh+box.height*scale)/2;
    for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){
      const sx=centerX+(x-fw/2+0.5)/scale;
      const sy=box.maxY+(y-bottom+0.5)/scale;
      const [left,top,right,end]=rois[frame];
      if(sx>=left&&sx<right&&sy>=top&&sy<end)sample(image,pixels,width,frame*fw+x,y,sx,sy);
    }
  });
  save(name,width,fh,pixels);
  console.log(name+' content: '+boxes.map(b=>b.width+'x'+b.height).join(', '));
}
// Regiões independentes: o mastro do navio começa acima da metade do atlas.
exportFrames('props-source.png',[[0,0,768,512]],'moon',96,96,56,56,false);
exportFrames('props-source.png',[[768,0,1536,420]],'ufo',128,64,96,44,false);
exportFrames('props-source.png',[[0,512,790,1024]],'witch',88,64,72,48,false);
exportFrames('props-source.png',[[790,420,1536,1024]],'ship',160,128,144,110);
exportFrames('monster-source.png',Array.from({length:4},(_,i)=>[i*512,0,(i+1)*512,768]),'monster',128,144,118,132);
{
 const fx=decodePng(readFileSync(source+'/effects-source.png'));
 const rois=row=>Array.from({length:4},(_,i)=>[Math.round(i*fx.width/4),row === 0 ? 0 : Math.round(fx.height*0.70),Math.round((i+1)*fx.width/4),row === 0 ? Math.round(fx.height*0.70) : fx.height]);
 exportFrames('effects-source.png',rois(0),'fire',64,96,40,80);
 exportFrames('effects-source.png',rois(1),'splash',112,48,96,32);
}
