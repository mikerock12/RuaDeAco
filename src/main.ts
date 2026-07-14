import Phaser from 'phaser';
import './styles.css';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from './config/pixelArtConfig';
import { BootScene } from './scenes/BootScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { FightScene } from './scenes/FightScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { PreloadScene } from './scenes/PreloadScene';
import { ResultScene } from './scenes/ResultScene';
import { SettingsScene } from './scenes/SettingsScene';
import { UIScene } from './scenes/UIScene';

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
    autoRound: true,
    width: INTERNAL_WIDTH,
    height: INTERNAL_HEIGHT,
  },
  scene: [
    BootScene,
    PreloadScene,
    MainMenuScene,
    CharacterSelectScene,
    FightScene,
    UIScene,
    ResultScene,
    SettingsScene,
  ],
};

new Phaser.Game(config);
