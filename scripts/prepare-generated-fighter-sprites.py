"""Converte as folhas direcionais originais em sprites provisórios 96x96.

As fontes foram criadas para Rua de Aço e não são as fichas conceituais usadas
na interface. O script apenas recorta poses já separadas e preserva pixels com
reamostragem nearest-neighbor.
"""

from pathlib import Path
from typing import Final

from PIL import Image


ROOT: Final = Path(__file__).resolve().parents[1]
REFERENCE_ROOT: Final = ROOT / "art-source" / "fighters"
FIGHTER_ROOT: Final = ROOT / "public" / "assets" / "fighters"
FRAME_SIZE: Final = 96


def extract_pose(source: Image.Image, box: tuple[int, int, int, int], max_size: tuple[int, int]) -> Image.Image:
    pose = source.crop(box)
    alpha_box = pose.getchannel("A").getbbox()
    if alpha_box is None:
        raise RuntimeError(f"Recorte sem pixels visíveis: {box}")
    pose = pose.crop(alpha_box)
    ratio = min(max_size[0] / pose.width, max_size[1] / pose.height)
    size = (max(1, round(pose.width * ratio)), max(1, round(pose.height * ratio)))
    return pose.resize(size, Image.Resampling.NEAREST)


def frame_from(pose: Image.Image, x_offset: int = 0, y_offset: int = 0, rotate: int = 0) -> Image.Image:
    frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    sprite = pose.rotate(rotate, expand=True, resample=Image.Resampling.NEAREST) if rotate else pose
    x = (FRAME_SIZE - sprite.width) // 2 + x_offset
    y = FRAME_SIZE - sprite.height - 2 + y_offset
    frame.alpha_composite(sprite, (x, y))
    return frame


def save_strip(path: Path, frames: list[Image.Image]) -> None:
    strip = Image.new("RGBA", (FRAME_SIZE * len(frames), FRAME_SIZE), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * FRAME_SIZE, 0))
    path.parent.mkdir(parents=True, exist_ok=True)
    strip.save(path, optimize=True)


def repeated(pose: Image.Image, offsets: list[tuple[int, int]]) -> list[Image.Image]:
    return [frame_from(pose, x, y) for x, y in offsets]


def build_rafa() -> None:
    source = Image.open(REFERENCE_ROOT / "rafa-mare-pixel-direction-alpha.png").convert("RGBA")
    idle = extract_pose(source, (120, 10, 690, 505), (88, 88))
    punch = extract_pose(source, (690, 5, 1325, 505), (92, 88))
    kick = extract_pose(source, (120, 490, 690, 1015), (92, 88))
    wave = extract_pose(source, (640, 500, 1320, 1018), (94, 88))
    output = FIGHTER_ROOT / "rafa-mare"
    strips = {
        "idle.png": repeated(idle, [(0, 0), (0, -1), (0, 0), (0, 1)]),
        "walk.png": repeated(idle, [(-2, 0), (0, -1), (2, 0), (0, 1)]),
        "jump.png": repeated(kick, [(0, 2), (0, 0), (0, -2), (0, 0)]),
        "crouch.png": repeated(wave, [(0, 3), (0, 2), (0, 3), (0, 2)]),
        "light-attack.png": repeated(punch, [(-3, 0), (-1, 0), (1, 0), (0, 0)]),
        "heavy-attack.png": repeated(kick, [(-2, 1), (0, 0), (2, -1), (0, 0)]),
        "special.png": repeated(wave, [(-2, 0), (0, -1), (2, 0), (0, 1)]),
        "hit.png": repeated(idle, [(2, 0), (-2, 1), (1, 0), (0, 0)]),
        "knockdown.png": [frame_from(idle, y_offset=8, rotate=90) for _ in range(4)],
        "victory.png": repeated(punch, [(0, 0), (0, -2), (0, 0), (0, -1)]),
    }
    for filename, frames in strips.items():
        save_strip(output / filename, frames)


def build_guto() -> None:
    source = Image.open(REFERENCE_ROOT / "guto-barba-pixel-direction-alpha.png").convert("RGBA")
    idle = extract_pose(source, (100, 0, 690, 500), (92, 88))
    ice = extract_pose(source, (720, 0, 1390, 510), (94, 88))
    grab = extract_pose(source, (90, 490, 735, 1018), (94, 88))
    output = FIGHTER_ROOT / "guto-barba"
    strips = {
        "idle.png": repeated(idle, [(0, 0), (0, -1), (0, 0), (0, 1)]),
        "walk.png": repeated(idle, [(-2, 0), (0, -1), (2, 0), (0, 1)]),
        "jump.png": repeated(idle, [(0, 2), (0, 0), (0, -2), (0, 0)]),
        "crouch.png": repeated(grab, [(0, 3), (0, 2), (0, 3), (0, 2)]),
        "light-attack.png": repeated(ice, [(-2, 0), (0, 0), (2, 0), (0, 0)]),
        "heavy-attack.png": repeated(grab, [(-3, 0), (-1, 0), (1, 0), (0, 0)]),
        "special.png": repeated(ice, [(-2, 0), (0, -1), (2, 0), (0, 1)]),
        "hit.png": repeated(idle, [(2, 0), (-2, 1), (1, 0), (0, 0)]),
        "knockdown.png": [frame_from(idle, y_offset=10, rotate=90) for _ in range(4)],
        "victory.png": repeated(grab, [(0, 0), (0, -2), (0, 0), (0, -1)]),
    }
    for filename, frames in strips.items():
        save_strip(output / filename, frames)


if __name__ == "__main__":
    build_rafa()
    build_guto()
    print("Sprites provisórios gerados: Rafa Maré e Guto Barba (20 strips, 96x96).")
