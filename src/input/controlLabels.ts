import type { CombatButton } from '../types/combat';
import type { CombatActionId, GamepadProfile, KeyboardProfile } from './controlsStore';

export type GamepadFamily = 'xbox' | 'playstation' | 'nintendo' | 'generic';

/** Nomes curtos e pixel-safe (ASCII) para as ações de combate. */
export const COMBAT_ACTION_LABELS: Readonly<Record<CombatActionId, string>> = {
  left: 'ESQUERDA',
  right: 'DIREITA',
  up: 'PULO',
  down: 'AGACHAR',
  light: 'FRACO',
  heavy: 'FORTE',
  special: 'ESPECIAL',
  block: 'DEFESA',
};

const KEY_CODE_LABELS: Readonly<Record<string, string>> = {
  ArrowLeft: 'ESQ',
  ArrowRight: 'DIR',
  ArrowUp: 'CIMA',
  ArrowDown: 'BAIXO',
  Space: 'ESPACO',
  ShiftLeft: 'SHIFT E',
  ShiftRight: 'SHIFT D',
  ControlLeft: 'CTRL E',
  ControlRight: 'CTRL D',
  AltLeft: 'ALT E',
  AltRight: 'ALT D',
  Tab: 'TAB',
  Backspace: 'APAGAR',
  CapsLock: 'CAPS',
  Semicolon: 'PT-VIRG',
  Quote: 'ASPAS',
  Comma: 'VIRGULA',
  Period: 'PONTO',
  Slash: 'BARRA',
  Backslash: 'B-INV',
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Backquote: 'CRASE',
};

/** Converte um KeyboardEvent.code em rótulo curto para a fonte pixel. */
export function keyLabel(code: string): string {
  const known = KEY_CODE_LABELS[code];
  if (known) return known;
  if (code.startsWith('Key')) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6).toUpperCase();
  if (/^F\d{1,2}$/.test(code)) return code;
  return code.toUpperCase().slice(0, 8);
}

/** Detecta a família apenas para apresentação de rótulos; nunca para lógica. */
export function detectGamepadFamily(id: string): GamepadFamily {
  const value = id.toLowerCase();
  if (/xbox|xinput|045e/.test(value)) return 'xbox';
  if (/playstation|dualshock|dualsense|sony|054c/.test(value)) return 'playstation';
  if (/nintendo|switch|joy-con|pro controller|057e/.test(value)) return 'nintendo';
  return 'generic';
}

const FAMILY_BUTTON_LABELS: Readonly<Record<GamepadFamily, Readonly<Record<number, string>>>> = {
  xbox: {
    0: 'A', 1: 'B', 2: 'X', 3: 'Y',
    4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
    8: 'BACK', 9: 'START', 10: 'LS', 11: 'RS',
    12: 'CIMA', 13: 'BAIXO', 14: 'ESQ', 15: 'DIR',
  },
  playstation: {
    0: 'CRUZ', 1: 'BOLA', 2: 'QUADRADO', 3: 'TRIANGULO',
    4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2',
    8: 'SHARE', 9: 'OPTIONS', 10: 'L3', 11: 'R3',
    12: 'CIMA', 13: 'BAIXO', 14: 'ESQ', 15: 'DIR',
  },
  nintendo: {
    0: 'B', 1: 'A', 2: 'Y', 3: 'X',
    4: 'L', 5: 'R', 6: 'ZL', 7: 'ZR',
    8: 'MENOS', 9: 'MAIS', 10: 'LS', 11: 'RS',
    12: 'CIMA', 13: 'BAIXO', 14: 'ESQ', 15: 'DIR',
  },
  generic: {
    12: 'CIMA', 13: 'BAIXO', 14: 'ESQ', 15: 'DIR',
  },
};

/** Rótulo de um botão de gamepad conforme a família detectada; famílias não
 * reconhecidas usam rótulos seguros B0..Bn. */
export function gamepadButtonLabel(family: GamepadFamily, index: number): string {
  return FAMILY_BUTTON_LABELS[family][index] ?? 'B' + index;
}

/** Rótulo visual dos botões touch: o glifo acompanha a ação, de modo que a
 * legenda "A = FRACO" continue verdadeira após o remapeamento. */
export const TOUCH_BUTTON_GLYPHS: Readonly<Record<CombatButton, string>> = {
  light: 'A',
  heavy: 'B',
  special: 'S',
  block: '▣',
};

/** Versão ASCII para a fonte pixel do jogo, que não possui o glifo ▣. */
export const TOUCH_BUTTON_PIXEL_LABELS: Readonly<Record<CombatButton, string>> = {
  light: 'A',
  heavy: 'B',
  special: 'S',
  block: 'ESCUDO',
};

export const TOUCH_BUTTON_ARIA: Readonly<Record<CombatButton, string>> = {
  light: 'Ataque fraco',
  heavy: 'Ataque forte',
  special: 'Especial',
  block: 'Defesa',
};

/** Resumo compacto das teclas de movimento (ex.: WASD, SETAS). */
export function movementKeysSummary(profile: KeyboardProfile): string {
  const { left, right, up, down } = profile.bindings;
  if (up === 'KeyW' && left === 'KeyA' && down === 'KeyS' && right === 'KeyD') return 'WASD';
  if ([left, right, up, down].every((code) => code.startsWith('Arrow'))) return 'SETAS';
  return [keyLabel(up), keyLabel(left), keyLabel(down), keyLabel(right)].join('/');
}

/** Linha de movimento para listas de comandos de teclado. */
export function keyboardMovementLine(profile: KeyboardProfile): string {
  const { left, right, up, down } = profile.bindings;
  return `${keyLabel(left)}/${keyLabel(right)} MOVER | ${keyLabel(up)} PULAR | ${keyLabel(down)} AGACHAR`;
}

/** Linha de botoes para listas de comandos de teclado. */
export function keyboardButtonsLine(profile: KeyboardProfile): string {
  const { light, heavy, special, block } = profile.bindings;
  return `${keyLabel(light)} FRACO | ${keyLabel(heavy)} FORTE | ${keyLabel(special)} ESP | ${keyLabel(block)} DEF`;
}

/** Linha de botoes para listas de comandos de gamepad. */
export function gamepadButtonsLine(profile: GamepadProfile, family: GamepadFamily): string {
  const label = (index: number): string => gamepadButtonLabel(family, index);
  const { light, heavy, special, block } = profile.bindings;
  return `${label(light)} FRACO | ${label(heavy)} FORTE | ${label(special)} ESP | ${label(block)} DEF`;
}
