import os
import cv2
import numpy as np
from PIL import Image
import rembg
import math

guides_dir = r"C:\Projetos\RuaDeAco\public\assets\references\character-guides"
fighters_dir = r"C:\Projetos\RuaDeAco\public\assets\fighters"

characters = [
    {"id": "rafa-mare", "file": "rafa-mare-guide.png", "moves": ["idle", "corrida", "mao-da-mare", "chute-da-ressaca", "eco-tatuado"]},
    {"id": "guto-barba", "file": "guto-barba-guide.png", "moves": ["idle", "corrida", "muralha-norte", "gancho-do-urso", "abraco-glacial"]},
    {"id": "noir-reflexo", "file": "noir-reflexo-guide.png", "moves": ["idle", "corrida", "reflexo-negro", "quebra-luz", "impacto-solar"]},
    {"id": "dante-sinal", "file": "dante-sinal-guide.png", "moves": ["idle", "corrida", "ponto-final", "cortina-optica", "chave-binaria"]},
    {"id": "leo-violeta", "file": "leo-violeta-guide.png", "moves": ["idle", "corrida", "olhar-frio", "impacto-sombrio", "pressao-violeta"]},
    {"id": "astro-riso", "file": "astro-riso-guide.png", "moves": ["idle", "corrida", "sorriso-relampago", "rajada-neon", "astro-giro"]},
]

def extract_sprites(img_path):
    img = cv2.imread(img_path)
    if img is None:
        return []
    h, w = img.shape[:2]
    bottom_y = int(h * 0.7)
    bottom_part = img[bottom_y:, :]
    
    gray = cv2.cvtColor(bottom_part, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    kernel = np.ones((5,5), np.uint8)
    dilated = cv2.dilate(edges, kernel, iterations=2)
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    boxes = []
    for c in contours:
        bx, by, bw, bh = cv2.boundingRect(c)
        if bw > 50 and bh > 100:
            boxes.append((bx, by, bw, bh))
            
    boxes = sorted(boxes, key=lambda b: b[0])
    
    sprites = []
    for bx, by, bw, bh in boxes:
        # crop text at bottom (approx 40px)
        crop_bh = bh - 40
        if crop_bh <= 0: continue
        
        # padding
        p = 10
        x1 = max(0, bx - p)
        y1 = max(0, bottom_y + by - p)
        x2 = min(w, bx + bw + p)
        y2 = min(h, bottom_y + by + crop_bh)
        
        sprite_bgr = img[y1:y2, x1:x2]
        
        # Background removal
        sprite_rgba = rembg.remove(sprite_bgr)
        sprites.append(Image.fromarray(cv2.cvtColor(sprite_rgba, cv2.COLOR_BGRA2RGBA)))
    
    return sprites

def process():
    for char in characters:
        print(f"Processing {char['id']}...")
        guide_path = os.path.join(guides_dir, char["file"])
        if not os.path.exists(guide_path):
            print(f"  Missing {guide_path}")
            continue
            
        sprites = extract_sprites(guide_path)
        if len(sprites) < 5:
            print(f"  Found only {len(sprites)} sprites. Attempting fallback slice.")
            # Fallback horizontal slice
            img = Image.open(guide_path)
            w, h = img.size
            slice_w = w // 5
            sprites = []
            for i in range(5):
                box = (i*slice_w, int(h*0.7), (i+1)*slice_w, h-40)
                cropped = img.crop(box)
                cv2_img = cv2.cvtColor(np.array(cropped), cv2.COLOR_RGBA2BGRA)
                rgba = rembg.remove(cv2_img)
                sprites.append(Image.fromarray(cv2.cvtColor(rgba, cv2.COLOR_BGRA2RGBA)))
        
        out_dir = os.path.join(fighters_dir, char["id"])
        os.makedirs(out_dir, exist_ok=True)
        
        for i, move in enumerate(char["moves"]):
            if i >= len(sprites): break
            base_sprite = sprites[i]
            
            # create 4 frames of 192x192
            sheet = Image.new("RGBA", (192 * 4, 192), (0,0,0,0))
            
            # paste function aligned to bottom center
            def paste_centered(frame_img, frame_idx, y_offset=0, scale_x=1.0, scale_y=1.0, alpha=1.0):
                tw, th = frame_img.size
                nw, nh = int(tw * scale_x), int(th * scale_y)
                if nw != tw or nh != th:
                    resized = frame_img.resize((nw, nh), Image.NEAREST)
                else:
                    resized = frame_img
                
                if alpha < 1.0:
                    data = np.array(resized)
                    data[:,:,3] = data[:,:,3] * alpha
                    resized = Image.fromarray(data)
                
                # Center x, align bottom y
                px = (frame_idx * 192) + (192 - nw) // 2
                py = 192 - nh - 10 + y_offset
                
                sheet.paste(resized, (px, py), resized)
            
            if move == "idle":
                paste_centered(base_sprite, 0, 0)
                paste_centered(base_sprite, 1, 2)
                paste_centered(base_sprite, 2, 4)
                paste_centered(base_sprite, 3, 2)
            elif move == "corrida":
                paste_centered(base_sprite, 0, 0)
                paste_centered(base_sprite, 1, -2)
                paste_centered(base_sprite, 2, 0)
                paste_centered(base_sprite, 3, -2)
            else: # specials
                paste_centered(base_sprite, 0, 0, scale_x=0.9, scale_y=1.05) # startup
                paste_centered(base_sprite, 1, 0) # active
                paste_centered(base_sprite, 2, 0, alpha=0.5) # recovery
                # frame 3 empty or very faded
            
            sheet.save(os.path.join(out_dir, f"{move}.png"))
            print(f"  Created {move}.png")

if __name__ == '__main__':
    process()
