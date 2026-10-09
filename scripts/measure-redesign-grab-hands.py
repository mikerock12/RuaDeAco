"""Leva marcações manuais das mãos da fonte às coordenadas reais do corpo exportado."""
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'art-source/fighters/redesign-v4'
def read(name): return json.loads((SOURCE/name).read_text(encoding='utf-8-sig'))
def main():
    manifest=read('export-manifest.json'); points=read('hand-landmarks.json')
    if len(points)!=5: raise ValueError('São necessárias as marcações dos cinco corpos novos')
    path=ROOT/'src/fighters/grabArtTiming.ts'; text=path.read_text(encoding='utf-8')
    for fid,hands in points.items():
        transforms=manifest[fid]['universal-grab-v2']['transforms']
        if len(hands)!=12: raise ValueError(fid+': são necessárias 12 poses')
        output=[]
        for (x,y),t in zip(hands,transforms):
            left,top,_,_=t['sourceCell']; bx,by,br,bb=t['sourceBounds']
            if not left+bx-8<=x<=left+br+8 or not top+by-8<=y<=top+bb+8: raise ValueError(f'{fid}: mão fora do corpo {(x,y)}')
            output.append([round(t['outputLeft']+(x-left-bx)*t['scale']-128),round(t['outputTop']+(y-top-by)*t['scale']-250)])
        body='  "'+fid+'": '+json.dumps(output)+','
        text,n=re.subn(r'  "'+re.escape(fid)+r'": \[\s*(?:\[\s*-?\d+\s*,\s*-?\d+\s*\]\s*,?\s*)+\],?',body,text,count=1)
        if n!=1: raise ValueError('Tabela ausente: '+fid)
    path.write_text(text,encoding='utf-8')
if __name__=='__main__': main()
