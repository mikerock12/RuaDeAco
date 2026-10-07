"""Atualiza os SHA-256 de saída travados pela auditoria de sprites depois da troca de rostos.

As folhas do agarrão (export-manifest.json) e as de Léo/Noir
(leo-noir-pipeline-cleanup-report.json) têm o hash da saída registrado. A troca
de rostos é um pós-processamento: o hash anterior fica em
preFaceRestyleOutputSha256 e a etapa é anotada em postProcess.
"""
import hashlib, json

def sha(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()
NOTE = 'scripts/faces/restyle.py (faces-v3, 07/10/2026)'

def touch(rep, path):
  h = sha(path)
  if h == rep['outputSha256']: return 0
  rep.setdefault('preFaceRestyleOutputSha256', rep['outputSha256'])
  rep['outputSha256'] = h; rep['postProcess'] = NOTE
  return 1

n = 0
p = 'scripts/data/leo-noir-pipeline-cleanup-report.json'; d = json.load(open(p))
for fid, files in d.items():
  if isinstance(files, dict):
    for name, rep in files.items():
      if isinstance(rep, dict) and 'outputSha256' in rep:
        n += touch(rep, f'public/assets/fighters/{fid}/{name}.png')
json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False); open(p, 'a').write('\n')
p = 'art-source/fighters/universal-grab-v2/export-manifest.json'; m = json.load(open(p))
for fid, rep in m.items(): n += touch(rep, rep['file'])
json.dump(m, open(p, 'w'), indent=2, ensure_ascii=False); open(p, 'a').write('\n')
print('hashes atualizados:', n)
