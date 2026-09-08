import type Phaser from 'phaser';
import type { ArenaDefinition } from '../types/game';
import { CaisStageView } from './CaisStageView';
import { SitioStageView } from './SitioStageView';
import { KitchenStageView } from './KitchenStageView';

export interface StageView {
  update(delta: number, playerOneX?: number, playerTwoX?: number): void;
  snapshot?(): unknown;
}

export function createStageView(scene: Phaser.Scene, arena: ArenaDefinition['id']): StageView {
  if (arena === 'sitio') return new SitioStageView(scene);
  return arena === 'cozinha-macabra' ? new KitchenStageView(scene) : new CaisStageView(scene);
}
