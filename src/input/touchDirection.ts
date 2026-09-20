import type { InputAction } from '../types/combat';

export const TOUCH_STICK_DEAD_ZONE = 0.12;

// Setores desiguais, porque andar é o gesto mais frequente e o mais castigado
// por um polegar torto. Com oito setores iguais bastavam 23° de desvio para o
// jogo somar `down` e o lutador agachar no lugar de andar. Agora o horizontal
// puro vai até 30°, a diagonal ocupa 30°–60° e continua confortável para os
// quartos de círculo. `up` exige 38°, porque um salto acidental custa mais caro
// que um agachamento acidental.
const DIAGONAL_SLOPE = 0.58;
const JUMP_SLOPE = 0.78;

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
  const verticalSlope = normalizedY < 0 ? JUMP_SLOPE : DIAGONAL_SLOPE;
  if (x > y * DIAGONAL_SLOPE) actions.add(normalizedX < 0 ? 'left' : 'right');
  if (y > x * verticalSlope) actions.add(normalizedY < 0 ? 'up' : 'down');
  return actions;
}
