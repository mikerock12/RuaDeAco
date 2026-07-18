import type { CombatButton } from '../types/combat';

const STORAGE_KEY = 'rua-de-aco:controls:v1';

export type PlayerSlot = 0 | 1;
export type ControlDevice = 'keyboard' | 'touch' | 'gamepad';

/** Ações de combate remapeáveis. As ações de interface (confirmar, cancelar,
 * pausa e navegação) permanecem fixas: Enter/Escape no teclado e botões
 * 0/1 mais o botão de pausa configurável no gamepad. */
export type CombatActionId =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'light'
  | 'heavy'
  | 'special'
  | 'block';

export const COMBAT_ACTION_IDS: readonly CombatActionId[] = [
  'left',
  'right',
  'up',
  'down',
  'light',
  'heavy',
  'special',
  'block',
];

/** Teclas que a interface usa de forma fixa e que não podem ser capturadas. */
export const RESERVED_KEY_CODES: readonly string[] = ['Enter', 'Escape'];

export interface KeyboardProfile {
  readonly bindings: Readonly<Record<CombatActionId, string>>;
}

export interface GamepadProfile {
  readonly bindings: Readonly<Record<CombatActionId, number>>;
  readonly pause: number;
}

/** Posições visuais dos quatro botões de ação touch (cluster direito). */
export type TouchSlotId = 'nw' | 'ne' | 'sw' | 'se';

export const TOUCH_SLOT_IDS: readonly TouchSlotId[] = ['nw', 'ne', 'sw', 'se'];

export interface TouchProfile {
  readonly slots: Readonly<Record<TouchSlotId, CombatButton>>;
}

export interface ControlsConfig {
  readonly version: 1;
  readonly keyboard: readonly [KeyboardProfile, KeyboardProfile];
  readonly gamepad: readonly [GamepadProfile, GamepadProfile];
  readonly touch: TouchProfile;
}

export type BindingChangeResult =
  | { readonly ok: true; readonly swappedWith: CombatActionId | 'pause' | null }
  | { readonly ok: false; readonly reason: 'reserved' | 'other-player' | 'invalid' };

const DEFAULT_KEYBOARD_P1: KeyboardProfile = {
  bindings: {
    left: 'KeyA',
    right: 'KeyD',
    up: 'KeyW',
    down: 'KeyS',
    light: 'KeyF',
    heavy: 'KeyG',
    special: 'KeyH',
    block: 'KeyR',
  },
};

const DEFAULT_KEYBOARD_P2: KeyboardProfile = {
  bindings: {
    left: 'ArrowLeft',
    right: 'ArrowRight',
    up: 'ArrowUp',
    down: 'ArrowDown',
    light: 'KeyJ',
    heavy: 'KeyK',
    special: 'KeyL',
    block: 'KeyU',
  },
};

// Layout `standard` da Gamepad API: 0..3 face, 12..15 D-pad, 9 start.
const DEFAULT_GAMEPAD: GamepadProfile = {
  bindings: {
    left: 14,
    right: 15,
    up: 12,
    down: 13,
    light: 0,
    heavy: 1,
    special: 2,
    block: 3,
  },
  pause: 9,
};

// Posições atuais do cluster: B em cima à esquerda, A em cima à direita,
// S embaixo à esquerda e escudo embaixo à direita.
const DEFAULT_TOUCH: TouchProfile = {
  slots: {
    nw: 'heavy',
    ne: 'light',
    sw: 'special',
    se: 'block',
  },
};

export function defaultControls(): ControlsConfig {
  return {
    version: 1,
    keyboard: [cloneKeyboard(DEFAULT_KEYBOARD_P1), cloneKeyboard(DEFAULT_KEYBOARD_P2)],
    gamepad: [cloneGamepad(DEFAULT_GAMEPAD), cloneGamepad(DEFAULT_GAMEPAD)],
    touch: cloneTouch(DEFAULT_TOUCH),
  };
}

function cloneKeyboard(profile: KeyboardProfile): KeyboardProfile {
  return { bindings: { ...profile.bindings } };
}

function cloneGamepad(profile: GamepadProfile): GamepadProfile {
  return { bindings: { ...profile.bindings }, pause: profile.pause };
}

function cloneTouch(profile: TouchProfile): TouchProfile {
  return { slots: { ...profile.slots } };
}

function cloneConfig(config: ControlsConfig): ControlsConfig {
  return {
    version: 1,
    keyboard: [cloneKeyboard(config.keyboard[0]), cloneKeyboard(config.keyboard[1])],
    gamepad: [cloneGamepad(config.gamepad[0]), cloneGamepad(config.gamepad[1])],
    touch: cloneTouch(config.touch),
  };
}

function isValidKeyCode(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 32
    && !RESERVED_KEY_CODES.includes(value);
}

function isValidButtonIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 31;
}

function sanitizeKeyboardProfile(value: unknown, fallback: KeyboardProfile): KeyboardProfile {
  if (typeof value !== 'object' || value === null) return cloneKeyboard(fallback);
  const bindings = (value as { bindings?: unknown }).bindings;
  if (typeof bindings !== 'object' || bindings === null) return cloneKeyboard(fallback);
  const candidate = bindings as Record<string, unknown>;
  const result: Partial<Record<CombatActionId, string>> = {};
  const used = new Set<string>();
  for (const action of COMBAT_ACTION_IDS) {
    const code = candidate[action];
    if (!isValidKeyCode(code) || used.has(code)) return cloneKeyboard(fallback);
    used.add(code);
    result[action] = code;
  }
  return { bindings: result as Record<CombatActionId, string> };
}

function sanitizeGamepadProfile(value: unknown, fallback: GamepadProfile): GamepadProfile {
  if (typeof value !== 'object' || value === null) return cloneGamepad(fallback);
  const record = value as { bindings?: unknown; pause?: unknown };
  if (typeof record.bindings !== 'object' || record.bindings === null) return cloneGamepad(fallback);
  const candidate = record.bindings as Record<string, unknown>;
  const result: Partial<Record<CombatActionId, number>> = {};
  const used = new Set<number>();
  for (const action of COMBAT_ACTION_IDS) {
    const index = candidate[action];
    if (!isValidButtonIndex(index) || used.has(index)) return cloneGamepad(fallback);
    used.add(index);
    result[action] = index;
  }
  const pause = record.pause;
  if (!isValidButtonIndex(pause) || used.has(pause)) return cloneGamepad(fallback);
  return { bindings: result as Record<CombatActionId, number>, pause };
}

function sanitizeTouchProfile(value: unknown, fallback: TouchProfile): TouchProfile {
  if (typeof value !== 'object' || value === null) return cloneTouch(fallback);
  const slots = (value as { slots?: unknown }).slots;
  if (typeof slots !== 'object' || slots === null) return cloneTouch(fallback);
  const candidate = slots as Record<string, unknown>;
  const buttons: CombatButton[] = ['light', 'heavy', 'special', 'block'];
  const result: Partial<Record<TouchSlotId, CombatButton>> = {};
  const used = new Set<CombatButton>();
  for (const slot of TOUCH_SLOT_IDS) {
    const button = candidate[slot];
    if (typeof button !== 'string' || !buttons.includes(button as CombatButton)) {
      return cloneTouch(fallback);
    }
    if (used.has(button as CombatButton)) return cloneTouch(fallback);
    used.add(button as CombatButton);
    result[slot] = button as CombatButton;
  }
  return { slots: result as Record<TouchSlotId, CombatButton> };
}

export function sanitizeControls(value: unknown): ControlsConfig {
  const defaults = defaultControls();
  if (typeof value !== 'object' || value === null) return defaults;
  const candidate = value as {
    version?: unknown;
    keyboard?: unknown;
    gamepad?: unknown;
    touch?: unknown;
  };
  // Versão desconhecida: fallback conservador para o padrão completo.
  if (candidate.version !== 1) return defaults;
  const keyboard = Array.isArray(candidate.keyboard) ? candidate.keyboard : [];
  const gamepad = Array.isArray(candidate.gamepad) ? candidate.gamepad : [];
  return {
    version: 1,
    keyboard: [
      sanitizeKeyboardProfile(keyboard[0], DEFAULT_KEYBOARD_P1),
      sanitizeKeyboardProfile(keyboard[1], DEFAULT_KEYBOARD_P2),
    ],
    gamepad: [
      sanitizeGamepadProfile(gamepad[0], DEFAULT_GAMEPAD),
      sanitizeGamepadProfile(gamepad[1], DEFAULT_GAMEPAD),
    ],
    touch: sanitizeTouchProfile(candidate.touch, DEFAULT_TOUCH),
  };
}

export type ControlsListener = (config: ControlsConfig) => void;

export class ControlsStore {
  private value: ControlsConfig = defaultControls();
  private readonly listeners = new Set<ControlsListener>();

  load(): ControlsConfig {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      this.value = raw ? sanitizeControls(JSON.parse(raw) as unknown) : defaultControls();
    } catch {
      this.value = defaultControls();
    }
    this.notify();
    return this.get();
  }

  get(): ControlsConfig {
    return cloneConfig(this.value);
  }

  subscribe(listener: ControlsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Reatribui uma tecla do teclado. Conflitos dentro do mesmo perfil são
   * resolvidos por troca determinística; teclas reservadas ou usadas pelo
   * outro jogador são rejeitadas com motivo explícito. */
  setKeyboardBinding(player: PlayerSlot, action: CombatActionId, code: string): BindingChangeResult {
    if (typeof code !== 'string' || code.length === 0 || code.length > 32) {
      return { ok: false, reason: 'invalid' };
    }
    if (RESERVED_KEY_CODES.includes(code)) return { ok: false, reason: 'reserved' };

    const other = this.value.keyboard[player === 0 ? 1 : 0];
    if (Object.values(other.bindings).includes(code)) {
      return { ok: false, reason: 'other-player' };
    }

    const profile = { ...this.value.keyboard[player].bindings };
    let swappedWith: CombatActionId | null = null;
    for (const existing of COMBAT_ACTION_IDS) {
      if (existing !== action && profile[existing] === code) {
        swappedWith = existing;
        profile[existing] = profile[action];
      }
    }
    profile[action] = code;
    this.commitKeyboard(player, { bindings: profile });
    return { ok: true, swappedWith };
  }

  /** Reatribui um botão do gamepad (ações de combate ou pausa) com troca
   * determinística dentro do mesmo perfil. */
  setGamepadBinding(
    player: PlayerSlot,
    action: CombatActionId | 'pause',
    buttonIndex: number,
  ): BindingChangeResult {
    if (!isValidButtonIndex(buttonIndex)) return { ok: false, reason: 'invalid' };

    const current = this.value.gamepad[player];
    const bindings = { ...current.bindings };
    let pause = current.pause;
    const previous = action === 'pause' ? pause : bindings[action];
    let swappedWith: CombatActionId | 'pause' | null = null;

    for (const existing of COMBAT_ACTION_IDS) {
      if (existing !== action && bindings[existing] === buttonIndex) {
        swappedWith = existing;
        bindings[existing] = previous;
      }
    }
    if (action !== 'pause' && pause === buttonIndex) {
      swappedWith = 'pause';
      pause = previous;
    }

    if (action === 'pause') pause = buttonIndex;
    else bindings[action] = buttonIndex;

    this.commitGamepad(player, { bindings, pause });
    return { ok: true, swappedWith };
  }

  /** Define qual ação ocupa uma posição touch, trocando com a posição que
   * possuía a ação para manter as quatro ações sempre presentes. */
  setTouchSlot(slot: TouchSlotId, button: CombatButton): BindingChangeResult {
    const slots = { ...this.value.touch.slots };
    const currentButton = slots[slot];
    if (currentButton === button) return { ok: true, swappedWith: null };
    let swappedSlot: TouchSlotId | null = null;
    for (const other of TOUCH_SLOT_IDS) {
      if (slots[other] === button) {
        swappedSlot = other;
        slots[other] = currentButton;
      }
    }
    slots[slot] = button;
    this.commit({ ...this.value, touch: { slots } });
    return { ok: true, swappedWith: swappedSlot === null ? null : buttonAsAction(currentButton) };
  }

  resetKeyboard(player: PlayerSlot): void {
    this.commitKeyboard(player, cloneKeyboard(player === 0 ? DEFAULT_KEYBOARD_P1 : DEFAULT_KEYBOARD_P2));
  }

  resetGamepad(player: PlayerSlot): void {
    this.commitGamepad(player, cloneGamepad(DEFAULT_GAMEPAD));
  }

  resetTouch(): void {
    this.commit({ ...this.value, touch: cloneTouch(DEFAULT_TOUCH) });
  }

  resetProfile(device: ControlDevice, player: PlayerSlot): void {
    if (device === 'keyboard') this.resetKeyboard(player);
    else if (device === 'gamepad') this.resetGamepad(player);
    else this.resetTouch();
  }

  resetAll(): void {
    this.commit(defaultControls());
  }

  private commitKeyboard(player: PlayerSlot, profile: KeyboardProfile): void {
    const keyboard: [KeyboardProfile, KeyboardProfile] = [
      player === 0 ? profile : this.value.keyboard[0],
      player === 1 ? profile : this.value.keyboard[1],
    ];
    this.commit({ ...this.value, keyboard });
  }

  private commitGamepad(player: PlayerSlot, profile: GamepadProfile): void {
    const gamepad: [GamepadProfile, GamepadProfile] = [
      player === 0 ? profile : this.value.gamepad[0],
      player === 1 ? profile : this.value.gamepad[1],
    ];
    this.commit({ ...this.value, gamepad });
  }

  private commit(next: ControlsConfig): void {
    // Grava somente dados que sobrevivem à própria validação.
    this.value = sanitizeControls(next);
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.value));
    } catch {
      // Sem armazenamento disponível, os controles valem durante a sessão.
    }
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.get());
  }
}

function buttonAsAction(button: CombatButton): CombatActionId {
  return button;
}

export const controlsStore = new ControlsStore();
