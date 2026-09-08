import type Phaser from 'phaser';
import type { ArenaDefinition } from '../types/game';
import { CaisStageView } from './CaisStageView';
import { KitchenStageView } from './KitchenStageView';

export interface StageView {
  update(delta: number): void;
  snapshot?(): unknown;
}

export function createStageView(scene: Phaser.Scene, arena: ArenaDefinition['id']): StageView {
  return arena === 'cozinha-macabra' ? new KitchenStageView(scene) : new CaisStageView(scene);
}
