import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { audioManager } from '../audio/AudioManager';
import { MUSIC_TRACK_BY_SCENE } from '../audio/musicCatalog';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, PALETTE } from '../config/pixelArtConfig';
import { gameSession } from '../config/session';
import { settingsStore } from '../config/settings';
import { FIGHTERS } from '../fighters';
import { inputManager } from '../input/InputManager';
import type { InputAction, InputFrame } from '../types/combat';
import type { GameMode } from '../types/game';
import { createConceptPortrait } from '../ui/PortraitView';
import { toggleFullscreen } from '../utils/fullscreen';
import { pixelText } from '../utils/text';

type MenuAction = GameMode | 'settings' | 'fullscreen';

interface MenuEntry {
  readonly action: MenuAction;
  readonly label: string;
}

interface MenuRow {
  readonly background: Phaser.GameObjects.Rectangle;
  readonly marker: Phaser.GameObjects.BitmapText;
  readonly label: Phaser.GameObjects.BitmapText;
}

const MENU_WIDTH = 356;
const STAGE_LAYER_SCALE = 2;

function pressedIn(frames: readonly InputFrame[], action: InputAction): boolean {
  return frames.some((frame) => frame.pressed.has(action));
}

export class MainMenuScene extends Phaser.Scene {
  private entries: readonly MenuEntry[] = [];
  private rows: MenuRow[] = [];
  private selectedIndex = 0;
  private transitionLocked = false;

  constructor() {
    super('MainMenuScene');
  }

  create(): void {
    void audioManager.playMusic(MUSIC_TRACK_BY_SCENE.MainMenuScene);
    this.cameras.main.setBackgroundColor(PALETTE.ink);
    this.rows = [];
    this.selectedIndex = 0;
    this.transitionLocked = false;
    inputManager.clear();

    this.drawBackdrop();
    this.drawLogo();
    this.drawRosterGallery();

    this.rebuildMenu();

    const settings = settingsStore.get();
    pixelText(this, 8, INTERNAL_HEIGHT - 12, `V ${settings.wins}  D ${settings.losses}`, {
      size: 16,
      color: '#8796ae',
    });
    pixelText(this, INTERNAL_WIDTH - 8, INTERNAL_HEIGHT - 12, 'W/S  ENTER/F', {
      size: 16,
      color: '#9af7ff',
      align: 'right',
    });

    this.events.once('shutdown', () => {
      this.rows = [];
    });
  }

  update(): void {
    if (this.transitionLocked || this.rows.length === 0) return;

    const frames = [inputManager.sample(0), inputManager.sample(1)];
    if (pressedIn(frames, 'up')) {
      this.moveSelection(-1);
    } else if (pressedIn(frames, 'down')) {
      this.moveSelection(1);
    } else if (pressedIn(frames, 'confirm') || pressedIn(frames, 'light')) {
      this.activateSelected();
    }
  }

  private drawBackdrop(): void {
    const { stage } = ASSET_MANIFEST;
    this.add.image(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.far.key).setScale(STAGE_LAYER_SCALE);
    this.add.image(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.mid.key).setScale(STAGE_LAYER_SCALE);
    this.add.sprite(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.water.key, 1).setScale(STAGE_LAYER_SCALE);
    this.add.image(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.foreground.key).setScale(STAGE_LAYER_SCALE);
    this.add.rectangle(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, INTERNAL_WIDTH, INTERNAL_HEIGHT, PALETTE.ink, 0.5);
    const scanlines = this.add.graphics();
    scanlines.fillStyle(PALETTE.black, 0.24);
    for (let y = 2; y < INTERNAL_HEIGHT; y += 6) scanlines.fillRect(0, y, INTERNAL_WIDTH, 2);
  }

  private drawLogo(): void {
    const logoKey = ASSET_MANIFEST.logo.key;
    if (this.textures.exists(logoKey)) {
      this.add.image(INTERNAL_WIDTH / 2, 46, logoKey)
        .setDisplaySize(132, 100)
        .setOrigin(0.5);
    } else {
      pixelText(this, INTERNAL_WIDTH / 2, 40, 'LOGO AUSENTE', {
        size: 16,
        color: '#f64070',
        align: 'center',
      });
    }

    pixelText(this, INTERNAL_WIDTH / 2, 100, 'A CIDADE LUTA DE VOLTA', {
      size: 16,
      color: '#ffd55c',
      align: 'center',
    });
    this.add.rectangle(INTERNAL_WIDTH / 2, 112, 224, 2, PALETTE.cyan, 1);
  }

  private drawRosterGallery(): void {
    FIGHTERS.forEach((fighter, index) => {
      const isLeft = index < 3;
      const slot = index % 3;
      const x = isLeft ? 38 : INTERNAL_WIDTH - 38;
      const y = 140 + slot * 72;
      const concept = ASSET_MANIFEST.concepts[fighter.id];

      if (this.textures.exists(concept.key)) {
        createConceptPortrait(this, x, y, fighter.id, 68, 60, {
          crop: 'framed',
          locked: !fighter.available,
          frameColor: fighter.available ? fighter.visual.accent : PALETTE.muted,
        });
      } else {
        this.add.rectangle(x, y, 68, 60, PALETTE.panel, 1)
          .setStrokeStyle(2, PALETTE.pink);
        pixelText(this, x, y, 'SEM\nIMAGEM', {
          size: 16,
          color: '#f64070',
          align: 'center',
        });
      }

      pixelText(this, x, y + 36, fighter.name.split(' ')[0] ?? fighter.name, {
        size: 16,
        color: fighter.available ? '#f7f2d0' : '#73829b',
        align: 'center',
      });
    });
  }

  private rebuildMenu(): void {
    for (const row of this.rows) {
      row.background.destroy();
      row.marker.destroy();
      row.label.destroy();
    }
    this.rows = [];

    const entries: MenuEntry[] = [
      { action: 'cpu', label: 'JOGAR CONTRA CPU' },
      { action: 'versus', label: 'DOIS JOGADORES' },
      { action: 'training', label: 'TREINAMENTO' },
      { action: 'settings', label: 'CONFIGURACOES' },
      { action: 'fullscreen', label: 'TELA CHEIA' },
    ];
    this.entries = entries;
    this.selectedIndex = Phaser.Math.Clamp(this.selectedIndex, 0, entries.length - 1);

    const spacing = entries.length > 5 ? 30 : 34;
    const startY = entries.length > 5 ? 126 : 128;
    entries.forEach((entry, index) => {
      const y = startY + index * spacing;
      const background = this.add.rectangle(INTERNAL_WIDTH / 2, y, MENU_WIDTH, 26, PALETTE.panel, 1)
        .setStrokeStyle(2, PALETTE.metalLight)
        .setInteractive({ useHandCursor: true });
      const marker = pixelText(this, 164, y, '>', {
        size: 16,
        color: '#ffd55c',
        align: 'center',
      });
      const label = pixelText(this, INTERNAL_WIDTH / 2, y, entry.label, {
        size: 16,
        color: '#f7f2d0',
        align: 'center',
      });

      background.on('pointerover', () => this.setSelected(index));
      background.on('pointerdown', () => {
        audioManager.unlock();
        this.setSelected(index);
        this.activateSelected();
      });
      this.rows.push({ background, marker, label });
    });

    this.refreshSelection();
  }

  private moveSelection(delta: number): void {
    const count = this.rows.length;
    this.selectedIndex = (this.selectedIndex + delta + count) % count;
    this.refreshSelection();
  }

  private setSelected(index: number): void {
    if (this.selectedIndex === index) return;
    this.selectedIndex = index;
    this.refreshSelection();
  }

  private refreshSelection(): void {
    this.rows.forEach((row, index) => {
      const selected = index === this.selectedIndex;
      row.background
        .setFillStyle(selected ? PALETTE.panelLight : PALETTE.panel, 1)
        .setStrokeStyle(2, selected ? PALETTE.cyan : PALETTE.metalLight);
      row.marker.setVisible(selected);
      row.label.setTint(selected ? PALETTE.ivory : PALETTE.muted);
    });
  }

  private activateSelected(): void {
    const entry = this.entries[this.selectedIndex];
    if (!entry || this.transitionLocked) return;

    if (entry.action === 'settings') {
      this.transitionTo('SettingsScene');
      return;
    }
    if (entry.action === 'fullscreen') {
      void this.switchFullscreen();
      return;
    }

    gameSession.setSelection({
      mode: entry.action,
      playerOne: 'rafa-mare',
      playerTwo: 'guto-barba',
    });
    this.transitionTo('CharacterSelectScene');
  }

  private transitionTo(sceneKey: string): void {
    this.transitionLocked = true;
    audioManager.unlock();
    audioManager.play('confirm');

    const shutter = this.add.rectangle(-INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, INTERNAL_WIDTH, INTERNAL_HEIGHT, PALETTE.ink, 1)
      .setDepth(500);
    this.tweens.add({
      targets: shutter,
      x: INTERNAL_WIDTH / 2,
      duration: 110,
      ease: 'Stepped',
      easeParams: [8],
      onComplete: () => this.scene.start(sceneKey),
    });
  }

  private async switchFullscreen(): Promise<void> {
    this.transitionLocked = true;
    audioManager.unlock();
    audioManager.play('confirm');
    try {
      const enabled = await toggleFullscreen();
      settingsStore.update({ preferFullscreen: enabled });
    } finally {
      this.transitionLocked = false;
    }
  }
}
