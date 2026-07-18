import type { InputAction, InputFrame } from '../types/combat';
import type { GameSettings } from '../types/game';
import { COMBAT_ACTION_IDS, controlsStore, type ControlsConfig } from './controlsStore';

export type PlayerIndex = 0 | 1;
export type InputSource = 'keyboard' | 'touch' | 'gamepad';

const INPUT_SOURCES: readonly InputSource[] = ['keyboard', 'touch', 'gamepad'];

const EMPTY_SET = (): Set<InputAction> => new Set<InputAction>();

/** Teclas de interface fixas, fora do remapeamento de combate. */
const UI_KEYS: Readonly<Record<string, readonly InputAction[]>> = {
  Enter: ['confirm'],
  Escape: ['pause', 'cancel'],
};

type KeyLookup = ReadonlyMap<string, readonly InputAction[]>;

function buildKeyLookup(config: ControlsConfig, player: PlayerIndex): KeyLookup {
  const lookup = new Map<string, InputAction[]>();
  for (const action of COMBAT_ACTION_IDS) {
    const code = config.keyboard[player].bindings[action];
    const actions = lookup.get(code) ?? [];
    actions.push(action);
    lookup.set(code, actions);
  }
  if (player === 0) {
    for (const [code, actions] of Object.entries(UI_KEYS)) {
      const existing = lookup.get(code) ?? [];
      lookup.set(code, [...existing, ...actions]);
    }
  }
  return lookup;
}

let keyLookups: readonly [KeyLookup, KeyLookup] = [
  buildKeyLookup(controlsStore.get(), 0),
  buildKeyLookup(controlsStore.get(), 1),
];

controlsStore.subscribe((config) => {
  keyLookups = [buildKeyLookup(config, 0), buildKeyLookup(config, 1)];
});

export function keyboardActionsForPlayer(player: PlayerIndex, code: string): readonly InputAction[] {
  return keyLookups[player].get(code) ?? [];
}

interface PlayerSourceState {
  readonly held: Record<InputSource, Set<InputAction>>;
  readonly effective: Set<InputAction>;
  readonly pressed: Set<InputAction>;
  readonly released: Set<InputAction>;
}

function createPlayerState(): PlayerSourceState {
  return {
    held: { keyboard: EMPTY_SET(), touch: EMPTY_SET(), gamepad: EMPTY_SET() },
    effective: EMPTY_SET(),
    pressed: EMPTY_SET(),
    released: EMPTY_SET(),
  };
}

/**
 * Estado central de entrada. Cada fonte física (teclado, touch, gamepad)
 * alimenta ações lógicas por jogador; o estado efetivo é a união das fontes,
 * de modo que soltar uma fonte não solta a ação enquanto outra a segurar.
 */
export class InputManager {
  private readonly players: readonly [PlayerSourceState, PlayerSourceState] = [
    createPlayerState(),
    createPlayerState(),
  ];
  private attached = false;
  private captureInterceptor: ((event: KeyboardEvent) => boolean) | null = null;

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    globalThis.window?.addEventListener('keydown', this.handleKeyDown, { passive: false });
    globalThis.window?.addEventListener('keyup', this.handleKeyUp, { passive: false });
    globalThis.window?.addEventListener('blur', this.clear);
    globalThis.document?.addEventListener('visibilitychange', this.handleVisibility);
  }

  sample(player: PlayerIndex): InputFrame {
    const state = this.players[player];
    const frame: InputFrame = {
      held: new Set(state.effective),
      pressed: new Set(state.pressed),
      released: new Set(state.released),
    };
    state.pressed.clear();
    state.released.clear();
    return frame;
  }

  peekHeld(player: PlayerIndex, action: InputAction): boolean {
    return this.players[player].effective.has(action);
  }

  /** Alimenta uma ação lógica a partir de uma fonte física. `edge: false`
   * atualiza o estado sem gerar borda de pressed (ex.: repeat de teclado). */
  setSourceAction(
    source: InputSource,
    player: PlayerIndex,
    action: InputAction,
    active: boolean,
    edge = true,
  ): void {
    const state = this.players[player];
    const held = state.held[source];
    if (active) {
      if (held.has(action)) return;
      held.add(action);
      if (!state.effective.has(action)) {
        state.effective.add(action);
        if (edge) state.pressed.add(action);
      }
      return;
    }
    if (!held.delete(action)) return;
    if (this.anySourceHolds(player, action)) return;
    state.effective.delete(action);
    state.released.add(action);
  }

  /** Compatibilidade com os controles touch, sempre ligados ao jogador 1. */
  setTouchAction(action: InputAction, active: boolean): void {
    this.setSourceAction('touch', 0, action, active);
  }

  /** Solta todas as ações de uma fonte (ex.: gamepad desconectado). */
  releaseSource(source: InputSource, player: PlayerIndex): void {
    const state = this.players[player];
    for (const action of [...state.held[source]]) {
      this.setSourceAction(source, player, action, false);
    }
  }

  clear = (): void => {
    for (const state of this.players) {
      for (const action of state.effective) state.released.add(action);
      state.effective.clear();
      state.pressed.clear();
      for (const source of INPUT_SOURCES) state.held[source].clear();
    }
  };

  detach(): void {
    if (!this.attached) return;
    globalThis.window?.removeEventListener('keydown', this.handleKeyDown);
    globalThis.window?.removeEventListener('keyup', this.handleKeyUp);
    globalThis.window?.removeEventListener('blur', this.clear);
    globalThis.document?.removeEventListener('visibilitychange', this.handleVisibility);
    this.clear();
    this.attached = false;
  }

  /** Intercepta o próximo teclado físico durante a captura de remapeamento.
   * O interceptor retorna true para consumir o evento sem alimentar ações. */
  setCaptureInterceptor(interceptor: ((event: KeyboardEvent) => boolean) | null): void {
    this.captureInterceptor = interceptor;
  }

  static isTouchCapable(): boolean {
    return (globalThis.navigator?.maxTouchPoints ?? 0) > 0
      || globalThis.matchMedia?.('(pointer: coarse)').matches === true;
  }

  static shouldShowTouch(settings: GameSettings): boolean {
    return settings.touchControls === 'on'
      || settings.touchControls === 'auto' && InputManager.isTouchCapable();
  }

  private anySourceHolds(player: PlayerIndex, action: InputAction): boolean {
    const state = this.players[player];
    for (const source of INPUT_SOURCES) {
      if (state.held[source].has(action)) return true;
    }
    return false;
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (this.captureInterceptor?.(event)) {
      event.preventDefault();
      return;
    }
    const handled = this.applyKey(event.code, true, event.repeat);
    if (handled) event.preventDefault();
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    if (this.captureInterceptor !== null) return;
    const handled = this.applyKey(event.code, false, false);
    if (handled) event.preventDefault();
  };

  private applyKey(code: string, active: boolean, repeat: boolean): boolean {
    let handled = false;
    for (const player of [0, 1] as const) {
      const actions = keyboardActionsForPlayer(player, code);
      if (actions.length === 0) continue;
      handled = true;
      for (const action of actions) {
        this.setSourceAction('keyboard', player, action, active, !repeat);
      }
    }
    return handled;
  }

  private handleVisibility = (): void => {
    if (globalThis.document?.hidden) this.clear();
  };
}

export const inputManager = new InputManager();
