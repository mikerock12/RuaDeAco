import Phaser from 'phaser';
import { audioManager, type AudioDebugState } from '../audio/AudioManager';
import { gameSession } from '../config/session';
import { settingsStore } from '../config/settings';
import { controlsStore } from '../input/controlsStore';
import { gamepadManager } from '../input/GamepadManager';
import { inputManager } from '../input/InputManager';
import { touchControls } from '../input/TouchControls';
import { registerServiceWorker } from '../pwa/registerServiceWorker';
import { gamepadToast } from '../ui/gamepadToast';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#050711');

    settingsStore.load();
    controlsStore.load();
    inputManager.attach();
    gamepadManager.attach();
    gamepadToast.attach();
    // Uma leitura da Gamepad API por frame, antes do update das cenas.
    this.game.events.on(Phaser.Core.Events.PRE_STEP, gamepadManager.poll);
    audioManager.attachLifecycle();
    if (import.meta.env.DEV) {
      const debugGlobal = globalThis as typeof globalThis & {
        __RUA_AUDIO_DEBUG__?: () => AudioDebugState;
        __RUA_SCENE_DEBUG__?: () => readonly string[];
        __RUA_SESSION_DEBUG__?: () => { mode: typeof gameSession.selection.mode; hasResult: boolean };
      };
      debugGlobal.__RUA_AUDIO_DEBUG__ = () => audioManager.getDebugState();
      debugGlobal.__RUA_SCENE_DEBUG__ = () => this.scene.manager
        .getScenes(true)
        .map((scene) => scene.scene.key);
      debugGlobal.__RUA_SESSION_DEBUG__ = () => ({
        mode: gameSession.selection.mode,
        hasResult: gameSession.result !== null,
      });
      (debugGlobal as typeof debugGlobal & {
        __RUA_GAMEPAD_DEBUG__?: () => unknown;
      }).__RUA_GAMEPAD_DEBUG__ = () => ({
        connected: gamepadManager.connectedPads(),
        assigned: [gamepadManager.assignedPad(0), gamepadManager.assignedPad(1)],
      });
    }
    // O fluxo de instalação PWA foi removido do menu; o service worker
    // continua ativo para manter a compatibilidade web offline.
    void registerServiceWorker();
    touchControls.build();
    globalThis.document?.addEventListener('fullscreenchange', this.syncFullscreenPreference);

    this.game.events.once('destroy', () => {
      this.game.events.off(Phaser.Core.Events.PRE_STEP, gamepadManager.poll);
      gamepadToast.detach();
      gamepadManager.detach();
      inputManager.detach();
      touchControls.destroy();
      void audioManager.destroy();
      if (import.meta.env.DEV) {
        const debugGlobal = globalThis as typeof globalThis & {
          __RUA_AUDIO_DEBUG__?: () => AudioDebugState;
          __RUA_SCENE_DEBUG__?: () => readonly string[];
          __RUA_SESSION_DEBUG__?: () => unknown;
        };
        delete debugGlobal.__RUA_AUDIO_DEBUG__;
        delete debugGlobal.__RUA_SCENE_DEBUG__;
        delete debugGlobal.__RUA_SESSION_DEBUG__;
      }
      globalThis.document?.removeEventListener('fullscreenchange', this.syncFullscreenPreference);
    });

    this.scene.start('PreloadScene');
  }

  private syncFullscreenPreference = (): void => {
    settingsStore.update({ preferFullscreen: Boolean(globalThis.document?.fullscreenElement) });
  };
}
