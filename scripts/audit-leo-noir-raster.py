"""Auditoria célula a célula das fontes e folhas finais de Léo/Noir.

Este script é somente analítico: não altera fontes nem PNGs públicos. Ele
registra bboxes, margens, componentes que o pipeline antigo removeria, contato
com divisórias e um proxy de escala/massa. Também cria contact sheets por grupo
com a silhueta do idle sobreposta como guia semitransparente.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import deque
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
FRAME_SIZE = 256
FIGHTERS = ("leo-violeta", "noir-reflexo")
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
SPECIALS = {
    "leo-violeta": ("olhar-frio", "impacto-sombrio", "pressao-violeta"),
    "noir-reflexo": ("reflexo-negro", "quebra-luz", "impacto-solar"),
}
CATEGORIES = {
    "locomocao": (
        "idle",
        "corrida",
        "walk-backward",
        "jump-neutral",
        "jump-forward",
        "jump-backward",
        "fall",
        "landing",
    ),
    "agachar-defender": ("crouch", "block-standing", "block-crouching"),
    "normais": (
        "standing-light",
        "standing-heavy",
        "forward-light",
        "forward-heavy",
        "crouch-light",
        "crouch-heavy",
    ),
    "aereos": (
        "air-light-neutral",
        "air-heavy-neutral",
        "air-light-forward",
        "air-heavy-forward",
        "air-light-backward",
        "air-heavy-backward",
    ),
    "especiais": (),
    "dano-vitoria-ko": (
        "hit",
        "knockdown",
        "wake-up",
        "thrown",
        "frozen",
        "knockout",
        "victory",
    ),
    "vitima-guto": ("grabbed-front", "grabbed-lifted"),
}


def alpha_mask(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("RGBA").getchannel("A")) > 0


def split_grid(image: Image.Image, columns: int, rows: int) -> list[Image.Image]:
    cells: list[Image.Image] = []
    for row in range(rows):
        top = round(row * image.height / rows)
        bottom = round((row + 1) * image.height / rows)
        for column in range(columns):
            left = round(column * image.width / columns)
            right = round((column + 1) * image.width / columns)
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
    largest = sorted(components, key=lambda value: value[0], reverse=True)[:4]
    if len(largest) == 4:
        xs = [center[0] for _, center in largest]
        ys = [center[1] for _, center in largest]
        if max(ys) - min(ys) < image.height * 0.28 and max(xs) - min(xs) > image.width * 0.55:
            return 4, 1
    return 2, 2


def bbox_from_mask(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.where(mask)
    if xs.size == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def longest_run(values: np.ndarray) -> int:
    best = current = 0
    for value in values.tolist():
        if value:
            current += 1
            best = max(best, current)
        else:
            current = 0
    return best


def measure_cell(image: Image.Image) -> dict[str, object]:
    mask = alpha_mask(image)
    bbox = bbox_from_mask(mask)
    if bbox is None:
        return {
            "bbox": None,
            "width": 0,
            "height": 0,
            "opaque": 0,
            "margins": None,
            "components": 0,
            "component_areas": [],
            "significant_components": 0,
            "removed_components_old_pipeline": 0,
            "removed_pixels_old_pipeline": 0,
            "edge_contacts": [],
            "straight_cut_suspects": [],
        }

    min_x, min_y, max_x, max_y = bbox
    binary = mask.astype(np.uint8)
    count, _, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    areas = sorted(
        (int(stats[index, cv2.CC_STAT_AREA]) for index in range(1, count)),
        reverse=True,
    )
    largest = areas[0]
    significant_threshold = max(16, round(largest * 0.005))
    significant = [area for area in areas if area >= significant_threshold]
    contacts: list[str] = []
    safe = 2
    if min_x < safe:
        contacts.append("left")
    if image.width - 1 - max_x < safe:
        contacts.append("right")
    if min_y < safe:
        contacts.append("top")
    if image.height - 1 - max_y < safe:
        contacts.append("bottom")

    # Pixel art pode ter pequenos degraus retos normais. Só sinalizamos uma
    # terminação reta relativamente longa no topo/laterais; baseline inferior
    # é deliberadamente excluído para não confundir sola apoiada com corte.
    suspects: list[str] = []
    if longest_run(mask[min_y, min_x : max_x + 1]) >= 8:
        suspects.append("top-flat")
    if longest_run(mask[min_y : max_y + 1, min_x]) >= 8:
        suspects.append("left-flat")
    if longest_run(mask[min_y : max_y + 1, max_x]) >= 8:
        suspects.append("right-flat")

    return {
        "bbox": [min_x, min_y, max_x, max_y],
        "width": max_x - min_x + 1,
        "height": max_y - min_y + 1,
        "opaque": int(mask.sum()),
        "margins": {
            "left": min_x,
            "right": image.width - 1 - max_x,
            "top": min_y,
            "bottom": image.height - 1 - max_y,
        },
        "components": len(areas),
        "component_areas": areas,
        "significant_components": len(significant),
        "removed_components_old_pipeline": max(0, len(areas) - 1),
        "removed_pixels_old_pipeline": int(sum(areas[1:])),
        "edge_contacts": contacts,
        "straight_cut_suspects": suspects,
    }


def public_frames(path: Path, frame_count: int) -> list[Image.Image]:
    image = Image.open(path).convert("RGBA")
    return [
        image.crop((index * FRAME_SIZE, 0, (index + 1) * FRAME_SIZE, FRAME_SIZE))
        for index in range(frame_count)
    ]


def source_frames(path: Path, frame_count: int) -> list[Image.Image]:
    image = Image.open(path).convert("RGBA")
    columns, rows = body_layout(image, frame_count)
    return split_grid(image, columns, rows)


def transparent_idle_guide(frame: Image.Image) -> Image.Image:
    rgba = np.asarray(frame.convert("RGBA")).copy()
    visible = rgba[:, :, 3] > 0
    rgba[:, :, :3] = np.array([170, 84, 255], dtype=np.uint8)
    rgba[:, :, 3] = np.where(visible, 58, 0).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def create_category_sheets(fighter: str, output: Path, public_root: Path) -> None:
    public_dir = public_root / fighter
    idle_frames = public_frames(public_dir / "idle.png", 4)
    idle_guide = transparent_idle_guide(idle_frames[0])
    categories = dict(CATEGORIES)
    categories["especiais"] = SPECIALS[fighter]
    background = (14, 18, 28, 255)
    guide_color = (104, 220, 255, 150)

    for category, names in categories.items():
        tile_width = 4 * FRAME_SIZE
        label_width = 164
        row_height = FRAME_SIZE
        sheet = Image.new(
            "RGBA",
            (label_width + tile_width, max(1, len(names)) * row_height),
            background,
        )
        draw = ImageDraw.Draw(sheet)
        for row, name in enumerate(names):
            count = 8 if name in {"grabbed-front", "grabbed-lifted"} else 4
            frames = public_frames(public_dir / f"{name}.png", count)
            draw.text((8, row * row_height + 8), name, fill=(238, 242, 249, 255))
            draw.text(
                (8, row * row_height + 24),
                "violeta=idle | ciano=head/shoulder/hip/feet",
                fill=(154, 166, 186, 255),
            )
            for index in range(min(4, len(frames))):
                x = label_width + index * FRAME_SIZE
                y = row * row_height
                frame = frames[index].copy()
                if name not in {"knockdown", "thrown", "knockout", "grabbed-front", "grabbed-lifted"}:
                    frame.alpha_composite(idle_guide)
                canvas = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), background)
                canvas.alpha_composite(frame)
                guide_y = [70, 104, 164, 249]
                for line_y in guide_y:
                    ImageDraw.Draw(canvas).line((0, line_y, FRAME_SIZE - 1, line_y), fill=guide_color)
                sheet.alpha_composite(canvas, (x, y))
        sheet.save(output / f"{fighter}-{category}.png", optimize=True)


def audit(public_root: Path) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for fighter in FIGHTERS:
        keyed_dir = ROOT / "tmp" / "imagegen" / fighter / "keyed"
        source_dir = ROOT / "tmp" / "imagegen" / fighter / "sources"
        public_dir = public_root / fighter
        names = (*BODY_NAMES, *SPECIALS[fighter])

        idle_source = source_frames(keyed_dir / "idle.png", 4)
        idle_measurements = [measure_cell(frame) for frame in idle_source]
        idle_area = float(np.median([entry["opaque"] for entry in idle_measurements]))
        idle_height = float(np.median([entry["height"] for entry in idle_measurements]))

        for name in names:
            frame_count = 8 if name in {"grabbed-front", "grabbed-lifted"} else 4
            keyed = source_frames(keyed_dir / f"{name}.png", frame_count)
            final = public_frames(public_dir / f"{name}.png", frame_count)
            source_size = Image.open(source_dir / f"{name}.png").size
            keyed_size = Image.open(keyed_dir / f"{name}.png").size
            for index, (source_cell, final_cell) in enumerate(zip(keyed, final, strict=True)):
                source_metrics = measure_cell(source_cell)
                final_metrics = measure_cell(final_cell)
                area_proxy = (
                    (float(source_metrics["opaque"]) / idle_area) ** 0.5
                    if source_metrics["opaque"] and idle_area > 0
                    else 0.0
                )
                height_proxy = (
                    float(source_metrics["height"]) / idle_height
                    if source_metrics["height"] and idle_height > 0
                    else 0.0
                )
                rows.append(
                    {
                        "fighter": fighter,
                        "file": f"{name}.png",
                        "frame": index,
                        "source_size": list(source_size),
                        "keyed_size": list(keyed_size),
                        "source_cell_size": list(source_cell.size),
                        "source": source_metrics,
                        "final": final_metrics,
                        "anatomical_scale_area_proxy": round(area_proxy, 4),
                        "height_ratio_to_idle_source": round(height_proxy, 4),
                    }
                )
    return rows


def write_outputs(rows: list[dict[str, object]], output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    (output / "auditoria-raster.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    fieldnames = (
        "fighter",
        "file",
        "frame",
        "source_bbox",
        "source_width",
        "source_height",
        "source_opaque",
        "source_margins",
        "source_components",
        "source_significant_components",
        "removed_components_old_pipeline",
        "removed_pixels_old_pipeline",
        "source_edge_contacts",
        "source_straight_cut_suspects",
        "final_bbox",
        "final_width",
        "final_height",
        "final_opaque",
        "final_margins",
        "final_edge_contacts",
        "final_straight_cut_suspects",
        "anatomical_scale_area_proxy",
        "height_ratio_to_idle_source",
    )
    with (output / "auditoria-raster.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            source = row["source"]
            final = row["final"]
            writer.writerow(
                {
                    "fighter": row["fighter"],
                    "file": row["file"],
                    "frame": row["frame"],
                    "source_bbox": source["bbox"],
                    "source_width": source["width"],
                    "source_height": source["height"],
                    "source_opaque": source["opaque"],
                    "source_margins": source["margins"],
                    "source_components": source["components"],
                    "source_significant_components": source["significant_components"],
                    "removed_components_old_pipeline": source["removed_components_old_pipeline"],
                    "removed_pixels_old_pipeline": source["removed_pixels_old_pipeline"],
                    "source_edge_contacts": source["edge_contacts"],
                    "source_straight_cut_suspects": source["straight_cut_suspects"],
                    "final_bbox": final["bbox"],
                    "final_width": final["width"],
                    "final_height": final["height"],
                    "final_opaque": final["opaque"],
                    "final_margins": final["margins"],
                    "final_edge_contacts": final["edge_contacts"],
                    "final_straight_cut_suspects": final["straight_cut_suspects"],
                    "anatomical_scale_area_proxy": row["anatomical_scale_area_proxy"],
                    "height_ratio_to_idle_source": row["height_ratio_to_idle_source"],
                }
            )

    lines = [
        "# Auditoria raster inicial — Léo Violeta e Noir Reflexo",
        "",
        "A tabela completa está em `auditoria-raster.csv` e o detalhe estruturado",
        "em `auditoria-raster.json`. O proxy de escala por área é apenas um",
        "sinalizador; poses agachadas/aéreas exigem comparação visual anatômica.",
        "",
        "| lutador | folha | frame | bbox fonte | px fonte | componentes | removidos pelo pipeline antigo | borda fonte | bbox final | px final | borda final | proxy área |",
        "| --- | --- | ---: | --- | ---: | ---: | --- | --- | --- | ---: | --- | ---: |",
    ]
    for row in rows:
        source = row["source"]
        final = row["final"]
        lines.append(
            "| {fighter} | {file} | {frame} | {source_bbox} | {source_opaque} | "
            "{components} | {removed_components}/{removed_pixels}px | {source_edges} | "
            "{final_bbox} | {final_opaque} | {final_edges} | {proxy:.3f} |".format(
                fighter=row["fighter"],
                file=row["file"],
                frame=row["frame"],
                source_bbox=source["bbox"],
                source_opaque=source["opaque"],
                components=source["components"],
                removed_components=source["removed_components_old_pipeline"],
                removed_pixels=source["removed_pixels_old_pipeline"],
                source_edges=",".join(source["edge_contacts"]) or "—",
                final_bbox=final["bbox"],
                final_opaque=final["opaque"],
                final_edges=",".join(final["edge_contacts"]) or "—",
                proxy=row["anatomical_scale_area_proxy"],
            )
        )
    (output / "auditoria-raster.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--public-root",
        type=Path,
        default=ROOT / "public" / "assets" / "fighters",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=(
            ROOT
            / "tmp"
            / "imagegen"
            / "leo-violeta-noir-reflexo"
            / "correcao-escala-recortes"
        ),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    public_root = args.public_root.resolve()
    output = args.output.resolve()
    rows = audit(public_root)
    write_outputs(rows, output)
    for fighter in FIGHTERS:
        create_category_sheets(fighter, output, public_root)
    print(f"{len(rows)} células auditadas em {output}")


if __name__ == "__main__":
    main()
