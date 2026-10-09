"""Exportação técnica v4: recorte, alpha binário e nearest-neighbor; sem redesenhar anatomia."""
from pathlib import Path
import argparse, hashlib, json, time
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'art-source/fighters/redesign-v4'
PUBLIC=ROOT/'public/assets/fighters'
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def read_json(path): return json.loads(path.read_text(encoding='utf-8-sig'))
def clean(cell):
    p=np.array(cell.convert('RGBA'))
    mask=p[...,3]>=160
    h,w=mask.shape; visited=np.zeros_like(mask); removed=0
    for sy,sx in zip(*np.where(mask)):
        if visited[sy,sx]: continue
        stack=[(int(sy),int(sx))]; visited[sy,sx]=True; points=[]
        while stack:
            y,x=stack.pop(); points.append((y,x))
            for ny,nx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
                if 0<=ny<h and 0<=nx<w and mask[ny,nx] and not visited[ny,nx]:
                    visited[ny,nx]=True; stack.append((ny,nx))
        if len(points)<24:
            removed+=len(points)
            for y,x in points: mask[y,x]=False
    if not mask.any(): raise ValueError('Célula vazia após limpar alpha')
    p[...,3]=mask.astype(np.uint8)*255; p[~mask]=0
    return Image.fromarray(p),removed
def split_atlas(path,rows):
    im=Image.open(path).convert('RGBA'); pixels=np.array(im)
    mask=pixels[...,3]>=160; seen=np.zeros_like(mask); h,w=mask.shape; components=[]
    for sy,sx in zip(*np.where(mask)):
        if seen[sy,sx]: continue
        stack=[(int(sy),int(sx))]; seen[sy,sx]=True; points=[]
        while stack:
            y,x=stack.pop(); points.append((y,x))
            for ny,nx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
                if 0<=ny<h and 0<=nx<w and mask[ny,nx] and not seen[ny,nx]:
                    seen[ny,nx]=True; stack.append((ny,nx))
        if len(points)>1000:
            ys,xs=zip(*points); components.append((min(xs),min(ys),max(xs)+1,max(ys)+1,points))
    if len(components)!=rows*4: raise ValueError(f'{path.name}: {len(components)} corpos, esperado {rows*4}')
    # Corpos completos, inclusive mãos que cruzam a grade nominal. Nunca cortar pela grade.
    components.sort(key=lambda b:(min(rows-1,int((b[1]+b[3])/2/(h/rows))),b[0]))
    cells=[]
    for left,top,right,bottom,points in components:
        box=(max(0,left-3),max(0,top-3),min(w,right+3),min(h,bottom+3))
        data=np.zeros((box[3]-box[1],box[2]-box[0],4),dtype=np.uint8)
        ys,xs=zip(*points); ys=np.array(ys); xs=np.array(xs)
        data[ys-box[1],xs-box[0]]=pixels[ys,xs]; data[ys-box[1],xs-box[0],3]=255
        if path.name.startswith(('leo-violeta','noir-reflexo')):
            green=(data[...,1]>=24)&(data[...,1].astype(int)-data[...,0]>=8)&(data[...,1].astype(int)-data[...,2]>=8)
            data[...,1][green]=np.maximum(data[...,0],data[...,2])[green]+7
        cells.append((Image.fromarray(data),box,0))
    return im,cells

def export_atlas(fid,group,spec,reference,target):
    path=SOURCE/f'{fid}-{group}.png'; im,cells=split_atlas(path,spec['rows'])
    scale=reference*(1280/im.height)*(spec['rows']/4)*spec.get('scaleAdjustment',1)
    if group=='motion':
        heights=[c.getbbox()[3]-c.getbbox()[1] for c,_,_ in cells[:4]]
        scale=target/float(np.median(heights))
    if group!='motion':
        idle=Image.open(PUBLIC/fid/'idle.png').convert('RGBA')
        idle_counts=[np.count_nonzero(np.array(idle.crop((i*256,0,(i+1)*256,256)))[...,3]) for i in range(4)]
        source_counts=[np.count_nonzero(np.array(c)[...,3]) for c,_,_ in cells]
        # One atlas-wide calibration, never individual-pose stretching.
        scale=(float(np.median(idle_counts))/float(np.median(source_counts)))**.5*spec.get('scaleAdjustment',1)
    if spec.get('heightCalibration'):
        heights=[cells[i][0].getbbox()[3]-cells[i][0].getbbox()[1] for i in spec['heightCalibration']]
        scale=target/float(np.median(heights))*spec.get('scaleAdjustment',1)
    if group=='grab':
        heights=[c.getbbox()[3]-c.getbbox()[1] for c,_,_ in cells[:3]]
        scale=target/float(np.median(heights))
    output=[]
    for name,indices in spec['selections'].items():
        strip=Image.new('RGBA',(256*len(indices),256)); transforms=[]
        for f,i in enumerate(indices):
            cell,source_box,removed=cells[i]; bbox=cell.getbbox(); body=cell.crop(bbox)
            size=(max(1,round(body.width*scale)),max(1,round(body.height*scale)))
            if size[0]>244 or size[1]>243: raise ValueError(f'{fid}/{group}/{i}: corpo {size} excede margens; revisar fonte/escala')
            body=body.resize(size,Image.Resampling.NEAREST); body=body.crop(body.getbbox())
            mirrored=i in spec.get('mirrorCells',[])
            if mirrored: body=body.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            opaque=np.array(body)[...,3]>0
            yy,xx=np.where(opaque&(np.arange(body.height)[:,None]>=body.height-max(2,round(body.height*.07))))
            center=(int(xx.min())+int(xx.max()))/2 if len(xx) else body.width/2
            if body.width>body.height*1.3: center=body.width/2
            x=round(128-center)
            if x<6 or x+body.width>250: x=round(128-body.width/2)
            y=250-body.height; strip.alpha_composite(body,(f*256+x,y))
            transforms.append({'cell':i,'mirrorX':mirrored,'sourceCell':source_box,'sourceBounds':list(bbox),'scale':scale,
                'outputLeft':x,'outputTop':y,'outputWidth':body.width,'outputHeight':body.height,
                'removedSmallComponentPixels':removed})
        out=PUBLIC/fid/f'{name}.png'
        temp=out.with_suffix('.exporting.png'); strip.save(temp,optimize=True)
        for attempt in range(15):
            try: temp.replace(out); break
            except PermissionError:
                if attempt==14: raise
                time.sleep(.2)
        counts=[]; heights=[]
        for i in range(len(indices)):
            frame=strip.crop((i*256,0,(i+1)*256,256)); counts.append(int(np.count_nonzero(np.array(frame)[...,3]))); b=frame.getbbox(); heights.append(b[3]-b[1])
        output.append((name,{'rasterContract':{'medianHeight':float(np.median(heights)),'medianMass':float(np.median(counts))},'source':path.relative_to(ROOT).as_posix(),'file':out.relative_to(ROOT).as_posix(),
            'sourceSha256':sha(path),'outputSha256':sha(out),'frames':len(indices),'frameWidth':256,'frameHeight':256,
            'scale':scale,'transforms':transforms}))
    return scale,output
def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--fighter'); parser.add_argument('--group'); parser.add_argument('--available',action='store_true')
    args=parser.parse_args(); plan=read_json(SOURCE/'export-plan.json'); mp=SOURCE/'export-manifest.json'
    manifest=read_json(mp) if mp.exists() else {}
    for fid,config in plan.items():
        if args.fighter and fid!=args.fighter: continue
        motion=SOURCE/f'{fid}-motion.png'
        if args.available and not motion.exists(): continue
        manifest.setdefault(fid,{}); reference=None
        for group,spec in config['groups'].items():
            if args.group and group!=args.group: continue
            path=SOURCE/f'{fid}-{group}.png'
            if args.available and not path.exists(): continue
            scale,entries=export_atlas(fid,group,spec,reference or 1,config['height'])
            if group=='motion': reference=scale*Image.open(path).height/1280
            manifest[fid].update(dict(entries)); mp.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf-8'); print(f'{fid}/{group}: {len(entries)} folhas, escala {scale:.4f}')
    mp.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
if __name__=='__main__': main()
