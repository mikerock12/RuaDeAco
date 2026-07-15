import { GROUND_Y, MAX_METER, STAGE_LEFT, STAGE_RIGHT } from '../config/gameConfig';
import type {
  DirectionToken,
  FighterDefinition,
  FighterId,
  FighterState,
  HitboxDefinition,
  HurtboxDefinition,
  InputFrame,
  MoveDefinition,
  MoveEvent,
} from '../types/combat';
import { applyDamageToHealth, applyEnergy, calculateDamage, calculateHitStun } from './calculations';
import { CommandBuffer } from './CommandBuffer';

const EMPTY_INPUT: InputFrame = {
  held: new Set(),
  pressed: new Set(),
  released: new Set(),
};

export interface AppliedHit {
  readonly damage: number;
  readonly blocked: boolean;
  readonly armored: boolean;
  readonly knockout: boolean;
  readonly passiveActivated: boolean;
}

export interface FighterSnapshot {
  readonly id: FighterId;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly previousX: number;
  readonly previousY: number;
  readonly facing: 1 | -1;
  readonly state: FighterState;
  readonly stateFrame: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly meter: number;
  readonly armorHits: number;
  readonly passiveFrames: number;
  readonly freezeEffectFrames: number;
  readonly activeMoveId: string | null;
}

export class FighterRuntime {
  readonly id: FighterId;
  readonly definition: FighterDefinition;
  x: number;
  y = GROUND_Y;
  previousX: number;
  previousY = GROUND_Y;
  velocityX = 0;
  velocityY = 0;
  facing: 1 | -1;
  state: FighterState = 'idle';
  stateFrame = 0;
  health: number;
  meter = 0;
  roundWins = 0;
  armorHits = 0;
  invulnerableFrames = 0;
  passiveFrames = 0;
  freezeEffectFrames = 0;
  /** Último golpe iniciado (inspeção/debug). */
  lastMoveId: string | null = null;

  private input: InputFrame = EMPTY_INPUT;
  private readonly commandBuffer = new CommandBuffer();
  private activeMove: MoveDefinition | null = null;
  private attackInstance = 0;
  private readonly registeredHits = new Set<string>();
  private readonly emittedEvents = new Set<number>();
  private hitStopFrames = 0;
  private hitStunFrames = 0;
  private blockStunFrames = 0;
  private knockdownPending = false;
  // Impulso horizontal do pulo, fixado na decolagem (sem controle aéreo).
  private airDriftX = 0;
  private damageTowardPassive = 0;
  private frozen = false;
  private moveConnected: 'none' | 'hit' | 'block' = 'none';

  constructor(definition: FighterDefinition, startX: number, facing: 1 | -1) {
    this.definition = definition;
    this.id = definition.id;
    this.x = startX;
    this.previousX = startX;
    this.facing = facing;
    this.health = definition.stats.maxHealth;
  }

  beginFrame(input: InputFrame, simulationFrame: number, opponentX: number): void {
    this.previousX = this.x;
    this.previousY = this.y;
    this.input = input;
    this.commandBuffer.push(simulationFrame, input, this.facing);
    this.invulnerableFrames = Math.max(0, this.invulnerableFrames - 1);
    this.passiveFrames = Math.max(0, this.passiveFrames - 1);
    this.freezeEffectFrames = Math.max(0, this.freezeEffectFrames - 1);

    if (this.hitStopFrames > 0) {
      this.hitStopFrames -= 1;
      this.frozen = true;
      return;
    }
    this.frozen = false;

    if (this.state === 'knockout' || this.state === 'victory') return;

    if (this.state === 'hitStun') {
      this.x += this.velocityX;
      this.velocityX *= 0.88;
      this.updateVertical();
      return;
    }

    if (this.state === 'knockdown' || this.state === 'wakeUp') return;

    if (this.blockStunFrames > 0) {
      this.transition(input.held.has('down') ? 'blockCrouching' : 'blockStanding');
      this.x += this.velocityX;
      this.velocityX *= 0.82;
      return;
    }

    if (this.activeMove) {
      const cancelWindow = this.activeMove.cancels?.find(({ range, condition }) =>
        this.stateFrame >= range.from
        && this.stateFrame <= range.to
        && (condition === 'always' || condition === this.moveConnected),
      );
      if (cancelWindow) {
        const cancelMove = this.commandBuffer.findMove(this.definition.moves, input, simulationFrame, this.meter);
        if (cancelMove && cancelWindow.into.includes(cancelMove.id)) {
          this.startMove(cancelMove);
          return;
        }
      }
      this.applyMoveMotion(this.activeMove);
      return;
    }

    if (this.y < GROUND_Y) {
      const airMove = this.commandBuffer.findMove(this.definition.moves, input, simulationFrame, this.meter, true);
      if (airMove) {
        this.startMove(airMove);
        this.applyMoveMotion(airMove);
        return;
      }
      this.x += this.airDriftX * this.speedMultiplier;
      this.updateVertical();
      if (this.y >= GROUND_Y) {
        this.airDriftX = 0;
        this.transition('idle');
      } else {
        this.state = this.velocityY < 0 ? 'jump' : 'fall';
      }
      return;
    }

    const requestedMove = this.commandBuffer.findMove(this.definition.moves, input, simulationFrame, this.meter);
    if (!input.held.has('block') && requestedMove) {
      this.startMove(requestedMove);
      return;
    }

    if (input.held.has('block')) {
      this.transition(input.held.has('down') ? 'blockCrouching' : 'blockStanding');
      return;
    }

    if (input.held.has('down')) {
      this.transition('crouch');
      return;
    }

    if (input.pressed.has('up')) {
      const horizontal = Number(input.held.has('right')) - Number(input.held.has('left'));
      const movingForward = horizontal === this.facing;
      const jumpDrift = movingForward
        ? this.definition.stats.jumpForwardSpeed
        : this.definition.stats.jumpBackwardSpeed;
      this.airDriftX = horizontal * jumpDrift;
      this.velocityY = -this.definition.stats.jumpSpeed;
      this.transition('jump');
      // Integra já neste frame: sem isso y continua em GROUND_Y e o
      // próximo beginFrame trata o lutador como se estivesse no chão,
      // cancelando o salto para idle/walk.
      this.updateVertical();
      return;
    }

    const horizontal = Number(input.held.has('right')) - Number(input.held.has('left'));
    if (horizontal === 0) {
      this.transition('idle');
      return;
    }

    const movingForward = horizontal === this.facing;
    const speed = movingForward ? this.definition.stats.walkSpeed : this.definition.stats.backwardSpeed;
    this.x += horizontal * speed * this.speedMultiplier;
    this.transition(movingForward ? 'walkForward' : 'walkBackward');

    if (!this.activeMove && opponentX !== this.x) {
      this.facing = opponentX > this.x ? 1 : -1;
    }
  }

  finishFrame(): void {
    this.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, this.x));
    if (this.frozen || this.state === 'knockout' || this.state === 'victory') return;

    if (this.state === 'hitStun') {
      this.hitStunFrames = Math.max(0, this.hitStunFrames - 1);
      this.stateFrame += 1;
      if (this.hitStunFrames === 0) {
        if (this.knockdownPending) {
          this.y = GROUND_Y;
          this.velocityY = 0;
          this.transition('knockdown');
        } else {
          this.transition(this.y < GROUND_Y ? 'fall' : 'idle');
        }
      }
      return;
    }

    if (this.blockStunFrames > 0) {
      this.blockStunFrames -= 1;
      this.stateFrame += 1;
      if (this.blockStunFrames === 0) this.transition('idle');
      return;
    }

    if (this.state === 'knockdown') {
      this.stateFrame += 1;
      if (this.stateFrame >= 42) {
        this.invulnerableFrames = 23;
        this.transition('wakeUp');
      }
      return;
    }

    if (this.state === 'wakeUp') {
      this.stateFrame += 1;
      if (this.stateFrame >= 22) this.transition('idle');
      return;
    }

    if (this.activeMove) {
      this.stateFrame += 1;
      if (this.stateFrame >= this.activeMove.totalFrames) {
        this.activeMove = null;
        this.armorHits = 0;
        this.transition(this.y < GROUND_Y ? 'fall' : 'idle');
      }
      return;
    }

    this.stateFrame += 1;
  }

  consumeMoveEvents(): readonly MoveEvent[] {
    if (!this.activeMove || this.frozen) return [];
    const events = this.activeMove.events?.filter((event) => event.frame === this.stateFrame && !this.emittedEvents.has(event.frame)) ?? [];
    for (const event of events) {
      this.emittedEvents.add(event.frame);
      if (event.type === 'grantArmor') this.armorHits = event.hits;
      if (event.type === 'clearArmor') this.armorHits = 0;
      if (event.type === 'grantBuff') this.passiveFrames = event.durationFrames;
    }
    return events;
  }

  getActiveHitboxes(): readonly HitboxDefinition[] {
    if (!this.activeMove) return [];
    if (this.activeMove.air && this.y >= GROUND_Y) return [];
    const timed = this.activeMove.hitboxes.find(({ range }) => this.stateFrame >= range.from && this.stateFrame <= range.to);
    return timed?.boxes ?? [];
  }

  getHurtboxes(): readonly HurtboxDefinition[] {
    if (this.invulnerableFrames > 0 || this.state === 'knockdown' || this.state === 'knockout') return [];
    const timed = this.activeMove?.hurtboxes?.find(({ range }) => this.stateFrame >= range.from && this.stateFrame <= range.to);
    if (timed) return timed.boxes;
    const crouching = this.state === 'crouch' || this.state === 'blockCrouching';
    return crouching ? this.definition.crouchingHurtboxes : this.definition.standingHurtboxes;
  }

  canRegisterHit(hitboxId: string, targetId: FighterId): boolean {
    return !this.registeredHits.has(this.attackInstance + ':' + hitboxId + ':' + targetId);
  }

  registerHit(hitboxId: string, targetId: FighterId, outcome: 'hit' | 'block'): void {
    this.registeredHits.add(this.attackInstance + ':' + hitboxId + ':' + targetId);
    this.moveConnected = outcome;
  }

  isBlocking(level: HitboxDefinition['level'], kind: HitboxDefinition['kind']): boolean {
    if (kind === 'throw') return false;
    const guarding = this.state === 'blockStanding'
      || this.state === 'blockCrouching'
      || this.blockStunFrames > 0;
    if (!guarding || this.activeMove !== null) return false;
    const crouching = this.state === 'blockCrouching';
    if (level === 'overhead') return !crouching;
    if (level === 'low') return crouching;
    return true;
  }

  applyHit(
    hitbox: HitboxDefinition,
    attackerFacing: 1 | -1,
    blocked: boolean,
    comboHits: number,
    infiniteHealth: boolean,
  ): AppliedHit {
    if (this.armorHits > 0 && hitbox.kind !== 'throw') {
      this.armorHits -= 1;
      this.hitStopFrames = Math.max(this.hitStopFrames, hitbox.hitStop);
      return { damage: 0, blocked: false, armored: true, knockout: false, passiveActivated: false };
    }

    const damage = calculateDamage({
      baseDamage: hitbox.damage,
      chipDamage: hitbox.chipDamage,
      blocked,
      comboHits,
    });
    if (!infiniteHealth) this.health = applyDamageToHealth(this.health, damage);
    let passiveActivated = false;
    if (!blocked && damage > 0 && this.definition.passive) {
      this.damageTowardPassive += damage;
      if (this.damageTowardPassive >= this.definition.passive.damageThreshold) {
        this.damageTowardPassive = 0;
        this.passiveFrames = this.definition.passive.durationFrames;
        passiveActivated = true;
      }
    }

    this.hitStopFrames = Math.max(this.hitStopFrames, hitbox.hitStop);
    if (blocked) {
      this.blockStunFrames = hitbox.blockStun;
      this.transition(this.input.held.has('down') ? 'blockCrouching' : 'blockStanding');
      this.velocityX = attackerFacing * hitbox.knockbackX * 0.35;
    } else {
      const counterHit = this.isAttacking;
      this.activeMove = null;
      this.armorHits = 0;
      this.hitStunFrames = calculateHitStun(hitbox.hitStun, counterHit, comboHits);
      this.knockdownPending = Boolean(hitbox.knockdown);
      this.freezeEffectFrames = Math.max(this.freezeEffectFrames, hitbox.freezeFrames ?? 0);
      this.airDriftX = 0;
      this.velocityX = attackerFacing * hitbox.knockbackX;
      this.velocityY = hitbox.knockbackY;
      this.transition('hitStun');
    }

    if (this.health <= 0) this.transition('knockout');
    return { damage, blocked, armored: false, knockout: this.health <= 0, passiveActivated };
  }

  addHitStop(frames: number): void {
    this.hitStopFrames = Math.max(this.hitStopFrames, frames);
  }

  addMeter(amount: number): void {
    this.meter = applyEnergy(this.meter, amount, MAX_METER);
  }

  forceMeter(amount: number): void {
    this.meter = applyEnergy(0, amount, MAX_METER);
  }

  setMatchState(state: 'victory' | 'knockout'): void {
    this.activeMove = null;
    this.armorHits = 0;
    this.transition(state);
  }

  setRoundDraw(knockout: boolean): void {
    this.activeMove = null;
    this.armorHits = 0;
    this.transition(knockout ? 'knockout' : 'idle');
  }

  resetRound(startX: number, facing: 1 | -1, keepMeter = true): void {
    this.x = startX;
    this.previousX = startX;
    this.y = GROUND_Y;
    this.previousY = GROUND_Y;
    this.velocityX = 0;
    this.velocityY = 0;
    this.facing = facing;
    this.health = this.definition.stats.maxHealth;
    if (!keepMeter) this.meter = 0;
    this.armorHits = 0;
    this.invulnerableFrames = 0;
    this.passiveFrames = 0;
    this.freezeEffectFrames = 0;
    this.damageTowardPassive = 0;
    this.activeMove = null;
    this.commandBuffer.clear();
    this.registeredHits.clear();
    this.emittedEvents.clear();
    this.hitStopFrames = 0;
    this.hitStunFrames = 0;
    this.blockStunFrames = 0;
    this.knockdownPending = false;
    this.airDriftX = 0;
    this.frozen = false;
    this.moveConnected = 'none';
    this.transition('idle');
  }

  resetPosition(startX: number, facing: 1 | -1): void {
    const meter = this.meter;
    this.resetRound(startX, facing, true);
    this.meter = meter;
  }

  get currentMove(): MoveDefinition | null {
    return this.activeMove;
  }

  get isAttacking(): boolean {
    return this.activeMove !== null;
  }

  get isFrozen(): boolean {
    return this.frozen;
  }

  get grounded(): boolean {
    return this.y >= GROUND_Y;
  }

  /** Última direção reconhecida pelo buffer de comandos (debug). */
  get lastDirection(): DirectionToken {
    return this.commandBuffer.history.at(-1)?.token ?? 'neutral';
  }

  get speedMultiplier(): number {
    return this.passiveFrames > 0 && this.definition.passive ? this.definition.passive.speedMultiplier : 1;
  }

  snapshot(): FighterSnapshot {
    return {
      id: this.id,
      name: this.definition.name,
      x: this.x,
      y: this.y,
      previousX: this.previousX,
      previousY: this.previousY,
      facing: this.facing,
      state: this.state,
      stateFrame: this.stateFrame,
      health: this.health,
      maxHealth: this.definition.stats.maxHealth,
      meter: this.meter,
      armorHits: this.armorHits,
      passiveFrames: this.passiveFrames,
      freezeEffectFrames: this.freezeEffectFrames,
      activeMoveId: this.activeMove?.id ?? null,
    };
  }

  private startMove(move: MoveDefinition): void {
    this.activeMove = move;
    this.lastMoveId = move.id;
    this.armorHits = 0;
    this.meter = applyEnergy(this.meter, -move.meterCost, MAX_METER);
    this.attackInstance += 1;
    this.registeredHits.clear();
    this.emittedEvents.clear();
    this.moveConnected = 'none';
    this.transition(move.state);
  }

  private applyMoveMotion(move: MoveDefinition): void {
    const movement = move.movement?.find(({ range }) => this.stateFrame >= range.from && this.stateFrame <= range.to);
    if (movement) {
      this.x += movement.velocityX * this.facing * this.speedMultiplier;
      if (movement.velocityY !== undefined) this.velocityY = movement.velocityY;
    }
    if (move.air && this.y < GROUND_Y) this.x += this.airDriftX * this.speedMultiplier;
    if (this.y < GROUND_Y || this.velocityY !== 0) this.updateVertical();
    if (move.air && this.y >= GROUND_Y && this.velocityY === 0) {
      // Aterrissou: encerra o ataque aéreo e desliga a hitbox.
      this.activeMove = null;
      this.airDriftX = 0;
      this.transition('idle');
    }
  }

  private updateVertical(): void {
    this.y += this.velocityY;
    this.velocityY += this.definition.stats.gravity;
    if (this.y >= GROUND_Y) {
      this.y = GROUND_Y;
      this.velocityY = 0;
    }
  }

  private transition(next: FighterState): void {
    if (this.state === next) return;
    this.state = next;
    this.stateFrame = 0;
  }
}
