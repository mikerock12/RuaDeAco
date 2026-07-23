import type { Buffer } from 'node:buffer';

export declare const BODY_MIN_DISTINCT_OPAQUE_COLORS: number;
export declare const EFFECT_MIN_DISTINCT_OPAQUE_COLORS: number;
export declare const MIN_FRAME_PAIR_DIFF_PIXELS: number;
export declare const MIN_FRAME_PAIR_DIFF_RATIO: number;
export declare const BODY_MAX_BBOX_FILL_RATIO: number;
export declare const BODY_FILL_MIN_BBOX_AREA: number;

export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  readonly bitDepth?: number;
  readonly colorType?: number;
  readonly interlace?: number;
  readonly pixels: Buffer;
}

export interface SheetGeometry {
  readonly frames: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly layout: 'horizontal' | 'vertical';
}

export interface FrameRasterStats {
  readonly opaque: number;
  readonly distinctColors: number;
  readonly bboxArea: number;
  readonly bboxFillRatio: number;
}

export declare function decodePng(buffer: Buffer): DecodedImage;
export declare function frameBounds(
  sheet: Pick<SheetGeometry, 'frameWidth' | 'frameHeight' | 'layout'>,
  frameIndex: number,
): { startX: number; endX: number; startY: number; endY: number };
export declare function frameRasterStats(
  image: DecodedImage,
  frameIndex: number,
  sheet: SheetGeometry,
): FrameRasterStats;
export declare function framePairDiff(
  image: DecodedImage,
  frameA: number,
  frameB: number,
  sheet: SheetGeometry,
): number;
export declare function placeholderIssues(
  image: DecodedImage,
  sheet: SheetGeometry,
  rasterKind: 'body' | 'effect',
): string[];
