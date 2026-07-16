import type { InputAction, InputFrame } from '../types/combat';
import type { GameSettings } from '../types/game';

export type PlayerIndex = 0 | 1;

const EMPTY_SET = (): Set<InputAction> => new Set<InputAction>();

export const PLAYER_ONE_KEYS: Readonly<Record<string, readonly InputAction[]>> = {
  KeyA: ['left'],
  KeyD: ['right'],
  KeyW: ['up'],
  KeyS: ['down'],
  KeyF: ['light'],
  KeyG: ['heavy'],
  KeyH: ['special'],
  KeyR: ['block'],
  Enter: ['confirm'],
  Escape: ['pause', 'cancel'],
};

export const PLAYER_TWO_KEYS: Readonly<Record<string, readonly InputAction[]>> = {
  ArrowLeft: ['left'],
  ArrowRight: ['right'],
  ArrowUp: ['up'],
  ArrowDown: ['down'],
  KeyJ: ['light'],
  KeyK: ['heavy'],
  KeyL: ['special'],
  KeyU: ['block'],
};

const PLAYER_KEY_BINDINGS = [PLAYER_ONE_KEYS, PLAYER_TWO_KEYS] as const;

export function keyboardActionsForPlayer(player: PlayerIndex, code: string): readonly InputAction[] {
  return PLAYER_KEY_BINDINGS[player][code] ?? [];
}

export class InputManager {
  private readonly held: [Set<InputAction>, Set<InputAction>] = [EMPTY_SET(), EMPTY_SET()];
  private readonly pressed: [Set<InputAction>, Set<InputAction>] = [EMPTY_SET(), EMPTY_SET()];
  private readonly released: [Set<InputAction>, Set<InputAction>] = [EMPTY_SET(), EMPTY_SET()];
  private readonly touchHeld = EMPTY_SET();
  private readonly touchPressed = EMPTY_SET();
  private readonly touchReleased = EMPTY_SET();
  private attached = false;

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    globalThis.window?.addEventListener('keydown', this.handleKeyDown, { passive: false });
    globalThis.window?.addEventListener('keyup', this.handleKeyUp, { passive: false });
    globalThis.window?.addEventListener('blur', this.clear);
    globalThis.document?.addEventListener('visibilitychange', this.handleVisibility);
  }

  sample(player: PlayerIndex): InputFrame {
    const held = new Set(this.held[player]);
    const pressed = new Set(this.pressed[player]);
    const released = new Set(this.released[player]);
    if (player === 0) {
      for (const action of this.touchHeld) held.add(action);
      for (const action of this.touchPressed) pressed.add(action);
      for (const action of this.touchReleased) released.add(action);
      this.touchPressed.clear();
      this.touchReleased.clear();
    }
    this.pressed[player].clear();
    this.released[player].clear();
    return { held, pressed, released };
  }

  peekHeld(player: PlayerIndex, action: InputAction): boolean {
    return this.held[player].has(action) || player === 0 && this.touchHeld.has(action);
  }

  setTouchAction(action: InputAction, active: boolean): void {
    if (active && !this.touchHeld.has(action)) {
      this.touchHeld.add(action);
      this.touchPressed.add(action);
      this.touchReleased.delete(action);
    } else if (!active && this.touchHeld.delete(action)) {
      this.touchReleased.add(action);
    }
  }

  clear = (): void => {
    for (const player of [0, 1] as const) {
      for (const action of this.held[player]) this.released[player].add(action);
      this.held[player].clear();
      this.pressed[player].clear();
    }
    for (const action of this.touchHeld) this.touchReleased.add(action);
    this.touchHeld.clear();
    this.touchPressed.clear();
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

  static isTouchCapable(): boolean {
    return (globalThis.navigator?.maxTouchPoints ?? 0) > 0
      || globalThis.matchMedia?.('(pointer: coarse)').matches === true;
  }

  static shouldShowTouch(settings: GameSettings): boolean {
    return settings.touchControls === 'on'
      || settings.touchControls === 'auto' && InputManager.isTouchCapable();
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const handled = this.applyKey(event.code, true, event.repeat);
    if (handled) event.preventDefault();
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
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
        if (active && !this.held[player].has(action)) {
          this.held[player].add(action);
          if (!repeat) this.pressed[player].add(action);
        } else if (!active && this.held[player].delete(action)) {
          this.released[player].add(action);
        }
      }
    }
    return handled;
  }

  private handleVisibility = (): void => {
    if (globalThis.document?.hidden) this.clear();
  };
}

export const inputManager = new InputManager();
