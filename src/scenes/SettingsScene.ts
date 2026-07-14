import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { audioManager } from '../audio/AudioManager';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, PALETTE } from '../config/pixelArtConfig';
import { settingsStore } from '../config/settings';
import { inputManager } from '../input/InputManager';
import { touchControls } from '../input/TouchControls';
import type { InputAction, InputFrame } from '../types/combat';
import type { Difficulty, GameSettings, TouchControlsPreference } from '../types/game';
import { toggleFullscreen } from '../utils/fullscreen';
import { pixelText } from '../utils/text';

type SettingId =
  | 'masterVolume'
  | 'musicVolume'
  | 'effectsVolume'
  | 'muted'
  | 'difficulty'
  | 'touchControls'
  | 'touchOpacity'
  | 'preferFullscreen'
  | 'back';

interface SettingEntry {
  readonly id: SettingId;
  readonly label: string;
}

interface SettingRow {
  readonly background: Phaser.GameObjects.Rectangle;
  readonly marker: Phaser.GameObjects.BitmapText;
  readonly label: Phaser.GameObjects.BitmapText;
  readonly value: Phaser.GameObjects.BitmapText;
}

const SETTINGS_ENTRIES: readonly SettingEntry[] = [
  { id: 'masterVolume', label: 'VOLUME GERAL' },
  { id: 'musicVolume', label: 'MUSICA' },
  { id: 'effectsVolume', label: 'EFEITOS' },
  { id: 'muted', label: 'MUDO' },
  { id: 'difficulty', label: 'DIFICULDADE' },
  { id: 'touchControls', label: 'CONTROLES TOUCH' },
  { id: 'touchOpacity', label: 'TRANSPARENCIA TOUCH' },
  { id: 'preferFullscreen', label: 'TELA CHEIA' },
  { id: 'back', label: 'VOLTAR' },
];

function pressedIn(frames: readonly InputFrame[], action: InputAction): boolean {
  return frames.some((frame) => frame.pressed.has(action));
}

function clampStep(value: number, direction: number, step: number): number {
  const stepped = Math.round((value + direction * step) / step) * step;
  return Phaser.Math.Clamp(stepped, 0, 1);
}

export class SettingsScene extends Phaser.Scene {
  private rows: SettingRow[] = [];
  private selectedIndex = 0;
  private settings: GameSettings = settingsStore.get();
  private transitionLocked = false;
  private fullscreenPending = false;

  constructor() {
    super('SettingsScene');
  }

  create(): void {
    this.rows = [];
    this.selectedIndex = 0;
    this.transitionLocked = false;
    this.fullscreenPending = false;
    this.settings = settingsStore.get();
    inputManager.clear();

    this.drawBackdrop();
    pixelText(this, INTERNAL_WIDTH / 2, 14, 'CONFIGURACOES', { size: 16, align: 'center' })
      .setTint(PALETTE.ivory);
    this.add.rectangle(INTERNAL_WIDTH / 2, 25, 150, 2, PALETTE.gold);
    this.add.rectangle(INTERNAL_WIDTH / 2, 27, 190, 1, PALETTE.cyan);

    SETTINGS_ENTRIES.forEach((entry, index) => this.createRow(entry, index));
    this.refreshRows();

    pixelText(this, INTERNAL_WIDTH / 2, 173, 'W/S ITEM  A/D ALTERA  ESC VOLTA', {
      size: 8,
      align: 'center',
    }).setTint(PALETTE.cyanLight);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.rows = [];
    });
  }

  update(): void {
    if (this.transitionLocked) return;

    const frames = [inputManager.sample(0), inputManager.sample(1)];
    if (pressedIn(frames, 'cancel') || pressedIn(frames, 'pause')) {
      this.goBack();
      return;
    }
    if (pressedIn(frames, 'up')) {
      this.moveSelection(-1);
    } else if (pressedIn(frames, 'down')) {
      this.moveSelection(1);
    } else if (pressedIn(frames, 'left')) {
      this.changeSelected(-1);
    } else if (pressedIn(frames, 'right')) {
      this.changeSelected(1);
    } else if (pressedIn(frames, 'confirm') || pressedIn(frames, 'light')) {
      this.changeSelected(1);
    }
  }

  private createRow(entry: SettingEntry, index: number): void {
    const y = 36 + index * 14;
    const background = this.add.rectangle(INTERNAL_WIDTH / 2, y, 282, 12, PALETTE.metalDark)
      .setStrokeStyle(1, PALETTE.steelDark)
      .setInteractive({ useHandCursor: true });
    const marker = pixelText(this, 22, y, '>', { size: 8, align: 'center' }).setTint(PALETTE.gold);
    const label = pixelText(this, 30, y, entry.label, { size: 8 }).setTint(PALETTE.steelLight);
    const value = pixelText(this, 298, y, '', { size: 8, align: 'right' }).setTint(PALETTE.cyanLight);

    background.on('pointerover', () => this.setSelected(index));
    background.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      audioManager.unlock();
      this.setSelected(index);
      this.changeSelected(pointer.worldX < INTERNAL_WIDTH / 2 ? -1 : 1);
    });

    this.rows.push({ background, marker, label, value });
  }

  private drawBackdrop(): void {
    this.cameras.main.setBackgroundColor(PALETTE.black);
    this.add.rectangle(
      INTERNAL_WIDTH / 2,
      INTERNAL_HEIGHT / 2,
      INTERNAL_WIDTH,
      INTERNAL_HEIGHT,
      PALETTE.ink,
    );

    this.add.rectangle(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, 306, 172, PALETTE.panel)
      .setStrokeStyle(2, PALETTE.steelLight);
    this.add.image(INTERNAL_WIDTH / 2, 97, ASSET_MANIFEST.ui.panel.key).setScale(2);

    const corners = this.add.graphics();
    corners.fillStyle(PALETTE.gold);
    corners.fillRect(5, 4, 18, 2);
    corners.fillRect(5, 4, 2, 18);
    corners.fillRect(297, 4, 18, 2);
    corners.fillRect(313, 4, 2, 18);
    corners.fillRect(5, 174, 18, 2);
    corners.fillRect(5, 158, 2, 18);
    corners.fillRect(297, 174, 18, 2);
    corners.fillRect(313, 158, 2, 18);

    const scanlines = this.add.graphics();
    scanlines.fillStyle(PALETTE.black, 0.15);
    for (let y = 1; y < INTERNAL_HEIGHT; y += 4) scanlines.fillRect(0, y, INTERNAL_WIDTH, 1);
  }

  private moveSelection(delta: number): void {
    const count = SETTINGS_ENTRIES.length;
    this.selectedIndex = (this.selectedIndex + delta + count) % count;
    this.refreshRows();
  }

  private setSelected(index: number): void {
    if (this.selectedIndex === index) return;
    this.selectedIndex = index;
    this.refreshRows();
  }

  private changeSelected(direction: number): void {
    const entry = SETTINGS_ENTRIES[this.selectedIndex];
    if (!entry || this.transitionLocked) return;

    if (entry.id === 'back') {
      this.goBack();
      return;
    }

    let patch: Partial<GameSettings> = {};
    switch (entry.id) {
      case 'masterVolume':
        patch = { masterVolume: clampStep(this.settings.masterVolume, direction, 0.05) };
        break;
      case 'musicVolume':
        patch = { musicVolume: clampStep(this.settings.musicVolume, direction, 0.05) };
        break;
      case 'effectsVolume':
        patch = { effectsVolume: clampStep(this.settings.effectsVolume, direction, 0.05) };
        break;
      case 'touchOpacity':
        patch = { touchOpacity: clampStep(this.settings.touchOpacity, direction, 0.1) };
        break;
      case 'muted':
        patch = { muted: !this.settings.muted };
        break;
      case 'preferFullscreen':
        if (!this.fullscreenPending) void this.changeFullscreen();
        return;
      case 'difficulty':
        patch = { difficulty: this.cycleDifficulty(direction) };
        break;
      case 'touchControls':
        patch = { touchControls: this.cycleTouchPreference(direction) };
        break;
    }

    this.settings = settingsStore.update(patch);
    audioManager.applySettings();
    if (entry.id === 'touchControls') touchControls.refreshVisibility();
    audioManager.play('confirm');
    this.refreshRows();
  }

  private async changeFullscreen(): Promise<void> {
    this.fullscreenPending = true;
    audioManager.unlock();
    audioManager.play('confirm');
    try {
      const enabled = await toggleFullscreen();
      this.settings = settingsStore.update({ preferFullscreen: enabled });
      this.refreshRows();
    } finally {
      this.fullscreenPending = false;
    }
  }

  private cycleDifficulty(direction: number): Difficulty {
    const choices: readonly Difficulty[] = ['easy', 'normal', 'hard'];
    const current = choices.indexOf(this.settings.difficulty);
    return choices[(current + direction + choices.length) % choices.length] ?? 'normal';
  }

  private cycleTouchPreference(direction: number): TouchControlsPreference {
    const choices: readonly TouchControlsPreference[] = ['auto', 'on', 'off'];
    const current = choices.indexOf(this.settings.touchControls);
    return choices[(current + direction + choices.length) % choices.length] ?? 'auto';
  }

  private refreshRows(): void {
    this.rows.forEach((row, index) => {
      const selected = index === this.selectedIndex;
      const entry = SETTINGS_ENTRIES[index];
      row.background
        .setFillStyle(selected ? PALETTE.panelLight : PALETTE.metalDark)
        .setStrokeStyle(selected ? 2 : 1, selected ? PALETTE.gold : PALETTE.steelDark);
      row.marker.setVisible(selected);
      row.label.setTint(selected ? PALETTE.ivory : PALETTE.steelLight);
      row.value.setTint(selected ? PALETTE.gold : PALETTE.cyanLight);
      row.value.setText(entry ? this.formatValue(entry.id) : '');
    });
  }

  private formatValue(id: SettingId): string {
    switch (id) {
      case 'masterVolume':
        return '< ' + Math.round(this.settings.masterVolume * 100) + '% >';
      case 'musicVolume':
        return '< ' + Math.round(this.settings.musicVolume * 100) + '% >';
      case 'effectsVolume':
        return '< ' + Math.round(this.settings.effectsVolume * 100) + '% >';
      case 'touchOpacity':
        return '< ' + Math.round(this.settings.touchOpacity * 100) + '% >';
      case 'muted':
        return this.settings.muted ? 'SIM' : 'NAO';
      case 'difficulty':
        return ({ easy: 'FACIL', normal: 'NORMAL', hard: 'DIFICIL' } as const)[this.settings.difficulty];
      case 'touchControls':
        return ({ auto: 'AUTO', on: 'LIGADO', off: 'DESLIG.' } as const)[this.settings.touchControls];
      case 'preferFullscreen':
        return this.settings.preferFullscreen ? 'SIM' : 'NAO';
      case 'back':
        return 'ESC';
    }
  }

  private goBack(): void {
    if (this.transitionLocked) return;
    this.transitionLocked = true;
    audioManager.unlock();
    audioManager.play('confirm');
    this.cameras.main.flash(90, 246, 64, 112);
    this.time.delayedCall(90, () => this.scene.start('MainMenuScene'));
  }
}
