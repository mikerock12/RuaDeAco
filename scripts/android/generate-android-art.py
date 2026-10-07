"""Ícones do Android, tela de abertura e imagens da ficha da Play Store.

Tudo sai do logo do jogo e dos retratos em pixel art, sem arte nova de terceiros.
Uso (na raiz do repositório): python3 scripts/android/generate-android-art.py
"""
import os
import numpy as np
from PIL import Image, ImageDraw

LOGO = 'public/assets/references/rua-de-aco-logo.png'
RES = 'android/app/src/main/res'
STORE = 'play-store/graphics'
BG = (7, 11, 26)
GLOW = (21, 122, 163)

def logo_block():
  """Recorte do letreiro "RUA DE AÇO" com o brasão, sem as faíscas laterais."""
  im = Image.open(LOGO).convert('RGB')
  crop = im.crop((300, 90, 1150, 1000))
  a = np.array(crop).astype(np.int32)
  # fundo do logo é quase preto: vira transparente para compor sobre qualquer cor
  dark = a.max(axis=2) < 24
  rgba = np.dstack([a, np.where(dark, 0, 255)]).astype(np.uint8)
  img = Image.fromarray(rgba, 'RGBA')
  return img.crop(img.getbbox())

def glow_bg(w, h, center=None, radius=None):
  y, x = np.mgrid[0:h, 0:w].astype(np.float32)
  cx, cy = center or (w / 2, h / 2)
  r = np.hypot(x - cx, y - cy) / (radius or max(w, h) / 1.6)
  t = np.clip(1 - r, 0, 1)
  t = np.floor(t * 6) / 6  # faixas quantizadas, estilo 16-bit
  bg = np.array(BG, np.float32)[None, None] * (1 - t[..., None] * 0.7) + np.array(GLOW, np.float32)[None, None] * (t[..., None] * 0.55)
  return Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')

def fit(img, w, h):
  s = min(w / img.width, h / img.height)
  return img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)

def paste_center(canvas, img, cy=None):
  x = (canvas.width - img.width) // 2
  y = (canvas.height - img.height) // 2 if cy is None else int(cy - img.height / 2)
  canvas.alpha_composite(img, (x, y))

def icon(size, safe=0.86, round_mask=False):
  c = glow_bg(size, size)
  paste_center(c, fit(LOGO_IMG, size * safe, size * safe))
  if round_mask:
    m = Image.new('L', (size, size), 0); ImageDraw.Draw(m).ellipse((0, 0, size - 1, size - 1), fill=255)
    c.putalpha(m)
  return c

def foreground(size):
  # zona segura do ícone adaptativo: 66/108 do quadro
  c = Image.new('RGBA', (size, size), (0, 0, 0, 0))
  paste_center(c, fit(LOGO_IMG, size * 0.6, size * 0.6))
  return c

def splash(w, h):
  c = glow_bg(w, h)
  paste_center(c, fit(LOGO_IMG, w * 0.55, h * 0.55))
  return c.convert('RGB')

def feature_graphic():
  w, h = 1024, 500
  c = Image.open('public/assets/stages/cais-da-cidade/remaster/background.png').convert('RGBA').resize((1024, 576), Image.NEAREST).crop((0, 38, 1024, 538))
  shade = Image.new('RGBA', (w, h), (4, 8, 20, 120)); c.alpha_composite(shade)
  roster = ['rafa-mare', 'noir-reflexo', 'astro-riso', 'dante-sinal', 'leo-violeta', 'guto-barba']
  xs = [70, 205, 330, 694, 818, 950]
  for fid, x in zip(roster, xs):
    sheet = Image.open(f'public/assets/fighters/{fid}/victory.png').convert('RGBA')
    fs = sheet.height
    f = sheet.crop((0, 0, fs, fs)); f = f.crop(f.getbbox())
    f = f.resize((round(f.width * 1.25), round(f.height * 1.25)), Image.NEAREST)
    if x > 512: f = f.transpose(Image.FLIP_LEFT_RIGHT)
    c.alpha_composite(f, (int(x - f.width / 2), h - f.height - 6))
  paste_center(c, fit(LOGO_IMG, 470, 330), cy=210)
  return c.convert('RGB')

if __name__ == '__main__':
  LOGO_IMG = logo_block()
  densities = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
  for d, k in densities.items():
    base = round(48 * k)
    icon(base).save(f'{RES}/mipmap-{d}/ic_launcher.png')
    icon(base, round_mask=True).save(f'{RES}/mipmap-{d}/ic_launcher_round.png')
    foreground(round(108 * k)).save(f'{RES}/mipmap-{d}/ic_launcher_foreground.png')
  for folder in sorted(os.listdir(RES)):
    if not folder.startswith('drawable'): continue
    p = f'{RES}/{folder}/splash.png'
    if os.path.exists(p):
      w, h = Image.open(p).size
      splash(w, h).save(p, optimize=True)
  with open(f'{RES}/values/ic_launcher_background.xml', 'w') as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#070B1A</color>\n</resources>\n')
  os.makedirs(STORE, exist_ok=True)
  icon(512, safe=0.9).convert('RGB').save(f'{STORE}/icon-512.png')
  feature_graphic().save(f'{STORE}/feature-graphic-1024x500.png')
  print('ok')
