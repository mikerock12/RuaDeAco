"""Localiza a cabeça em cada quadro por correspondência de molde (rotação, escala, espelho)."""
import json, os, sys
import numpy as np, cv2
from PIL import Image, ImageDraw
from concurrent.futures import ProcessPoolExecutor

import os as _os
# Folhas ORIGINAIS (antes da troca de rostos). Para reproduzir, extraia-as de
# git (commit becdd61) para esta pasta: git archive becdd61 public/assets/fighters | tar -x -C /tmp/orig
ROOT = _os.environ.get('FACES_SRC', '/tmp/orig/public/assets/fighters')
S = _os.environ.get('FACES_DATA', 'art-source/fighters/faces-v3')
# Caixa da cabeça no quadro 0 de idle.png: (x0, y0, x1, y1), exclusiva.
HEADS = {
  'rafa-mare': (124, 73, 151, 107),
  'noir-reflexo': (123, 68, 150, 99),
  'astro-riso': (127, 80, 156, 116),
  'dante-sinal': (125, 71, 158, 110),
  'leo-violeta': (129, 69, 157, 104),
}
ANGLES = list(range(0, 360, 15))
SCALES = [0.85, 0.95, 1.05, 1.15]
# Folhas em que a cabeça pode girar livremente (quedas, arremessos, deitado).
FREE = ('knockdown', 'knockout', 'thrown', 'fall', 'wake-up', 'grabbed-lifted', 'universal-grab', 'frozen', 'jump', 'air-')

def angle_dist(a):
  a = a % 360
  return min(a, 360 - a)

def to_feat(rgba):
  a = rgba[:, :, 3:4].astype(np.float32) / 255.0
  rgb = rgba[:, :, :3].astype(np.float32) * a
  return np.concatenate([rgb, a * 255.0], axis=2)

def variants(template, angles=ANGLES, scales=SCALES, mirrors=(False, True)):
  template = cv2.GaussianBlur(template, (3, 3), 0)
  h, w = template.shape[:2]
  out = []
  for mirror in mirrors:
    t = template[:, ::-1] if mirror else template
    for s in scales:
      for ang in angles:
        diag = int(np.ceil(np.hypot(w, h) * s)) + 2
        M = cv2.getRotationMatrix2D((w / 2, h / 2), ang, s)
        M[0, 2] += diag / 2 - w / 2; M[1, 2] += diag / 2 - h / 2
        rt = cv2.warpAffine(t, M, (diag, diag), flags=cv2.INTER_NEAREST, borderValue=(0, 0, 0, 0))
        mask = cv2.warpAffine(np.full((h, w), 255, np.uint8), M, (diag, diag), flags=cv2.INTER_NEAREST)
        out.append(dict(mirror=mirror, scale=s, angle=ang, t=to_feat(rt), m=np.repeat((mask > 0).astype(np.float32)[:, :, None], 4, 2), size=diag))
  return out

def best_match(f, V, pad, top, free, prior=True):
  best = None
  for v in V:
    r = cv2.matchTemplate(f, v['t'], cv2.TM_SQDIFF, mask=v['m'])
    norm = v['m'].sum()
    r = r / norm
    if prior:
      # Cabeça em pé e no alto da silhueta, salvo nas folhas de queda/giro.
      r = r + angle_dist(v['angle']) * (6 if free else 25)
      if not free:
        ys = np.arange(r.shape[0])[:, None] + v['size'] / 2 - pad
        r = r + np.maximum(0, ys - (top + 45)) * 30
    mn, _, loc, _ = cv2.minMaxLoc(r)
    if best is None or mn < best[0]: best = (mn, loc, v)
  return best

def detect(args):
  fighter, file = args
  tmpl = np.array(Image.open(f'{ROOT}/{fighter}/idle.png').convert('RGBA'))[:, :256]
  x0, y0, x1, y1 = HEADS[fighter]
  head = tmpl[y0:y1, x0:x1]
  free = any(k in file for k in FREE)
  V = variants(head, ANGLES if free else [a for a in ANGLES if angle_dist(a) <= 45])
  im = np.array(Image.open(f'{ROOT}/{fighter}/{file}').convert('RGBA'))
  fs = im.shape[0]; n = im.shape[1] // fs
  res = []
  for k in range(n):
    frame = im[:, k * fs:(k + 1) * fs]
    if (frame[:, :, 3] > 0).sum() < 200: res.append(None); continue
    ys = np.nonzero((frame[:, :, 3] > 64).any(axis=1))[0]; top = ys.min()
    pad = 40
    f = to_feat(cv2.GaussianBlur(cv2.copyMakeBorder(frame, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=(0, 0, 0, 0)), (3, 3), 0))
    score, loc, v = best_match(f, V, pad, top, free)
    # Refino fino de ângulo e escala em volta do melhor candidato.
    R = variants(head, [v['angle'] + d for d in (-10, -5, 0, 5, 10)], [v['scale'] + d for d in (-0.05, 0, 0.05)], (v['mirror'],))
    score2, loc2, v2 = best_match(f, R, pad, top, free)
    if score2 <= score: score, loc, v = score2, loc2, v2
    cx = loc[0] + v['size'] / 2 - pad; cy = loc[1] + v['size'] / 2 - pad
    res.append(dict(cx=float(cx), cy=float(cy), angle=v['angle'] % 360, scale=round(v['scale'], 3), mirror=v['mirror'], score=float(score)))
  return fighter, file, fs, res

if __name__ == '__main__':
  fighters = sys.argv[1].split(',')
  jobs = []
  for fighter in fighters:
    for file in sorted(os.listdir(f'{ROOT}/{fighter}')):
      if 'effect' in file: continue
      jobs.append((fighter, file))
  out = {}
  with ProcessPoolExecutor() as ex:
    for fighter, file, fs, res in ex.map(detect, jobs):
      out.setdefault(fighter, {})[file] = dict(frameSize=fs, frames=res)
      print(fighter, file, [round(r['score']) if r else None for r in res], flush=True)
  for fighter in fighters:
    json.dump(out[fighter], open(f'{S}/heads-{fighter}.json', 'w'), indent=1)
