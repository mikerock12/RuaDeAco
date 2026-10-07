"""Troca a identidade visual da cabeça dos lutadores em todas as folhas.

Cada quadro tem a cabeça localizada (detect.py): centro, ângulo, escala e
espelho. Todo pixel perto da cabeça é levado ao espaço canônico do molde
(quadro 0 de idle.png) e reclassificado por cor e zona. A partir daí cada
personagem aplica o próprio visual: cabelo novo (cor e volume), barba
removida ou recolorida, óculos trocados e marcas no rosto. Corpo, golpes,
alpha e baseline não mudam fora da cabeça.
"""
import json, math, os, sys
import numpy as np, cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from detect import HEADS, ROOT, S  # noqa: E402
from face import smooth_face, features, skin_ramp, in_ell  # noqa: E402

def hexrgb(h):
  h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)

def ramp(*colors):
  return np.stack([hexrgb(c) for c in colors])

def lum(rgb):
  return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114

# ---------------------------------------------------------------------------
# Geometria canônica: (u, v) em pixels do molde, origem no canto da caixa.
# ---------------------------------------------------------------------------
def in_poly(u, v, pts):
  path = np.array(pts, np.float32)
  out = np.zeros(u.shape, bool)
  n = len(path)
  j = n - 1
  for i in range(n):
    xi, yi = path[i]; xj, yj = path[j]
    cond = ((yi > v) != (yj > v)) & (u < (xj - xi) * (v - yi) / (yj - yi + 1e-9) + xi)
    out ^= cond
    j = i
  return out

def in_ellipse(u, v, cu, cv_, ru, rv):
  return ((u - cu) / ru) ** 2 + ((v - cv_) / rv) ** 2 <= 1

# ---------------------------------------------------------------------------
# Visual de cada personagem.
#   hair_zone / eye_zone / beard_zone: onde pixels escuros viram cabelo, olhos, barba
#   hair_shape: volume novo de cabelo (pode sair da silhueta original)
#   hair_ramp: rampa escuro -> claro
#   beard: 'remove' ou rampa nova
#   eyes: rampa para óculos/olhos ou None
#   marks: lista de (máscara(u,v), rampa) pintadas só sobre pele
# ---------------------------------------------------------------------------
def rafa_design():
  return dict(
    hair_zone=lambda u, v: (v < 11) | ((u < 9) & (v < 17)),
    eye_zone=lambda u, v: np.zeros(u.shape, bool),
    beard_zone=lambda u, v: (v >= 26) & (u >= 10) & (v <= 38),
    hair_shape=lambda u, v: in_poly(u, v, [(4, 9), (5, 3), (9, -1), (14, -5), (20, -7), (25, -6), (28, -3), (27, 1), (24, 0), (26, 4), (23, 6), (17, 7), (11, 8), (8, 11), (5, 12)]),
    hair_ramp=ramp('#082a33', '#0f5664', '#178a96', '#3cc3c8', '#9cf0ec'),
    hair_dir=(0.9, -0.45),
    beard='remove',
    eyes=None,
    face=dict(zone=lambda u, v: in_poly(u, v, [(7, 12), (26, 10), (27, 22), (26, 29), (23, 34), (18, 37), (12, 36), (8, 31), (6, 22)]),
              F=dict(eye_v=18.5, back_eye_u=12, front_eye_u=21.5, nose_u=25, nose_v=24.5, mouth_u=18.5, mouth_v=30.5, mouth_w=6),
              iris='#1aa6b0'),
    marks=[(lambda u, v: (np.abs(v - 21.0 - (u - 7) * 0.15) < 0.55) & (u >= 7) & (u <= 11.5), ramp('#0c6f7a', '#3ad0d6')),
           (lambda u, v: (np.abs(v - 23.0 - (u - 7) * 0.15) < 0.55) & (u >= 7.5) & (u <= 11), ramp('#0c6f7a', '#3ad0d6'))],
  )

def noir_design():
  return dict(
    hair_zone=lambda u, v: (v < 9) | ((u < 10) & (v < 18)),
    eye_zone=lambda u, v: (v >= 15) & (v <= 22) & (u >= 7),
    beard_zone=lambda u, v: (v >= 24) & (u >= 6) & (v <= 39),
    hair_shape=lambda u, v: in_poly(u, v, [(26, 7), (24, 2), (19, -1), (12, -2), (6, 0), (2, 4), (0, 10), (-2, 17), (-3, 24), (0, 27), (3, 22), (5, 16), (8, 12), (13, 9), (19, 8), (23, 9)]),
    hair_ramp=ramp('#3b3f4d', '#7e8698', '#b8c0d0', '#e3e8f0', '#ffffff'),
    hair_dir=(-1.0, 0.25),
    beard='remove',
    eyes=ramp('#0a1a2e', '#1f5f8a', '#4fc6e8', '#bff4ff', '#ffffff'),
    eye_style='mirror',
    face=dict(zone=lambda u, v: in_poly(u, v, [(9, 22), (25, 22), (26, 28), (23, 34), (18, 38), (12, 37), (8, 31)]) | in_poly(u, v, [(11, 9), (24, 9), (25, 15), (10, 15)]),
              F=dict(eye_v=-50, back_eye_u=-50, front_eye_u=-50, nose_u=24, nose_v=25.5, mouth_u=17.5, mouth_v=31, mouth_w=6),
              iris='#4fc6e8', no_eyes=True),
    marks=[],
  )

def astro_design():
  spikes = [(1, 14), (-3, 6), (3, 7), (1, -1), (7, 2), (8, -6), (12, 0), (15, -7), (17, 0), (22, -5), (22, 2), (28, 0), (25, 6), (29, 9), (26, 12), (27, 16), (22, 14), (14, 13), (8, 15), (4, 20)]
  star = [(15.5, 18.5), (17.0, 21.5), (20.5, 21.8), (17.8, 23.6), (18.8, 27.0), (15.5, 25.0), (12.2, 27.0), (13.2, 23.6), (10.5, 21.8), (14.0, 21.5)]
  return dict(
    hair_zone=lambda u, v: (v < 19) | ((u < 8) & (v < 26)),
    eye_zone=lambda u, v: np.zeros(u.shape, bool),
    beard_zone=lambda u, v: np.zeros(u.shape, bool),
    hair_shape=lambda u, v: in_poly(u, v, spikes),
    hair_ramp=ramp('#2a0a33', '#62177a', '#a52fc4', '#e35fe8', '#ffb3f6'),
    hair_dir=(0.6, -0.8),
    beard=None,
    eyes=None,
    face=dict(zone=lambda u, v: in_poly(u, v, [(9, 16), (25, 14), (27, 24), (26, 31), (23, 36), (17, 38), (11, 35), (8, 27)]),
              F=dict(eye_v=22, back_eye_u=14, front_eye_u=21.5, nose_u=25, nose_v=27, mouth_u=19, mouth_v=32, mouth_w=7, grin=True),
              iris='#e35fe8'),
    marks=[(lambda u, v: in_poly(u, v, star), ramp('#a8650d', '#f2b630', '#fff0a0'))],
  )

def dante_design():
  return dict(
    hair_zone=lambda u, v: (v < 12) | ((u < 13) & (v < 19)),
    eye_zone=lambda u, v: (v >= 12) & (v <= 22) & (u >= 9),
    beard_zone=lambda u, v: (v >= 22) & (u >= 3) & (v <= 39),
    hair_shape=lambda u, v: in_poly(u, v, [(5, 13), (6, 6), (10, 2), (16, 0), (23, 1), (27, 4), (28, 9), (24, 8), (18, 7), (12, 8), (9, 12), (8, 17)]),
    hair_ramp=ramp('#2a2d33', '#5a5f69', '#8f95a0', '#c5cad2', '#eceff3'),
    hair_dir=(0.8, -0.6),
    beard=ramp('#3a1508', '#6e2a10', '#a8461c', '#d9733a', '#f4a86a'),
    eyes=ramp('#0d0507', '#2a0b10', '#8a0f1c', '#ff2a3a', '#ffd0d4'),
    eye_style='led',
    face=dict(zone=lambda u, v: in_poly(u, v, [(14, 21), (28, 20), (29, 26), (24, 28), (15, 27)]),
              F=dict(eye_v=-50, back_eye_u=-50, front_eye_u=-50, nose_u=27, nose_v=25, mouth_u=-50, mouth_v=-50, mouth_w=0),
              iris='#ff2a3a', no_eyes=True, no_mouth=True),
    marks=[],
  )

def leo_design():
  fringe = [(11, 15), (15, 13), (20, 14), (24, 16), (22, 19), (19, 23), (17, 28), (14, 27), (12, 22), (10, 19)]
  scar = lambda u, v: (np.abs((u - 22.5) - (v - 29.5) * 0.7) < 0.6) & (v >= 27) & (v <= 32)
  return dict(
    hair_zone=lambda u, v: (v < 21) | ((u < 9) & (v < 28)),
    eye_zone=lambda u, v: np.zeros(u.shape, bool),
    beard_zone=lambda u, v: (v >= 32) & (u >= 12) & (v <= 37),
    cover=lambda u, v: in_poly(u, v, fringe),
    hair_shape=lambda u, v: in_poly(u, v, fringe) | in_poly(u, v, [(2, 20), (1, 10), (5, 3), (11, -1), (19, -2), (25, 1), (28, 6), (27, 12), (24, 16), (20, 14), (15, 13), (11, 15), (8, 20), (6, 26), (3, 26)]),
    hair_ramp=ramp('#12081f', '#2e1650', '#55289a', '#8a55dd', '#c9a6ff'),
    hair_dir=(1.0, 0.35),
    beard='remove',
    eyes=None,
    face=dict(zone=lambda u, v: in_poly(u, v, [(12, 20), (27, 19), (29, 28), (28, 36), (24, 40), (17, 40), (12, 34), (10, 26)]),
              F=dict(eye_v=26.5, back_eye_u=15.5, front_eye_u=23.5, nose_u=28, nose_v=31.5, mouth_u=21, mouth_v=36, mouth_w=6),
              iris='#c9a6ff'),
    marks=[(scar, ramp('#c98a90', '#f2c4c4'))],
  )

DESIGNS = {
  'rafa-mare': rafa_design, 'noir-reflexo': noir_design, 'astro-riso': astro_design,
  'dante-sinal': dante_design, 'leo-violeta': leo_design,
}

# ---------------------------------------------------------------------------
def skin_samples(fighter):
  im = np.array(Image.open(f'{ROOT}/{fighter}/idle.png').convert('RGBA'))[:, :256].astype(np.float32)
  x0, y0, x1, y1 = HEADS[fighter]
  patch = im[y0:y1, x0:x1]
  rgb = patch[..., :3][patch[..., 3] > 200]
  L = lum(rgb)
  r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
  skin = rgb[(L > 95) & (r > g) & (g > b) & (r - b > 35)]
  return skin

def classify(rgb, alpha, skin_lab, dark_limit):
  """0 transparente, 1 escuro (cabelo/barba/óculos/contorno), 2 pele, 3 outro."""
  cls = np.full(alpha.shape, 3, np.uint8)
  cls[alpha < 40] = 0
  L = lum(rgb)
  r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
  lab = cv2.cvtColor((rgb / 255.0).astype(np.float32).reshape(-1, 1, 3), cv2.COLOR_RGB2Lab).reshape(rgb.shape)
  # distância ao conjunto de pele (média + tolerância)
  d = np.linalg.norm(lab[..., 1:] - skin_lab[1:], axis=-1)
  skinlike = (d < 22) & (L > 55) & (r >= g) & (g >= b - 6)
  darklike = (L < dark_limit) & ~skinlike
  # cabelo castanho médio também conta como escuro quando quase sem saturação de pele
  cls[(alpha >= 40) & skinlike] = 2
  cls[(alpha >= 40) & darklike] = 1
  return cls, L

_RNG = np.random.default_rng(7)
_NOISE = _RNG.random((64, 64)).astype(np.float32)

def vnoise(x, y):
  """Ruído de valor em coordenadas canônicas: a textura é a mesma em todos os quadros."""
  x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
  fx = x - x0; fy = y - y0
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
  def g(ix, iy): return _NOISE[iy % 64, ix % 64]
  a = g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx
  b = g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx
  return a * (1 - fy) + b * fy

_EDGE_CACHE = {}

def shape_depth(design, u, v):
  """Distância (px canônicos) até a borda do volume de cabelo: borda escura, miolo claro."""
  key = id(design['hair_shape'])
  if key not in _EDGE_CACHE:
    gu, gv = np.meshgrid(np.arange(-20, 60, 0.25), np.arange(-20, 60, 0.25))
    m = design['hair_shape'](gu, gv).astype(np.uint8)
    d = cv2.distanceTransform(m, cv2.DIST_L2, 5) * 0.25
    _EDGE_CACHE[key] = d
  d = _EDGE_CACHE[key]
  iu = np.clip(((u + 20) * 4).astype(int), 0, d.shape[1] - 1)
  iv = np.clip(((v + 20) * 4).astype(int), 0, d.shape[0] - 1)
  return d[iv, iu]

def hair_color(u, v, base_L, design):
  """Mechas largas: ruído alongado no sentido do penteado, borda mais escura e brilho no topo."""
  R = design['hair_ramp']
  du, dv = design['hair_dir']
  along = u * du + v * dv
  across = -u * dv + v * du
  strands = vnoise(along * 0.18 + 11.0, across * 0.75 + 3.0) * 0.7 + vnoise(along * 0.5 + 40.0, across * 1.4) * 0.3
  depth = np.clip(shape_depth(design, u, v) / 3.0, 0, 1)
  light = np.clip(0.7 - v * 0.02 + u * 0.012, 0, 1)
  t = depth * 0.45 + light * 0.30 + strands * 0.35 - 0.12
  idx = np.clip((t * (len(R) - 1)).round(), 0, len(R) - 1).astype(int)
  return R[idx]

def ramp_by_lum(L, R, lo, hi):
  t = np.clip((L - lo) / max(1.0, hi - lo), 0, 1)
  idx = np.clip((t * (len(R) - 1)).round(), 0, len(R) - 1).astype(int)
  return R[idx]

def recolor_hair_only(frame, ov, design, skin_lab):
  """Quadros em que só o cabelo aparece (cabeça entre os braços): recolore os fios num raio."""
  out = frame.copy().astype(np.float32)
  H, W = frame.shape[:2]
  ys, xs = np.mgrid[0:H, 0:W]
  near = np.hypot(xs - ov['cx'], ys - ov['cy']) <= ov['r']
  rgb = out[..., :3]; a = out[..., 3]
  cls, L = classify(rgb, a, skin_lab, ov.get('dark', 95))
  r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
  hair = near & (cls == 1) & (r >= b) & (L > 8)
  if hair.any():
    out[..., :3][hair] = ramp_by_lum(L[hair], design['hair_ramp'], 10, 90)
  beard = ov.get('beard')
  if beard and isinstance(design.get('beard'), np.ndarray):
    bz = (np.hypot(xs - beard['cx'], ys - beard['cy']) <= beard['r']) & (ys <= beard.get('maxY', 999))
    bp = bz & (a > 40) & (L < 70) & (r + 2 >= b)
    out[..., :3][bp] = ramp_by_lum(L[bp], design['beard'], 2, 45)
  eyes = ov.get('eyes')
  if eyes and design.get('eyes') is not None:
    # óculos vistos de frente: lentes escuras viram o visor do personagem
    box = (np.abs(xs - eyes['cx']) <= eyes['rx']) & (np.abs(ys - eyes['cy']) <= eyes['ry'])
    lens = box & (a > 40) & (L < 45)
    E = design['eyes']
    out[..., :3][lens] = E[2]
    core = lens & (np.abs(ys - eyes['cy']) < 1)
    out[..., :3][core] = np.where(((xs[core] % 3) < 1)[:, None], E[4], E[3])
  return np.clip(out, 0, 255).astype(np.uint8)

def restyle_frame(frame, det, fighter, design, skin_lab, skin_ref, expr='normal', sramp=None):
  x0, y0, x1, y1 = HEADS[fighter]
  w, h = x1 - x0, y1 - y0
  H, W = frame.shape[:2]
  out = frame.copy().astype(np.float32)
  rgb = out[..., :3]; alpha = out[..., 3]
  a = math.radians(-det['angle']); s = det['scale']; m = -1.0 if det['mirror'] else 1.0
  R = int(max(w, h) * s * 1.2) + 12
  cx, cy = det['cx'], det['cy']
  xa, xb = max(0, int(cx - R)), min(W, int(cx + R) + 1)
  ya, yb = max(0, int(cy - R)), min(H, int(cy + R) + 1)
  ys, xs = np.mgrid[ya:yb, xa:xb].astype(np.float32)
  dx, dy = xs - cx, ys - cy
  px = dx * math.cos(a) + dy * math.sin(a)
  py = -dx * math.sin(a) + dy * math.cos(a)
  u = m * px / s + w / 2; v = py / s + h / 2
  sub_rgb = rgb[ya:yb, xa:xb]; sub_a = alpha[ya:yb, xa:xb]
  cls, L = classify(sub_rgb, sub_a, skin_lab, 70)
  inside_head = (u >= -2) & (u <= w + 2) & (v >= -2) & (v <= h + 4)
  new_rgb = sub_rgb.copy(); new_a = sub_a.copy()

  # 1) barba: remover (pintura de pele) ou recolorir
  beard_zone = design['beard_zone'](u, v) & inside_head
  if isinstance(design.get('beard'), str) and design['beard'] == 'remove':
    r_, g_, b_ = sub_rgb[..., 0], sub_rgb[..., 1], sub_rgb[..., 2]
    beardish = (cls == 1) | ((cls == 3) & (L < 120) & (r_ >= b_))
    beard_px = beard_zone & beardish & (L > 20) & (sub_a > 40)
    # vizinhos opacos que não são barba servem de fonte
    src = sub_rgb.astype(np.uint8)
    mask = beard_px.astype(np.uint8) * 255
    if mask.any():
      inp = cv2.inpaint(np.ascontiguousarray(src), mask, 2, cv2.INPAINT_TELEA).astype(np.float32)
      # puxa para o tom de pele de referência para não sobrar mancha escura
      inp = inp * 0.55 + skin_ref * 0.45
      shade = np.clip(L / 120.0, 0.75, 1.0)[..., None]
      new_rgb[beard_px] = (inp * shade)[beard_px]
  elif isinstance(design.get('beard'), np.ndarray):
    rr, bb_ = sub_rgb[..., 0], sub_rgb[..., 2]
    beard_px = beard_zone & (cls == 1) & (rr > bb_ + 4) & (L > 10)
    trim = design.get('beard_trim')
    if trim is not None:
      cut = beard_px & trim(u, v) & (L > 18)
      src = sub_rgb.astype(np.uint8)
      inp = cv2.inpaint(np.ascontiguousarray(src), cut.astype(np.uint8) * 255, 2, cv2.INPAINT_TELEA).astype(np.float32)
      inp = inp * 0.5 + skin_ref * 0.5
      new_rgb[cut] = inp[cut]
      beard_px = beard_px & ~cut
    new_rgb[beard_px] = ramp_by_lum(L[beard_px], design['beard'], 8, 85)

  # 1b) rosto novo: alisa os traços originais e desenha os novos
  fd = design.get('face')
  if fd is not None and sramp is not None:
    zone = fd['zone'](u, v) & inside_head
    new_rgb, smoothed = smooth_face(new_rgb, sub_a, u, v, cls, lum(new_rgb), zone, sramp, xs, ys)
    F = fd['F']
    e = expr
    if F.get('grin') and e == 'normal': e = 'grin'
    dark = hexrgb('#24130d')
    cmap = {'dark': sramp[0] * 0.55 + dark * 0.45, 'white': hexrgb('#efe6d2'), 'iris': hexrgb(fd['iris']),
            'lid': dark, 'lip': sramp[0] * 0.5 + hexrgb('#5a1a16') * 0.5, 'shadow': sramp[1],
            'light': sramp[-1], 'mouth': hexrgb('#3a0d10'), 'teeth': hexrgb('#f2ede0'),
            'brow': fd.get('brow', design['hair_ramp'][1])}
    if isinstance(cmap['brow'], str): cmap['brow'] = hexrgb(cmap['brow'])
    paintable = smoothed | (zone & (cls == 2))
    for mk, key in features(u, v, F, 'normal' if e == 'grin' else e):
      if fd.get('no_eyes') and key in ('white', 'iris', 'lid', 'brow'): continue
      if fd.get('no_mouth') and key in ('lip', 'mouth', 'teeth'): continue
      if e == 'grin' and key in ('lip',): continue
      m = mk & paintable
      new_rgb[m] = cmap[key]
    if e == 'grin':
      mu, mv, mw = F['mouth_u'], F['mouth_v'], F['mouth_w']
      smile = in_ell(u, v, (mu, mv - 0.2), (mw / 2, 1.4)) & (v >= mv - 0.6) & smoothed
      new_rgb[smile] = cmap['mouth']
      teeth = smile & (v < mv + 0.4)
      new_rgb[teeth] = cmap['teeth']

  # 2) olhos / óculos
  eye_zone = design['eye_zone'](u, v) & inside_head
  if design.get('eyes') is not None:
    eye_px = eye_zone & (cls == 1)
    E = design['eyes']
    if design.get('eye_style') == 'mirror':
      # cromado espelhado: faixa de reflexo diagonal que acompanha a cabeça
      t = np.clip(0.15 + ((u - 8) / 18.0) * 0.35 + np.where(((u - v * 0.6) % 6) < 1.4, 0.55, 0.0) + (L / 255.0) * 0.4, 0, 1)
      idx = np.clip((t * (len(E) - 1)).round(), 0, len(E) - 1).astype(int)
      new_rgb[eye_px] = E[idx][eye_px]
    elif design.get('eye_style') == 'led':
      vc = np.median(v[eye_px]) if eye_px.any() else 17
      core = eye_px & (np.abs(v - vc) <= 0.9)
      new_rgb[eye_px] = ramp_by_lum(L[eye_px], E[:3], 5, 70)
      new_rgb[core] = np.where((u[core] % 3 < 1.2)[:, None], E[4], E[3])
  if design.get('glow'):
    g = design['glow']
    gz = g['zone'](u, v) & inside_head & (cls == 1) & (L < 60)
    new_rgb[gz] = g['color']

  # 3) cabelo: recolorir o existente e acrescentar o volume novo
  hair_zone = design['hair_zone'](u, v) & inside_head
  shape = design['hair_shape'](u, v)
  hair_old = hair_zone & (cls == 1)
  paint = shape & ((cls == 0) | (cls == 1) | ((cls == 2) & hair_zone))
  if design.get('cover'):
    paint |= design['cover'](u, v) & ((cls == 1) | (cls == 2) | ((cls == 3) & (L < 140)))
  paint |= hair_old
  if paint.any():
    col = hair_color(u, v, L, design)
    new_rgb[paint] = col[paint]
    new_a[paint] = 255
  # contorno escuro onde o cabelo novo encosta no transparente
  Rr = design['hair_ramp']
  opaque = new_a > 40
  edge = paint & ~(np.roll(opaque, 1, 0) & np.roll(opaque, -1, 0) & np.roll(opaque, 1, 1) & np.roll(opaque, -1, 1))
  new_rgb[edge] = Rr[0] * 0.6

  # 4) marcas no rosto (só sobre pele)
  for mk, MR in design['marks']:
    mz = mk(u, v) & inside_head & (cls == 2)
    if mz.any():
      new_rgb[mz] = ramp_by_lum(L[mz], MR, 90, 230)

  out[ya:yb, xa:xb, :3] = new_rgb
  out[ya:yb, xa:xb, 3] = new_a
  return np.clip(out, 0, 255).astype(np.uint8)

PAIN = ('hit', 'knockdown', 'knockout', 'thrown', 'fall', 'grabbed', 'frozen', 'wake-up')
SHOUT = ('heavy', 'universal-grab', 'mao-da-mare', 'chute-da-ressaca', 'eco-tatuado', 'reflexo-negro', 'quebra-luz', 'impacto-solar',
         'sorriso-relampago', 'rajada-neon', 'astro-giro', 'ponto-final', 'bomba-fumaca', 'chave-binaria', 'olhar-frio', 'impacto-sombrio', 'pressao-violeta')

def expression(file, frame):
  if any(k in file for k in PAIN): return 'pain'
  if any(k in file for k in SHOUT): return 'shout'
  return 'normal'

def run(fighter, files=None, dst_root=None):
  design = DESIGNS[fighter]()
  skin = skin_samples(fighter)
  skin_lab = cv2.cvtColor((skin.mean(0) / 255.0).astype(np.float32).reshape(1, 1, 3), cv2.COLOR_RGB2Lab).reshape(3)
  skin_ref = skin.mean(0)
  data = json.load(open(f'{S}/heads-{fighter}.json'))
  over_path = f'{S}/overrides-{fighter}.json'
  overrides = json.load(open(over_path)) if os.path.exists(over_path) else {}
  x0, y0, x1, y1 = HEADS[fighter]
  sramp = skin_ramp(skin)
  dst_root = dst_root or os.environ.get('FACES_OUT', 'public/assets/fighters')
  os.makedirs(f'{dst_root}/{fighter}', exist_ok=True)
  if os.path.abspath(dst_root) == os.path.abspath(ROOT):
    raise SystemExit('FACES_SRC precisa apontar para as folhas originais, não para a saída')
  for file, info in data.items():
    if files and file not in files: continue
    im = np.array(Image.open(f'{ROOT}/{fighter}/{file}').convert('RGBA'))
    fs = info['frameSize']
    for k, det in enumerate(info['frames']):
      ov = overrides.get(file, {}).get(str(k))
      if ov == 'skip': continue
      if isinstance(ov, dict) and ov.get('mode') == 'hair':
        im[:, k * fs:(k + 1) * fs] = recolor_hair_only(im[:, k * fs:(k + 1) * fs], ov, design, skin_lab)
        continue
      if ov: det = {**(det or {}), **ov}
      if not det: continue
      im[:, k * fs:(k + 1) * fs] = restyle_frame(im[:, k * fs:(k + 1) * fs], det, fighter, design, skin_lab, skin_ref, expression(file, k), sramp)
    Image.fromarray(im, 'RGBA').save(f'{dst_root}/{fighter}/{file}')
  return dst_root

if __name__ == '__main__':
  fighter = sys.argv[1]
  files = sys.argv[2].split(',') if len(sys.argv) > 2 and sys.argv[2] != 'all' else None
  print(run(fighter, files))
