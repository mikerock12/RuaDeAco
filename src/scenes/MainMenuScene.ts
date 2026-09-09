import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { audioManager } from '../audio/AudioManager';
import { MUSIC_TRACK_BY_SCENE } from '../audio/musicCatalog';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, PALETTE } from '../config/pixelArtConfig';
import { gameSession } from '../config/session';
import { settingsStore } from '../config/settings';
import { FIGHTERS } from '../fighters';
import { keyLabel } from '../input/controlLabels';
import { controlsStore } from '../input/controlsStore';
import { InputManager, inputManager } from '../input/InputManager';
import type { InputAction, InputFrame } from '../types/combat';
import type { GameMode } from '../types/game';
import { createConceptPortrait } from '../ui/PortraitView';
import { drawRemasterBackdrop, focusPanel, panelCorners, UI_THEME, uiIcon, type UiIcon } from '../ui/remasterTheme';
import { toggleFullscreen } from '../utils/fullscreen';
import { pixelText, tagLayoutPanel } from '../utils/text';

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

const MENU_WIDTH = 248;

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
    pixelText(this, 8, INTERNAL_HEIGHT - 16, `V ${settings.wins}  D ${settings.losses}`, {
      size: 8,
      maxWidth: 180,
      maxHeight: 20,
      color: '#8796ae',
      layoutName: 'main-record',
    });
    const playerOneKeys = controlsStore.get().keyboard[0].bindings;
    pixelText(
      this,
      INTERNAL_WIDTH - 8,
      INTERNAL_HEIGHT - 16,
      InputManager.shouldShowTouch(settings) ? 'TOQUE EM UMA OPCAO' : `${keyLabel(playerOneKeys.up)}/${keyLabel(playerOneKeys.down)}  ENTER/${keyLabel(playerOneKeys.light)}`,
      {
        size: 8,
        minSize: 8,
        maxWidth: 380,
        maxHeight: 20,
        color: '#9af7ff',
        align: 'right',
        layoutName: 'main-input-hint',
      },
    );

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
    drawRemasterBackdrop(this, 0.1);
    panelCorners(this, 320, 208, 260, 198);
    this.add.rectangle(320, 322, 170, 1, UI_THEME.cyan, 0.4);
    pixelText(this, 320, 334, 'A NOITE APENAS COMECA', { size: 8, maxWidth: 260, align: 'center', color: UI_THEME.muted });
  }

  private drawLogo(): void {
    const logoKey = ASSET_MANIFEST.logo.key;
    if (this.textures.exists(logoKey)) {
      this.add.image(INTERNAL_WIDTH / 2, 58, logoKey)
        .setDisplaySize(148, 112)
        .setBlendMode(Phaser.BlendModes.SCREEN)
        .setOrigin(0.5);
    } else {
      pixelText(this, INTERNAL_WIDTH / 2, 40, 'LOGO AUSENTE', {
        size: 16,
        maxWidth: 200,
        maxHeight: 24,
        color: '#f64070',
        align: 'center',
        layoutName: 'main-logo-fallback',
      });
    }


  }

  private drawRosterGallery(): void {
    FIGHTERS.forEach((fighter, index) => {
      const isLeft = index < 3;
      const slot = index % 3;
      const x = isLeft ? 48 : INTERNAL_WIDTH - 48;
      const y = 140 + slot * 62;
      const concept = ASSET_MANIFEST.concepts[fighter.id];

      if (this.textures.exists(concept.key)) {
        createConceptPortrait(this, x, y, fighter.id, 48, 44, {
          crop: 'card',
          locked: !fighter.available,
          frameColor: fighter.available ? UI_THEME.cyan : PALETTE.muted,
        });
      } else {
        this.add.rectangle(x, y, 48, 44, PALETTE.panel, 1)
          .setStrokeStyle(2, PALETTE.pink);
        pixelText(this, x, y, 'SEM\nIMAGEM', {
          size: 16,
          minSize: 8,
          maxWidth: 56,
          maxHeight: 52,
          color: '#f64070',
          align: 'center',
        });
      }

      pixelText(this, x, y + 28, fighter.name.split(' ')[0] ?? fighter.name, {
        size: 16,
        minSize: 8,
        maxWidth: 70,
        maxHeight: 12,
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
      { action: 'online', label: 'JOGAR ONLINE' },
      { action: 'settings', label: 'CONFIGURACOES' },
      { action: 'fullscreen', label: 'TELA CHEIA' },
    ];
    this.entries = entries;
    this.selectedIndex = Phaser.Math.Clamp(this.selectedIndex, 0, entries.length - 1);

    const spacing = entries.length > 5 ? 30 : 34;
    const startY = entries.length > 5 ? 126 : 128;
    entries.forEach((entry, index) => {
      const y = startY + index * spacing;
      const panelName = `main-menu-row-${index}`;
      const background = tagLayoutPanel(
        this.add.rectangle(INTERNAL_WIDTH / 2, y, MENU_WIDTH, 26, UI_THEME.panel, 0.85)
          .setStrokeStyle(1, UI_THEME.border)
          .setInteractive({ useHandCursor: true }),
        panelName,
        { x: 10, y: 3 },
      );
      const marker = pixelText(this, 208, y, '>', {
        size: 16,
        color: '#ffd55c',
        align: 'center',
      });
      const label = pixelText(this, INTERNAL_WIDTH / 2 + 10, y, entry.label, {
        size: 16,
        minSize: 8,
        maxWidth: MENU_WIDTH - 62,
        maxHeight: 22,
        color: '#f7f2d0',
        align: 'center',
        layoutName: `main-menu-label-${index}`,
        panelName,
        padding: { x: 10, y: 3 },
      });

      const icons: readonly UiIcon[] = ['person', 'group', 'gamepad', 'online', 'gear', 'screen'];
      uiIcon(this, 234, y, icons[index]!, UI_THEME.cyan, 1);
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
      focusPanel(row.background, selected);
      row.marker.setVisible(selected);
      row.label.setTint(selected ? UI_THEME.text : UI_THEME.muted);
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
    if (entry.action === 'online') {
      this.transitionTo('OnlineScene');
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
