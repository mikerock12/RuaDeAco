"""Monta as folhas finais de Léo Violeta e Noir Reflexo.

As fontes desta tarefa já devem ter passado pelo helper oficial
``remove_chroma_key.py``. A separação é feita por componentes globais, nunca
por crop destrutivo da célula: assim, mãos/pés que cruzam uma divisória da grade
continuam íntegros. Cada folha usa um único fator de escala declarado; se a
pose não couber no canvas canônico, o build falha em vez de encolhê-la.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
FRAME_SIZE = 256
BASELINE_Y = 249
MAX_BODY_WIDTH = 238
MAX_BODY_HEIGHT = 238
MAX_EFFECT_SIZE = 224
SAFE_SOURCE_MARGIN = 2
SAFE_FINAL_MARGIN = 6
MAX_REMOVABLE_NOISE_AREA = 3

BODY_NAMES = (
    "idle",
    "corrida",
    "walk-backward",
    "jump-neutral",
    "jump-forward",
    "jump-backward",
    "fall",
    "landing",
    "crouch",
    "standing-light",
    "standing-heavy",
    "forward-light",
    "forward-heavy",
    "crouch-light",
    "crouch-heavy",
    "air-light-neutral",
    "air-heavy-neutral",
    "air-light-forward",
    "air-heavy-forward",
    "air-light-backward",
    "air-heavy-backward",
    "block-standing",
    "block-crouching",
    "hit",
    "knockdown",
    "wake-up",
    "grabbed-front",
    "grabbed-lifted",
    "thrown",
    "frozen",
    "knockout",
    "victory",
)


@dataclass(frozen=True)
class FighterContract:
    slug: str
    target_standing_height: int
    specials: tuple[str, str, str]
    effects: tuple[str, ...]


FIGHTERS = (
    FighterContract(
        "leo-violeta",
        179,
        ("olhar-frio", "impacto-sombrio", "pressao-violeta"),
        (
            "olhar-frio-effect",
            "impacto-sombrio-effect",
            "pressao-violeta-effect",
        ),
    ),
    FighterContract(
        "noir-reflexo",
        181,
        ("reflexo-negro", "quebra-luz", "impacto-solar"),
        (
            "reflexo-negro-effect",
            "quebra-luz-effect",
            "impacto-solar-effect",
            "quebra-luz-status-effect",
        ),
    ),
)

# Correções de zoom por folha, sempre uniformes nos quatro/oito frames.
# O fator multiplica a escala canônica derivada do idle. Entradas 1.0 usam o
# enquadramento canônico da fonte. Os valores abaixo foram medidos pelas
# sobreposições de cabeça/ombros/quadril/pés da auditoria inicial.
SHEET_SCALE_FACTORS: dict[str, dict[str, float]] = {
    "leo-violeta": {
        **{name: 1.0 for name in (*BODY_NAMES, "olhar-frio", "impacto-sombrio", "pressao-violeta")},
        "walk-backward": 0.92,
        "crouch": 0.84,
        "standing-heavy": 0.92,
        "forward-light": 0.94,
        "block-crouching": 0.92,
        "pressao-violeta": 1.12,
        # As fontes 4×2 têm células menores; estes fatores reproduzem a
        # estatura canônica do grupo sem escalar quadros individualmente.
        "grabbed-front": 1.23,
        "grabbed-lifted": 1.35,
    },
    "noir-reflexo": {
        **{name: 1.0 for name in (*BODY_NAMES, "reflexo-negro", "quebra-luz", "impacto-solar")},
        "corrida": 1.12,
        "walk-backward": 1.16,
        "jump-neutral": 1.10,
        "jump-forward": 1.07,
        "jump-backward": 1.07,
        "crouch": 0.90,
        "standing-light": 1.12,
        "forward-light": 1.12,
        "forward-heavy": 1.20,
        "crouch-light": 1.08,
        "crouch-heavy": 1.05,
        "air-light-neutral": 1.12,
        "air-heavy-neutral": 1.10,
        "air-light-forward": 1.08,
        "air-heavy-forward": 1.05,
        "air-light-backward": 1.05,
        "air-heavy-backward": 1.08,
        "block-standing": 1.08,
        "wake-up": 1.08,
        "reflexo-negro": 1.07,
        "quebra-luz": 1.12,
        "impacto-solar": 1.07,
        "grabbed-front": 1.36,
        "grabbed-lifted": 1.64,
    },
}


def alpha_mask(image: Image.Image) -> np.ndarray:
    return np.asarray(image.getchannel("A")) > 0


def crop_alpha(image: Image.Image) -> Image.Image:
    prepared = image.convert("RGBA")
    bbox = prepared.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("quadro vazio após remoção do chroma")
    return prepared.crop(bbox)


def split_grid(image: Image.Image, columns: int, rows: int) -> list[Image.Image]:
    width, height = image.size
    cells: list[Image.Image] = []
    for row in range(rows):
        top = round(row * height / rows)
        bottom = round((row + 1) * height / rows)
        for column in range(columns):
            left = round(column * width / columns)
            right = round((column + 1) * width / columns)
            cells.append(image.crop((left, top, right, bottom)))
    return cells


def body_layout(image: Image.Image, frame_count: int) -> tuple[int, int]:
    if frame_count == 8:
        return 4, 2

    mask = alpha_mask(image).astype(np.uint8)
    count, _, stats, centers = cv2.connectedComponentsWithStats(mask, 8)
    components = [
        (int(stats[index, cv2.CC_STAT_AREA]), centers[index])
        for index in range(1, count)
        if stats[index, cv2.CC_STAT_AREA] >= 1000
    ]
    largest = sorted(components, key=lambda component: component[0], reverse=True)[:4]
    if len(largest) == 4:
        xs = [center[0] for _, center in largest]
        ys = [center[1] for _, center in largest]
        if max(ys) - min(ys) < image.height * 0.28 and max(xs) - min(xs) > image.width * 0.55:
            return 4, 1
    return 2, 2


def component_assignments(
    image: Image.Image,
    frame_count: int,
) -> tuple[np.ndarray, list[list[int]], list[dict[str, object]]]:
    """Agrupa componentes globais por pose sem cortar nas divisórias.

    Primeiro escolhe o componente dominante de cada célula nominal. Depois
    associa todos os demais componentes não triviais ao corpo dominante mais
    próximo. Só ruído isolado de até três pixels é removido.
    """

    columns, rows = body_layout(image, frame_count)
    mask = alpha_mask(image).astype(np.uint8)
    count, labels, stats, centers = cv2.connectedComponentsWithStats(mask, 8)
    if count <= 1:
        raise ValueError("fonte sem conteúdo opaco")

    assignments: list[list[int]] = [[] for _ in range(frame_count)]
    selected: list[int] = []
    for row in range(rows):
        top = round(row * image.height / rows)
        bottom = round((row + 1) * image.height / rows)
        for column in range(columns):
            left = round(column * image.width / columns)
            right = round((column + 1) * image.width / columns)
            region = labels[top:bottom, left:right]
            values, region_counts = np.unique(region[region > 0], return_counts=True)
            candidates = sorted(
                zip(values.tolist(), region_counts.tolist(), strict=True),
                key=lambda item: item[1],
                reverse=True,
            )
            main = next(
                (
                    int(label)
                    for label, _ in candidates
                    if int(label) not in selected
                    and int(stats[int(label), cv2.CC_STAT_AREA]) > MAX_REMOVABLE_NOISE_AREA
                ),
                None,
            )
            if main is None:
                raise ValueError(
                    f"não foi possível localizar corpo na célula {len(selected)}"
                )
            selected.append(main)
            assignments[len(selected) - 1].append(main)

    cleanup: list[dict[str, object]] = [
        {"removedComponents": 0, "removedPixels": 0, "preservedComponents": 1}
        for _ in range(frame_count)
    ]
    for label in range(1, count):
        if label in selected:
            continue
        area = int(stats[label, cv2.CC_STAT_AREA])
        center = centers[label]
        nearest = min(
            range(frame_count),
            key=lambda index: float(
                (center[0] - centers[selected[index]][0]) ** 2
                + (center[1] - centers[selected[index]][1]) ** 2
            ),
        )
        if area <= MAX_REMOVABLE_NOISE_AREA:
            cleanup[nearest]["removedComponents"] = int(
                cleanup[nearest]["removedComponents"]
            ) + 1
            cleanup[nearest]["removedPixels"] = int(cleanup[nearest]["removedPixels"]) + area
            continue
        assignments[nearest].append(label)
        cleanup[nearest]["preservedComponents"] = int(
            cleanup[nearest]["preservedComponents"]
        ) + 1

    return labels, assignments, cleanup


def extract_body_frames(
    image: Image.Image,
    frame_count: int,
    source: Path,
) -> tuple[list[Image.Image], list[dict[str, object]]]:
    rgba = np.asarray(image.convert("RGBA")).copy()
    labels, assignments, cleanup = component_assignments(image, frame_count)
    frames: list[Image.Image] = []
    for index, assigned in enumerate(assignments):
        frame_rgba = rgba.copy()
        keep = np.isin(labels, assigned)
        frame_rgba[~keep, 3] = 0
        ys, xs = np.where(keep)
        if xs.size == 0:
            raise ValueError(f"{source}: frame {index} vazio")
        margins = {
            "left": int(xs.min()),
            "right": int(image.width - 1 - xs.max()),
            "top": int(ys.min()),
            "bottom": int(image.height - 1 - ys.max()),
        }
        unsafe = [
            side
            for side in ("left", "right", "top")
            if margins[side] < SAFE_SOURCE_MARGIN
        ]
        if unsafe:
            raise ValueError(
                f"{source}: frame {index} toca limite externo "
                f"{'/'.join(unsafe)}; margens={margins}"
            )
        cleanup[index]["sourceMargins"] = margins
        cleanup[index]["preservedAreas"] = [
            int(np.count_nonzero(labels == label)) for label in assigned
        ]
        frames.append(crop_alpha(Image.fromarray(frame_rgba, "RGBA")))
    return frames, cleanup


def body_reference_scale(source_dir: Path, target_standing_height: int) -> float:
    idle = Image.open(source_dir / "idle.png").convert("RGBA")
    frames, _ = extract_body_frames(idle, 4, source_dir / "idle.png")
    heights = [frame.height for frame in frames]
    return target_standing_height / float(np.median(heights))


def resize_nearest(image: Image.Image, scale: float) -> Image.Image:
    width = max(1, round(image.width * scale))
    height = max(1, round(image.height * scale))
    resized = image.resize((width, height), Image.Resampling.NEAREST)
    rgba = np.asarray(resized.convert("RGBA")).copy()
    # O helper oficial remove o fundo, mas alguns pixels opacos de borda
    # ainda carregam spill verde-escuro. Neutralize apenas canais em que o
    # verde domina claramente; isto preserva silhueta, alpha e cores canônicas.
    red = rgba[:, :, 0].astype(np.int16)
    green = rgba[:, :, 1].astype(np.int16)
    blue = rgba[:, :, 2].astype(np.int16)
    green_spill = (
        (rgba[:, :, 3] > 0)
        & (green >= 24)
        & (green - red >= 8)
        & (green - blue >= 8)
    )
    rgba[:, :, 1][green_spill] = np.maximum(red, blue)[green_spill].astype(np.uint8)
    rgba[:, :, 3] = np.where(rgba[:, :, 3] > 0, 255, 0).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def save_sheet_atomic(
    sheet: Image.Image,
    destination: Path,
    expected_frames: int,
    *,
    baseline: bool,
) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    candidate = destination.with_name(f".{destination.stem}.candidate.png")
    sheet.save(candidate, optimize=True)
    try:
        validate_output(candidate, expected_frames, baseline=baseline)
        candidate.replace(destination)
    finally:
        if candidate.exists():
            candidate.unlink()


def compose_body_frame(
    crop: Image.Image,
    scale: float,
    source: Path,
    frame_index: int,
) -> Image.Image:
    sprite = resize_nearest(crop, scale)
    if sprite.width > MAX_BODY_WIDTH or sprite.height > MAX_BODY_HEIGHT:
        raise ValueError(
            f"{source}: frame {frame_index} não cabe na escala canônica "
            f"{scale:.5f}: {sprite.width}x{sprite.height}, "
            f"máximo {MAX_BODY_WIDTH}x{MAX_BODY_HEIGHT}"
        )
    frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE))
    left = (FRAME_SIZE - sprite.width) // 2
    top = BASELINE_Y - sprite.height + 1
    right = FRAME_SIZE - left - sprite.width
    if left < SAFE_FINAL_MARGIN or right < SAFE_FINAL_MARGIN or top < SAFE_FINAL_MARGIN:
        raise ValueError(
            f"{source}: frame {frame_index} sem margem final segura: "
            f"left={left}, right={right}, top={top}, bottom=6"
        )
    frame.alpha_composite(sprite, (left, top))
    return frame


def build_body_sheet(
    source: Path,
    destination: Path,
    frame_count: int,
    scale: float,
    scale_factor: float,
) -> list[dict[str, object]]:
    image = Image.open(source).convert("RGBA")
    crops, cleanup = extract_body_frames(image, frame_count, source)
    sheet_scale = scale * scale_factor

    sheet = Image.new("RGBA", (FRAME_SIZE * frame_count, FRAME_SIZE))
    for index, crop in enumerate(crops):
        sheet.alpha_composite(
            compose_body_frame(crop, sheet_scale, source, index),
            (index * FRAME_SIZE, 0),
        )
        cleanup[index]["scale"] = round(sheet_scale, 8)
        cleanup[index]["scaleFactor"] = scale_factor
    save_sheet_atomic(sheet, destination, frame_count, baseline=True)
    return cleanup


def build_effect_sheet(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGBA")
    crops = [
        crop_alpha(cell)
        for cell in split_grid(image, 2, 2)
    ]
    scale = min(
        MAX_EFFECT_SIZE / max(crop.width for crop in crops),
        MAX_EFFECT_SIZE / max(crop.height for crop in crops),
    )
    sheet = Image.new("RGBA", (FRAME_SIZE * 4, FRAME_SIZE))
    for index, crop in enumerate(crops):
        sprite = resize_nearest(crop, scale)
        frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE))
        frame.alpha_composite(
            sprite,
            ((FRAME_SIZE - sprite.width) // 2, (FRAME_SIZE - sprite.height) // 2),
        )
        sheet.alpha_composite(frame, (index * FRAME_SIZE, 0))
    save_sheet_atomic(sheet, destination, 4, baseline=False)


def validate_output(path: Path, expected_frames: int, *, baseline: bool) -> None:
    image = Image.open(path).convert("RGBA")
    expected_size = (FRAME_SIZE * expected_frames, FRAME_SIZE)
    if image.size != expected_size:
        raise ValueError(f"{path}: {image.size}, esperado {expected_size}")
    alpha = np.asarray(image.getchannel("A"))
    values = set(np.unique(alpha).tolist())
    if not values.issubset({0, 255}):
        raise ValueError(f"{path}: alpha não binário: {sorted(values)[:8]}")
    for index in range(expected_frames):
        frame = alpha[:, index * FRAME_SIZE : (index + 1) * FRAME_SIZE]
        if not np.any(frame):
            raise ValueError(f"{path}: quadro {index} vazio")
        if baseline:
            opaque_rows = np.where(np.any(frame > 0, axis=1))[0]
            if int(opaque_rows[-1]) != BASELINE_Y:
                raise ValueError(
                    f"{path}: quadro {index} termina em Y={opaque_rows[-1]}, esperado {BASELINE_Y}"
                )


def build_contact_sheets(fighter: FighterContract, destination_dir: Path) -> None:
    evidence_dir = ROOT / "tmp" / "imagegen" / fighter.slug / "evidence"
    evidence_dir.mkdir(parents=True, exist_ok=True)
    background = (18, 22, 31, 255)
    foreground = (232, 238, 246, 255)

    names = (*BODY_NAMES, *fighter.specials)
    tile_width = 540
    tile_height = 166
    columns = 2
    rows = (len(names) + columns - 1) // columns
    body_sheet = Image.new(
        "RGBA",
        (tile_width * columns, tile_height * rows),
        background,
    )
    draw = ImageDraw.Draw(body_sheet)
    for index, name in enumerate(names):
        animation = Image.open(destination_dir / f"{name}.png").convert("RGBA")
        strip_width = 512
        strip_height = round(animation.height * strip_width / animation.width)
        strip = animation.resize(
            (strip_width, strip_height),
            Image.Resampling.NEAREST,
        )
        left = (index % columns) * tile_width + 14
        top = (index // columns) * tile_height
        draw.text((left, top + 7), name, fill=foreground)
        body_sheet.alpha_composite(strip, (left, top + 28))
    body_sheet.save(evidence_dir / "contact-sheet-body.png", optimize=True)

    grabbed_sheet = Image.new("RGBA", (1052, 340), background)
    grabbed_draw = ImageDraw.Draw(grabbed_sheet)
    for row, name in enumerate(("grabbed-front", "grabbed-lifted")):
        animation = Image.open(destination_dir / f"{name}.png").convert("RGBA")
        strip = animation.resize((1024, 128), Image.Resampling.NEAREST)
        top = row * 166
        grabbed_draw.text((14, top + 7), name, fill=foreground)
        grabbed_sheet.alpha_composite(strip, (14, top + 28))
    grabbed_sheet.save(evidence_dir / "contact-sheet-grabbed.png", optimize=True)

    effect_sheet = Image.new(
        "RGBA",
        (tile_width, tile_height * len(fighter.effects)),
        background,
    )
    effect_draw = ImageDraw.Draw(effect_sheet)
    for row, name in enumerate(fighter.effects):
        animation = Image.open(destination_dir / f"{name}.png").convert("RGBA")
        strip = animation.resize((512, 128), Image.Resampling.NEAREST)
        top = row * tile_height
        effect_draw.text((14, top + 7), name, fill=foreground)
        effect_sheet.alpha_composite(strip, (14, top + 28))
    effect_sheet.save(evidence_dir / "contact-sheet-effects.png", optimize=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-root",
        type=Path,
        default=ROOT / "public" / "assets" / "fighters",
        help="raiz que receberá <lutador>/<folha>.png",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    built = 0
    cleanup_report: dict[str, dict[str, dict[str, object]]] = {}
    for fighter in FIGHTERS:
        source_dir = ROOT / "tmp" / "imagegen" / fighter.slug / "keyed"
        destination_dir = args.output_root.resolve() / fighter.slug
        scale = body_reference_scale(source_dir, fighter.target_standing_height)
        cleanup_report[fighter.slug] = {}
        for name in (*BODY_NAMES, *fighter.specials):
            frame_count = 8 if name in {"grabbed-front", "grabbed-lifted"} else 4
            destination = destination_dir / f"{name}.png"
            source = source_dir / f"{name}.png"
            frame_cleanup = build_body_sheet(
                source,
                destination,
                frame_count,
                scale,
                SHEET_SCALE_FACTORS[fighter.slug][name],
            )
            cleanup_report[fighter.slug][name] = {
                "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                "scaleFactor": SHEET_SCALE_FACTORS[fighter.slug][name],
                "frames": frame_cleanup,
            }
            validate_output(destination, frame_count, baseline=True)
            built += 1
        for name in fighter.effects:
            destination = destination_dir / f"{name}.png"
            build_effect_sheet(source_dir / f"{name}.png", destination)
            validate_output(destination, 4, baseline=False)
            built += 1
        build_contact_sheets(fighter, destination_dir)
    report_path = (
        ROOT
        / "tmp"
        / "imagegen"
        / "leo-violeta-noir-reflexo"
        / "correcao-escala-recortes"
        / "pipeline-cleanup-report.json"
    )
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(cleanup_report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"{built} folhas montadas e validadas.")


if __name__ == "__main__":
    main()
