import os
import cv2
import numpy as np
import hashlib
from collections import defaultdict

fighters_dir = r"C:\Projetos\RuaDeAco\public\assets\fighters"

def get_hash(filepath):
    hasher = hashlib.md5()
    with open(filepath, 'rb') as f:
        buf = f.read()
        hasher.update(buf)
    return hasher.hexdigest()

def check_alpha(img):
    if img.shape[2] != 4:
        return False, "Missing alpha channel"
    alpha = img[:,:,3]
    if np.all(alpha == 255):
        return False, "Alpha channel exists but has no transparency (all 255)"
    return True, "OK"

def check_repeated_frames(img):
    h, w = img.shape[:2]
    # assuming 192x192 frames horizontally
    if h != 192 or w % 192 != 0:
        return True, "OK" # not a standard spritesheet, skip frame check
    
    num_frames = w // 192
    if num_frames <= 1:
        return True, "OK"
        
    frames = []
    for i in range(num_frames):
        frames.append(img[:, i*192:(i+1)*192])
        
    # Check if all frames are completely identical
    identical = True
    for i in range(1, num_frames):
        if not np.array_equal(frames[0], frames[i]):
            identical = False
            break
            
    if identical:
        return False, f"All {num_frames} frames are perfectly identical"
    return True, "OK"

def validate():
    print("=== Sprite Validation Report ===")
    hashes = defaultdict(list)
    errors = []
    
    if not os.path.exists(fighters_dir):
        print(f"Directory not found: {fighters_dir}")
        return
        
    for char in os.listdir(fighters_dir):
        char_dir = os.path.join(fighters_dir, char)
        if not os.path.isdir(char_dir):
            continue
            
        print(f"\nEvaluating {char}:")
        
        for file in os.listdir(char_dir):
            if not file.endswith('.png'):
                continue
                
            filepath = os.path.join(char_dir, file)
            
            # 1. Empty file
            if os.path.getsize(filepath) == 0:
                errors.append(f"{char}/{file}: File is empty")
                continue
                
            # 2. Hash check for duplicates
            file_hash = get_hash(filepath)
            hashes[file_hash].append(f"{char}/{file}")
            
            img = cv2.imread(filepath, cv2.IMREAD_UNCHANGED)
            if img is None:
                errors.append(f"{char}/{file}: Invalid image format")
                continue
                
            # 3. Alpha check
            alpha_ok, alpha_msg = check_alpha(img)
            if not alpha_ok:
                errors.append(f"{char}/{file}: {alpha_msg}")
                
            # 4. Repeated frames check
            frames_ok, frames_msg = check_repeated_frames(img)
            if not frames_ok:
                errors.append(f"{char}/{file}: {frames_msg}")
                
    print("\n--- Duplicates ---")
    dup_found = False
    for h, files in hashes.items():
        if len(files) > 1:
            print(f"Duplicate images found: {', '.join(files)}")
            dup_found = True
            
    if not dup_found:
        print("No duplicated PNGs found.")
        
    print("\n--- Errors & Issues ---")
    if len(errors) == 0:
        print("No issues found. All files are valid.")
    else:
        for err in errors:
            print(f"- {err}")

if __name__ == '__main__':
    validate()
