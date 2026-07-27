import { describe, expect, it } from 'vitest';
import { astroRiso } from '../../fighters/astroRiso';
import { danteSinal } from '../../fighters/danteSinal';
import { gutoBarba } from '../../fighters/gutoBarba';
import { rafaMare } from '../../fighters/rafaMare';
import { defaultControls } from '../../input/controlsStore';
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

describe('rótulos dinâmicos por dispositivo e binding', () => {
  it('cobre os quatro lutadores disponíveis em teclado, touch e gamepad', () => {
    const fighters = [rafaMare, astroRiso, gutoBarba, danteSinal];
    const devices = ['keyboard', 'touch', 'gamepad'] as const;
    for (const fighter of fighters) {
      for (const device of devices) {
        const lines = buildPauseMoveList(fighter, 0, device, {
          gamepadFamily: 'xbox',
        }).lines.map(({ text }) => text);
        const deviceLabel = device === 'keyboard'
          ? 'TECLADO'
          : device === 'touch' ? 'TOUCH' : 'CONTROLE';
        expect(lines[0], `${fighter.id}/${device}`).toContain(`(${deviceLabel})`);
        expect(lines).toContain('ESPECIAIS');
        for (const move of Object.values(fighter.moves).filter((candidate) => (
          candidate?.command.buttons.includes('special')
        ))) {
          const label = move!.label.normalize('NFD').replace(/[̀-ͯ]/gu, '').toUpperCase();
          expect(lines.some((line) => line.includes(label)), `${fighter.id}/${device}/${label}`)
            .toBe(true);
        }
      }
    }
  });

  it('reflete um teclado remapeado na lista de comandos', () => {
    const config = defaultControls();
    const remapped = {
      ...config,
      keyboard: [
        { bindings: { ...config.keyboard[0].bindings, special: 'KeyT', down: 'KeyC' } },
        config.keyboard[1],
      ] as const,
    };
    const lines = buildPauseMoveList(gutoBarba, 0, 'keyboard', { config: remapped })
      .lines.map(({ text }) => text);
    expect(lines).toContain('FRENTE+T GANCHO DO URSO');
    expect(lines).toContain('C+T ABRACO GLACIAL [100 ENERGIA]');
    expect(lines.some((line) => line.includes('+H '))).toBe(false);
  });

  it('apresenta comandos touch com os glifos A/B/S e identifica o dispositivo', () => {
    const lines = buildPauseMoveList(astroRiso, 0, 'touch').lines.map(({ text }) => text);
    expect(lines[0]).toContain('(TOUCH)');
    expect(lines).toContain('A FRACO | B FORTE | S ESPECIAL | ESCUDO DEFESA');
    expect(lines.some((line) => line.includes('+S ') && line.includes('SORRISO'))).toBe(true);
  });

  it('usa rótulos da família do gamepad detectado', () => {
    const linesXbox = buildPauseMoveList(gutoBarba, 0, 'gamepad', { gamepadFamily: 'xbox' })
      .lines.map(({ text }) => text);
    expect(linesXbox[0]).toContain('(CONTROLE)');
    expect(linesXbox).toContain('FRENTE+X GANCHO DO URSO');

    const linesGeneric = buildPauseMoveList(gutoBarba, 0, 'gamepad', { gamepadFamily: 'generic' })
      .lines.map(({ text }) => text);
    expect(linesGeneric).toContain('FRENTE+B2 GANCHO DO URSO');
  });

  it('reflete um gamepad remapeado', () => {
    const config = defaultControls();
    const remapped = {
      ...config,
      gamepad: [
        { bindings: { ...config.gamepad[0].bindings, special: 5 }, pause: 9 },
        config.gamepad[1],
      ] as const,
    };
    const lines = buildPauseMoveList(gutoBarba, 0, 'gamepad', {
      config: remapped,
      gamepadFamily: 'playstation',
    }).lines.map(({ text }) => text);
    expect(lines).toContain('FRENTE+R1 GANCHO DO URSO');
  });
});
