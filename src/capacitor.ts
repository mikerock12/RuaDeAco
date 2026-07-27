import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type Phaser from 'phaser';

export function setupCapacitorApp(game: Phaser.Game) {
  if (!Capacitor.isNativePlatform()) return;

  App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
      game.events.emit('online:background');
      // Pause game
      if (game.loop) {
        game.loop.sleep();
      }
      game.sound.pauseAll();
    } else {
      // Keep game paused for user to resume manually, or just resume
      // For now we resume core loop but maybe keep scene paused if implemented.
      if (game.loop) {
        game.loop.wake();
      }
    }
  });

  App.addListener('backButton', () => {
    // If we are in FightScene, open pause menu.
    const fightScene = game.scene.getScene('FightScene');
    if (fightScene && game.scene.isActive('FightScene')) {
      // Attempt to pause via UIScene or FightScene logic
      const uiScene = game.scene.getScene('UIScene') as any;
      if (uiScene && typeof uiScene.togglePause === 'function') {
        uiScene.togglePause();
      }
    } else {
      const mainMenu = game.scene.getScene('MainMenuScene');
      if (mainMenu && game.scene.isActive('MainMenuScene')) {
        // Exit app?
        App.exitApp();
      } else {
        // Go back to main menu
        for (const scene of game.scene.getScenes(true)) {
          scene.scene.stop();
        }
        game.scene.start('MainMenuScene');
      }
    }
  });
}
