import type { FighterId, LocalRect } from './combat';

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

export type FighterAnimationId =
  | 'idle'
  | 'walk'
  | 'jumpNeutral'
  | 'jumpForward'
  | 'jumpBackward'
  | 'fall'
  | 'landing'
  | 'crouch'
  | 'standingLight'
  | 'standingHeavy'
  | 'crouchLight'
  | 'crouchHeavy'
  | 'airLightNeutral'
  | 'airHeavyNeutral'
  | 'airLightForward'
  | 'airHeavyForward'
  | 'airLightBackward'
  | 'airHeavyBackward'
  | 'special'
  | 'hit'
  | 'knockdown'
  | 'victory';


export interface FighterAnimationAsset extends ImageAsset {
  readonly id: FighterAnimationId;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly frames: number;
  readonly frameRate: number;
  readonly repeat: number;
}

export interface FighterSpriteAsset {
  readonly fighterId: Extract<FighterId, 'rafa-mare' | 'guto-barba'>;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly origin: Readonly<{ x: number; y: number }>;
  readonly scale: number;
  readonly visualOffset: Readonly<{ x: number; y: number }>;
  readonly hitboxGuide: readonly LocalRect[];
  readonly hurtboxGuide: readonly LocalRect[];
  readonly animations: Readonly<Record<FighterAnimationId, FighterAnimationAsset>>;
}

export interface SpriteSheetAsset extends ImageAsset {
  readonly frameWidth: number;
  readonly frameHeight: number;
}
