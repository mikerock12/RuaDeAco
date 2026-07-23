export const FIGHTER_OPAQUE_BOTTOM_PADDING = {
  'rafa-mare': 6,
  'guto-barba': 6,
  'astro-riso': 6,
  'dante-sinal': 6,
} as const;

/**
 * Converte a raiz inferior do frame na coordenada do último pixel opaco.
 * Os valores acima foram medidos nos quatro frames de todas as animações
 * corporais; efeitos anexados não participam do contato com o piso.
 */
export function resolveVisualSoleY(
  logicalY: number,
  visualOffsetY: number,
  opaqueBottomPadding: number,
): number {
  return logicalY + visualOffsetY - opaqueBottomPadding;
}
