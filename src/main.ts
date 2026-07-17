import Phaser from 'phaser';
import { setupCapacitorApp } from './capacitor';
import './styles.css';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from './config/pixelArtConfig';
import { BootScene } from './scenes/BootScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { FightScene } from './scenes/FightScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { PreloadScene } from './scenes/PreloadScene';
import { ResultScene } from './scenes/ResultScene';
import { SettingsScene } from './scenes/SettingsScene';
import { StartScene } from './scenes/StartScene';
import { UIScene } from './scenes/UIScene';
import { createViewportRefreshScheduler } from './utils/viewportLayout';

const gameShell = document.getElementById('game-shell');
if (!gameShell) throw new Error('Área do jogo não encontrada.');

for (const eventName of ['contextmenu', 'dblclick', 'dragstart', 'selectstart'] as const) {
  gameShell.addEventListener(eventName, (event) => event.preventDefault());
}
gameShell.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: INTERNAL_WIDTH,
  height: INTERNAL_HEIGHT,
  backgroundColor: '#000000',
  transparent: false,
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  autoFocus: true,
  banner: false,
  fps: {
    target: 60,
    smoothStep: false,
  },
  input: {
    activePointers: 10,
    smoothFactor: 0,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    // Dimensões CSS fracionárias preservam 16:9 em telas cuja altura não
    // produz um múltiplo inteiro de 640x360. O mundo continua arredondado.
    autoRound: false,
    resizeInterval: 100,
    width: INTERNAL_WIDTH,
    height: INTERNAL_HEIGHT,
  },
  scene: [
    BootScene,
    PreloadScene,
    StartScene,
    MainMenuScene,
    CharacterSelectScene,
    FightScene,
    UIScene,
    ResultScene,
    SettingsScene,
  ],
};

const game = new Phaser.Game(config);

const viewportRefresh = createViewportRefreshScheduler(
  () => {
    if (game.isBooted) game.scale.refresh();
  },
  {
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (handle) => window.cancelAnimationFrame(handle),
    setDelay: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearDelay: (handle) => window.clearTimeout(handle),
  },
);

const scheduleViewportRefresh = (): void => viewportRefresh.schedule();
const visualViewport = window.visualViewport;
const screenOrientation = window.screen.orientation;

window.addEventListener('resize', scheduleViewportRefresh, { passive: true });
window.addEventListener('orientationchange', scheduleViewportRefresh, { passive: true });
visualViewport?.addEventListener('resize', scheduleViewportRefresh, { passive: true });
screenOrientation?.addEventListener('change', scheduleViewportRefresh);
document.addEventListener('fullscreenchange', scheduleViewportRefresh);

game.events.once(Phaser.Core.Events.DESTROY, () => {
  window.removeEventListener('resize', scheduleViewportRefresh);
  window.removeEventListener('orientationchange', scheduleViewportRefresh);
  visualViewport?.removeEventListener('resize', scheduleViewportRefresh);
  screenOrientation?.removeEventListener('change', scheduleViewportRefresh);
  document.removeEventListener('fullscreenchange', scheduleViewportRefresh);
  viewportRefresh.dispose();
});

game.events.once(Phaser.Core.Events.READY, scheduleViewportRefresh);
setupCapacitorApp(game);
