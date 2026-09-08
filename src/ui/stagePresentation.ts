import { VISUAL_GROUND_Y } from '../config/pixelArtConfig';

export const CAIS_STAGE_LAYOUT = {
  backgroundOffsetY: 13,
  skyBottomY: 144,
  moon: { x: 430, y: 96, radius: 28 },
  waterHorizonY: 197,
  dockSurfaceY: 267,
  dockContactY: VISUAL_GROUND_Y,
  dockFrontY: VISUAL_GROUND_Y + 20,
} as const;

export const CAIS_STAGE_DEPTHS = {
  background: -40,
  moonGlow: -38,
  distantUfo: -37.5,
  moon: -37,
  witch: -36,
  water: -28,
  reflection: -27,
  ship: -25,
  monster: -24,
  splash: -23,
  fire: -22,
  closeUfo: 12,
  beam: 13,
} as const;
