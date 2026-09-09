import type Phaser from 'phaser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CombatFeedback } from '../CombatFeedback';
import { CombatWorld } from '../../combat/CombatWorld';
import { getFighterDefinition } from '../../fighters';
import { audioManager } from '../../audio/AudioManager';

vi.mock('../../audio/AudioManager', () => ({ audioManager: { play: vi.fn() } }));
function fixture(reducedMotion = false) {
  vi.stubGlobal('matchMedia', () => ({matches: reducedMotion}));
  const graphics = Object.fromEntries(['setDepth', 'setName', 'clear', 'lineStyle', 'strokeCircle', 'lineBetween', 'fillStyle', 'fillRect'].map(name => [name, vi.fn().mockReturnThis()]));
  const rectangle = Object.fromEntries(['setDepth', 'setName', 'setFillStyle'].map(name => [name, vi.fn().mockReturnThis()]));
  const scene = { add: { graphics: vi.fn(() => graphics), rectangle: vi.fn(() => rectangle) }, time: {now: 500}, cameras: {main: {shake: vi.fn()}} };
  const world = new CombatWorld(getFighterDefinition('rafa-mare'), getFighterDefinition('rafa-mare'), 'training');
  return { scene, world, graphics, rectangle, feedback: new CombatFeedback(scene as unknown as Phaser.Scene) };
}
describe('CombatFeedback', () => {
  beforeEach(() => {vi.clearAllMocks(); vi.unstubAllGlobals();});
  it('reuses a bounded pool without changing combat state, including mirror matches', () => {
    const {scene, world, feedback, graphics} = fixture();
    const before = world.exportDeterministicState();
    for (let i = 0; i < 100; i++) {
      feedback.event({type: i % 2 ? 'hit' : 'blocked', frame: i, attacker: world.fighters[0].id, defender: world.fighters[1].id, attackerIndex: 0, defenderIndex: 1}, world.fighters);
      feedback.update(16, world.fighters, false);
    }
    expect(world.exportDeterministicState()).toEqual(before);
    expect(scene.add.graphics).toHaveBeenCalledTimes(1);
    expect(scene.add.rectangle).toHaveBeenCalledTimes(1);
    expect(graphics.strokeCircle).toHaveBeenCalled();
    expect(graphics.lineBetween).toHaveBeenCalled();
    expect(audioManager.play).toHaveBeenCalledWith('hit');
    expect(audioManager.play).toHaveBeenCalledWith('block');
  });
  it('respects reduced motion and holds visual lifetime during pause', () => {
    const {scene, world, feedback, rectangle, graphics} = fixture(true);
    feedback.event({type: 'knockout', frame: 1}, world.fighters);
    feedback.update(16, world.fighters, true);
    expect(scene.cameras.main.shake).not.toHaveBeenCalled();
    expect(rectangle.setFillStyle).not.toHaveBeenCalled();
    expect(graphics.clear).not.toHaveBeenCalled();
  });
});
