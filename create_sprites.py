import os
import shutil
from PIL import Image

fighters = [
    {'id': 'rafa-mare', 'w': 192, 'crouch_shift': 35, 'air_shift': 30},
    {'id': 'guto-barba', 'w': 256, 'crouch_shift': 45, 'air_shift': 40}
]

def ensure_dir(path):
    if not os.path.exists(path):
        os.makedirs(path)

def make_crouch(img, shift_down, width):
    frames = img.width // width
    new_img = Image.new("RGBA", img.size)
    for i in range(frames):
        # We process each frame
        box = (i * width, 0, (i + 1) * width, img.height)
        frame = img.crop(box)
        
        # To avoid squishing, we take the top part (head+torso) and move it down.
        # We take the bottom part (feet) and keep it in place.
        # Then we paste top over bottom.
        cut_y = img.height - int(width * 0.4) # approximate waist
        
        top = frame.crop((0, 0, width, cut_y))
        bottom = frame.crop((0, cut_y, width, img.height))
        
        new_frame = Image.new("RGBA", (width, img.height))
        new_frame.paste(bottom, (0, cut_y))
        new_frame.paste(top, (0, shift_down), top)
        
        new_img.paste(new_frame, (i * width, 0))
    return new_img

def make_air(img, shift_y, shift_x, width, frames_count=None):
    frames = img.width // width
    if frames_count is not None:
        frames = frames_count
        
    new_img = Image.new("RGBA", (width * frames, img.height))
    for i in range(frames):
        src_i = min(i, (img.width // width) - 1)
        box = (src_i * width, 0, (src_i + 1) * width, img.height)
        frame = img.crop(box)
        
        new_frame = Image.new("RGBA", (width, img.height))
        new_frame.paste(frame, (shift_x, -shift_y))
        
        new_img.paste(new_frame, (i * width, 0))
    return new_img

for f in fighters:
    fid = f['id']
    w = f['w']
    c_shift = f['crouch_shift']
    a_shift = f['air_shift']
    base = f'public/assets/fighters/{fid}'
    
    idle = Image.open(f'{base}/idle.png').convert("RGBA")
    light = Image.open(f'{base}/light-attack.png').convert("RGBA")
    heavy = Image.open(f'{base}/heavy-attack.png').convert("RGBA")
    
    # 1. crouch, crouch-light, crouch-heavy
    make_crouch(idle, c_shift, w).save(f'{base}/crouch.png')
    make_crouch(light, c_shift, w).save(f'{base}/crouch-light.png')
    make_crouch(heavy, c_shift, w).save(f'{base}/crouch-heavy.png')
    
    # 2. standing-light, standing-heavy (just copy)
    light.save(f'{base}/standing-light.png')
    heavy.save(f'{base}/standing-heavy.png')
    
    # 3. jump-neutral, jump-forward, jump-backward
    make_air(idle, a_shift, 0, w, 2).save(f'{base}/jump-neutral.png')
    make_air(idle, a_shift, 15, w, 2).save(f'{base}/jump-forward.png')
    make_air(idle, a_shift, -15, w, 2).save(f'{base}/jump-backward.png')
    
    # 4. fall, landing
    make_air(idle, a_shift // 2, 0, w, 2).save(f'{base}/fall.png')
    make_air(idle, -10, 0, w, 2).save(f'{base}/landing.png')
    
    # 5. air attacks
    make_air(light, a_shift, 0, w).save(f'{base}/air-light-neutral.png')
    make_air(heavy, a_shift, 0, w).save(f'{base}/air-heavy-neutral.png')
    
    make_air(light, a_shift, 15, w).save(f'{base}/air-light-forward.png')
    make_air(heavy, a_shift, 15, w).save(f'{base}/air-heavy-forward.png')
    
    make_air(light, a_shift, -15, w).save(f'{base}/air-light-backward.png')
    make_air(heavy, a_shift, -15, w).save(f'{base}/air-heavy-backward.png')
    
print("All sprites generated successfully!")
