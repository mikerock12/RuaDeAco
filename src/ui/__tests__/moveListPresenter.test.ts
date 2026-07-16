import { describe, expect, it } from 'vitest';
import { gutoBarba } from '../../fighters/gutoBarba';
import { rafaMare } from '../../fighters/rafaMare';
import { buildPauseMoveList } from '../moveListPresenter';

const texts = (fighter: typeof gutoBarba | typeof rafaMare, player: 0 | 1) =>
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
});
