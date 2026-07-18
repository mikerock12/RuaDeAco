import type { FighterId, FrameRange, LocalRect } from './combat';

export interface AssetCrop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ImageAsset {
  readonly key: string;
  readonly path: string;
}

export interface PortraitAsset extends ImageAsset {
  readonly fighterId: FighterId;
  readonly hudCrop: AssetCrop;
  readonly framedCrop: AssetCrop;
}

export interface SpriteSheetAsset extends ImageAsset {
  readonly frameWidth: number;
  readonly frameHeight: number;
  /** Quantidade exata de quadros, dispostos da esquerda para a direita. */
  readonly frames: number;
  readonly layout: 'horizontal';
}

export interface AnimatedSpriteSheetAsset extends SpriteSheetAsset {
  readonly frameRate: number;
  readonly repeat: number;
}

export type SharedFighterAnimationId =
  | 'idle'
  | 'walk'
  | 'walkBackward'
  | 'jumpNeutral'
  | 'jumpForward'
  | 'jumpBackward'
  | 'fall'
  | 'landing'
  | 'crouch'
  | 'standingLight'
  | 'standingHeavy'
  | 'forwardLight'
  | 'forwardHeavy'
  | 'crouchLight'
  | 'crouchHeavy'
  | 'airLightNeutral'
  | 'airHeavyNeutral'
  | 'airLightForward'
  | 'airHeavyForward'
  | 'airLightBackward'
  | 'airHeavyBackward'
  | 'special1'
  | 'special2'
  | 'special3'
  | 'blockStanding'
  | 'blockCrouching'
  | 'hit'
  | 'knockdown'
  | 'wakeUp'
  | 'grabbedFront'
  | 'grabbedLifted'
  | 'thrown'
  | 'frozen'
  | 'knockout'
  | 'victory';

export type FighterAnimationId = SharedFighterAnimationId
  | 'special2Grab'
  | 'special2Hold'
  | 'special2Throw'
  | 'special2Recovery'
  | 'special3Grab'
  | 'special3Hold'
  | 'special3Freeze'
  | 'special3Finish';


export interface FighterAnimationAsset extends AnimatedSpriteSheetAsset {
  readonly id: FighterAnimationId;
}

export interface FighterEffectAsset extends AnimatedSpriteSheetAsset {
  readonly id: string;
  readonly moveId: string;
  readonly usage: 'attached' | 'projectile';
  readonly attachTo?: 'attacker' | 'victim';
  readonly activeRange?: FrameRange;
  readonly origin: Readonly<{ x: number; y: number }>;
  readonly offset: Readonly<{ x: number; y: number }>;
  readonly scale: number;
  /** Mapeamento determinístico da simulação para poses específicas do efeito. */
  readonly frameTimeline?: readonly FighterEffectFramePhase[];
}

export interface FighterEffectFramePhase {
  readonly range: FrameRange;
  readonly frame: number;
}

export interface FighterMoveAnimationPhase {
  readonly animation: FighterAnimationId;
  readonly range: FrameRange;
  /** Mantém uma pose específica durante trechos longos, como o gelo completo. */
  readonly explicitFrame?: number;
}

export interface FighterSpriteAsset {
  /** Todo lutador renderizável deve fornecer também os quatro estados de vítima compartilhados. */
  readonly fighterId: FighterId;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly origin: Readonly<{ x: number; y: number }>;
  readonly scale: number;
  readonly visualOffset: Readonly<{ x: number; y: number }>;
  readonly hitboxGuide: readonly LocalRect[];
  readonly hurtboxGuide: readonly LocalRect[];
  readonly animations: Readonly<
    Record<SharedFighterAnimationId, FighterAnimationAsset>
    & Partial<Record<FighterAnimationId, FighterAnimationAsset>>
  >;
  /** Efeitos continuam na pasta plana do lutador, mas em sprites separados do corpo. */
  readonly effects: readonly FighterEffectAsset[];
  readonly movePhases: Readonly<Record<string, readonly FighterMoveAnimationPhase[]>>;
}
