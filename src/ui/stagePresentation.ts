import { VISUAL_GROUND_Y } from '../config/pixelArtConfig';

export const CAIS_STAGE_LAYOUT = {
  skyBottomY: 144,
  moon: { x: 430, y: 96, radius: 22 },
  waterHorizonY: 230,
  boat: { x: 540, y: 226, driftX: 10, bobY: 1 },
  dockSurfaceY: VISUAL_GROUND_Y - 30,
  dockContactY: VISUAL_GROUND_Y,
  dockFrontY: VISUAL_GROUND_Y + 20,
} as const;

export const CAIS_STAGE_DEPTHS = {
  sky: -40,
  stars: -39,
  moonGlow: -38,
  moon: -37,
  skyline: -30,
  nearStructures: -24,
  boat: -21,
  water: -20,
  reflection: -19,
  foreground: -10,
  dock: -8,
} as const;

export const CAIS_SKY_STARS: readonly (readonly [x: number, y: number, size: number])[] = [
  [42, 76, 1], [76, 62, 2], [118, 104, 1], [158, 70, 1],
  [202, 92, 2], [246, 58, 1], [286, 114, 1], [326, 74, 2],
  [370, 98, 1], [414, 62, 1], [452, 126, 1], [538, 66, 2],
  [578, 106, 1], [616, 82, 1],
] as const;

export interface SkylineBuilding {
  readonly x: number;
  readonly width: number;
  readonly top: number;
  readonly color: number;
}

export const CAIS_SKYLINE_BUILDINGS: readonly SkylineBuilding[] = [
  { x: 0, width: 54, top: 166, color: 0x10243a },
  { x: 48, width: 48, top: 150, color: 0x142b43 },
  { x: 90, width: 70, top: 174, color: 0x0c1c30 },
  { x: 150, width: 54, top: 158, color: 0x132940 },
  { x: 198, width: 76, top: 182, color: 0x0b1b2d },
  { x: 266, width: 50, top: 146, color: 0x152c45 },
  { x: 308, width: 72, top: 170, color: 0x0d2034 },
  { x: 372, width: 58, top: 154, color: 0x13283e },
  { x: 422, width: 74, top: 180, color: 0x0a192a },
  { x: 488, width: 52, top: 150, color: 0x142b43 },
  { x: 532, width: 64, top: 172, color: 0x0d2034 },
  { x: 588, width: 52, top: 156, color: 0x12273d },
] as const;

export const MOON_PIXEL_ROWS: readonly (readonly [offsetY: number, offsetX: number, width: number])[] = [
  [-20, -8, 16],
  [-18, -14, 28],
  [-16, -17, 34],
  [-14, -19, 38],
  [-12, -20, 40],
  [-10, -21, 42],
  [-8, -22, 44],
  [-6, -22, 44],
  [-4, -22, 44],
  [-2, -22, 44],
  [0, -22, 44],
  [2, -22, 44],
  [4, -22, 44],
  [6, -22, 44],
  [8, -21, 42],
  [10, -20, 40],
  [12, -19, 38],
  [14, -17, 34],
  [16, -14, 28],
  [18, -8, 16],
] as const;

export interface BoatPose {
  readonly x: number;
  readonly y: number;
  readonly lightAlpha: number;
}

export function resolveBoatPose(elapsedMs: number): BoatPose {
  const elapsed = Math.max(0, elapsedMs);
  const { boat } = CAIS_STAGE_LAYOUT;
  return {
    x: boat.x + Math.round(Math.sin(elapsed / 7_000) * boat.driftX),
    y: boat.y + Math.floor(elapsed / 650) % (boat.bobY + 1),
    lightAlpha: 0.55 + (Math.floor(elapsed / 420) % 2) * 0.35,
  };
}
