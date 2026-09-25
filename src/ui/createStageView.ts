import type Phaser from 'phaser';
import type { ArenaDefinition } from '../types/game';
import { CaisStageView } from './CaisStageView';
import { SitioStageView } from './SitioStageView';
import { KitchenStageView } from './KitchenStageView';

/** Quem executa a finalização: a coreografia do cenário nasce à frente dele. */
export interface FinisherContext {
  readonly originX: number;
  readonly facing: 1 | -1;
}

export interface StageView {
  update(delta: number, playerOneX?: number, playerTwoX?: number): void;
  snapshot?(): unknown;
  setFinisherFrame?(frame: number | null, context?: FinisherContext): void;
}

export function createStageView(scene: Phaser.Scene, arena: ArenaDefinition['id']): StageView {
  if (arena === 'sitio') return new SitioStageView(scene);
  return arena === 'cozinha-macabra' ? new KitchenStageView(scene) : new CaisStageView(scene);
}
