import type { AnimatedSpriteSheetAsset, SpriteSheetAsset } from '../types/assets';
import type { FighterStats, MoveDefinition } from '../types/combat';

export interface SpriteSheetDimensions {
  readonly width: number;
  readonly height: number;
}

export interface SpriteSheetPreloadConfig {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly startFrame: number;
  readonly endFrame: number;
}

export function spriteSheetPreloadConfig(asset: SpriteSheetAsset): SpriteSheetPreloadConfig {
  return {
    frameWidth: asset.frameWidth,
    frameHeight: asset.frameHeight,
    startFrame: 0,
    endFrame: asset.frames - 1,
  };
}

/** Chave global separada da chave da textura para a AnimationManager do Phaser. */
export function phaserAnimationKey(textureKey: string): string {
  return `${textureKey}:animation`;
}

export function spriteSheetFrameIndex(
  asset: Pick<AnimatedSpriteSheetAsset, 'frameRate' | 'frames' | 'repeat'>,
  elapsedSimulationFrames: number,
  phaseFrames?: number,
): number {
  const elapsed = Math.max(0, Math.floor(elapsedSimulationFrames));
  if (phaseFrames !== undefined) {
    const duration = Math.max(1, Math.floor(phaseFrames));
    return Math.min(asset.frames - 1, Math.floor(elapsed * asset.frames / duration));
  }

  const ticksPerFrame = Math.max(1, Math.round(60 / asset.frameRate));
  const frame = Math.floor(elapsed / ticksPerFrame);
  return asset.repeat === -1 ? frame % asset.frames : Math.min(asset.frames - 1, frame);
}

function moveImpactRange(move: MoveDefinition): readonly [number, number] {
  const hitRanges = move.hitboxes
    .filter(({ boxes }) => boxes.length > 0)
    .map(({ range }) => range);
  if (hitRanges.length > 0) {
    return [
      Math.min(...hitRanges.map(({ from }) => from)),
      Math.max(...hitRanges.map(({ to }) => to)),
    ];
  }

  const cueFrames = move.events
    ?.filter(({ type }) =>
      type === 'spawnProjectile'
      || type === 'grantBuff'
      || type === 'grantDamageReduction'
      || type === 'throw')
    .map(({ frame }) => frame) ?? [];
  if (cueFrames.length > 0) return [Math.min(...cueFrames), Math.max(...cueFrames)];

  const midpoint = Math.floor(Math.max(0, move.totalFrames - 1) / 2);
  return [midpoint, midpoint];
}

/**
 * Quatro poses semânticas por golpe: startup, preparação, impacto e recuperação.
 * A janela ativa sempre usa o frame visual 2, independentemente do frameRate.
 */
export function moveAnimationFrameIndex(
  move: MoveDefinition,
  elapsedMoveFrames: number,
  spriteFrames = 4,
): number {
  const elapsed = Math.max(0, Math.min(move.totalFrames - 1, Math.floor(elapsedMoveFrames)));
  if (spriteFrames !== 4) {
    return Math.min(spriteFrames - 1, Math.floor(elapsed * spriteFrames / Math.max(1, move.totalFrames)));
  }

  const [activeFrom, activeTo] = moveImpactRange(move);
  if (elapsed >= activeFrom && elapsed <= activeTo) return 2;
  if (elapsed > activeTo) return 3;

  const preparationStart = Math.max(1, Math.floor(activeFrom / 2));
  return elapsed < preparationStart ? 0 : 1;
}

/** Estimativa determinística da metade ascendente/descendente do arco de pulo. */
export function jumpArcPhaseFrames(
  stats: Pick<FighterStats, 'jumpSpeed' | 'gravity'>,
): number {
  return Math.max(4, Math.ceil(Math.abs(stats.jumpSpeed) / Math.max(0.001, stats.gravity)));
}

/**
 * Valida o contrato adotado pelo projeto: uma única linha horizontal, sem
 * margem ou espaçamento e com exatamente a contagem declarada de quadros.
 */
export function spriteSheetContractErrors(
  asset: SpriteSheetAsset,
  dimensions: SpriteSheetDimensions,
): readonly string[] {
  const errors: string[] = [];

  if (!Number.isInteger(asset.frameWidth) || asset.frameWidth <= 0) {
    errors.push(`frameWidth inválido (${asset.frameWidth})`);
  }
  if (!Number.isInteger(asset.frameHeight) || asset.frameHeight <= 0) {
    errors.push(`frameHeight inválido (${asset.frameHeight})`);
  }
  if (!Number.isInteger(asset.frames) || asset.frames <= 0) {
    errors.push(`frames inválido (${asset.frames})`);
  }
  if (!Number.isInteger(dimensions.width) || dimensions.width <= 0) {
    errors.push(`largura total inválida (${dimensions.width})`);
  }
  if (!Number.isInteger(dimensions.height) || dimensions.height <= 0) {
    errors.push(`altura total inválida (${dimensions.height})`);
  }

  if (errors.length > 0) return errors;

  if (dimensions.height !== asset.frameHeight) {
    errors.push(`altura ${dimensions.height}, esperada ${asset.frameHeight} (uma linha horizontal)`);
  }
  if (dimensions.width % asset.frameWidth !== 0) {
    errors.push(`largura ${dimensions.width} não é divisível por frameWidth ${asset.frameWidth}`);
  }

  const expectedWidth = asset.frameWidth * asset.frames;
  if (dimensions.width !== expectedWidth) {
    errors.push(`largura ${dimensions.width}, esperada ${expectedWidth} para ${asset.frames} frames`);
  }

  return errors;
}

/**
 * Impede que uma spritesheet chegue ao AnimationManager do Phaser com tempo
 * indefinido. O tipo cobre o código compilado; esta validação cobre também
 * objetos montados dinamicamente ou dados corrompidos em runtime.
 */
export function animatedSpriteSheetContractErrors(
  asset: AnimatedSpriteSheetAsset,
): readonly string[] {
  const errors: string[] = [];

  if (!Number.isFinite(asset.frameRate) || asset.frameRate <= 0) {
    errors.push(`frameRate inválido (${String(asset.frameRate)})`);
  }
  if (!Number.isInteger(asset.repeat) || asset.repeat < -1) {
    errors.push(`repeat inválido (${String(asset.repeat)})`);
  }

  return errors;
}

export function isFlatFighterAssetPath(asset: Pick<SpriteSheetAsset, 'path'>, fighterId: string): boolean {
  const prefix = `assets/fighters/${fighterId}/`;
  if (!asset.path.startsWith(prefix)) return false;
  return !asset.path.slice(prefix.length).includes('/');
}

export function spriteSheetManifestErrors(assets: readonly SpriteSheetAsset[]): readonly string[] {
  const errors: string[] = [];
  const keys = new Set<string>();
  const paths = new Set<string>();

  for (const asset of assets) {
    if (keys.has(asset.key)) errors.push(`chave duplicada: ${asset.key}`);
    if (paths.has(asset.path)) errors.push(`caminho duplicado: ${asset.path}`);
    keys.add(asset.key);
    paths.add(asset.path);
  }

  return errors;
}
