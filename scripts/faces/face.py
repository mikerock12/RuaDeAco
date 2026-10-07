"""Redesenho de rosto: alisa os traços originais e desenha olhos, sobrancelhas, nariz e boca novos."""
import math
import numpy as np, cv2

def seg_dist(u, v, a, b):
  ax, ay = a; bx, by = b
  dx, dy = bx - ax, by - ay
  t = np.clip(((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy + 1e-9), 0, 1)
  return np.hypot(u - (ax + t * dx), v - (ay + t * dy))

def on_line(u, v, a, b, width=0.5):
  return seg_dist(u, v, a, b) <= width

def in_ell(u, v, c, r):
  return ((u - c[0]) / r[0]) ** 2 + ((v - c[1]) / r[1]) ** 2 <= 1

BAYER = np.array([[0, 2], [3, 1]], np.float32) / 4.0 - 0.375

def skin_ramp(skin_rgb, n=6):
  """Níveis de pele do próprio personagem (escuro -> claro), para manter o tom do corpo."""
  data = skin_rgb.astype(np.float32)
  crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.5)
  _, labels, centers = cv2.kmeans(data, n, None, crit, 5, cv2.KMEANS_PP_CENTERS)
  L = centers @ np.array([0.299, 0.587, 0.114], np.float32)
  return centers[np.argsort(L)]

def smooth_face(sub_rgb, sub_a, u, v, cls, L, zone, ramp, xs, ys):
  """Remove os traços: pinta a zona com a luz grossa do próprio rosto, quantizada na rampa de pele."""
  opaque = sub_a > 40
  interior = opaque & np.roll(opaque, 1, 0) & np.roll(opaque, -1, 0) & np.roll(opaque, 1, 1) & np.roll(opaque, -1, 1)
  r, g, b = sub_rgb[..., 0], sub_rgb[..., 1], sub_rgb[..., 2]
  warm = (r > b + 10) & (r >= g - 4)
  # só traços quentes (pelos, sombras de pele); luvas, camiseta e óculos ficam como estão
  target = zone & interior & (cls != 0) & (((cls == 1) & warm & (L > 12)) | (cls == 2) | ((cls == 3) & warm & (L < 170)))
  if not target.any(): return sub_rgb, target
  src = sub_rgb.astype(np.uint8)
  # traços escuros viram buraco e são preenchidos a partir da pele em volta
  holes = target & (L < np.percentile(L[target], 55))
  filled = cv2.inpaint(np.ascontiguousarray(src), holes.astype(np.uint8) * 255, 3, cv2.INPAINT_TELEA).astype(np.float32)
  Lf = filled @ np.array([0.299, 0.587, 0.114], np.float32)
  w = target.astype(np.float32)
  blur = cv2.GaussianBlur(Lf * w, (0, 0), 1.15); norm = cv2.GaussianBlur(w, (0, 0), 1.15) + 1e-6
  Ls = blur / norm
  RL = ramp @ np.array([0.299, 0.587, 0.114], np.float32)
  lo, hi = RL[0], RL[-1]
  t = (Ls - lo) / max(1.0, hi - lo)
  t = t + BAYER[ys.astype(int) % 2, xs.astype(int) % 2] * (0.25 / (len(ramp) - 1))
  idx = np.clip((t * (len(ramp) - 1)).round(), 1, len(ramp) - 1).astype(int)
  out = sub_rgb.copy()
  out[target] = ramp[idx][target]
  return out, target

def features(u, v, F, expr):
  """Lista (máscara, cor) do rosto novo, em ordem de pintura; F são as âncoras canônicas.

  Vista 3/4 voltada para a direita: o olho de trás é menor, o da frente fica
  junto da ponte do nariz. Cores: dark, white, iris, lid, brow, shadow,
  light, lip, mouth, teeth.
  """
  ey = F['eye_v']; be = F['back_eye_u']; fe = F['front_eye_u']
  nu, nv = F['nose_u'], F['nose_v']
  mu, mv, mw = F['mouth_u'], F['mouth_v'], F['mouth_w']
  eye_h = F.get('eye_h', 0.75)
  bw = F.get('brow_w', 0.65)
  M = []
  # estrutura: sombra das órbitas, bochecha e queixo dão volume ao rosto alisado
  M += [(in_ell(u, v, (be, ey + 0.2), (2.4, 1.6)), 'shadow'),
        (in_ell(u, v, (fe - 0.2, ey + 0.2), (2.6, 1.6)), 'shadow'),
        (on_line(u, v, (nu - 2.5, ey - 1.0), (nu - 2.8, nv - 1.2), 0.5), 'shadow'),
        (on_line(u, v, (nu - 1.2, ey - 1.6), (nu - 0.4, nv - 1.5), 0.45), 'light'),
        (on_line(u, v, (mu - mw / 2, mv + 2.6), (mu + mw / 2 - 0.5, mv + 2.6), 0.5), 'shadow')]
  # nariz: aba escura, narina e ponta clara
  M += [(on_line(u, v, (nu - 2.4, nv + 0.2), (nu - 0.6, nv + 0.6), 0.55), 'dark'),
        (in_ell(u, v, (nu - 0.2, nv - 0.6), (0.7, 0.6)), 'light')]
  if expr == 'normal':
    M += [(in_ell(u, v, (be + 0.2, ey + 0.3), (1.2, eye_h)), 'white'),
          (in_ell(u, v, (fe + 0.1, ey + 0.3), (1.7, eye_h)), 'white'),
          (in_ell(u, v, (be + 0.7, ey + 0.4), (0.6, eye_h)), 'iris'),
          (in_ell(u, v, (fe + 0.6, ey + 0.4), (0.75, eye_h)), 'iris'),
          (on_line(u, v, (be - 1.3, ey - 0.4), (be + 1.4, ey - 0.6), 0.55), 'lid'),
          (on_line(u, v, (fe - 1.8, ey - 0.6), (fe + 1.7, ey - 0.4), 0.55), 'lid')]
    brow = [((be - 2.2, ey - 1.9), (be + 1.6, ey - 2.4)), ((fe - 1.6, ey - 2.4), (fe + 2.4, ey - 2.2))]
    M += [(on_line(u, v, (mu - mw / 2, mv), (mu + mw / 2, mv - 0.4), 0.5), 'lip'),
          (on_line(u, v, (mu - mw / 2 + 1, mv + 1.1), (mu + mw / 2 - 1.5, mv + 1.0), 0.45), 'light')]
  elif expr == 'pain':
    M += [(on_line(u, v, (be - 1.4, ey - 0.3), (be + 1.4, ey + 0.6), 0.55), 'lid'),
          (on_line(u, v, (fe - 1.7, ey + 0.6), (fe + 1.7, ey - 0.3), 0.55), 'lid')]
    brow = [((be - 2.2, ey - 1.8), (be + 1.6, ey - 3.1)), ((fe - 1.6, ey - 3.1), (fe + 2.4, ey - 1.8))]
    M += [(in_ell(u, v, (mu, mv + 0.7), (mw / 2, 1.4)), 'mouth'),
          (on_line(u, v, (mu - mw / 2 + 0.7, mv - 0.2), (mu + mw / 2 - 0.7, mv - 0.2), 0.45), 'teeth')]
  else:  # shout: esforço e ataque
    M += [(on_line(u, v, (be - 1.3, ey + 0.1), (be + 1.3, ey + 0.4), 0.55), 'lid'),
          (on_line(u, v, (fe - 1.6, ey + 0.4), (fe + 1.6, ey + 0.1), 0.55), 'lid'),
          (in_ell(u, v, (fe + 0.6, ey + 0.9), (0.6, 0.45)), 'iris')]
    brow = [((be - 2.2, ey - 3.0), (be + 1.6, ey - 1.5)), ((fe - 1.6, ey - 1.4), (fe + 2.4, ey - 3.0))]
    M += [(in_ell(u, v, (mu, mv + 0.5), (mw / 2 + 0.3, 1.2)), 'mouth'),
          (on_line(u, v, (mu - mw / 2 + 0.6, mv - 0.3), (mu + mw / 2 - 0.6, mv - 0.3), 0.45), 'teeth')]
  M += [(on_line(u, v, a, b, bw), 'brow') for a, b in brow]
  return M
