import { describe, expect, it } from 'vitest';
import { SitioAmbience } from '../sitioAmbience';

function advance(scene: SitioAmbience, seconds: number) {
  for (let i = 0; i < seconds * 50; i++) scene.update(20);
}
describe('vida do Sítio', () => {
  it('garante as quatro espécies e faz todas caminharem', () => {
    const scene = new SitioAmbience(() => 0.5);
    expect(new Set(scene.animals.map(a => a.species))).toEqual(new Set(['hen', 'duck', 'snake', 'lizard']));
    const initial = scene.animals.map(a => a.x);
    advance(scene, 1);
    expect(scene.animals.every((a, i) => a.x !== initial[i])).toBe(true);
  });
  it('mostra a postura e o ovo antes do consumo pelos dois répteis', () => {
    const scene = new SitioAmbience(() => 0.5);
    advance(scene, 2.6);
    expect(scene.animals[0]?.action).toBe('lay');
    expect(scene.eggsLaid).toBe(1);
    expect(scene.eggs.some(egg => egg.active)).toBe(true);
    expect(scene.eggsEaten).toEqual({ snake: 0, lizard: 0 });
    advance(scene, 14);
    expect(scene.eggsEaten.snake).toBeGreaterThan(0);
    expect(scene.eggsEaten.lizard).toBeGreaterThan(0);
    expect(scene.eggsLaid).toBeGreaterThanOrEqual(scene.eggsEaten.snake + scene.eggsEaten.lizard);
  });
  it('encena uma disputa real e os animais retomam o movimento', () => {
    const scene = new SitioAmbience(() => 0.5);
    for (let i = 0; i < 2500 && scene.fights === 0; i++) scene.update(20);
    expect(scene.fights).toBe(1);
    const [snake, lizard] = scene.animals.slice(4);
    expect(snake!.action).toBe('fight');
    expect(lizard!.action).toBe('fight');
    expect(snake!.direction).toBe(1);
    expect(lizard!.direction).toBe(-1);
    expect(Math.abs(snake!.x - lizard!.x)).toBeLessThan(32);
    advance(scene, 3);
    expect(scene.animals.slice(4).every(a => a.action === 'walk')).toBe(true);
  });
  it('limita animais e ovos e mantém os comportamentos durante dez minutos', () => {
    const scene = new SitioAmbience(() => 0.5);
    const actors = [...scene.animals], eggs = [...scene.eggs];
    advance(scene, 600);
    expect(scene.animals).toHaveLength(6);
    expect(scene.eggs).toHaveLength(6);
    expect(scene.animals.every((a, i) => a === actors[i] && Number.isFinite(a.x) && a.x > -32 && a.x < 672)).toBe(true);
    expect(scene.eggs.every((e, i) => e === eggs[i])).toBe(true);
    expect(scene.eggsEaten.snake).toBeGreaterThan(3);
    expect(scene.eggsEaten.lizard).toBeGreaterThan(3);
    expect(scene.fights).toBeGreaterThan(3);
  });
  it('ignora deltas inválidos e limita o salto ao retomar uma aba', () => {
    const scene = new SitioAmbience();
    for (const delta of [NaN, Infinity, -1, 0]) scene.update(delta);
    expect(scene.elapsed).toBe(0);
    scene.update(600000);
    expect(scene.elapsed).toBe(100);
    expect(scene.eggsLaid).toBe(0);
  });
});
