import { CAIS_DA_CIDADE } from './gameConfig';
import type { MatchResult, MatchSelection } from '../types/game';

class GameSession {
  selection: MatchSelection = {
    mode: 'cpu',
    playerOne: 'rafa-mare',
    playerTwo: 'guto-barba',
    arena: CAIS_DA_CIDADE.id,
  };

  result: MatchResult | null = null;

  setSelection(patch: Partial<MatchSelection>): void {
    this.selection = { ...this.selection, ...patch };
  }
}

export const gameSession = new GameSession();
