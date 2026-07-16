"""Normalize a transparent 2x2 contact sheet into a horizontal Phaser sheet.

The image model produces four equally sized cells.  This tool keeps a single
scale for all poses, aligns them consistently and writes exactly four square
frames side by side.  Production calls pass ``--scale`` from a fighter-level
reference (normally the idle sheet); the tool never needs to resize an
animation merely because that pose is wider or shorter.
"""

from __future__ import annotations

import argparse
from collections import deque
from dataclasses import dataclass
from itertools import permutations
from pathlib import Path

from PIL import Image, ImageChops


@dataclass(frozen=True)
class AlphaComponent:
    pixels: tuple[int, ...]
    area: int
    min_x: int
    min_y: int
    max_x: int
    max_y: int
    center_x: float
    center_y: float


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("contact-sheet cell is completely transparent")
    return bbox


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--frame-size", required=True, type=int)
    parser.add_argument("--alignment", choices=("ground", "center"), default="ground")
    parser.add_argument("--padding", type=int, default=6)
    parser.add_argument("--hard-alpha", action="store_true")
    parser.add_argument(
        "--scale",
        type=float,
        help=(
            "fixed source-to-output scale shared by every body sheet of one "
            "fighter; when omitted, legacy per-sheet fitting is used"
        ),
    )
    parser.add_argument(
        "--footline",
        type=int,
        help="inclusive output Y used by the lowest visible body pixel",
    )
    parser.add_argument(
        "--isolate-subjects",
        action="store_true",
        help=(
            "find the four largest connected alpha components globally before "
            "laying out frames; use when a pose crosses a 2x2 quadrant boundary"
        ),
    )
    return parser.parse_args()


def harden_alpha(image: Image.Image) -> Image.Image:
    """Quantize alpha before measuring bounds, so discarded fringe cannot move pivots."""

    red, green, blue, alpha = image.split()
    alpha = alpha.point(lambda value: 255 if value >= 128 else 0)
    return Image.merge("RGBA", (red, green, blue, alpha))


def alpha_components(image: Image.Image) -> list[AlphaComponent]:
    """Return 8-connected opaque components in the complete contact sheet."""

    width, height = image.size
    alpha = image.getchannel("A").point(lambda value: 255 if value >= 128 else 0)
    occupied = alpha.tobytes()
    visited = bytearray(width * height)
    components: list[AlphaComponent] = []

    for start, value in enumerate(occupied):
        if value == 0 or visited[start]:
            continue

        queue: deque[int] = deque([start])
        visited[start] = 1
        pixels: list[int] = []
        min_x = max_x = start % width
        min_y = max_y = start // width
        sum_x = 0
        sum_y = 0

        while queue:
            index = queue.popleft()
            pixels.append(index)
            y, x = divmod(index, width)
            min_x = min(min_x, x)
            max_x = max(max_x, x)
            min_y = min(min_y, y)
            max_y = max(max_y, y)
            sum_x += x
            sum_y += y

            for neighbor_y in range(max(0, y - 1), min(height, y + 2)):
                row = neighbor_y * width
                for neighbor_x in range(max(0, x - 1), min(width, x + 2)):
                    neighbor = row + neighbor_x
                    if occupied[neighbor] == 0 or visited[neighbor]:
                        continue
                    visited[neighbor] = 1
                    queue.append(neighbor)

        area = len(pixels)
        components.append(
            AlphaComponent(
                pixels=tuple(pixels),
                area=area,
                min_x=min_x,
                min_y=min_y,
                max_x=max_x,
                max_y=max_y,
                center_x=sum_x / area,
                center_y=sum_y / area,
            )
        )

    return components


def isolate_four_subjects(source: Image.Image) -> list[Image.Image]:
    """Extract the four full poses even when a limb crosses a quadrant line."""

    components = sorted(alpha_components(source), key=lambda component: component.area, reverse=True)
    if len(components) < 4:
        raise ValueError(f"expected at least four opaque subjects, found {len(components)}")
    subjects = components[:4]
    width, height = source.size
    expected_centers = (
        (width * 0.25, height * 0.25),
        (width * 0.75, height * 0.25),
        (width * 0.25, height * 0.75),
        (width * 0.75, height * 0.75),
    )

    def assignment_cost(order: tuple[AlphaComponent, ...]) -> float:
        return sum(
            (component.center_x - expected_x) ** 2
            + (component.center_y - expected_y) ** 2
            for component, (expected_x, expected_y) in zip(order, expected_centers, strict=True)
        )

    ordered = min(permutations(subjects), key=assignment_cost)
    source_alpha = source.getchannel("A")
    poses: list[Image.Image] = []
    for component in ordered:
        box = (component.min_x, component.min_y, component.max_x + 1, component.max_y + 1)
        pose = source.crop(box)
        mask = Image.new("L", pose.size, 0)
        mask_pixels = mask.load()
        for index in component.pixels:
            y, x = divmod(index, width)
            mask_pixels[x - component.min_x, y - component.min_y] = 255
        pose.putalpha(ImageChops.multiply(source_alpha.crop(box), mask))
        poses.append(pose)

    return poses


def main() -> None:
    args = parse_args()
    source = Image.open(args.input).convert("RGBA")
    # Bounds, connected components, scale and alignment must all observe the
    # same alpha that will be exported.  Quantizing after bbox calculation was
    # the source of the old four-pixel foot jitter.
    if args.hard_alpha:
        source = harden_alpha(source)
    if args.isolate_subjects:
        cells = isolate_four_subjects(source)
    else:
        cell_width = source.width // 2
        cell_height = source.height // 2
        if cell_width * 2 != source.width or cell_height * 2 != source.height:
            raise ValueError(f"source must divide evenly into 2x2 cells: {source.size}")

        cells = []
        for row in range(2):
            for column in range(2):
                cells.append(
                    source.crop(
                        (
                            column * cell_width,
                            row * cell_height,
                            (column + 1) * cell_width,
                            (row + 1) * cell_height,
                        )
                    )
                )
    boxes = [alpha_bbox(cell) for cell in cells]

    max_width = max(box[2] - box[0] for box in boxes)
    max_height = max(box[3] - box[1] for box in boxes)
    usable = args.frame_size - 2 * args.padding
    scale = args.scale if args.scale is not None else min(usable / max_width, usable / max_height)
    if scale <= 0:
        raise ValueError("invalid output scale")

    footline = args.footline if args.footline is not None else args.frame_size - args.padding - 1
    if not 0 <= footline < args.frame_size:
        raise ValueError(f"footline outside frame: {footline}")

    sheet = Image.new("RGBA", (args.frame_size * 4, args.frame_size), (0, 0, 0, 0))
    for index, (cell, box) in enumerate(zip(cells, boxes, strict=True)):
        pose = cell.crop(box)
        width = max(1, round(pose.width * scale))
        height = max(1, round(pose.height * scale))
        pose = pose.resize((width, height), Image.Resampling.NEAREST)
        x = index * args.frame_size + (args.frame_size - width) // 2
        if args.alignment == "ground":
            y = footline - height + 1
        else:
            y = (args.frame_size - height) // 2
        frame_left = index * args.frame_size
        frame_right = frame_left + args.frame_size
        if x < frame_left or x + width > frame_right or y < 0 or y + height > args.frame_size:
            raise ValueError(
                f"pose {index} does not fit {args.frame_size}px frame at fixed scale {scale:.6f}: "
                f"size={width}x{height}, position=({x - frame_left},{y})"
            )
        sheet.alpha_composite(pose, (x, y))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.output, optimize=True)


if __name__ == "__main__":
    main()
