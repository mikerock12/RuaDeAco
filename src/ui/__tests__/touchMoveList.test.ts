import { describe, expect, it } from 'vitest';
import { FIGHTERS } from '../../fighters';
import { buildTouchMovePages, touchMoveCommand } from '../touchMoveList';
import { toPixelFontText } from '../../utils/textLayout';

describe('guia touch', () => {
  it.each(FIGHTERS)('mantém golpes e custos de $name em páginas curtas', (fighter) => {
    const pages = buildTouchMovePages(fighter);
    expect(pages).toHaveLength(4);
    expect(pages.every((page) => page.lines.length <= 6)).toBe(true);
    const lines = pages.flatMap((page) => page.lines);
    for (const move of Object.values(fighter.moves).filter((move) => !move.air)) {
      expect(lines.some((line) => line.includes(toPixelFontText(move.label).toUpperCase()))).toBe(true);
      expect(lines.some((line) => line.includes(touchMoveCommand(move)))).toBe(true);
      if (move.meterCost) expect(lines.some((line) => line.includes(move.meterCost + ' ENERGIA'))).toBe(true);
    }
  });

  it('distingue sequência de direções de botões simultâneos', () => {
    const fighter = FIGHTERS.find((fighter) => fighter.id === 'astro-riso')!;
    const move = Object.values(fighter.moves).find((move) => move.command.directions?.length === 3)!;
    expect(touchMoveCommand(move).split(' > ')).toHaveLength(3);
    expect(touchMoveCommand(move)).toMatch(/ \+ S$/u);
  });
});
