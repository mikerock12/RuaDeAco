import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('fluxo da StartScene', () => {
  it('aparece somente depois do preload e encaminha para o menu principal', () => {
    const preload = source('src/scenes/PreloadScene.ts');
    const start = source('src/scenes/StartScene.ts');

    expect(preload).toContain("this.scene.start('StartScene')");
    expect(start).toContain('unlockAudio: audioManager.unlock');
    expect(start).not.toContain('await audioManager.unlock()');
    expect(start).toContain("this.scene.start('MainMenuScene')");
  });

  it('escuta Phaser, canvas e fallback DOM sem bloquear a navegação pelo áudio', () => {
    const start = source('src/scenes/StartScene.ts');
    const transition = source('src/scenes/startTransition.ts');

    expect(start).toContain('this.add.zone(');
    expect(start).toContain('this.input.on(Phaser.Input.Events.POINTER_DOWN');
    expect(start).toContain('[globalThis.window, canvas]');
    expect(transition).toContain('this.dependencies.unlockAudio()');
    expect(transition).toContain('this.dependencies.openMainMenu()');
  });

  it('pré-carrega sem solicitar reprodução antes da interação', () => {
    const start = source('src/scenes/StartScene.ts');
    const menu = source('src/scenes/MainMenuScene.ts');

    expect(start).toContain('audioManager.preloadMusic');
    expect(start).not.toContain('audioManager.playMusic');
    expect(menu).toContain('audioManager.playMusic');
  });

  it('retornos internos continuam indo diretamente ao menu', () => {
    const result = source('src/scenes/ResultScene.ts');
    const settings = source('src/scenes/SettingsScene.ts');
    const characterSelect = source('src/scenes/CharacterSelectScene.ts');

    expect(result).toContain("this.goTo('MainMenuScene')");
    expect(settings).toContain("this.scene.start('MainMenuScene')");
    expect(characterSelect).toContain("this.scene.start('MainMenuScene')");
    expect(result).not.toContain("this.scene.start('StartScene')");
    expect(settings).not.toContain("this.scene.start('StartScene')");
    expect(characterSelect).not.toContain("this.scene.start('StartScene')");
  });
});
