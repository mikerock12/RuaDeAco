// Technical atlas export: chroma-key, connected-component slicing, nearest sampling.
// No anatomy is painted or invented here; source art is generated and reviewed separately.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { decodePng } from './fighterRasterAnalysis.mjs';
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
  writeFileSync(name, png);
  console.log(name + ': ' + width + 'x' + height + ', ' + png.length + ' bytes');
}
function sample(image, target, width, x, y, sx, sy) {
  sx = Math.floor(sx); sy = Math.floor(sy);
  if (sx < 0 || sy < 0 || sx >= image.width || sy >= image.height) return;
  image.pixels.copy(target, (y * width + x) * 4, (sy * image.width + sx) * 4, (sy * image.width + sx) * 4 + 4);
}

function isolate(image) {
  const {width:w,height:h,pixels:p}=image;
  for(let i=0;i<p.length;i+=4) {
    if(p[i]>180 && p[i+2]>180 && p[i+1]<85 && Math.min(p[i],p[i+2])-p[i+1]>130) p[i+3]=0;
    else p[i+3]=255;
  }
  const visited=new Uint8Array(w*h), components=[];
  for(let start=0;start<w*h;start++) {
    if(visited[start]||!p[start*4+3]) continue;
    const stack=[start]; visited[start]=1; const points=[];
    let left=w,top=h,right=0,bottom=0;
    while(stack.length) {
      const i=stack.pop(),x=i%w,y=Math.floor(i/w);points.push(i);
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      for(const j of [x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1]) {
        if(j>=0&&!visited[j]&&p[j*4+3]){visited[j]=1;stack.push(j);}
      }
    }
    if(points.length>1500) components.push({left,top,right,bottom,points});
  }
  if(components.length!==12)throw Error('Expected 12 sprites, got '+components.length);
  components.sort((a,b)=>Math.floor(a.bottom/(h/3))-Math.floor(b.bottom/(h/3)) || a.left-b.left);
  return components;
}
const ids=['rafa-mare','guto-barba','noir-reflexo','astro-riso','dante-sinal','leo-violeta'];
const manifest={};
for(const id of [...ids,'monster']) {
  const monster=id==='monster';
  const source=monster?'art-source/stages/cais-finisher-v2/monster.png':'art-source/fighters/universal-grab-v2/'+id+(id==='rafa-mare'?'-keyed':'')+'.png';
  const sourceBytes=readFileSync(source);
  const image=decodePng(sourceBytes), boxes=isolate(image);
  // Neutralize tiny green key spill on the two monochrome character palettes.
  if(id==='leo-violeta'||id==='noir-reflexo') for(let i=0;i<image.pixels.length;i+=4) {
    const p=image.pixels;
    if(p[i+1]>=24 && p[i+1]-p[i]>=8 && p[i+1]-p[i+2]>=8) p[i+1]=Math.max(p[i],p[i+2])+7;
  }
  const fw=monster?192:id==='guto-barba'?288:256, fh=monster?192:fw;
  const target=monster?156:id==='guto-barba'?202:id==='astro-riso'?159:176;
  const referenceHeight=monster?Math.max(...boxes.map(b=>b.bottom-b.top+1)):boxes[0].bottom-boxes[0].top+1;
  const scale=target/referenceHeight;
  const pixels=Buffer.alloc(fw*12*fh*4), outWidth=fw*12;
  const transforms=[];
  for(let frame=0;frame<12;frame++) {
    const b=boxes[frame], layer=new Set(b.points);
    // The root follows the center of the planted feet, never extended hands.
    const feet=b.points.filter(i=>Math.floor(i/image.width)>b.bottom-referenceHeight*0.09).map(i=>i%image.width);
    const center=(Math.min(...feet)+Math.max(...feet))/2;
    const baseline=fh-(monster?3:7);
    transforms.push({sourceBounds:{left:b.left,top:b.top,right:b.right,bottom:b.bottom},center,baseline,scale});
    for(let y=0;y<fh;y++) for(let x=0;x<fw;x++) {
      const sx=Math.floor(center+(x-fw/2+0.5)/scale),sy=y===baseline?b.bottom:Math.floor(b.bottom+(y-baseline+0.5)/scale);
      const i=sy*image.width+sx;
      if(sx>=0&&sy>=0&&sx<image.width&&sy<image.height&&layer.has(i)) sample(image,pixels,outWidth,frame*fw+x,y,sx,sy);
    }
  }
  // Align the sampled opaque feet (a narrow sole can fall between sample columns).
  if(!monster) for(let frame=0;frame<12;frame++) {
    let bottom=-1;
    for(let y=0;y<fh;y++) for(let x=0;x<fw;x++) if(pixels[(y*outWidth+frame*fw+x)*4+3]) bottom=y;
    const shift=fh-7-bottom;
    if(shift>0) for(let y=fh-1;y>=0;y--) {
      const target=(y*outWidth+frame*fw)*4;
      if(y>=shift) pixels.copy(pixels,target,((y-shift)*outWidth+frame*fw)*4,((y-shift)*outWidth+frame*fw+fw)*4);
      else pixels.fill(0,target,target+fw*4);
    }
    transforms[frame].rootOffset=shift;
  }
  const file=monster?'public/assets/stages/cais-da-cidade/remaster/monster-finisher-v2.png':'public/assets/fighters/'+id+'/universal-grab-v2.png';
  save(file,outWidth,fh,pixels);
  manifest[id]={source,file,sourceSha256:createHash('sha256').update(sourceBytes).digest('hex'),outputSha256:createHash('sha256').update(readFileSync(file)).digest('hex'),sourceWidth:image.width,sourceHeight:image.height,frameWidth:fw,frameHeight:fh,frames:12,transforms};
}
writeFileSync('art-source/fighters/universal-grab-v2/export-manifest.json',JSON.stringify(manifest,null,2)+'\n');

const landmarks=JSON.parse(readFileSync('art-source/fighters/universal-grab-v2/hand-landmarks.json','utf8'));
const hands=Object.fromEntries(ids.map(id=>[id,landmarks[id].map(([x,y],i)=>{
  const m=manifest[id],t=m.transforms[i];
  return [Math.round((x+i%4*m.sourceWidth/4-t.center)*t.scale),Math.round((y+Math.floor(i/4)*m.sourceHeight/3-t.sourceBounds.bottom)*t.scale)+(t.rootOffset||0)];
})]));
const timingPath='src/fighters/grabArtTiming.ts';
let timing=readFileSync(timingPath,'utf8');
timing=timing.replace(/(export const GRAB_HANDS:[\s\S]*? = )[\s\S]*?(;\r?\nexport const GRAB_POSE_STARTS)/,(_,start,end)=>start+JSON.stringify(hands,null,2)+end);
writeFileSync(timingPath,timing);
