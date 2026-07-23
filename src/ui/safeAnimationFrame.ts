/**
 * Fail-safe visual de índice de frame: nunca lança no loop de render.
 * Contrato e auditoria continuam falhando se o asset estiver incompleto;
 * em runtime publicado o jogo usa o índice mais próximo e registra uma vez.
 */

const loggedMissingFrames = new Set<string>();

export interface SafeFrameResolution {
  readonly index: number;
  readonly clamped: boolean;
  readonly available: number;
  readonly requested: number;
}

export function resolveSafeFrameIndex(
  requested: number,
  availableFrames: number,
): SafeFrameResolution {
  const available = Math.max(0, Math.floor(availableFrames));
  if (available <= 0) {
    return { index: 0, clamped: true, available: 0, requested };
  }
  const maxIndex = available - 1;
  if (!Number.isFinite(requested)) {
    return { index: 0, clamped: true, available, requested };
  }
  const rounded = Math.trunc(requested);
  if (rounded >= 0 && rounded <= maxIndex) {
    return { index: rounded, clamped: false, available, requested };
  }
  const index = Math.max(0, Math.min(rounded, maxIndex));
  return { index, clamped: true, available, requested };
}

/** Registra no máximo uma vez por combinação textura/índice solicitado. */
export function logMissingAnimationFrameOnce(
  animationKey: string,
  requested: number,
  available: number,
  used: number,
  log: (message: string) => void = console.error,
): void {
  const token = `${animationKey}:${requested}`;
  if (loggedMissingFrames.has(token)) return;
  loggedMissingFrames.add(token);
  log(
    `[Rua de Aço] Frame ${requested} ausente em ${animationKey} `
    + `(disponíveis 0-${Math.max(0, available - 1)}); usando ${used}`,
  );
}

/** Apenas para testes — limpa o conjunto de logs deduplicados. */
export function resetMissingAnimationFrameLogForTests(): void {
  loggedMissingFrames.clear();
}
