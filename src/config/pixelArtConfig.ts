import type { LocalRect } from '../types/combat';

export const INTERNAL_WIDTH = 640;
export const INTERNAL_HEIGHT = 360;
// A apresentação principal é 1280x720 (escala inteira exata de 2x via Scale.FIT).
export const PRESENTATION_WIDTH = 1280;
export const PRESENTATION_HEIGHT = 720;
// Mundo de combate e tela compartilham o mesmo espaço 640x360.
export const WORLD_TO_SCREEN = 1;
export const DEFAULT_SPRITE_SIZE = 256;
export const PORTRAIT_SIZE = 96;
export const VISUAL_GROUND_Y = 304;
// Assets rasterizados em 320x180 (palco, HUD, efeitos) são exibidos em 2x inteiro.
export const RASTER_ASSET_SCALE = 2;

export const PALETTE = {
  black: 0x02040a,
  ink: 0x050814,
  navy: 0x09152a,
  panel: 0x0d1728,
  panelLight: 0x172944,
  steelDark: 0x26364c,
  steel: 0x526b82,
  steelLight: 0x9db6c6,
  metalDark: 0x26364c,
  metalLight: 0x9db6c6,
  silver: 0xc9d7d8,
  cyan: 0x20c8e5,
  cyanLight: 0x9af7ff,
  blue: 0x157aa3,
  pink: 0xd44771,
  gold: 0xe8b84a,
  ivory: 0xf3e7bd,
  cream: 0xf3e7bd,
  muted: 0x71869a,
  danger: 0xd94350,
} as const;

export const PIXEL_ART_CONFIG = {
  internalWidth: INTERNAL_WIDTH,
  internalHeight: INTERNAL_HEIGHT,
  worldScale: WORLD_TO_SCREEN,
  defaultSpriteSize: DEFAULT_SPRITE_SIZE,
  portraitSize: PORTRAIT_SIZE,
  debug: import.meta.env.DEV,
  camera: {
    roundPixels: true,
    backgroundColor: PALETTE.black,
    integerZoomPreferred: true,
  },
  rounding: {
    position: 'round',
    rectStart: 'floor',
    rectEnd: 'ceil',
  },
} as const;

export function roundPixel(value: number): number {
  return Math.round(value);
}

export function worldToScreen(value: number): number {
  return roundPixel(value * WORLD_TO_SCREEN);
}

export function worldRectToScreen(rect: LocalRect): LocalRect {
  const left = Math.floor(rect.x * WORLD_TO_SCREEN);
  const top = Math.floor(rect.y * WORLD_TO_SCREEN);
  const right = Math.ceil((rect.x + rect.width) * WORLD_TO_SCREEN);
  const bottom = Math.ceil((rect.y + rect.height) * WORLD_TO_SCREEN);
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}
