import type { InputAction } from '../types/combat';
import { detectGamepadFamily, type GamepadFamily } from './controlLabels';
import { COMBAT_ACTION_IDS, controlsStore, type CombatActionId, type ControlsConfig } from './controlsStore';
import { inputManager, type PlayerIndex } from './InputManager';

/** Zona morta com histerese: ativa acima de PRESS, desativa abaixo de RELEASE. */
const AXIS_PRESS_THRESHOLD = 0.5;
const AXIS_RELEASE_THRESHOLD = 0.3;
const BUTTON_PRESS_VALUE = 0.5;

/** Botões fixos de interface no layout standard. */
const CONFIRM_BUTTON = 0;
const CANCEL_BUTTON = 1;

const DPAD_BY_DIRECTION: Readonly<Record<'up' | 'down' | 'left' | 'right', number>> = {
  up: 12,
  down: 13,
  left: 14,
  right: 15,
};

export interface GamepadInfo {
  readonly index: number;
  readonly id: string;
  readonly family: GamepadFamily;
}

export type GamepadEventKind = 'connected' | 'disconnected' | 'activity' | 'assigned';
export type GamepadListener = (info: GamepadInfo) => void;

export interface GamepadCaptureResult {
  readonly buttonIndex: number;
}

interface CaptureRequest {
  readonly player: PlayerIndex;
  neutralSeen: boolean;
  readonly callback: (result: GamepadCaptureResult) => void;
}

interface InputSink {
  setSourceAction(
    source: 'gamepad',
    player: PlayerIndex,
    action: InputAction,
    active: boolean,
    edge?: boolean,
  ): void;
  releaseSource(source: 'gamepad', player: PlayerIndex): void;
}

interface GamepadManagerOptions {
  readonly input?: InputSink;
  readonly readPads?: () => readonly (Gamepad | null)[];
  readonly target?: EventTarget | null;
}

interface DirectionHold {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

/**
 * Lê a Gamepad API por polling (uma vez por frame via PRE_STEP), atribui o
 * primeiro controle ativo ao P1 e o segundo ao P2 e alimenta o InputManager
 * com ações lógicas. A ausência da API nunca lança exceção.
 */
export class GamepadManager {
  private readonly input: InputSink;
  private readonly readPads: () => readonly (Gamepad | null)[];
  private readonly target: EventTarget | null;
  private readonly listeners = new Map<GamepadEventKind, Set<GamepadListener>>();
  private readonly connected = new Map<number, GamepadInfo>();
  private readonly previousButtons = new Map<number, boolean[]>();
  private readonly assignments: [number | null, number | null] = [null, null];
  private readonly axisHold: [DirectionHold, DirectionHold] = [
    { left: false, right: false, up: false, down: false },
    { left: false, right: false, up: false, down: false },
  ];
  // Borda detectada aqui, não no InputManager: se o estado for limpo (pausa,
  // troca de cena) com um botão ainda físico, a continuação não pode gerar
  // um novo pressed — mesmo papel do flag repeat do teclado.
  private readonly previousActive: [Map<InputAction, boolean>, Map<InputAction, boolean>] = [
    new Map(),
    new Map(),
  ];
  private capture: CaptureRequest | null = null;
  private config: ControlsConfig = controlsStore.get();
  private unsubscribe: (() => void) | null = null;
  private attached = false;

  constructor(options: GamepadManagerOptions = {}) {
    this.input = options.input ?? inputManager;
    this.readPads = options.readPads ?? (() => {
      const navigatorRef = globalThis.navigator as Navigator | undefined;
      if (typeof navigatorRef?.getGamepads !== 'function') return [];
      try {
        return navigatorRef.getGamepads();
      } catch {
        return [];
      }
    });
    this.target = options.target !== undefined ? options.target : globalThis.window ?? null;
  }

  static isSupported(): boolean {
    return typeof (globalThis.navigator as Navigator | undefined)?.getGamepads === 'function';
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.unsubscribe = controlsStore.subscribe((config) => {
      this.config = config;
    });
    this.target?.addEventListener('gamepadconnected', this.handleConnected);
    this.target?.addEventListener('gamepaddisconnected', this.handleDisconnected);
    // Controles já conectados antes do attach são detectados na primeira leitura.
    this.reconcileConnections(this.readPads());
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.target?.removeEventListener('gamepadconnected', this.handleConnected);
    this.target?.removeEventListener('gamepaddisconnected', this.handleDisconnected);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.capture = null;
    for (const player of [0, 1] as const) this.unassign(player);
    this.connected.clear();
    this.previousButtons.clear();
  }

  on(kind: GamepadEventKind, listener: GamepadListener): () => void {
    const set = this.listeners.get(kind) ?? new Set<GamepadListener>();
    set.add(listener);
    this.listeners.set(kind, set);
    return () => set.delete(listener);
  }

  connectedPads(): readonly GamepadInfo[] {
    return [...this.connected.values()];
  }

  assignedPad(player: PlayerIndex): GamepadInfo | null {
    const index = this.assignments[player];
    if (index === null) return null;
    return this.connected.get(index) ?? null;
  }

  /** Captura o próximo botão (ou direção, traduzida para o D-pad) do controle
   * do jogador. Exige leitura neutra completa antes de aceitar a entrada. */
  startCapture(player: PlayerIndex, callback: (result: GamepadCaptureResult) => void): void {
    this.capture = { player, neutralSeen: false, callback };
  }

  cancelCapture(): void {
    this.capture = null;
  }

  get capturing(): boolean {
    return this.capture !== null;
  }

  /** Deve ser chamado uma vez por frame (PRE_STEP do Phaser). */
  poll = (): void => {
    const pads = this.readPads();
    this.reconcileConnections(pads);

    for (const pad of pads) {
      if (!pad) continue;
      this.trackActivity(pad);
    }

    if (this.capture) this.pollCapture(pads);

    for (const player of [0, 1] as const) {
      const index = this.assignments[player];
      if (index === null) continue;
      const pad = pads.find((candidate) => candidate?.index === index) ?? null;
      if (!pad || !pad.connected) continue;
      if (this.capture?.player === player) continue;
      this.feedPlayer(player, pad);
    }
  };

  private reconcileConnections(pads: readonly (Gamepad | null)[]): void {
    const seen = new Set<number>();
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      seen.add(pad.index);
      if (!this.connected.has(pad.index)) this.registerPad(pad);
    }
    for (const index of [...this.connected.keys()]) {
      if (!seen.has(index)) this.unregisterPad(index);
    }
  }

  private registerPad(pad: Gamepad): void {
    const info: GamepadInfo = {
      index: pad.index,
      id: pad.id,
      family: detectGamepadFamily(pad.id),
    };
    this.connected.set(pad.index, info);
    this.previousButtons.set(pad.index, pad.buttons.map(() => false));
    this.emit('connected', info);
  }

  private unregisterPad(index: number): void {
    const info = this.connected.get(index);
    this.connected.delete(index);
    this.previousButtons.delete(index);
    for (const player of [0, 1] as const) {
      if (this.assignments[player] === index) this.unassign(player);
    }
    if (info) this.emit('disconnected', info);
  }

  private unassign(player: PlayerIndex): void {
    if (this.assignments[player] === null) return;
    this.assignments[player] = null;
    this.axisHold[player] = { left: false, right: false, up: false, down: false };
    this.previousActive[player].clear();
    // Solta apenas a fonte gamepad; teclado e touch permanecem válidos.
    this.input.releaseSource('gamepad', player);
  }

  private trackActivity(pad: Gamepad): void {
    const previous = this.previousButtons.get(pad.index) ?? [];
    let freshPress = false;
    const next = pad.buttons.map((button, index) => {
      const pressed = isButtonPressed(button);
      if (pressed && !previous[index]) freshPress = true;
      return pressed;
    });
    this.previousButtons.set(pad.index, next);
    if (!freshPress) return;

    const info = this.connected.get(pad.index);
    if (info) this.emit('activity', info);
    this.assignIfNeeded(pad.index);
  }

  private assignIfNeeded(padIndex: number): void {
    if (this.assignments.includes(padIndex)) return;
    const freeSlot = this.assignments[0] === null ? 0 : this.assignments[1] === null ? 1 : null;
    if (freeSlot === null) return;
    this.assignments[freeSlot] = padIndex;
    const info = this.connected.get(padIndex);
    if (info) this.emit('assigned', info);
  }

  private pollCapture(pads: readonly (Gamepad | null)[]): void {
    const request = this.capture;
    if (!request) return;
    const assigned = this.assignments[request.player];
    const pad = assigned !== null
      ? pads.find((candidate) => candidate?.index === assigned) ?? null
      : pads.find((candidate) => candidate?.connected) ?? null;
    if (!pad) return;

    const neutral = pad.buttons.every((button) => !isButtonPressed(button))
      && pad.axes.every((value) => Math.abs(value) < AXIS_RELEASE_THRESHOLD);
    if (!request.neutralSeen) {
      if (neutral) request.neutralSeen = true;
      return;
    }

    for (let index = 0; index < pad.buttons.length; index += 1) {
      if (isButtonPressed(pad.buttons[index])) {
        this.capture = null;
        request.callback({ buttonIndex: index });
        return;
      }
    }

    const horizontal = pad.axes[0] ?? 0;
    const vertical = pad.axes[1] ?? 0;
    if (Math.abs(horizontal) >= AXIS_PRESS_THRESHOLD) {
      this.capture = null;
      request.callback({
        buttonIndex: horizontal < 0 ? DPAD_BY_DIRECTION.left : DPAD_BY_DIRECTION.right,
      });
      return;
    }
    if (Math.abs(vertical) >= AXIS_PRESS_THRESHOLD) {
      this.capture = null;
      request.callback({
        buttonIndex: vertical < 0 ? DPAD_BY_DIRECTION.up : DPAD_BY_DIRECTION.down,
      });
    }
  }

  private feedPlayer(player: PlayerIndex, pad: Gamepad): void {
    const profile = this.config.gamepad[player];
    const hold = this.axisHold[player];
    updateAxisHold(hold, pad.axes[0] ?? 0, pad.axes[1] ?? 0);

    for (const action of COMBAT_ACTION_IDS) {
      const buttonActive = isButtonPressed(pad.buttons[profile.bindings[action]]);
      const axisActive = isDirection(action) ? hold[action] : false;
      this.feedAction(player, action, buttonActive || axisActive);
    }

    this.feedAction(player, 'confirm', isButtonPressed(pad.buttons[CONFIRM_BUTTON]));
    this.feedAction(player, 'cancel', isButtonPressed(pad.buttons[CANCEL_BUTTON]));
    this.feedAction(player, 'pause', isButtonPressed(pad.buttons[profile.pause]));
  }

  private feedAction(player: PlayerIndex, action: InputAction, active: boolean): void {
    const previous = this.previousActive[player].get(action) ?? false;
    this.input.setSourceAction('gamepad', player, action, active, active && !previous);
    this.previousActive[player].set(action, active);
  }

  private readonly handleConnected = (event: Event): void => {
    const pad = (event as GamepadEvent).gamepad;
    if (pad && !this.connected.has(pad.index)) this.registerPad(pad);
  };

  private readonly handleDisconnected = (event: Event): void => {
    const pad = (event as GamepadEvent).gamepad;
    if (pad) this.unregisterPad(pad.index);
  };

  private emit(kind: GamepadEventKind, info: GamepadInfo): void {
    const set = this.listeners.get(kind);
    if (!set) return;
    for (const listener of [...set]) listener(info);
  }
}

function isButtonPressed(button: GamepadButton | undefined): boolean {
  if (!button) return false;
  return button.pressed || button.value > BUTTON_PRESS_VALUE;
}

function isDirection(action: CombatActionId): action is 'left' | 'right' | 'up' | 'down' {
  return action === 'left' || action === 'right' || action === 'up' || action === 'down';
}

/** Histerese do analógico esquerdo: evita oscilação perto do limite e impede
 * que drift execute comandos. */
function updateAxisHold(hold: DirectionHold, horizontal: number, vertical: number): void {
  hold.left = updateDirection(hold.left, -horizontal);
  hold.right = updateDirection(hold.right, horizontal);
  hold.up = updateDirection(hold.up, -vertical);
  hold.down = updateDirection(hold.down, vertical);
}

function updateDirection(active: boolean, value: number): boolean {
  if (active) return value > AXIS_RELEASE_THRESHOLD;
  return value >= AXIS_PRESS_THRESHOLD;
}

export const gamepadManager = new GamepadManager();
