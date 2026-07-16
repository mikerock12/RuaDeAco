"""Remove disconnected raster fragments from selected fighter-sheet frames.

The tool is intentionally conservative: it validates a 4x256 horizontal RGBA
sheet and, only in explicitly selected frames, keeps the largest connected
alpha component.  Other frames are copied byte-for-byte at the pixel level.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


FRAME_SIZE = 256
FRAME_COUNT = 4


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--frames", required=True, type=int, nargs="+")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    invalid = sorted(set(args.frames) - set(range(FRAME_COUNT)))
    if invalid:
        raise ValueError(f"invalid frame indices: {invalid}")

    source = Image.open(args.input)
    if source.mode != "RGBA" or source.size != (FRAME_SIZE * FRAME_COUNT, FRAME_SIZE):
        raise ValueError(
            f"expected RGBA 1024x256 sheet, got mode={source.mode} size={source.size}"
        )

    pixels = np.array(source)
    for frame_index in sorted(set(args.frames)):
        left = frame_index * FRAME_SIZE
        frame = pixels[:, left : left + FRAME_SIZE]
        alpha = frame[:, :, 3]
        label_count, labels, stats, _ = cv2.connectedComponentsWithStats(
            (alpha > 0).astype(np.uint8), connectivity=8
        )
        if label_count <= 1:
            raise ValueError(f"frame {frame_index} has no visible component")

        component_areas = stats[1:, cv2.CC_STAT_AREA]
        largest_label = 1 + int(np.argmax(component_areas))
        removed_mask = (labels != 0) & (labels != largest_label)
        removed_area = int(removed_mask.sum())
        if removed_area == 0:
            raise ValueError(f"frame {frame_index} has no disconnected fragment")

        frame[removed_mask] = (0, 0, 0, 0)
        pixels[:, left : left + FRAME_SIZE] = frame
        print(
            f"frame={frame_index} kept={int(component_areas.max())} "
            f"removed={removed_area}"
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(pixels, mode="RGBA").save(args.output, optimize=True)


if __name__ == "__main__":
    main()
