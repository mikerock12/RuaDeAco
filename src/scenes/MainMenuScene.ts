import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { audioManager } from '../audio/AudioManager';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, PALETTE } from '../config/pixelArtConfig';
import { gameSession } from '../config/session';
import { settingsStore } from '../config/settings';
import { FIGHTERS } from '../fighters';
import { inputManager } from '../input/InputManager';
import { installPromptManager } from '../pwa/installPrompt';
import type { InputAction, InputFrame } from '../types/combat';
import type { GameMode } from '../types/game';
import { createConceptPortrait } from '../ui/PortraitView';
import { toggleFullscreen } from '../utils/fullscreen';
import { pixelText } from '../utils/text';

type MenuAction = GameMode | 'settings' | 'install' | 'fullscreen';

interface MenuEntry {
  readonly action: MenuAction;
  readonly label: string;
}

interface MenuRow {
  readonly background: Phaser.GameObjects.Rectangle;
  readonly marker: Phaser.GameObjects.BitmapText;
  readonly label: Phaser.GameObjects.BitmapText;
}

const MENU_WIDTH = 178;

function pressedIn(frames: readonly InputFrame[], action: InputAction): boolean {
  return frames.some((frame) => frame.pressed.has(action));
}

export class MainMenuScene extends Phaser.Scene {
  private entries: readonly MenuEntry[] = [];
  private rows: MenuRow[] = [];
  private selectedIndex = 0;
  private installAvailable = false;
  private installUnsubscribe: (() => void) | null = null;
  private transitionLocked = false;

  constructor() {
    super('MainMenuScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PALETTE.ink);
    this.rows = [];
    this.selectedIndex = 0;
    this.transitionLocked = false;
    inputManager.clear();

    this.drawBackdrop();
    this.drawLogo();
    this.drawRosterGallery();

    this.installAvailable = installPromptManager.available;
    this.rebuildMenu();
    this.installUnsubscribe = installPromptManager.subscribe((available) => {
      if (available === this.installAvailable) return;
      this.installAvailable = available;
      this.rebuildMenu();
    });

    const settings = settingsStore.get();
    pixelText(this, 3, INTERNAL_HEIGHT - 4, `V ${settings.wins}  D ${settings.losses}`, {
      size: 8,
      color: '#8796ae',
    });
    pixelText(this, INTERNAL_WIDTH - 3, INTERNAL_HEIGHT - 4, 'W/S  ENTER/F', {
      size: 8,
      color: '#9af7ff',
      align: 'right',
    });

    this.events.once('shutdown', () => {
      this.installUnsubscribe?.();
      this.installUnsubscribe = null;
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
    this.add.image(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.far.key);
    this.add.image(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.mid.key);
    this.add.sprite(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.water.key, 1);
    this.add.image(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.foreground.key);
    this.add.rectangle(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, INTERNAL_WIDTH, INTERNAL_HEIGHT, PALETTE.ink, 0.5);
    const scanlines = this.add.graphics();
    scanlines.fillStyle(PALETTE.black, 0.24);
    for (let y = 1; y < INTERNAL_HEIGHT; y += 3) scanlines.fillRect(0, y, INTERNAL_WIDTH, 1);
  }

  private drawLogo(): void {
    const logoKey = ASSET_MANIFEST.logo.key;
    if (this.textures.exists(logoKey)) {
      this.add.image(INTERNAL_WIDTH / 2, 23, logoKey)
        .setDisplaySize(66, 50)
        .setOrigin(0.5);
    } else {
      pixelText(this, INTERNAL_WIDTH / 2, 20, 'LOGO AUSENTE', {
        size: 8,
        color: '#f64070',
        align: 'center',
      });
    }

    pixelText(this, INTERNAL_WIDTH / 2, 50, 'A CIDADE LUTA DE VOLTA', {
      size: 8,
      color: '#ffd55c',
      align: 'center',
    });
    this.add.rectangle(INTERNAL_WIDTH / 2, 56, 112, 1, PALETTE.cyan, 1);
  }

  private drawRosterGallery(): void {
    FIGHTERS.forEach((fighter, index) => {
      const isLeft = index < 3;
      const slot = index % 3;
      const x = isLeft ? 19 : INTERNAL_WIDTH - 19;
      const y = 70 + slot * 36;
      const concept = ASSET_MANIFEST.concepts[fighter.id];

      if (this.textures.exists(concept.key)) {
        createConceptPortrait(this, x, y, fighter.id, 34, 30, {
          crop: 'framed',
          locked: !fighter.available,
          frameColor: fighter.available ? fighter.visual.accent : PALETTE.muted,
        });
      } else {
        this.add.rectangle(x, y, 34, 30, PALETTE.panel, 1)
          .setStrokeStyle(1, PALETTE.pink);
        pixelText(this, x, y, 'SEM\nIMAGEM', {
          size: 8,
          color: '#f64070',
          align: 'center',
        });
      }

      pixelText(this, x, y + 18, fighter.name.split(' ')[0] ?? fighter.name, {
        size: 8,
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
    ];
    if (this.installAvailable) entries.push({ action: 'install', label: 'INSTALAR JOGO' });
    entries.push({ action: 'fullscreen', label: 'TELA CHEIA' });
    this.entries = entries;
    this.selectedIndex = Phaser.Math.Clamp(this.selectedIndex, 0, entries.length - 1);

    const spacing = entries.length > 5 ? 15 : 17;
    const startY = entries.length > 5 ? 63 : 64;
    entries.forEach((entry, index) => {
      const y = startY + index * spacing;
      const background = this.add.rectangle(INTERNAL_WIDTH / 2, y, MENU_WIDTH, 13, PALETTE.panel, 1)
        .setStrokeStyle(1, PALETTE.metalLight)
        .setInteractive({ useHandCursor: true });
      const marker = pixelText(this, 82, y, '>', {
        size: 8,
        color: '#ffd55c',
        align: 'center',
      });
      const label = pixelText(this, INTERNAL_WIDTH / 2, y, entry.label, {
        size: 8,
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
        .setStrokeStyle(1, selected ? PALETTE.cyan : PALETTE.metalLight);
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
    if (entry.action === 'install') {
      void this.installGame();
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

  private async installGame(): Promise<void> {
    this.transitionLocked = true;
    audioManager.unlock();
    audioManager.play('confirm');
    try {
      await installPromptManager.prompt();
    } finally {
      this.transitionLocked = false;
    }
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
