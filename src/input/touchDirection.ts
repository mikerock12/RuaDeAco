import type { InputAction } from '../types/combat';

/** Posição relativa ao centro; -1 e +1 são as bordas do direcional. */
export function touchDpadActions(normalizedX: number, normalizedY: number): ReadonlySet<InputAction> {
  const actions = new Set<InputAction>();
  if (!Number.isFinite(normalizedX) || !Number.isFinite(normalizedY)) return actions;
  const x = Math.abs(normalizedX);
  const y = Math.abs(normalizedY);
  // Centro neutro e margem de arraste: sair muito da área solta o movimento.
  if (Math.hypot(x, y) < 0.22 || Math.max(x, y) > 1.45) return actions;
  // Oito setores de 45 graus evitam pulos por pequenos desvios ao andar.
  const diagonalSlope = Math.SQRT2 - 1;
  if (x > y * diagonalSlope) actions.add(normalizedX < 0 ? 'left' : 'right');
  if (y > x * diagonalSlope) actions.add(normalizedY < 0 ? 'up' : 'down');
  return actions;
}
