import { describe, expect, it } from 'vitest';
import { PauseMenuModel } from '../pauseMenu';

describe('modelo do menu de pausa', () => {
  it('começa em continuar e navega circularmente', () => {
    const menu = new PauseMenuModel();
    expect(menu.selected).toBe('continue');
    expect(menu.move(-1)).toBe('main-menu');
    expect(menu.move(1)).toBe('continue');
    expect(menu.move(1)).toBe('character-select');
    expect(menu.move(1)).toBe('main-menu');
    expect(menu.move(1)).toBe('continue');
  });

  it('gera os comandos corretos para continuar, seleção e menu', () => {
    const menu = new PauseMenuModel();
    expect(menu.activate()).toEqual({ type: 'continue' });
    expect(menu.activate('character-select')).toEqual({
      type: 'navigate',
      target: 'CharacterSelectScene',
    });

    menu.reset();
    expect(menu.activate('main-menu')).toEqual({
      type: 'navigate',
      target: 'MainMenuScene',
    });
  });

  it('bloqueia navegações duplicadas e volta ao estado inicial no reset', () => {
    const menu = new PauseMenuModel();
    expect(menu.activate('main-menu')).not.toBeNull();
    expect(menu.activate('character-select')).toBeNull();
    expect(menu.move(1)).toBe('main-menu');

    menu.reset();
    expect(menu.selected).toBe('continue');
    expect(menu.activate('character-select')).not.toBeNull();
  });
});
