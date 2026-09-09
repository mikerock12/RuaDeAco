import Phaser from 'phaser';
import { audioManager } from '../audio/AudioManager';
import { INTERNAL_WIDTH, PALETTE } from '../config/pixelArtConfig';
import { settingsStore } from '../config/settings';
import { keyLabel } from '../input/controlLabels';
import { controlsStore } from '../input/controlsStore';
import { inputManager } from '../input/InputManager';
import { touchControls } from '../input/TouchControls';
import type { InputAction, InputFrame } from '../types/combat';
import type { Difficulty, GameSettings, TouchControlsPreference } from '../types/game';
import { toggleFullscreen } from '../utils/fullscreen';
import { drawRemasterBackdrop, focusPanel, panelCorners, uiPanel, uiIcon, UI_THEME, type UiIcon } from '../ui/remasterTheme';
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
  { id: 'touchOpacity', label: 'OPACIDADE TOUCH' },
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
      size: 20,
      minSize: 16,
      maxWidth: 440,
      maxHeight: 26,
      align: 'center',
      layoutName: 'settings-title',
    })
      .setTint(PALETTE.ivory);
    this.add.rectangle(INTERNAL_WIDTH / 2, 50, 180, 1, PALETTE.gold);
    this.add.rectangle(INTERNAL_WIDTH / 2, 54, 250, 1, PALETTE.cyan);

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
      this.add.rectangle(INTERNAL_WIDTH / 2, y, 372, 24, UI_THEME.panel, 0.82)
        .setStrokeStyle(1, UI_THEME.border)
        .setInteractive({ useHandCursor: true }),
      panelName,
      { x: 8, y: 3 },
    );
    const marker = pixelText(this, 142, y, '>', { size: 16, align: 'center' }).setTint(PALETTE.gold);
    const label = pixelText(this, 168, y, entry.label, {
      size: 16,
      minSize: 8,
      maxWidth: 208,
      maxHeight: 20,
      layoutName: `settings-label-${index}`,
      panelName,
      padding: { x: 8, y: 3 },
    }).setTint(PALETTE.steelLight);
    const value = pixelText(this, 496, y, '', {
      size: 16,
      minSize: 8,
      maxWidth: 114,
      maxHeight: 20,
      align: 'right',
      layoutName: `settings-value-${index}`,
      panelName,
      padding: { x: 8, y: 3 },
    }).setTint(PALETTE.cyanLight);

    const icons: readonly UiIcon[] = ['volume', 'music', 'effects', 'mute', 'skull', 'touch', 'eye', 'screen', 'gamepad', 'back'];
    uiIcon(this, 155, y, icons[index]!, UI_THEME.cyan, 1);
    background.on('pointerover', () => this.setSelected(index));
    background.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      audioManager.unlock();
      this.setSelected(index);
      this.changeSelected(pointer.worldX < INTERNAL_WIDTH / 2 ? -1 : 1);
    });

    this.rows.push({ background, marker, label, value });
  }

  private drawBackdrop(): void {
    drawRemasterBackdrop(this, 0.16);
    uiPanel(this, 320, 194, 392, 286, UI_THEME.cyan);
    panelCorners(this, 320, 194, 396, 290);
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
      focusPanel(row.background, selected, true);
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
    this.cameras.main.fadeOut(90, 4, 12, 24);
    this.time.delayedCall(90, () => this.scene.start('ControlsScene'));
  }

  private goBack(): void {
    if (this.transitionLocked) return;
    this.transitionLocked = true;
    audioManager.unlock();
    audioManager.play('confirm');
    this.cameras.main.fadeOut(90, 4, 12, 24);
    this.time.delayedCall(90, () => this.scene.start('MainMenuScene'));
  }
}
