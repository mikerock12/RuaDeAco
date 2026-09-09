import type { InputAction } from '../types/combat';

export const TOUCH_STICK_DEAD_ZONE = 0.18;

/** Knob contínuo, limitado ao círculo; o centro da base permanece fixo. */
export function radialStickPosition(x: number, y: number): { x: number; y: number } {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
  const radius = Math.max(1, Math.hypot(x, y));
  return { x: x / radius, y: y / radius };
}

/** Converte o analógico em oito setores digitais, compatíveis com o combate. */
export function touchDpadActions(normalizedX: number, normalizedY: number): ReadonlySet<InputAction> {
  const actions = new Set<InputAction>();
  if (!Number.isFinite(normalizedX) || !Number.isFinite(normalizedY)) return actions;
  const x = Math.abs(normalizedX), y = Math.abs(normalizedY);
  if (Math.hypot(x, y) < TOUCH_STICK_DEAD_ZONE) return actions;
  // Captura mantém a direção além da base; soltar/cancelar sempre limpa o input.
  const diagonalSlope = Math.SQRT2 - 1;
  if (x > y * diagonalSlope) actions.add(normalizedX < 0 ? 'left' : 'right');
  if (y > x * diagonalSlope) actions.add(normalizedY < 0 ? 'up' : 'down');
  return actions;
}
