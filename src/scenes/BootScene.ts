import Phaser from 'phaser';
import { audioManager } from '../audio/AudioManager';
import { settingsStore } from '../config/settings';
import { inputManager } from '../input/InputManager';
import { touchControls } from '../input/TouchControls';
import { installPromptManager } from '../pwa/installPrompt';
import { registerServiceWorker } from '../pwa/registerServiceWorker';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#050711');

    settingsStore.load();
    inputManager.attach();
    audioManager.attachUnlock();
    installPromptManager.attach();
    void registerServiceWorker();
    touchControls.build();
    globalThis.document?.addEventListener('fullscreenchange', this.syncFullscreenPreference);

    this.game.events.once('destroy', () => {
      inputManager.detach();
      touchControls.destroy();
      globalThis.document?.removeEventListener('fullscreenchange', this.syncFullscreenPreference);
    });

    this.scene.start('PreloadScene');
  }

  private syncFullscreenPreference = (): void => {
    settingsStore.update({ preferFullscreen: Boolean(globalThis.document?.fullscreenElement) });
  };
}
