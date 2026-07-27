import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { audioManager } from '../audio/AudioManager';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, PALETTE } from '../config/pixelArtConfig';
import { settingsStore } from '../config/settings';
import { keyLabel } from '../input/controlLabels';
import { controlsStore } from '../input/controlsStore';
import { inputManager } from '../input/InputManager';
import { touchControls } from '../input/TouchControls';
import type { InputAction, InputFrame } from '../types/combat';
import type { Difficulty, GameSettings, TouchControlsPreference } from '../types/game';
import { toggleFullscreen } from '../utils/fullscreen';
import { pixelText, tagLayoutPanel } from '../utils/text';

type SettingId =
  | 'masterVolume'
  | 'musicVolume'
  | 'effectsVolume'
  | 'muted'
  | 'difficulty'
  | 'touchControls'
  | 'touchOpacity'
  | 'preferFullscreen'
  | 'controls'
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
  { id: 'controls', label: 'CONTROLES' },
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
    pixelText(this, INTERNAL_WIDTH / 2, 28, 'CONFIGURACOES', {
      size: 32,
      minSize: 16,
      maxWidth: 440,
      maxHeight: 40,
      align: 'center',
      layoutName: 'settings-title',
    })
      .setTint(PALETTE.ivory);
    this.add.rectangle(INTERNAL_WIDTH / 2, 50, 300, 4, PALETTE.gold);
    this.add.rectangle(INTERNAL_WIDTH / 2, 54, 380, 2, PALETTE.cyan);

    SETTINGS_ENTRIES.forEach((entry, index) => this.createRow(entry, index));
    this.refreshRows();

    const keys = controlsStore.get().keyboard[0].bindings;
    pixelText(
      this,
      INTERNAL_WIDTH / 2,
      344,
      `${keyLabel(keys.up)}/${keyLabel(keys.down)} ITEM  ${keyLabel(keys.left)}/${keyLabel(keys.right)} ALTERA  ESC VOLTA`,
      {
        size: 8,
        maxWidth: 600,
        maxHeight: 14,
        align: 'center',
        layoutName: 'settings-footer',
      },
    ).setTint(PALETTE.cyanLight);

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
    const y = 72 + index * 28;
    const panelName = `settings-row-${index}`;
    const background = tagLayoutPanel(
      this.add.rectangle(INTERNAL_WIDTH / 2, y, 564, 24, PALETTE.metalDark)
        .setStrokeStyle(2, PALETTE.steelDark)
        .setInteractive({ useHandCursor: true }),
      panelName,
      { x: 8, y: 3 },
    );
    const marker = pixelText(this, 44, y, '>', { size: 16, align: 'center' }).setTint(PALETTE.gold);
    const label = pixelText(this, 60, y, entry.label, {
      size: 16,
      minSize: 8,
      maxWidth: 310,
      maxHeight: 20,
      layoutName: `settings-label-${index}`,
      panelName,
      padding: { x: 8, y: 3 },
    }).setTint(PALETTE.steelLight);
    const value = pixelText(this, 592, y, '', {
      size: 16,
      minSize: 8,
      maxWidth: 210,
      maxHeight: 20,
      align: 'right',
      layoutName: `settings-value-${index}`,
      panelName,
      padding: { x: 8, y: 3 },
    }).setTint(PALETTE.cyanLight);

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

    this.add.rectangle(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, 612, 344, PALETTE.panel)
      .setStrokeStyle(4, PALETTE.steelLight);
    this.add.image(INTERNAL_WIDTH / 2, 194, ASSET_MANIFEST.ui.panel.key).setScale(4);

    const corners = this.add.graphics();
    corners.fillStyle(PALETTE.gold);
    corners.fillRect(10, 8, 36, 4);
    corners.fillRect(10, 8, 4, 36);
    corners.fillRect(594, 8, 36, 4);
    corners.fillRect(626, 8, 4, 36);
    corners.fillRect(10, 348, 36, 4);
    corners.fillRect(10, 316, 4, 36);
    corners.fillRect(594, 348, 36, 4);
    corners.fillRect(626, 316, 4, 36);

    const scanlines = this.add.graphics();
    scanlines.fillStyle(PALETTE.black, 0.15);
    for (let y = 2; y < INTERNAL_HEIGHT; y += 8) scanlines.fillRect(0, y, INTERNAL_WIDTH, 2);
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
    if (entry.id === 'controls') {
      this.openControls();
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
        .setStrokeStyle(selected ? 4 : 2, selected ? PALETTE.gold : PALETTE.steelDark);
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
      case 'controls':
        return '>';
      case 'back':
        return 'ESC';
    }
  }

  private openControls(): void {
    if (this.transitionLocked) return;
    this.transitionLocked = true;
    audioManager.unlock();
    audioManager.play('confirm');
    this.cameras.main.flash(90, 246, 64, 112);
    this.time.delayedCall(90, () => this.scene.start('ControlsScene'));
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
