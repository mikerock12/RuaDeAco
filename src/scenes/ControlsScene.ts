import Phaser from 'phaser';
import { audioManager } from '../audio/AudioManager';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, PALETTE } from '../config/pixelArtConfig';
import {
  COMBAT_ACTION_LABELS,
  gamepadButtonLabel,
  keyLabel,
  TOUCH_BUTTON_PIXEL_LABELS,
} from '../input/controlLabels';
import {
  COMBAT_ACTION_IDS,
  controlsStore,
  TOUCH_SLOT_IDS,
  type BindingChangeResult,
  type CombatActionId,
  type ControlDevice,
  type TouchSlotId,
} from '../input/controlsStore';
import { GamepadManager, gamepadManager } from '../input/GamepadManager';
import { inputManager } from '../input/InputManager';
import type { CombatButton, InputAction, InputFrame } from '../types/combat';
import { pixelText } from '../utils/text';

type RowKind = 'player' | 'device' | 'action' | 'touch-slot' | 'reset-profile' | 'reset-all' | 'back';

interface RowSpec {
  readonly kind: RowKind;
  readonly label: string;
  readonly action?: CombatActionId | 'pause';
  readonly slot?: TouchSlotId;
}

interface RowView {
  readonly background: Phaser.GameObjects.Rectangle;
  readonly marker: Phaser.GameObjects.BitmapText;
  readonly label: Phaser.GameObjects.BitmapText;
  readonly value: Phaser.GameObjects.BitmapText;
}

interface CaptureState {
  readonly device: 'keyboard' | 'gamepad';
  readonly action: CombatActionId | 'pause';
}

const DEVICES: readonly ControlDevice[] = ['keyboard', 'gamepad', 'touch'];

const DEVICE_LABELS: Readonly<Record<ControlDevice, string>> = {
  keyboard: 'TECLADO',
  touch: 'TOUCH',
  gamepad: 'CONTROLE',
};

const TOUCH_SLOT_LABELS: Readonly<Record<TouchSlotId, string>> = {
  nw: 'POS. SUP. ESQ.',
  ne: 'POS. SUP. DIR.',
  sw: 'POS. INF. ESQ.',
  se: 'POS. INF. DIR.',
};

const COMBAT_BUTTONS: readonly CombatButton[] = ['light', 'heavy', 'special', 'block'];

const ROW_START_Y = 64;
const ROW_SPACING = 20;

function pressedIn(frames: readonly InputFrame[], action: InputAction): boolean {
  return frames.some((frame) => frame.pressed.has(action));
}

/**
 * Tela de remapeamento de teclado, touch e gamepad, com captura por
 * dispositivo, troca determinística de conflitos e restauração de padrões.
 */
export class ControlsScene extends Phaser.Scene {
  private rows: RowView[] = [];
  private specs: RowSpec[] = [];
  private selectedIndex = 0;
  private player: 0 | 1 = 0;
  private device: ControlDevice = 'keyboard';
  private capture: CaptureState | null = null;
  private transitionLocked = false;
  private statusText: Phaser.GameObjects.BitmapText | null = null;
  private gamepadInfoText: Phaser.GameObjects.BitmapText | null = null;
  private captureShade: Phaser.GameObjects.Rectangle | null = null;
  private captureText: Phaser.GameObjects.BitmapText | null = null;
  private statusTimer: Phaser.Time.TimerEvent | null = null;
  private readonly gamepadUnsubscribers: (() => void)[] = [];

  constructor() {
    super('ControlsScene');
  }

  create(): void {
    this.rows = [];
    this.specs = [];
    this.selectedIndex = 0;
    this.player = 0;
    this.device = 'keyboard';
    this.capture = null;
    this.transitionLocked = false;
    inputManager.clear();

    this.drawBackdrop();
    pixelText(this, INTERNAL_WIDTH / 2, 24, 'CONTROLES', { size: 32, align: 'center' })
      .setTint(PALETTE.ivory);
    this.add.rectangle(INTERNAL_WIDTH / 2, 44, 300, 4, PALETTE.gold);

    this.gamepadInfoText = pixelText(this, INTERNAL_WIDTH / 2, 54, '', { size: 8, align: 'center' })
      .setTint(PALETTE.cyanLight);
    this.statusText = pixelText(this, INTERNAL_WIDTH / 2, 330, '', { size: 8, align: 'center' })
      .setTint(PALETTE.gold);

    this.rebuildRows();

    pixelText(this, INTERNAL_WIDTH / 2, 348, 'CIMA/BAIXO ITEM  ESQ/DIR ALTERA  CONFIRMA CAPTURA  ESC VOLTA', {
      size: 8,
      align: 'center',
    }).setTint(PALETTE.cyanLight);

    this.captureShade = this.add.rectangle(
      INTERNAL_WIDTH / 2,
      INTERNAL_HEIGHT / 2,
      INTERNAL_WIDTH,
      INTERNAL_HEIGHT,
      PALETTE.black,
      0.82,
    ).setVisible(false).setDepth(200);
    this.captureText = pixelText(this, INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, '', {
      size: 16,
      align: 'center',
    }).setTint(PALETTE.ivory).setVisible(false).setDepth(201);

    this.gamepadUnsubscribers.push(
      gamepadManager.on('connected', () => this.refreshRows()),
      gamepadManager.on('disconnected', () => this.refreshRows()),
      gamepadManager.on('assigned', () => this.refreshRows()),
    );

    if (import.meta.env.DEV) {
      const debugGlobal = globalThis as typeof globalThis & {
        __RUA_CONTROLS_DEBUG__?: () => unknown;
      };
      debugGlobal.__RUA_CONTROLS_DEBUG__ = () => ({
        player: this.player,
        device: this.device,
        selectedIndex: this.selectedIndex,
        capturing: this.capture !== null,
        rows: this.specs.map((spec, index) => ({
          label: spec.label,
          value: this.rowValue(spec),
          selected: index === this.selectedIndex,
        })),
        status: this.statusText?.text ?? '',
      });
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.endCapture(null, true);
      for (const unsubscribe of this.gamepadUnsubscribers) unsubscribe();
      this.gamepadUnsubscribers.length = 0;
      if (import.meta.env.DEV) {
        delete (globalThis as typeof globalThis & { __RUA_CONTROLS_DEBUG__?: unknown })
          .__RUA_CONTROLS_DEBUG__;
      }
      this.rows = [];
      this.specs = [];
    });
  }

  update(): void {
    if (this.transitionLocked) return;
    const frames = [inputManager.sample(0), inputManager.sample(1)];

    if (this.capture) {
      // Durante a captura de gamepad, Esc cancela; o teclado é interceptado
      // diretamente pelo InputManager na captura de teclado.
      if (this.capture.device === 'gamepad' && (pressedIn(frames, 'cancel') || pressedIn(frames, 'pause'))) {
        this.endCapture(null);
      }
      return;
    }

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
      this.activateSelected();
    }
  }

  private buildSpecs(): RowSpec[] {
    const specs: RowSpec[] = [
      { kind: 'player', label: 'JOGADOR' },
      { kind: 'device', label: 'DISPOSITIVO' },
    ];
    if (this.device === 'touch') {
      for (const slot of TOUCH_SLOT_IDS) {
        specs.push({ kind: 'touch-slot', label: TOUCH_SLOT_LABELS[slot], slot });
      }
    } else {
      for (const action of COMBAT_ACTION_IDS) {
        specs.push({ kind: 'action', label: COMBAT_ACTION_LABELS[action], action });
      }
      if (this.device === 'gamepad') {
        specs.push({ kind: 'action', label: 'PAUSA', action: 'pause' });
      }
    }
    specs.push(
      { kind: 'reset-profile', label: 'RESTAURAR PERFIL' },
      { kind: 'reset-all', label: 'RESTAURAR TUDO' },
      { kind: 'back', label: 'VOLTAR' },
    );
    return specs;
  }

  private rebuildRows(): void {
    for (const row of this.rows) {
      row.background.destroy();
      row.marker.destroy();
      row.label.destroy();
      row.value.destroy();
    }
    this.rows = [];
    this.specs = this.buildSpecs();
    this.selectedIndex = Math.min(this.selectedIndex, this.specs.length - 1);

    this.specs.forEach((spec, index) => {
      const y = ROW_START_Y + index * ROW_SPACING;
      const background = this.add.rectangle(INTERNAL_WIDTH / 2, y, 564, 18, PALETTE.metalDark)
        .setStrokeStyle(2, PALETTE.steelDark)
        .setInteractive({ useHandCursor: true });
      const marker = pixelText(this, 44, y, '>', { size: 16, align: 'center' }).setTint(PALETTE.gold);
      const label = pixelText(this, 60, y, spec.label, { size: 16 }).setTint(PALETTE.steelLight);
      const value = pixelText(this, 596, y, '', { size: 16, align: 'right' }).setTint(PALETTE.cyanLight);

      background.on('pointerover', () => this.setSelected(index));
      background.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (this.capture || this.transitionLocked) return;
        audioManager.unlock();
        this.setSelected(index);
        if (spec.kind === 'player' || spec.kind === 'device' || spec.kind === 'touch-slot') {
          this.changeSelected(pointer.worldX < INTERNAL_WIDTH / 2 ? -1 : 1);
        } else {
          this.activateSelected();
        }
      });

      this.rows.push({ background, marker, label, value });
    });
    this.refreshRows();
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

    const scanlines = this.add.graphics();
    scanlines.fillStyle(PALETTE.black, 0.15);
    for (let y = 2; y < INTERNAL_HEIGHT; y += 8) scanlines.fillRect(0, y, INTERNAL_WIDTH, 2);
  }

  private moveSelection(delta: number): void {
    const count = this.specs.length;
    this.selectedIndex = (this.selectedIndex + delta + count) % count;
    this.refreshRows();
  }

  private setSelected(index: number): void {
    if (this.selectedIndex === index) return;
    this.selectedIndex = index;
    this.refreshRows();
  }

  private changeSelected(direction: number): void {
    const spec = this.specs[this.selectedIndex];
    if (!spec || this.capture || this.transitionLocked) return;

    switch (spec.kind) {
      case 'player': {
        if (this.device === 'touch') {
          this.showStatus('O TOUCH CONTROLA SEMPRE O P1');
          return;
        }
        this.player = this.player === 0 ? 1 : 0;
        audioManager.play('confirm');
        this.refreshRows();
        return;
      }
      case 'device': {
        const index = DEVICES.indexOf(this.device);
        const next = DEVICES[(index + direction + DEVICES.length) % DEVICES.length] ?? 'keyboard';
        this.device = next;
        if (next === 'touch') this.player = 0;
        audioManager.play('confirm');
        this.rebuildRows();
        return;
      }
      case 'touch-slot': {
        if (!spec.slot) return;
        const current = controlsStore.get().touch.slots[spec.slot];
        const currentIndex = COMBAT_BUTTONS.indexOf(current);
        const next = COMBAT_BUTTONS[
          (currentIndex + direction + COMBAT_BUTTONS.length) % COMBAT_BUTTONS.length
        ] ?? current;
        const result = controlsStore.setTouchSlot(spec.slot, next);
        this.announceResult(result);
        this.refreshRows();
        return;
      }
      default:
        this.activateSelected();
    }
  }

  private activateSelected(): void {
    const spec = this.specs[this.selectedIndex];
    if (!spec || this.capture || this.transitionLocked) return;

    switch (spec.kind) {
      case 'player':
      case 'device':
      case 'touch-slot':
        this.changeSelected(1);
        return;
      case 'action':
        if (spec.action === undefined) return;
        audioManager.play('confirm');
        if (this.device === 'keyboard') {
          if (spec.action !== 'pause') this.startKeyboardCapture(spec.action);
        } else {
          this.startGamepadCapture(spec.action);
        }
        return;
      case 'reset-profile':
        controlsStore.resetProfile(this.device, this.player);
        audioManager.play('confirm');
        this.showStatus('PERFIL RESTAURADO');
        this.refreshRows();
        return;
      case 'reset-all':
        controlsStore.resetAll();
        audioManager.play('confirm');
        this.showStatus('TODOS OS CONTROLES RESTAURADOS');
        this.refreshRows();
        return;
      case 'back':
        this.goBack();
    }
  }

  private startKeyboardCapture(action: CombatActionId): void {
    this.capture = { device: 'keyboard', action };
    this.showCaptureOverlay(
      `PRESSIONE UMA TECLA PARA ${COMBAT_ACTION_LABELS[action]}\nESC CANCELA`,
    );
    inputManager.setCaptureInterceptor((event) => {
      // Ignora repetição da tecla que abriu a captura e demais repeats.
      if (event.repeat) return true;
      if (event.code === 'Escape') {
        this.endCapture(null);
        return true;
      }
      const result = controlsStore.setKeyboardBinding(this.player, action, event.code);
      this.endCapture(result);
      return true;
    });
  }

  private startGamepadCapture(action: CombatActionId | 'pause'): void {
    if (!GamepadManager.isSupported()) {
      this.showStatus('GAMEPAD API INDISPONIVEL NESTE NAVEGADOR');
      return;
    }
    if (gamepadManager.connectedPads().length === 0) {
      this.showStatus('CONECTE UM CONTROLE E PRESSIONE UM BOTAO');
      return;
    }
    this.capture = { device: 'gamepad', action };
    const label = action === 'pause' ? 'PAUSA' : COMBAT_ACTION_LABELS[action];
    this.showCaptureOverlay(
      `SOLTE TUDO E PRESSIONE UM BOTAO OU DIRECAO\nPARA ${label}\nESC CANCELA`,
    );
    gamepadManager.startCapture(this.player, ({ buttonIndex }) => {
      const result = controlsStore.setGamepadBinding(this.player, action, buttonIndex);
      this.endCapture(result);
    });
  }

  private endCapture(result: BindingChangeResult | null, silent = false): void {
    inputManager.setCaptureInterceptor(null);
    gamepadManager.cancelCapture();
    this.capture = null;
    this.captureShade?.setVisible(false);
    this.captureText?.setVisible(false);
    // Evita que a entrada capturada ou a tecla de abertura reaja no menu.
    inputManager.clear();
    if (silent) return;
    if (result === null) {
      this.showStatus('CAPTURA CANCELADA');
    } else {
      this.announceResult(result);
      if (result.ok) audioManager.play('confirm');
    }
    this.refreshRows();
  }

  private announceResult(result: BindingChangeResult): void {
    if (result.ok) {
      if (result.swappedWith === null) {
        this.showStatus('CONTROLE ATUALIZADO');
      } else {
        const other = result.swappedWith === 'pause'
          ? 'PAUSA'
          : COMBAT_ACTION_LABELS[result.swappedWith];
        this.showStatus(`TROCADO COM ${other}`);
      }
      return;
    }
    if (result.reason === 'reserved') this.showStatus('TECLA RESERVADA PELA INTERFACE');
    else if (result.reason === 'other-player') this.showStatus('TECLA EM USO PELO OUTRO JOGADOR');
    else this.showStatus('ENTRADA INVALIDA');
  }

  private showCaptureOverlay(message: string): void {
    this.captureShade?.setVisible(true);
    this.captureText?.setText(message).setVisible(true).setCenterAlign();
  }

  private showStatus(message: string): void {
    this.statusText?.setText(message);
    this.statusTimer?.remove();
    this.statusTimer = this.time.delayedCall(2200, () => this.statusText?.setText(''));
  }

  private rowValue(spec: RowSpec): string {
    const config = controlsStore.get();
    switch (spec.kind) {
      case 'player':
        return `< P${this.player + 1} >`;
      case 'device':
        return `< ${DEVICE_LABELS[this.device]} >`;
      case 'action': {
        if (spec.action === undefined) return '';
        if (this.device === 'keyboard') {
          if (spec.action === 'pause') return 'ESC';
          return keyLabel(config.keyboard[this.player].bindings[spec.action]);
        }
        const profile = config.gamepad[this.player];
        const family = gamepadManager.assignedPad(this.player)?.family
          ?? gamepadManager.connectedPads()[0]?.family
          ?? 'generic';
        const index = spec.action === 'pause' ? profile.pause : profile.bindings[spec.action];
        return gamepadButtonLabel(family, index);
      }
      case 'touch-slot': {
        if (!spec.slot) return '';
        const button = config.touch.slots[spec.slot];
        return `${TOUCH_BUTTON_PIXEL_LABELS[button]} ${COMBAT_ACTION_LABELS[button]}`;
      }
      case 'reset-profile':
        return `P${this.player + 1} ${DEVICE_LABELS[this.device]}`;
      case 'reset-all':
        return 'TUDO';
      case 'back':
        return 'ESC';
    }
  }

  private refreshRows(): void {
    this.rows.forEach((row, index) => {
      const selected = index === this.selectedIndex;
      const spec = this.specs[index];
      row.background
        .setFillStyle(selected ? PALETTE.panelLight : PALETTE.metalDark)
        .setStrokeStyle(selected ? 4 : 2, selected ? PALETTE.gold : PALETTE.steelDark);
      row.marker.setVisible(selected);
      row.label.setTint(selected ? PALETTE.ivory : PALETTE.steelLight);
      row.value.setTint(selected ? PALETTE.gold : PALETTE.cyanLight);
      row.value.setText(spec ? this.rowValue(spec) : '');
    });
    this.refreshGamepadInfo();
  }

  private refreshGamepadInfo(): void {
    if (!this.gamepadInfoText) return;
    if (this.device !== 'gamepad') {
      this.gamepadInfoText.setText('');
      return;
    }
    if (!GamepadManager.isSupported()) {
      this.gamepadInfoText.setText('GAMEPAD API INDISPONIVEL NESTE NAVEGADOR');
      return;
    }
    const assigned = gamepadManager.assignedPad(this.player);
    if (assigned) {
      this.gamepadInfoText.setText(
        `P${this.player + 1}: CONTROLE ${assigned.family.toUpperCase()} CONECTADO`,
      );
      return;
    }
    const connected = gamepadManager.connectedPads().length;
    this.gamepadInfoText.setText(connected > 0
      ? 'PRESSIONE UM BOTAO NO CONTROLE PARA ATRIBUI-LO'
      : 'CONECTE UM CONTROLE E PRESSIONE UM BOTAO PARA DETECTAR');
  }

  private goBack(): void {
    if (this.transitionLocked) return;
    this.transitionLocked = true;
    audioManager.unlock();
    audioManager.play('confirm');
    this.cameras.main.flash(90, 246, 64, 112);
    this.time.delayedCall(90, () => this.scene.start('SettingsScene'));
  }
}
