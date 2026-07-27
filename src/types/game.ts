import type { FighterId } from './combat';

export type GameMode = 'cpu' | 'versus' | 'training' | 'online';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type TouchControlsPreference = 'auto' | 'on' | 'off';

export interface GameSettings {
  masterVolume: number;
  musicVolume: number;
  effectsVolume: number;
  muted: boolean;
  difficulty: Difficulty;
  touchControls: TouchControlsPreference;
  touchOpacity: number;
  preferFullscreen: boolean;
  wins: number;
  losses: number;
}

export interface ArenaDefinition {
  readonly id: 'cais-da-cidade';
  readonly name: string;
  readonly subtitle: string;
}

export interface MatchSelection {
  mode: GameMode;
  playerOne: FighterId;
  playerTwo: FighterId;
  arena: ArenaDefinition['id'];
}

export interface MatchResult {
  winner: FighterId;
  loser: FighterId;
  playerWon: boolean;
  rounds: readonly [number, number];
}

export interface OnlineMatchResult {
  readonly kind: 'completed' | 'interrupted';
  readonly message: string;
}
