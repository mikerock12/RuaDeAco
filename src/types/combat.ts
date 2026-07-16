export type FighterId =
  | 'rafa-mare'
  | 'guto-barba'
  | 'noir-reflexo'
  | 'astro-riso'
  | 'dante-sinal'
  | 'leo-violeta';

export type FighterState =
  | 'idle'
  | 'walkForward'
  | 'walkBackward'
  | 'jump'
  | 'fall'
  | 'landing'
  | 'crouch'
  | 'blockStanding'
  | 'blockCrouching'
  | 'lightAttack'
  | 'heavyAttack'
  | 'kickAttack'
  | 'specialAttack'
  | 'hitStun'
  | 'knockdown'
  | 'wakeUp'
  | 'grabbedFront'
  | 'grabbedLifted'
  | 'thrown'
  | 'frozen'
  | 'victory'
  | 'knockout';

/** Estados visuais genéricos da vítima; pertencem ao lutador agarrado, não ao atacante. */
export type GrabVictimState = Extract<
  FighterState,
  'grabbedFront' | 'grabbedLifted' | 'thrown' | 'frozen'
>;

export type HeldVictimState = Exclude<GrabVictimState, 'thrown'>;

export type InputAction =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'light'
  | 'heavy'
  | 'special'
  | 'block'
  | 'pause'
  | 'confirm'
  | 'cancel';

export type CombatButton = 'light' | 'heavy' | 'special' | 'block';
export type DirectionToken = 'neutral' | 'down' | 'downForward' | 'downBack' | 'forward' | 'back' | 'up';
export type HitLevel = 'high' | 'mid' | 'low' | 'overhead';
export type HitKind = 'strike' | 'throw' | 'projectile';

export interface InputFrame {
  readonly held: ReadonlySet<InputAction>;
  readonly pressed: ReadonlySet<InputAction>;
  readonly released: ReadonlySet<InputAction>;
}

export interface InputCommand {
  readonly directions?: readonly DirectionToken[];
  readonly buttons: readonly CombatButton[];
  readonly maxGapFrames: number;
  readonly bufferFrames: number;
  readonly priority: number;
}

export interface FrameRange {
  readonly from: number;
  readonly to: number;
}

export interface LocalRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface HitboxDefinition extends LocalRect {
  readonly id: string;
  readonly kind: HitKind;
  readonly level: HitLevel;
  readonly damage: number;
  readonly chipDamage: number;
  readonly hitStun: number;
  readonly blockStun: number;
  readonly hitStop: number;
  readonly priority: number;
  readonly knockbackX: number;
  readonly knockbackY: number;
  readonly knockdown?: boolean;
  readonly freezeFrames?: number;
}

export interface HurtboxDefinition extends LocalRect {
  readonly region: 'head' | 'body' | 'legs';
}

export interface TimedHitbox {
  readonly range: FrameRange;
  readonly boxes: readonly HitboxDefinition[];
}

export interface TimedHurtbox {
  readonly range: FrameRange;
  readonly boxes: readonly HurtboxDefinition[];
}

export interface MovementFrame {
  readonly range: FrameRange;
  readonly velocityX: number;
  readonly velocityY?: number;
}

/** Transformação base da vítima, relativa à origem e direção do atacante. */
export interface GrabVictimTransform {
  readonly victimAnchorX: number;
  readonly victimAnchorY: number;
  /** Rotação em radianos; o sinal acompanha a direção do atacante. */
  readonly victimRotation: number;
  readonly victimScale: number;
}

/**
 * Ajuste aditivo por personagem. `scaleMultiplier` é multiplicativo para
 * permitir pequenas correções de proporção sem criar sprites do oponente no atacante.
 */
export interface GrabVictimOffset {
  readonly anchorOffsetX?: number;
  readonly anchorOffsetY?: number;
  readonly rotationOffset?: number;
  readonly scaleMultiplier?: number;
}

/** Pose/âncora opcional para um trecho específico da animação do atacante. */
export interface GrabVictimPhase {
  readonly range: FrameRange;
  readonly state: HeldVictimState;
  readonly victimAnchorX?: number;
  readonly victimAnchorY?: number;
  readonly victimRotation?: number;
  readonly victimScale?: number;
}

/**
 * Contrato genérico de agarrão. O atacante fornece apenas timing e âncoras;
 * a vítima continua uma entidade separada e usa suas próprias animações.
 */
export interface GrabDefinition extends GrabVictimTransform {
  readonly holdStartFrame: number;
  readonly releaseFrame: number;
  readonly throwVelocityX: number;
  readonly throwVelocityY: number;
  readonly victimPhases?: readonly GrabVictimPhase[];
  readonly victimOffsets?: Partial<Readonly<Record<FighterId, GrabVictimOffset>>>;
}

export type MoveEvent =
  | { readonly frame: number; readonly type: 'spawnProjectile'; readonly projectileId: string }
  | { readonly frame: number; readonly type: 'grantArmor'; readonly hits: number }
  | { readonly frame: number; readonly type: 'clearArmor' }
  | { readonly frame: number; readonly type: 'grantBuff'; readonly durationFrames: number }
  | { readonly frame: number; readonly type: 'throw'; readonly range: number; readonly damage: number; readonly cinematic?: boolean };

export interface CancelWindow {
  readonly range: FrameRange;
  readonly into: readonly string[];
  readonly condition: 'always' | 'hit' | 'block';
}

export interface MoveDefinition {
  readonly id: string;
  readonly label: string;
  readonly state: Extract<FighterState, 'lightAttack' | 'heavyAttack' | 'kickAttack' | 'specialAttack'>;
  readonly animation: string;
  readonly command: InputCommand;
  /** Golpe executável apenas no ar; a hitbox desliga ao aterrissar. */
  readonly air?: boolean;
  readonly jumpTrajectory?: 'neutral' | 'forward' | 'backward';
  readonly totalFrames: number;
  readonly hitboxes: readonly TimedHitbox[];
  readonly hurtboxes?: readonly TimedHurtbox[];
  readonly movement?: readonly MovementFrame[];
  readonly grab?: GrabDefinition;
  readonly events?: readonly MoveEvent[];
  readonly cancels?: readonly CancelWindow[];
  readonly meterCost: number;
  readonly meterGainOnHit: number;
  readonly meterGainOnBlock: number;
  readonly isSuper?: boolean;
  readonly cinematic?: 'rush' | 'freeze';
  readonly lockFacing?: boolean;
}

export interface AnimationDefinition {
  readonly key: string;
  readonly frames: number;
  readonly frameDuration: number;
  readonly loop: boolean;
}

export interface FighterStats {
  readonly maxHealth: number;
  readonly walkSpeed: number;
  readonly backwardSpeed: number;
  readonly jumpSpeed: number;
  /** Impulso horizontal do pulo diagonal, fixado na decolagem. */
  readonly jumpForwardSpeed: number;
  readonly jumpBackwardSpeed: number;
  readonly gravity: number;
  readonly weight: number;
  readonly pushbox: LocalRect;
}

export interface FighterPassiveDefinition {
  readonly id: string;
  readonly label: string;
  readonly damageThreshold: number;
  readonly durationFrames: number;
  readonly speedMultiplier: number;
}

export interface FighterVisualDefinition {
  readonly body: number;
  readonly accent: number;
  readonly shadow: number;
  readonly skin: number;
}

export interface ProjectileDefinition {
  readonly id: string;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly velocityX: number;
  readonly lifeFrames: number;
  readonly hitbox: HitboxDefinition;
}

export interface FighterDefinition {
  readonly id: FighterId;
  readonly name: string;
  readonly archetype: string;
  readonly available: boolean;
  readonly description: string;
  readonly abilities: readonly [string, string, string];
  readonly stats: FighterStats;
  readonly standingHurtboxes: readonly HurtboxDefinition[];
  readonly crouchingHurtboxes: readonly HurtboxDefinition[];
  readonly moves: Readonly<Record<string, MoveDefinition>>;
  readonly projectiles?: Readonly<Record<string, ProjectileDefinition>>;
  readonly animations: readonly AnimationDefinition[];
  readonly passive?: FighterPassiveDefinition;
  readonly visual: FighterVisualDefinition;
}

export interface WorldRect extends LocalRect {
  readonly ownerId: FighterId;
}

export interface CombatEvent {
  readonly type:
    | 'hit'
    | 'blocked'
    | 'special'
    | 'roundStart'
    | 'fight'
    | 'knockout'
    | 'roundEnd'
    | 'matchEnd'
    | 'passive';
  readonly frame: number;
  readonly attacker?: FighterId;
  readonly defender?: FighterId;
  readonly value?: number;
  readonly text?: string;
  readonly moveId?: string;
  readonly isSuper?: boolean;
  readonly cinematic?: 'rush' | 'freeze';
}
