"""Retratos v4 separados dos corpos, exportados em nearest-neighbor; preserva o Guto."""
from pathlib import Path
import importlib.util,json,re,time
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
def main():
    spec=importlib.util.spec_from_file_location('portraits',ROOT/'scripts/faces/portraits.py')
    module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    colors={'rafa-mare':('#06202a','#2fc4cc'),'noir-reflexo':('#0c1424','#7fd8f0'),
      'astro-riso':('#1d0a2a','#e35fe8'),'dante-sinal':('#0a2012','#79e327'),'leo-violeta':('#120a24','#9a6cff')}
    for fighter in module.FIGHTERS:
        image=Image.open(ROOT/f'public/assets/fighters/{fighter}/idle.png').convert('RGBA').crop((0,0,256,256))
        box=image.getbbox(); top=box[1]
        band=np.array(image)[top:top+round((box[3]-top)*.24),:,3]>0
        yy,xx=np.where(band); cx=int(np.mean(xx)); cy=top+int(np.mean(yy))
        # O capuz do Astro é grande: enquadrar o rosto, não o centro de massa do chapéu.
        if fighter == "astro-riso": cx,cy=160,135
        module.HEADS[fighter]=(cx-14,cy-18,cx+14,cy+18)
        module.FIGHTERS[fighter]=('idle.png',0,*colors[fighter])
    temporary=ROOT/'tmp/redesign-portraits'; temporary.mkdir(parents=True,exist_ok=True); module.OUT=str(temporary)
    crops={fighter:module.card(fighter) for fighter in module.FIGHTERS}
    for fighter in module.FIGHTERS:
        for attempt in range(15):
            try: (temporary/f'{fighter}.png').replace(ROOT/f'public/assets/portraits/{fighter}.png'); break
            except PermissionError:
                if attempt==14: raise
                time.sleep(.2)
    (ROOT/'art-source/fighters/redesign-v4/portrait-crops.json').write_text(json.dumps(crops,indent=2)+'\n',encoding='utf8')
    path=ROOT/'src/assets/assetManifest.ts'; text=path.read_text(encoding='utf8')
    for fighter,crop in crops.items():
        pattern=r"('"+re.escape(fighter)+r"': portrait\([^,]+,[^,]+, )\{[\s\S]*?\n\s*\}\),"
        text,count=re.subn(pattern,lambda m:m[1]+json.dumps(crop,indent=2)+'),',text,count=1)
        if count!=1: raise ValueError('Recortes ausentes para '+fighter)
    text=text.replace('por scripts/faces/portraits.py','por scripts/export-redesign-portraits.py (v4)')
    path.write_text(text,encoding='utf8')
if __name__=='__main__': main()
