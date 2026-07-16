import cv2
import numpy as np

img_path = r"C:\Projetos\RuaDeAco\public\assets\references\character-guides\rafa-mare-guide.png"
img = cv2.imread(img_path, cv2.IMREAD_COLOR)

x, y, w, h = 433, 1060, 246, 260
sprite = img[y:y+h, x:x+w]

# Grab background color from top-left corner
bg_color = sprite[0, 0]

# Simple thresholding
diff = np.abs(sprite.astype(int) - bg_color.astype(int))
mask = np.sum(diff, axis=2) > 20

# Create alpha channel
alpha = np.zeros_like(mask, dtype=np.uint8)
alpha[mask] = 255

rgba = cv2.cvtColor(sprite, cv2.COLOR_BGR2BGRA)
rgba[:,:,3] = alpha

cv2.imwrite("test_sprite.png", rgba)
