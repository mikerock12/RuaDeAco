/**
 * Adiciona uma revisão de conteúdo sem mudar o caminho plano do manifest.
 * A query é indispensável durante upgrades: um service worker antigo não
 * encontra essa URL em seu cache e precisa buscar o PNG físico atual.
 */
export function fighterAssetUrl(path: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}v=${encodeURIComponent(__FIGHTER_ASSET_REVISION__)}`;
}

export function fighterAssetRevision(): string {
  return __FIGHTER_ASSET_REVISION__;
}
