import { describe, expect, it } from 'vitest';
import { radialStickPosition, touchDpadActions } from '../touchDirection';

describe('direcional touch com oito setores', () => {
  it.each([
    [0, 0, []], [0.08, -0.06, []], [0.11, 0, []], [0.13, 0, ['right']],
    [0.8, -0.25, ['right']], [-0.8, 0.25, ['left']],
    [0.2, -0.8, ['up']], [-0.2, 0.8, ['down']],
    [0.7, 0.7, ['right', 'down']], [-0.7, 0.7, ['left', 'down']],
    [0.7, -0.7, ['right', 'up']], [-0.7, -0.7, ['left', 'up']],
    [1.2, 0, ['right']], [1.6, 0, ['right']], [0, -1.6, ['up']],
    [NaN, 1, []], [Infinity, 0, []],
  ])('posição %s, %s produz somente %j', (x, y, expected) => {
    expect([...touchDpadActions(x as number, y as number)]).toEqual(expected);
  });

  it('limita o knob ao círculo sem mudar seu ângulo', () => {
    expect(radialStickPosition(0.3, 0.4)).toEqual({ x: 0.3, y: 0.4 });
    const knob = radialStickPosition(3, 4);
    expect(knob.x).toBeCloseTo(0.6); expect(knob.y).toBeCloseTo(0.8);
    expect(Math.hypot(knob.x, knob.y)).toBeCloseTo(1);
    expect(radialStickPosition(Infinity, 0)).toEqual({ x: 0, y: 0 });
  });

  it('anda reto mesmo com o polegar torto, sem agachar nem pular', () => {
    // Até 30° para baixo e 38° para cima o lutador continua só andando; era em
    // 23° que o direcional antigo já somava a vertical e travava a caminhada.
    expect([...touchDpadActions(0.87, 0.48)]).toEqual(['right']);
    expect([...touchDpadActions(0.82, -0.57)]).toEqual(['right']);
    expect([...touchDpadActions(-0.87, 0.48)]).toEqual(['left']);
    // Passando dos limites a diagonal volta, para os quartos de círculo.
    expect([...touchDpadActions(0.77, 0.64)]).toEqual(['right', 'down']);
    expect([...touchDpadActions(0.71, -0.71)]).toEqual(['right', 'up']);
  });

  it('permite rolar baixo, diagonal e frente sem salto acidental', () => {
    const motion = [[0, 0.8], [0.6, 0.6], [0.8, 0.25], [0.8, 0]];
    expect(motion.map(([x, y]) => [...touchDpadActions(x!, y!)]))
      .toEqual([['down'], ['right', 'down'], ['right'], ['right']]);
  });
});
