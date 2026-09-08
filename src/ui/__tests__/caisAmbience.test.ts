import { describe, expect, it } from 'vitest';
import { CaisAmbience, CAIS_EVENTS, type CaisEvent } from '../caisAmbience';
import { CAIS_STAGE_LAYOUT } from '../stagePresentation';
const advance = (model: CaisAmbience, ms: number) => { for (let t = 0; t < ms; t += 100) model.update(Math.min(100, ms - t), 180, 465); };
function event(kind: CaisEvent): CaisAmbience {
  const model = new CaisAmbience(() => 0.25);
  for (let t = 0; t < 600000 && model.event !== kind; t += 100) model.update(100, 180, 465);
  expect(model.event).toBe(kind); return model;
}

describe('direção lenta dos eventos do Cais', () => {
  it('distribui todos os eventos, mantém pausas e nunca mistura encontros independentes', () => {
    let seed = 73;
    const model = new CaisAmbience(() => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296));
    const actors = [...model.actors]; let endedAt = -1, previous: CaisEvent | null = null, last: CaisEvent | null = null;
    for (let t = 0; t < 1200000; t += 100) {
      model.update(100);
      if (model.event && !previous) {
        if (endedAt >= 0) expect(model.elapsed - endedAt).toBeGreaterThanOrEqual(18000);
        expect(model.event).not.toBe(last); last = model.event;
      }
      if (!model.event && previous) endedAt = model.elapsed;
      if (!model.event) expect(model.actors.every(actor => !actor.visible)).toBe(true);
      if (model.ufo.visible || model.witch.visible) expect(model.monster.visible || model.ship.visible).toBe(false);
      expect(model.ufo.visible && model.witch.visible).toBe(false);
      previous = model.event;
    }
    for (const kind of CAIS_EVENTS) expect(model.counts[kind]).toBeGreaterThan(2);
    model.actors.forEach((actor, i) => expect(actor).toBe(actors[i]));
  });
  it('faz o disco distante cruzar a área da lua e o próximo disco se aproximar do lutador', () => {
    const far = event('ufo-pass'); let crossesMoon = false;
    for (let t = 0; t < 20000; t += 100) {
      if (Math.hypot(far.ufo.x - CAIS_STAGE_LAYOUT.moon.x, far.ufo.y - CAIS_STAGE_LAYOUT.moon.y) < 18) crossesMoon = true;
      far.update(100);
    }
    expect(crossesMoon).toBe(true);
    const close = event('ufo-close'); advance(close, 9000);
    expect(close.phase).toBe('abduction-hover'); expect(close.ufo.scale).toBe(1);
    expect(Math.min(Math.abs(close.ufo.x - 180), Math.abs(close.ufo.x - 465))).toBeLessThan(1);
    expect(close.beamStrength).toBe(1); advance(close, 8500);
    expect(close.phase).toBe('ascending'); expect(close.ufo.y).toBeLessThan(40);
  });
  it('faz o monstro emergir, respirar fogo e desaparecer sob a água', () => {
    const model = event('monster'); advance(model, 11000);
    expect(model.monsterReveal).toBe(1); expect(model.fireStrength).toBe(1); expect(model.monster.frame).toBe(2);
    expect(model.ship.visible).toBe(false); advance(model, 9000);
    expect(model.phase).toBe('submerging'); expect(model.monsterReveal).toBeLessThan(0.5);
    advance(model, 2200); expect(model.event).toBeNull(); expect(model.monster.visible).toBe(false);
  });
  it('coordena três tiros visíveis contra um monstro emerso e só então recolhe os dois', () => {
    const model = event('pirate-battle'); const shots = model.shots; let impact = false, flame = false;
    for (let t = 0; t < 42000; t += 100) {
      model.update(100); flame ||= model.fireStrength > 0;
      if (model.cannonball.visible) { expect(model.ship.visible).toBe(true); expect(model.monsterReveal).toBe(1); }
      if (model.impactStrength > 0) { impact = true; expect(model.monster.frame).toBe(3); }
    }
    expect(model.shots - shots).toBe(3); expect(impact && flame).toBe(true);
    expect(model.event).toBeNull(); expect(model.actors.every(actor => !actor.visible)).toBe(true);
  });
  it('a bruxa percorre o céu perto da lua e deltas inválidos não disparam uma sequência inteira', () => {
    const model = event('witch'); advance(model, 10000);
    expect(Math.abs(model.witch.y - CAIS_STAGE_LAYOUT.moon.y)).toBeLessThan(45);
    const before = model.elapsed;
    model.update(NaN); model.update(-10); expect(model.elapsed).toBe(before);
    model.update(90000); expect(model.elapsed - before).toBe(100);
    expect(model.event).toBe('witch');
  });
});
