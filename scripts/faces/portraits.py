"""Retratos de menu, seleção, HUD, versus e resultado a partir dos sprites do jogo.

Substitui as fichas conceituais (ilustrações quase fotográficas) dos cinco
lutadores por cartões em pixel art montados com o próprio quadro de pose de
vitória/idle já com o rosto novo, ampliado em nearest-neighbor. O Guto mantém o
retrato aprovado e ganha só acabamento: contorno frio e flocos de gelo.

Uso: python3 scripts/faces/portraits.py   (a partir da raiz do repositório)
Escreve public/assets/portraits/<id>.png, guto-barba.png e imprime os recortes.
"""
import json
import numpy as np
from PIL import Image

OUT = 'public/assets/portraits'
SCALE = 2
SIZE = 512
FIGHTERS = {
  # id: (folha, quadro, cor de fundo escura, cor de destaque)
  'rafa-mare': ('idle.png', 0, '#06202a', '#2fc4cc'),
  'noir-reflexo': ('idle.png', 0, '#0c1424', '#7fd8f0'),
  'astro-riso': ('idle.png', 0, '#1d0a2a', '#e35fe8'),
  'dante-sinal': ('idle.png', 0, '#1e0a0c', '#ff3a46'),
  'leo-violeta': ('idle.png', 0, '#120a24', '#9a6cff'),
}
HEADS = {
  'rafa-mare': (124, 73, 151, 107),
  'noir-reflexo': (123, 68, 150, 99),
  'astro-riso': (127, 80, 156, 116),
  'dante-sinal': (125, 71, 158, 110),
  'leo-violeta': (129, 69, 157, 104),
}

def rgb(h):
  h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)

def background(dark, accent):
  y, x = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
  # faixas quantizadas (sem gradiente suave) e raios diagonais
  t = np.clip(1 - y / SIZE, 0, 1)
  bands = np.floor(t * 6) / 6
  base = dark[None, None] * (1 - bands[..., None] * 0.35) + accent[None, None] * (bands[..., None] * 0.22)
  rays = (((x + y * 0.55) // 18) % 5 == 0) & (y < SIZE * 0.85)
  base[rays] = base[rays] * 0.75 + accent * 0.25
  # halo atrás da cabeça em anéis de pixels
  return base

def card(fighter):
  sheet, frame, dark, accent = FIGHTERS[fighter]
  im = Image.open(f'public/assets/fighters/{fighter}/{sheet}').convert('RGBA')
  fs = im.height
  body = im.crop((frame * fs, 0, (frame + 1) * fs, fs)).resize((fs * SCALE, fs * SCALE), Image.NEAREST)
  dark_c, accent_c = rgb(dark), rgb(accent)
  bg = background(dark_c, accent_c)
  x0, y0, x1, y1 = HEADS[fighter]
  hx, hy = (x0 + x1) / 2 * SCALE, (y0 + y1) / 2 * SCALE
  yy, xx = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
  r = np.hypot(xx - hx, yy - hy)
  for radius, mix in ((150, 0.10), (110, 0.16), (78, 0.24)):
    ring = r < radius
    bg[ring] = bg[ring] * (1 - mix) + accent_c * mix
  canvas = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
  # contorno de 2 px na cor de destaque para destacar a silhueta do fundo
  a = np.array(body)[..., 3] > 40
  outline = np.zeros_like(a)
  for dx, dy in ((2, 0), (-2, 0), (0, 2), (0, -2), (1, 1), (-1, -1), (1, -1), (-1, 1)):
    outline |= np.roll(np.roll(a, dy, 0), dx, 1)
  outline &= ~a
  ol = np.zeros((*a.shape, 4), np.uint8); ol[outline] = (*accent_c.astype(np.uint8), 255)
  canvas.alpha_composite(Image.fromarray(ol, 'RGBA'))
  canvas.alpha_composite(body)
  canvas = canvas.convert('RGB')
  canvas.save(f'{OUT}/{fighter}.png', optimize=True)
  hxi, hyi = int(hx), int(hy)
  def box(cx, top, w, h):
    x = int(max(0, min(SIZE - w, cx - w // 2))); y = int(max(0, min(SIZE - h, top)))
    return dict(x=x, y=y, width=w, height=h)
  return dict(
    hud=box(hxi, hyi - 52, 96, 108),
    card=box(hxi, hyi - 62, 196, 150),
    profile=box(hxi, hyi - 72, 216, 288),
    hero=box(hxi + 10, hyi - 84, 320, 400),
  )

def guto():
  """Retrato aprovado do Guto, intacto, com contorno gelado e flocos no fundo azul."""
  src = Image.open('public/assets/references/guto-barba-portrait-final.png').convert('RGB')
  p = np.array(src).astype(np.float32)
  r, g, b = p[..., 0], p[..., 1], p[..., 2]
  H, W = r.shape
  yy, xx = np.mgrid[0:H, 0:W]
  inner = (xx > 112) & (xx < W - 112) & (yy > 100) & (yy < H - 330)
  blue_bg = (b > r + 35) & (b > g + 15) & inner
  person = inner & ~blue_bg
  # contorno frio: pixels do fundo a até 7 px do Guto recebem luz ciano em degraus
  from scipy.ndimage import distance_transform_edt, binary_opening
  from scipy.ndimage import label
  person = binary_opening(person, iterations=2)
  lab, n = label(person)
  if n > 1:
    sizes = np.bincount(lab.ravel()); sizes[0] = 0
    person = lab == sizes.argmax()
  d = distance_transform_edt(~person)
  rim = blue_bg & (d <= 14)
  ice = np.array([150, 236, 255], np.float32)
  step = np.where(d <= 4, 0.85, np.where(d <= 8, 0.5, 0.22))
  p[rim] = p[rim] * (1 - step[rim, None]) + ice * step[rim, None]
  # flocos em cruz de pixel, posições fixas, só no fundo azul
  rng = np.random.default_rng(42)
  for _ in range(60):
    cx, cy = int(rng.integers(90, W - 90)), int(rng.integers(80, H - 190))
    if not blue_bg[cy, cx] or d[cy, cx] < 24: continue
    s = int(rng.integers(3, 6))
    for ddx, ddy in [(0, 0)] + [(k, 0) for k in range(-s, s + 1)] + [(0, k) for k in range(-s, s + 1)]:
      x, y = cx + ddx * 2, cy + ddy * 2
      if 0 <= x < W - 1 and 0 <= y < H - 1 and blue_bg[y, x]:
        p[y:y + 2, x:x + 2] = ice * 0.85 + p[y:y + 2, x:x + 2] * 0.15
  Image.fromarray(np.clip(p, 0, 255).astype(np.uint8), 'RGB').save(f'{OUT}/guto-barba.png', optimize=True)

if __name__ == '__main__':
  import os
  os.makedirs(OUT, exist_ok=True)
  crops = {f: card(f) for f in FIGHTERS}
  guto()
  print(json.dumps(crops, indent=1))
