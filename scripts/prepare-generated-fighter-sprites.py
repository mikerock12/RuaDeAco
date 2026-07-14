"""Converte as folhas direcionais originais em sprites provisórios de alta definição.

Fontes: art-source/fighters/*-pixel-direction.png (folhas OPACAS, fundo magenta).
As variantes *-pixel-direction-alpha.png NÃO são usadas: o canal alpha delas é
corrompido (pixels internos do corpo com alpha 0-144), causa da aparência
semitransparente/vazada observada em jogo.

Saída: spritesheets com 4 frames por animação.
  - Rafa Maré: frames 192x192
  - Guto Barba: frames 256x256

Regras aplicadas:
  - alpha reconstruído por chroma key do fundo magenta → binário (0 ou 255);
  - reamostragem NEAREST (pixels quadrados, sem interpolação);
  - jato de água destacado do Rafa removido do corpo (recorte antes da palma)
    e exportado em art-source/extracted/ como camada de efeito separada;
  - linha de chão consistente: base do sprite em FRAME - GROUND_PAD em todos
    os frames, compatível com origem (0.5, 1).

Os sprites continuam PROVISÓRIOS: são 3-4 poses estáticas deslocadas, não
animações quadro a quadro reais.
"""

from pathlib import Path
from typing import Final

from PIL import Image


ROOT: Final = Path(__file__).resolve().parents[1]
REFERENCE_ROOT: Final = ROOT / "art-source" / "fighters"
EXTRACTED_ROOT: Final = ROOT / "art-source" / "extracted"
FIGHTER_ROOT: Final = ROOT / "public" / "assets" / "fighters"
GROUND_PAD: Final = 4


def key_magenta_background(source: Image.Image) -> Image.Image:
    """Remove o fundo magenta com alpha binário (0 ou 255).

    Depois do chroma key, duas passadas de erosão removem a franja
    magenta (pixels de borda mesclados com o fundo).
    """
    rgba = source.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, _ = pixels[x, y]
            if r - g > 80 and b - g > 30 and r > 110:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                pixels[x, y] = (r, g, b, 255)

    for _ in range(2):
        fringe: list[tuple[int, int]] = []
        for y in range(rgba.height):
            for x in range(rgba.width):
                r, g, b, a = pixels[x, y]
                if a == 0 or not (r - g > 35 and b - g > 15 and r > 80):
                    continue
                neighbors = (
                    pixels[x - 1, y][3] if x > 0 else 0,
                    pixels[x + 1, y][3] if x < rgba.width - 1 else 0,
                    pixels[x, y - 1][3] if y > 0 else 0,
                    pixels[x, y + 1][3] if y < rgba.height - 1 else 0,
                )
                if 0 in neighbors:
                    fringe.append((x, y))
        for x, y in fringe:
            pixels[x, y] = (0, 0, 0, 0)
    return rgba


def binarize_alpha(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
    image.putalpha(alpha)
    return image


def extract_pose(
    source: Image.Image,
    box: tuple[int, int, int, int],
    max_size: tuple[int, int],
) -> Image.Image:
    pose = source.crop(box)
    alpha_box = pose.getchannel("A").getbbox()
    if alpha_box is None:
        raise RuntimeError(f"Recorte sem pixels visíveis: {box}")
    pose = pose.crop(alpha_box)
    ratio = min(max_size[0] / pose.width, max_size[1] / pose.height)
    size = (max(1, round(pose.width * ratio)), max(1, round(pose.height * ratio)))
    return binarize_alpha(pose.resize(size, Image.Resampling.NEAREST))


def export_effect_layer(source: Image.Image, box: tuple[int, int, int, int], name: str) -> None:
    layer = source.crop(box)
    if layer.getchannel("A").getbbox() is None:
        return
    EXTRACTED_ROOT.mkdir(parents=True, exist_ok=True)
    layer.save(EXTRACTED_ROOT / f"{name}.png", optimize=True)


def frame_from(pose: Image.Image, frame_size: int, x_offset: int = 0, y_offset: int = 0, rotate: int = 0) -> Image.Image:
    frame = Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
    sprite = pose.rotate(rotate, expand=True, resample=Image.Resampling.NEAREST) if rotate else pose
    x = (frame_size - sprite.width) // 2 + x_offset
    y = frame_size - sprite.height - GROUND_PAD + y_offset
    frame.alpha_composite(sprite, (max(0, x), max(0, y)))
    return frame


def save_strip(path: Path, frames: list[Image.Image], frame_size: int) -> None:
    strip = Image.new("RGBA", (frame_size * len(frames), frame_size), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        strip.alpha_composite(frame, (index * frame_size, 0))
    path.parent.mkdir(parents=True, exist_ok=True)
    strip.save(path, optimize=True)


def repeated(pose: Image.Image, frame_size: int, offsets: list[tuple[int, int]]) -> list[Image.Image]:
    return [frame_from(pose, frame_size, x, y) for x, y in offsets]


def build_rafa() -> None:
    frame_size = 192
    body_max = (188, 176)
    source = key_magenta_background(
        Image.open(REFERENCE_ROOT / "rafa-mare-pixel-direction.png"),
    )
    idle = extract_pose(source, (120, 10, 690, 505), body_max)
    punch = extract_pose(source, (690, 5, 1325, 505), body_max)
    kick = extract_pose(source, (120, 490, 690, 1015), body_max)
    # Recorte termina antes do jato de água destacado (palma ~x1205).
    wave = extract_pose(source, (640, 500, 1205, 1018), body_max)
    export_effect_layer(source, (1205, 520, 1470, 780), "rafa-mare-water-jet")
    output = FIGHTER_ROOT / "rafa-mare"
    strips = {
        "idle.png": repeated(idle, frame_size, [(0, 0), (0, -2), (0, 0), (0, 2)]),
        "walk.png": repeated(idle, frame_size, [(-4, 0), (0, -2), (4, 0), (0, 2)]),
        "jump.png": repeated(kick, frame_size, [(0, 4), (0, 0), (0, -4), (0, 0)]),
        "crouch.png": repeated(wave, frame_size, [(0, 6), (0, 4), (0, 6), (0, 4)]),
        "light-attack.png": repeated(punch, frame_size, [(-6, 0), (-2, 0), (2, 0), (0, 0)]),
        "heavy-attack.png": repeated(kick, frame_size, [(-4, 2), (0, 0), (4, -2), (0, 0)]),
        "special.png": repeated(wave, frame_size, [(-4, 0), (0, -2), (4, 0), (0, 2)]),
        "hit.png": repeated(idle, frame_size, [(4, 0), (-4, 2), (2, 0), (0, 0)]),
        "knockdown.png": [frame_from(idle, frame_size, rotate=90) for _ in range(4)],
        "victory.png": repeated(punch, frame_size, [(0, 0), (0, -4), (0, 0), (0, -2)]),
    }
    for filename, frames in strips.items():
        save_strip(output / filename, frames, frame_size)


def build_guto() -> None:
    frame_size = 256
    body_max = (248, 232)
    source = key_magenta_background(
        Image.open(REFERENCE_ROOT / "guto-barba-pixel-direction.png"),
    )
    idle = extract_pose(source, (100, 0, 690, 500), body_max)
    # Fundo do recorte em y=500 (nível das botas) para as gotículas de gelo
    # abaixo dos pés não deslocarem a linha de chão.
    ice = extract_pose(source, (720, 0, 1390, 500), body_max)
    grab = extract_pose(source, (90, 490, 735, 1018), body_max)
    output = FIGHTER_ROOT / "guto-barba"
    strips = {
        "idle.png": repeated(idle, frame_size, [(0, 0), (0, -2), (0, 0), (0, 2)]),
        "walk.png": repeated(idle, frame_size, [(-4, 0), (0, -2), (4, 0), (0, 2)]),
        "jump.png": repeated(idle, frame_size, [(0, 4), (0, 0), (0, -4), (0, 0)]),
        "crouch.png": repeated(grab, frame_size, [(0, 6), (0, 4), (0, 6), (0, 4)]),
        "light-attack.png": repeated(ice, frame_size, [(-4, 0), (0, 0), (4, 0), (0, 0)]),
        "heavy-attack.png": repeated(grab, frame_size, [(-6, 0), (-2, 0), (2, 0), (0, 0)]),
        "special.png": repeated(ice, frame_size, [(-4, 0), (0, -2), (4, 0), (0, 2)]),
        "hit.png": repeated(idle, frame_size, [(4, 0), (-4, 2), (2, 0), (0, 0)]),
        "knockdown.png": [frame_from(idle, frame_size, rotate=90) for _ in range(4)],
        "victory.png": repeated(grab, frame_size, [(0, 0), (0, -4), (0, 0), (0, -2)]),
    }
    for filename, frames in strips.items():
        save_strip(output / filename, frames, frame_size)


if __name__ == "__main__":
    build_rafa()
    build_guto()
    print("Sprites provisórios regenerados: Rafa Maré 192x192 e Guto Barba 256x256 (20 strips, alpha binário).")
