import { describe, expect, it } from 'vitest';
import { touchDpadActions } from '../touchDirection';

describe('direcional touch com oito setores', () => {
  it.each([
    [0, 0, []], [0.12, -0.1, []],
    [0.8, -0.25, ['right']], [-0.8, 0.25, ['left']],
    [0.2, -0.8, ['up']], [-0.2, 0.8, ['down']],
    [0.7, 0.7, ['right', 'down']], [-0.7, 0.7, ['left', 'down']],
    [0.7, -0.7, ['right', 'up']], [-0.7, -0.7, ['left', 'up']],
    [1.2, 0, ['right']], [1.6, 0, []], [0, -1.6, []],
    [NaN, 1, []], [Infinity, 0, []],
  ])('posição %s, %s produz somente %j', (x, y, expected) => {
    expect([...touchDpadActions(x as number, y as number)]).toEqual(expected);
  });

  it('permite rolar baixo, diagonal e frente sem salto acidental', () => {
    const motion = [[0, 0.8], [0.6, 0.6], [0.8, 0.25], [0.8, 0]];
    expect(motion.map(([x, y]) => [...touchDpadActions(x!, y!)]))
      .toEqual([['down'], ['right', 'down'], ['right'], ['right']]);
  });
});
