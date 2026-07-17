"""Rebuild Rafa, Guto and Astro combat strips with stable scale and pivots.

The large reference-driven contact sheets stay under ``tmp/imagegen``.  This
script only writes the public fighter PNGs, keeping their flat paths and four
horizontal frames.  Effects are reframed without resizing their visible art.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.dont_write_bytecode = True

from PIL import Image

from normalize_fighter_sheet import alpha_bbox, harden_alpha, isolate_four_subjects


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public" / "assets" / "fighters"
IMAGEGEN = ROOT / "tmp" / "imagegen"
FRAME_COUNT = 4

RAFA_FRAME = 256
RAFA_FOOTLINE = 249
RAFA_SCALE = 176 / 542
RAFA_LEGACY_SCALE = 176 / 180

GUTO_FRAME = 288
GUTO_FOOTLINE = 281
GUTO_SCALE = 210 / 561

ASTRO_FRAME = 256
ASTRO_FOOTLINE = 249
# A maior pose do idle canônico mede 553 px; Astro compartilha a estatura
# visual de 176 px do Rafa, mas mantém silhueta e massa mais leves.
ASTRO_SCALE = 176 / 553

MIN_MASS_SCALE = 0.75
MAX_MASS_SCALE = 1.60


RAFA_SOURCES: dict[str, tuple[str, bool]] = {
    "idle.png": ("idle-alpha.png", False),
    "corrida.png": ("corrida-alpha.png", False),
    "walk-backward.png": ("walk-backward-alpha.png", False),
    "jump-neutral.png": ("jump-neutral-alpha.png", False),
    "jump-forward.png": ("jump-forward-alpha.png", False),
    "jump-backward.png": ("jump-backward-alpha.png", False),
    "fall.png": ("fall-alpha.png", False),
    "landing.png": ("landing-alpha-v2.png", True),
    "crouch.png": ("crouch-alpha.png", False),
    "standing-light.png": ("standing-light-alpha.png", False),
    "standing-heavy.png": ("standing-heavy-alpha.png", False),
    "forward-light.png": ("forward-light-alpha.png", False),
    "forward-heavy.png": ("forward-heavy-alpha.png", False),
    "crouch-light.png": ("crouch-light-alpha-v2.png", True),
    "crouch-heavy.png": ("crouch-heavy-alpha-v2.png", True),
    "air-light-neutral.png": ("air-light-neutral-alpha.png", False),
    "air-heavy-neutral.png": ("air-heavy-neutral-alpha.png", False),
    "air-light-forward.png": ("air-light-forward-alpha.png", False),
    "air-heavy-forward.png": ("air-heavy-forward-alpha-v2.png", True),
    "air-light-backward.png": ("air-light-backward-alpha.png", False),
    "air-heavy-backward.png": ("air-heavy-backward-alpha-v2.png", True),
}

GUTO_SOURCE_OVERRIDES: dict[str, Path] = {
    "abraco-glacial-grab.png": IMAGEGEN / "guto-barba" / "keyed" / "abraco-glacial-grab-fix-v3.png",
    "abraco-glacial-hold.png": IMAGEGEN / "guto-barba" / "keyed" / "abraco-glacial-hold-clean-v2.png",
    "air-heavy-forward.png": IMAGEGEN / "guto-barba" / "kicks-v2" / "keyed" / "air-heavy-forward-clean-v2.png",
    "air-heavy-neutral.png": IMAGEGEN / "guto-barba" / "kicks-v2" / "keyed" / "air-heavy-neutral-clean-v2.png",
    "air-light-neutral.png": IMAGEGEN / "guto-barba" / "keyed" / "air-light-neutral-clean-v2.png",
    "crouch-heavy.png": IMAGEGEN / "guto-barba" / "kicks-v2" / "keyed" / "crouch-heavy-clean-v2.png",
    "crouch-light.png": IMAGEGEN / "guto-barba" / "kicks-v2" / "keyed" / "crouch-light-clean-v2.png",
    "forward-heavy.png": IMAGEGEN / "guto-barba" / "kicks-v2" / "keyed" / "forward-heavy-clean-v3.png",
    "frozen.png": IMAGEGEN / "guto-barba" / "keyed" / "frozen-clean-v2.png",
    "gancho-do-urso-startup.png": IMAGEGEN / "guto-barba" / "keyed" / "gancho-do-urso-startup-clean-v2.png",
    "gancho-do-urso-grab.png": IMAGEGEN / "guto-barba" / "keyed" / "gancho-do-urso-grab-clean-v2.png",
    "gancho-do-urso-hold.png": IMAGEGEN / "guto-barba" / "keyed" / "gancho-do-urso-hold-clean-v2.png",
    "gancho-do-urso-throw.png": IMAGEGEN / "guto-barba" / "keyed" / "gancho-do-urso-throw-clean-v2.png",
    "gancho-do-urso-recovery.png": IMAGEGEN / "guto-barba" / "keyed" / "gancho-do-urso-recovery-clean-v2.png",
    "grabbed-front.png": IMAGEGEN / "guto-barba" / "keyed" / "grabbed-front-clean-v2.png",
    "grabbed-lifted.png": IMAGEGEN / "guto-barba" / "keyed" / "grabbed-lifted-clean-v2.png",
    "jump-backward.png": IMAGEGEN / "guto-barba" / "jump-backward-alpha-v5.png",
    "jump-forward.png": IMAGEGEN / "guto-barba" / "jump-forward-alpha-v5.png",
    "jump-neutral.png": IMAGEGEN / "guto-barba" / "keyed" / "jump-neutral-clean-v2.png",
    "knockdown.png": IMAGEGEN / "guto-barba" / "keyed" / "knockdown-clean-v2.png",
    "victory.png": IMAGEGEN / "guto-barba" / "keyed-clean" / "victory.png",
}

ASTRO_BODY_ASSETS: tuple[str, ...] = (
    "idle.png",
    "corrida.png",
    "walk-backward.png",
    "jump-neutral.png",
    "jump-forward.png",
    "jump-backward.png",
    "fall.png",
    "landing.png",
    "crouch.png",
    "standing-light.png",
    "standing-heavy.png",
    "forward-light.png",
    "forward-heavy.png",
    "crouch-light.png",
    "crouch-heavy.png",
    "air-light-neutral.png",
    "air-heavy-neutral.png",
    "air-light-forward.png",
    "air-heavy-forward.png",
    "air-light-backward.png",
    "air-heavy-backward.png",
    "block-standing.png",
    "block-crouching.png",
    "hit.png",
    "knockdown.png",
    "wake-up.png",
    "grabbed-front.png",
    "grabbed-lifted.png",
    "thrown.png",
    "frozen.png",
    "knockout.png",
    "victory.png",
    "sorriso-relampago.png",
    "rajada-neon.png",
    "astro-giro.png",
)

ASTRO_EFFECT_ASSETS: tuple[str, ...] = (
    "sorriso-relampago-effect.png",
    "rajada-neon-effect.png",
    "astro-giro-effect.png",
)


def split_contact_sheet(source: Image.Image, isolate: bool) -> list[Image.Image]:
    if isolate:
        return isolate_four_subjects(source)

    cell_width = source.width // 2
    cell_height = source.height // 2
    if cell_width * 2 != source.width or cell_height * 2 != source.height:
        raise ValueError(f"contact sheet must be 2x2: {source.size}")
    return [
        source.crop(
            (
                column * cell_width,
                row * cell_height,
                (column + 1) * cell_width,
                (row + 1) * cell_height,
            )
        )
        for row in range(2)
        for column in range(2)
    ]


def compose_body(
    poses: list[Image.Image],
    frame_size: int,
    footline: int,
    scale: float,
) -> Image.Image:
    if len(poses) != FRAME_COUNT:
        raise ValueError(f"expected {FRAME_COUNT} poses, found {len(poses)}")

    sheet = Image.new("RGBA", (frame_size * FRAME_COUNT, frame_size), (0, 0, 0, 0))
    for index, pose_source in enumerate(poses):
        pose_source = harden_alpha(pose_source.convert("RGBA"))
        box = alpha_bbox(pose_source)
        pose = pose_source.crop(box)
        width = max(1, round(pose.width * scale))
        height = max(1, round(pose.height * scale))
        pose = pose.resize((width, height), Image.Resampling.NEAREST)
        pose = harden_alpha(pose)

        local_x = (frame_size - width) // 2
        y = footline - height + 1
        if local_x < 0 or local_x + width > frame_size or y < 0 or y + height > frame_size:
            raise ValueError(
                f"pose {index} does not fit {frame_size}px canvas: "
                f"size={width}x{height}, at=({local_x},{y}), scale={scale:.6f}"
            )
        sheet.alpha_composite(pose, (index * frame_size + local_x, y))
    return sheet


def median_opaque_area(sheet: Image.Image, frame_size: int) -> float:
    areas: list[int] = []
    for index in range(FRAME_COUNT):
        frame = sheet.crop(
            (index * frame_size, 0, (index + 1) * frame_size, frame_size)
        )
        alpha = frame.getchannel("A")
        areas.append(alpha.histogram()[255])
    ordered = sorted(areas)
    return (ordered[1] + ordered[2]) / 2


def normalize_visual_mass(
    sheet: Image.Image,
    frame_size: int,
    footline: int,
    target_area: float,
) -> Image.Image:
    """Correct source-sheet scale drift without stretching individual poses.

    Generated contact sheets do not always draw the same fighter at the same
    scale.  A single uniform factor is applied to all four poses in one sheet,
    using opaque body mass (more pose-invariant than bbox width or height).
    """

    current_area = median_opaque_area(sheet, frame_size)
    if current_area <= 0:
        raise ValueError("body sheet has no opaque pixels")
    scale = (target_area / current_area) ** 0.5
    if not MIN_MASS_SCALE <= scale <= MAX_MASS_SCALE:
        raise ValueError(
            f"visual-mass scale {scale:.4f} outside "
            f"{MIN_MASS_SCALE:.2f}..{MAX_MASS_SCALE:.2f}"
        )

    poses = [
        sheet.crop((index * frame_size, 0, (index + 1) * frame_size, frame_size))
        for index in range(FRAME_COUNT)
    ]
    return compose_body(poses, frame_size, footline, scale)


def body_from_contact_source(
    source_path: Path,
    frame_size: int,
    footline: int,
    scale: float,
    isolate: bool,
) -> Image.Image:
    source = harden_alpha(Image.open(source_path).convert("RGBA"))
    return compose_body(split_contact_sheet(source, isolate), frame_size, footline, scale)


def body_from_existing_strip(
    source_path: Path,
    frame_size: int,
    footline: int,
    legacy_scale: float,
) -> Image.Image:
    source = Image.open(source_path).convert("RGBA")
    if source.width % FRAME_COUNT != 0 or source.height != source.width // FRAME_COUNT:
        raise ValueError(f"invalid legacy strip: {source_path} {source.size}")
    old_frame = source.width // FRAME_COUNT
    poses = [
        source.crop((index * old_frame, 0, (index + 1) * old_frame, old_frame))
        for index in range(FRAME_COUNT)
    ]
    # Only the committed 192px Rafa strips need the one-time stature correction.
    # Reframing later normalized output must be lossless and idempotent.
    scale = legacy_scale if old_frame == 192 else 1
    return compose_body(poses, frame_size, footline, scale)


def has_frame_size(source_path: Path, frame_size: int) -> bool:
    """Return whether a four-frame strip already uses the final canvas."""

    with Image.open(source_path) as source:
        return source.size == (frame_size * FRAME_COUNT, frame_size)


def reframe_effect(source_path: Path, frame_size: int) -> Image.Image:
    source = Image.open(source_path).convert("RGBA")
    if source.width % FRAME_COUNT != 0 or source.height != source.width // FRAME_COUNT:
        raise ValueError(f"invalid effect strip: {source_path} {source.size}")
    old_frame = source.width // FRAME_COUNT
    if old_frame > frame_size:
        raise ValueError(f"effect frame {old_frame} does not fit {frame_size}: {source_path}")

    offset = (frame_size - old_frame) // 2
    sheet = Image.new("RGBA", (frame_size * FRAME_COUNT, frame_size), (0, 0, 0, 0))
    for index in range(FRAME_COUNT):
        frame = source.crop((index * old_frame, 0, (index + 1) * old_frame, old_frame))
        sheet.alpha_composite(frame, (index * frame_size + offset, offset))
    return sheet


def effect_from_contact_source(source_path: Path, frame_size: int) -> Image.Image:
    """Preserve every disconnected spark while applying one scale per sheet."""

    source = harden_alpha(Image.open(source_path).convert("RGBA"))
    cells = split_contact_sheet(source, False)
    boxes = [alpha_bbox(cell) for cell in cells]
    max_width = max(box[2] - box[0] for box in boxes)
    max_height = max(box[3] - box[1] for box in boxes)
    usable = frame_size - 16
    scale = min(usable / max_width, usable / max_height)
    sheet = Image.new(
        "RGBA",
        (frame_size * FRAME_COUNT, frame_size),
        (0, 0, 0, 0),
    )
    for index, (cell, box) in enumerate(zip(cells, boxes, strict=True)):
        effect = cell.crop(box)
        width = max(1, round(effect.width * scale))
        height = max(1, round(effect.height * scale))
        effect = harden_alpha(
            effect.resize((width, height), Image.Resampling.NEAREST)
        )
        x = index * frame_size + (frame_size - width) // 2
        y = (frame_size - height) // 2
        sheet.alpha_composite(effect, (x, y))
    return sheet


def save(sheet: Image.Image, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, optimize=True)
    print(f"{output.relative_to(ROOT)}: {sheet.width}x{sheet.height}")


def rebuild_rafa(only_assets: set[str] | None = None) -> None:
    directory = PUBLIC / "rafa-mare"
    source_directory = IMAGEGEN / "rafa-mare"
    idle_source, idle_isolate = RAFA_SOURCES["idle.png"]
    idle_sheet = body_from_contact_source(
        source_directory / idle_source,
        RAFA_FRAME,
        RAFA_FOOTLINE,
        RAFA_SCALE,
        idle_isolate,
    )
    target_area = median_opaque_area(idle_sheet, RAFA_FRAME)
    for output in sorted(directory.glob("*.png")):
        if only_assets is not None and output.name not in only_assets:
            continue
        normalize_mass = True
        if output.name.endswith("-effect.png"):
            sheet = reframe_effect(output, RAFA_FRAME)
            normalize_mass = False
        elif output.name in RAFA_SOURCES:
            source_name, isolate = RAFA_SOURCES[output.name]
            sheet = body_from_contact_source(
                source_directory / source_name,
                RAFA_FRAME,
                RAFA_FOOTLINE,
                RAFA_SCALE,
                isolate,
            )
        else:
            # These state/special strips have no retained high-resolution
            # contact source.  They are reframed once from the committed art,
            # using the same 176px idle stature instead of per-frame fitting.
            if has_frame_size(output, RAFA_FRAME):
                # Sem fonte de alta resolução, o PNG público normalizado é a
                # fonte canônica. Reamostrá-lo novamente causaria deriva.
                sheet = Image.open(output).convert("RGBA")
                normalize_mass = False
            else:
                sheet = body_from_existing_strip(
                    output,
                    RAFA_FRAME,
                    RAFA_FOOTLINE,
                    RAFA_LEGACY_SCALE,
                )
        if normalize_mass:
            sheet = normalize_visual_mass(
                sheet,
                RAFA_FRAME,
                RAFA_FOOTLINE,
                target_area,
            )
        save(sheet, output)


def rebuild_guto(only_assets: set[str] | None = None) -> None:
    directory = PUBLIC / "guto-barba"
    keyed_directory = IMAGEGEN / "guto-barba" / "keyed"
    idle_sheet = body_from_contact_source(
        keyed_directory / "idle.png",
        GUTO_FRAME,
        GUTO_FOOTLINE,
        GUTO_SCALE,
        True,
    )
    target_area = median_opaque_area(idle_sheet, GUTO_FRAME)
    for output in sorted(directory.glob("*.png")):
        if only_assets is not None and output.name not in only_assets:
            continue
        if output.name.endswith("-effect.png"):
            # Guto already uses the final effect canvas. Reframing is
            # intentionally lossless and leaves its visible size untouched.
            sheet = reframe_effect(output, GUTO_FRAME)
        else:
            source = GUTO_SOURCE_OVERRIDES.get(output.name, keyed_directory / output.name)
            sheet = body_from_contact_source(
                source,
                GUTO_FRAME,
                GUTO_FOOTLINE,
                GUTO_SCALE,
                True,
            )
            sheet = normalize_visual_mass(
                sheet,
                GUTO_FRAME,
                GUTO_FOOTLINE,
                target_area,
            )
        save(sheet, output)


def rebuild_astro(only_assets: set[str] | None = None) -> None:
    directory = PUBLIC / "astro-riso"
    source_directory = IMAGEGEN / "astro-riso" / "keyed"
    idle_sheet = body_from_contact_source(
        source_directory / "idle.png",
        ASTRO_FRAME,
        ASTRO_FOOTLINE,
        ASTRO_SCALE,
        True,
    )
    target_area = median_opaque_area(idle_sheet, ASTRO_FRAME)

    for name in (*ASTRO_BODY_ASSETS, *ASTRO_EFFECT_ASSETS):
        if only_assets is not None and name not in only_assets:
            continue
        source = source_directory / name
        if not source.is_file():
            raise FileNotFoundError(f"missing Astro source: {source}")
        output = directory / name
        if name in ASTRO_EFFECT_ASSETS:
            sheet = effect_from_contact_source(source, ASTRO_FRAME)
        else:
            sheet = body_from_contact_source(
                source,
                ASTRO_FRAME,
                ASTRO_FOOTLINE,
                ASTRO_SCALE,
                True,
            )
            sheet = normalize_visual_mass(
                sheet,
                ASTRO_FRAME,
                ASTRO_FOOTLINE,
                target_area,
            )
        save(sheet, output)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Rebuild all fighter sprites or a safe, explicit subset."
    )
    parser.add_argument(
        "--fighter",
        choices=("all", "rafa", "guto", "astro"),
        default="all",
        help="fighter whose public sprites will be rewritten (default: all)",
    )
    parser.add_argument(
        "--asset",
        action="append",
        dest="assets",
        metavar="FILENAME",
        help="rewrite only this PNG; repeat for multiple assets",
    )
    return parser.parse_args()


def validate_requested_assets(fighter: str, assets: set[str] | None) -> None:
    if assets is None:
        return
    directories = []
    if fighter in ("all", "rafa"):
        directories.append(PUBLIC / "rafa-mare")
    if fighter in ("all", "guto"):
        directories.append(PUBLIC / "guto-barba")
    if fighter in ("all", "astro"):
        available = set(ASTRO_BODY_ASSETS) | set(ASTRO_EFFECT_ASSETS)
    else:
        available = set()
    available.update(
        path.name for directory in directories for path in directory.glob("*.png")
    )
    missing = sorted(assets - available)
    if missing:
        raise ValueError(f"unknown requested assets: {', '.join(missing)}")


def main() -> None:
    args = parse_args()
    assets = set(args.assets) if args.assets else None
    validate_requested_assets(args.fighter, assets)
    if args.fighter in ("all", "rafa"):
        rebuild_rafa(assets)
    if args.fighter in ("all", "guto"):
        rebuild_guto(assets)
    if args.fighter in ("all", "astro"):
        rebuild_astro(assets)


if __name__ == "__main__":
    main()
