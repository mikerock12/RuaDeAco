import type { InputAction } from '../types/combat';

/** Converte a posição normalizada dentro do direcional em ações, incluindo diagonais. */
export function touchDpadActions(normalizedX: number, normalizedY: number): ReadonlySet<InputAction> {
  const actions = new Set<InputAction>();
  // Removido o limite de 'outside' para que o dedo possa deslizar livremente pelo direcional sem perder o input
  if (normalizedX < -0.2) actions.add('left');
  if (normalizedX > 0.2) actions.add('right');
  if (normalizedY < -0.2) actions.add('up');
  if (normalizedY > 0.2) actions.add('down');
  return actions;
}
