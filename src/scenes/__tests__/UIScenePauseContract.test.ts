import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CombatWorld } from '../../combat/CombatWorld';
import { gutoBarba } from '../../fighters/gutoBarba';
import { rafaMare } from '../../fighters/rafaMare';
import { keyboardActionsForPlayer } from '../../input/InputManager';

const source = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('contrato da pausa', () => {
  it('mostra instruções de navegação e não apresenta II como tecla de retomada', () => {
    const ui = source('src/scenes/UIScene.ts');
    expect(ui).toContain('A/D OU SETAS ESCOLHE  ENTER CONFIRMA  ESC CONTINUA');
    expect(ui).toContain('TOQUE EM UMA OPCAO  OU USE > PARA CONTINUAR');
    expect(ui).not.toContain('II PARA CONTINUAR');
  });

  it('mantém Esc e o botão superior ligados à alternância de pausa', () => {
    const ui = source('src/scenes/UIScene.ts');
    const fight = source('src/scenes/FightScene.ts');
    expect(keyboardActionsForPlayer(0, 'Escape')).toEqual(['pause', 'cancel']);
    expect(ui).toContain("this.game.events.emit('fight:pause')");
    expect(ui).toContain("paused ? '>' : 'II'");
    expect(fight).toContain("this.game.events.on('fight:pause', this.togglePause, this)");
    expect(fight).toContain("this.game.events.on('fight:pause-action', this.handlePauseAction, this)");
    expect(fight).toContain("this.game.events.off('fight:pause-action', this.handlePauseAction, this)");

    const world = new CombatWorld(rafaMare, gutoBarba, 'versus');
    expect(world.togglePause()).toBe(true);
    expect(world.togglePause()).toBe(false);
  });

  it('oferece continuar, seleção e menu sem retornar à StartScene', () => {
    const ui = source('src/scenes/UIScene.ts');
    const fight = source('src/scenes/FightScene.ts');
    expect(ui).toContain("this.game.events.emit('fight:pause-action', action)");
    expect(fight).toContain("this.scene.stop('UIScene')");
    expect(fight).toContain('this.scene.start(target)');
    expect(fight).not.toContain("this.scene.start('StartScene')");
  });
});
