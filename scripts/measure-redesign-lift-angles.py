"""Inclinação por pose, medida pelo eixo principal da silhueta; Guto permanece original."""
from pathlib import Path
import json,re
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
def main():
    source=ROOT/'art-source/fighters/redesign-v4'
    plan=json.loads((source/'export-plan.json').read_text(encoding='utf-8-sig')); measurements={}
    for fid in plan:
        sheet=Image.open(ROOT/f'public/assets/fighters/{fid}/grabbed-lifted.png').convert('RGBA'); angles=[]
        for i in range(8):
            mask=np.array(sheet.crop((i*256,0,(i+1)*256,256)))[...,3]>0
            y,x=np.where(mask); _,vectors=np.linalg.eigh(np.cov(np.stack([x,y])))
            vx,vy=vectors[:,-1]
            # Em pé: vetor aponta para cima. Deitado: cabeça está à direita na fonte.
            if (i<6 and vy>0) or (i>=6 and vx>0): vx,vy=-vx,-vy
            angle=-float(np.arctan2(vx,-vy))
            if i==7: angle=np.pi/2
            angles.append(round(angle,4))
        measurements[fid]=angles
    (source/'lift-angles.json').write_text(json.dumps(measurements,indent=2)+'\n',encoding='utf8')
    p=ROOT/'src/fighters/grabArtTiming.ts'; s=p.read_text(encoding='utf8')
    s=s.replace('readonly tilt: number }>>', 'readonly tilt: number; readonly tilts?: readonly number[] }>>')
    for fid,angles in measurements.items():
        s=re.sub(r"  '"+fid+r"': \{ frames: \[[^\]]+\], tilt: [^}\n]+\}", "  '"+fid+"': { frames: [0, 1, 2, 3, 4, 5, 6, 7], tilt: Math.PI / 2, tilts: "+json.dumps(angles)+" }",s)
    s=s.replace('tilt: art.tilt * (last ? step / last : 1)', 'tilt: art.tilts?.[step] ?? art.tilt * (last ? step / last : 1)')
    p.write_text(s,encoding='utf8')
if __name__=='__main__': main()
