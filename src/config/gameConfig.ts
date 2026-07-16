import type { ArenaDefinition } from '../types/game';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from './pixelArtConfig';

export const LOGICAL_WIDTH = INTERNAL_WIDTH;
export const LOGICAL_HEIGHT = INTERNAL_HEIGHT;
export const COMBAT_WIDTH = 640;
export const COMBAT_HEIGHT = 360;
export const COMBAT_GROUND_Y = 304;
export const COMBAT_STAGE_LEFT = 36;
export const COMBAT_STAGE_RIGHT = 604;

// Compatibilidade: a simulação continua no espaço 640x360.
export const GROUND_Y = COMBAT_GROUND_Y;
export const STAGE_LEFT = COMBAT_STAGE_LEFT;
export const STAGE_RIGHT = COMBAT_STAGE_RIGHT;
export const FIXED_STEP_MS = 1000 / 60;
export const MAX_CATCH_UP_STEPS = 5;
export const ROUND_TIME_FRAMES = 99 * 60;
export const ROUNDS_TO_WIN = 2;
export const MAX_METER = 100;
export const LANDING_FRAMES = 6;
export const WAKE_UP_FRAMES = 22;

export const COLORS = {
  ink: 0x050711,
  panel: 0x0c1224,
  cyan: 0x29d9ff,
  cyanLight: 0x9af7ff,
  pink: 0xf64070,
  yellow: 0xffd55c,
  white: 0xf7f2d0,
  muted: 0x73829b,
  danger: 0xe43f5a,
} as const;

export const CAIS_DA_CIDADE: ArenaDefinition = {
  id: 'cais-da-cidade',
  name: 'CAIS DA CIDADE',
  subtitle: 'NOITE • ZONA PORTUÁRIA',
};
