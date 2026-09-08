import { describe, expect, it } from 'vitest';
import { KitchenAmbience, KITCHEN_LAYOUT } from '../kitchenAmbience';

const advance = (ambience: KitchenAmbience, milliseconds: number) => {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 100) ambience.update(100);
};

describe('ambiente da Cozinha Macabra', () => {
  it('inicia em silêncio e faz morcegos emergirem da churrasqueira', () => {
    const ambience = new KitchenAmbience(() => 0.5);
    advance(ambience, 800);
    expect(ambience.batWaves).toBe(0);
    expect(ambience.ratSpawns).toBe(0);
    advance(ambience, 1000);
    expect(ambience.batWaves).toBe(1);
    const emerging = ambience.bats.filter(bat => bat.active);
    expect(emerging.length).toBeGreaterThanOrEqual(2);
    expect(emerging.every(bat => bat.startX === KITCHEN_LAYOUT.grill.x)).toBe(true);
    expect(emerging.every(bat => Math.abs(bat.y - KITCHEN_LAYOUT.grill.y) < 8)).toBe(true);
    expect(ambience.ratSpawns).toBeGreaterThan(0);
  });

  it('recicla os mesmos objetos e mantém limites durante uma sessão longa', () => {
    let seed = 91;
    const ambience = new KitchenAmbience(() => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    });
    const bats = [...ambience.bats];
    const rats = [...ambience.rats];
    for (let step = 0; step < 6000; step++) {
      ambience.update(100);
      expect(ambience.bats.length).toBe(KITCHEN_LAYOUT.maxBats);
      expect(ambience.rats.length).toBe(KITCHEN_LAYOUT.maxRats);
      for (const bat of ambience.bats.filter(actor => actor.active)) {
        expect(bat.x).toBeGreaterThanOrEqual(-28);
        expect(bat.x).toBeLessThanOrEqual(668);
        expect(bat.y).toBeGreaterThanOrEqual(85);
        expect(bat.y).toBeLessThan(155);
      }
      for (const rat of ambience.rats.filter(actor => actor.active)) {
        expect(KITCHEN_LAYOUT.ratLanes).toContain(rat.y);
        expect(Number.isInteger(rat.x)).toBe(true);
      }
    }
    expect(ambience.bats.every((bat, index) => bat === bats[index])).toBe(true);
    expect(ambience.rats.every((rat, index) => rat === rats[index])).toBe(true);
    expect(ambience.batWaves).toBeGreaterThan(30);
    expect(ambience.ratSpawns).toBeGreaterThan(50);
  });

  it('deixa intervalos vazios entre revoadas e permite ratos nos dois sentidos', () => {
    const right = new KitchenAmbience(() => 0.25);
    const left = new KitchenAmbience(() => 0.99);
    advance(right, 1000);
    advance(left, 1000);
    expect(right.rats[0]!.endX).toBeGreaterThan(right.rats[0]!.startX);
    expect(left.rats[0]!.endX).toBeLessThan(left.rats[0]!.startX);
    advance(left, 9000);
    expect(left.batWaves).toBe(1);
    expect(left.bats.every(bat => !bat.active)).toBe(true);
  });

  it('não acumula eventos após suspensão nem aceita tempos inválidos', () => {
    const ambience = new KitchenAmbience();
    for (const delta of [-20, 0, NaN, Infinity]) ambience.update(delta);
    expect(ambience.elapsed).toBe(0);
    ambience.update(60000);
    expect(ambience.elapsed).toBe(100);
    expect(ambience.batWaves).toBe(0);
    expect(ambience.ratSpawns).toBe(0);
  });
});
