import { describe, expect, it } from 'vitest';
import { astroRiso } from '../../fighters/astroRiso';
import { gutoBarba } from '../../fighters/gutoBarba';
import { rafaMare } from '../../fighters/rafaMare';
import type { FighterDefinition } from '../../types/combat';
import { buildPauseMoveList } from '../moveListPresenter';

const texts = (fighter: FighterDefinition, player: 0 | 1) =>
  buildPauseMoveList(fighter, player).lines.map(({ text }) => text);

describe('lista de comandos da pausa', () => {
  it('organiza Guto P1 por grupos, teclas reais e sem duplicar trajetórias aéreas', () => {
    const lines = texts(gutoBarba, 0);
    expect(lines).toContain('S+F CHUTE FRONTAL');
    expect(lines).toContain('S+G RASTEIRA DO URSO');
    expect(lines).toContain('FRENTE+G CHUTE PESADO');
    expect(lines).toContain('F SOCO AEREO');
    expect(lines).toContain('G CHUTE AEREO');
    expect(lines.filter((line) => line.includes('SOCO AEREO'))).toHaveLength(1);
    expect(lines.filter((line) => line.includes('CHUTE AEREO'))).toHaveLength(1);
    expect(lines).toContain('H MURALHA NORTE');
    expect(lines).toContain('FRENTE+H GANCHO DO URSO');
    expect(lines).toContain('S+H ABRACO GLACIAL [100 ENERGIA]');
    expect(lines.indexOf('MOVIMENTO E DEFESA')).toBeLessThan(lines.indexOf('ATAQUES NO CHAO'));
    expect(lines.indexOf('ATAQUES NO CHAO')).toBeLessThan(lines.indexOf('ATAQUES NO AR'));
    expect(lines.indexOf('ATAQUES NO AR')).toBeLessThan(lines.indexOf('ESPECIAIS'));
  });

  it('traduz Rafa P2 e seus custos de energia', () => {
    const lines = texts(rafaMare, 1);
    expect(lines).toContain('L MAO DA MARE');
    expect(lines).toContain('FRENTE+L CHUTE DA RESSACA [100 ENERGIA]');
    expect(lines).toContain('BAIXO+L ECO TATUADO [50 ENERGIA]');
    expect(lines).toContain('BAIXO+J CHUTE BAIXO');
    expect(lines).toContain('BAIXO+K RASTEIRA');
  });

  it('adapta as teclas quando Guto ocupa o P2 e mantém o painel compacto', () => {
    const lines = texts(gutoBarba, 1);
    expect(lines).toContain('BAIXO+J CHUTE FRONTAL');
    expect(lines).toContain('BAIXO+K RASTEIRA DO URSO');
    expect(lines).toContain('L MURALHA NORTE');
    expect(lines).toContain('FRENTE+L GANCHO DO URSO');
    expect(lines).toContain('BAIXO+L ABRACO GLACIAL [100 ENERGIA]');
    expect(lines.length).toBeLessThanOrEqual(19);
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(46);
  });

  it('mostra as três sequências do Astro em ordem legível e dentro do painel', () => {
    const p1 = texts(astroRiso, 0);
    expect(p1).toContain('FRENTE+S+S-FRENTE+H SORRISO RELAMPAGO');
    expect(p1).toContain('S+S-FRENTE+FRENTE+H RAJADA NEON');
    expect(p1).toContain('S+S-TRAS+TRAS+H ASTRO GIRO [100 ENERGIA]');
    expect(p1.indexOf('FRENTE+S+S-FRENTE+H SORRISO RELAMPAGO'))
      .toBeLessThan(p1.indexOf('S+S-FRENTE+FRENTE+H RAJADA NEON'));
    expect(p1.length).toBeLessThanOrEqual(19);
    expect(Math.max(...p1.map((line) => line.length))).toBeLessThanOrEqual(46);

    const p2 = texts(astroRiso, 1);
    expect(p2).toContain('FRENTE+BAIXO+BAIXO-FRENTE+L SORRISO RELAMPAGO');
    expect(p2).toContain('BAIXO+BAIXO-FRENTE+FRENTE+L RAJADA NEON');
    expect(p2).toContain('BAIXO+BAIXO-TRAS+TRAS+L ASTRO GIRO [100 ENERGIA]');
  });
});
