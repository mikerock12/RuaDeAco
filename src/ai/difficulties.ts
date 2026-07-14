import type { Difficulty } from '../types/game';

export interface CpuDifficultyConfig {
  readonly reactionFrames: number;
  readonly decisionFrames: number;
  readonly guardChance: number;
  readonly specialChance: number;
  readonly jumpChance: number;
  readonly mistakeChance: number;
}

export const CPU_DIFFICULTIES: Readonly<Record<Difficulty, CpuDifficultyConfig>> = {
  easy: {
    reactionFrames: 18,
    decisionFrames: 12,
    guardChance: 0.2,
    specialChance: 0.08,
    jumpChance: 0.08,
    mistakeChance: 0.15,
  },
  normal: {
    reactionFrames: 10,
    decisionFrames: 7,
    guardChance: 0.45,
    specialChance: 0.16,
    jumpChance: 0.11,
    mistakeChance: 0.06,
  },
  hard: {
    reactionFrames: 6,
    decisionFrames: 4,
    guardChance: 0.65,
    specialChance: 0.25,
    jumpChance: 0.14,
    mistakeChance: 0.02,
  },
};
