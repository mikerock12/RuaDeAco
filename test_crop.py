import cv2
import numpy as np
import os

img_path = r"C:\Projetos\RuaDeAco\public\assets\references\character-guides\rafa-mare-guide.png"
img = cv2.imread(img_path, cv2.IMREAD_UNCHANGED)

# Focus on bottom 30% of the image where sprites are
h, w = img.shape[:2]
bottom_y = int(h * 0.7)
bottom_part = img[bottom_y:, :]

# Convert to grayscale
if bottom_part.shape[2] == 4:
    # Blend alpha
    alpha = bottom_part[:,:,3] / 255.0
    bg = np.ones_like(bottom_part[:,:,:3]) * 255
    bgr = (bottom_part[:,:,:3] * alpha[:,:,None] + bg * (1 - alpha[:,:,None])).astype(np.uint8)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
else:
    gray = cv2.cvtColor(bottom_part, cv2.COLOR_BGR2GRAY)

# Threshold to isolate sprites (background is dark blue, so let's use Canny or adaptive)
edges = cv2.Canny(gray, 50, 150)
kernel = np.ones((5,5), np.uint8)
dilated = cv2.dilate(edges, kernel, iterations=2)

contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

boxes = []
for c in contours:
    x, y, w_box, h_box = cv2.boundingRect(c)
    if w_box > 20 and h_box > 20: # Ignore noise
        boxes.append((x, y, w_box, h_box))

# Sort from left to right
boxes = sorted(boxes, key=lambda b: b[0])

print(f"Found {len(boxes)} sprites.")
for i, box in enumerate(boxes):
    x, y, w_box, h_box = box
    print(f"Sprite {i}: x={x}, y={bottom_y + y}, w={w_box}, h={h_box}")
