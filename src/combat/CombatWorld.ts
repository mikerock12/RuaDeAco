import {
  GROUND_Y,
  ROUND_TIME_FRAMES,
  ROUNDS_TO_WIN,
  STAGE_LEFT,
  STAGE_RIGHT,
} from '../config/gameConfig';
import type {
  CombatEvent,
  FighterDefinition,
  FighterId,
  GrabDefinition,
  HeldVictimState,
  HitboxDefinition,
  InputFrame,
  LocalRect,
  MoveDefinition,
} from '../types/combat';
import type { GameMode } from '../types/game';
import { FighterRuntime, type AppliedHit, type FighterSnapshot } from './FighterRuntime';
import { horizontalOverlap, intersects, toWorldRect } from './geometry';
import { resolveGrabVictimPose } from './grabTimeline';

export type CombatPhase = 'intro' | 'active' | 'roundOver' | 'matchOver';

interface Contact {
  readonly attacker: FighterRuntime;
  readonly defender: FighterRuntime;
  readonly hitbox: HitboxDefinition;
  readonly move: MoveDefinition | null;
}

interface ProjectileRuntime {
  readonly runtimeId: number;
  readonly projectileId: string;
  readonly owner: FighterRuntime;
  readonly hitbox: HitboxDefinition;
  x: number;
  y: number;
  velocityX: number;
  facing: 1 | -1;
  life: number;
  ageFrames: number;
  readonly armingFrames: number;
  readonly sourceMove: MoveDefinition;
}

interface ActiveGrab {
  readonly attacker: FighterRuntime;
  readonly defender: FighterRuntime;
  readonly hitbox: HitboxDefinition;
  readonly move: MoveDefinition;
  readonly definition: GrabDefinition;
  readonly attackerIndex: 0 | 1;
  readonly comboDepth: number;
}

export interface ProjectileSnapshot {
  readonly runtimeId: number;
  readonly projectileId: string;
  readonly sourceMoveId: string;
  readonly ownerId: FighterId;
  readonly ageFrames: number;
  readonly armingFrames: number;
  readonly x: number;
  readonly y: number;
  readonly facing: 1 | -1;
  readonly hitbox: LocalRect;
  readonly state: 'arming' | 'active';
}

export interface GrabSnapshot {
  readonly attackerId: FighterId;
  readonly victimId: FighterId;
  readonly moveId: string;
  readonly attackerFrame: number;
  readonly holdStartFrame: number;
  readonly releaseFrame: number;
}

export interface CombatWorldSnapshot {
  readonly frame: number;
  readonly phase: CombatPhase;
  readonly phaseFrame: number;
  readonly round: number;
  readonly timeSeconds: number;
  readonly paused: boolean;
  readonly fighters: readonly [FighterSnapshot, FighterSnapshot];
  readonly roundWins: readonly [number, number];
  readonly projectiles: readonly ProjectileSnapshot[];
  readonly activeGrab: GrabSnapshot | null;
  readonly combo: readonly [number, number];
  readonly lastDamage: number;
  readonly debugBoxes: boolean;
  readonly trainingCpuEnabled: boolean;
  readonly roundDraw: boolean;
}

const EMPTY_INPUT: InputFrame = {
  held: new Set(),
  pressed: new Set(),
  released: new Set(),
};

export class CombatWorld {
  readonly fighters: readonly [FighterRuntime, FighterRuntime];
  readonly mode: GameMode;
  frame = 0;
  phase: CombatPhase = 'intro';
  phaseFrame = 0;
  round = 1;
  timeFrames = ROUND_TIME_FRAMES;
  paused = false;
  debugBoxes = false;
  trainingCpuEnabled = false;

  private readonly events: CombatEvent[] = [];
  private projectiles: ProjectileRuntime[] = [];
  private activeGrab: ActiveGrab | null = null;
  private projectileSequence = 0;
  private readonly comboHits: [number, number] = [0, 0];
  private readonly comboTimers: [number, number] = [0, 0];
  private lastDamage = 0;
  private roundDraw = false;
  private roundWinner: 0 | 1 | null = null;

  constructor(playerOne: FighterDefinition, playerTwo: FighterDefinition, mode: GameMode) {
    this.mode = mode;
    this.fighters = [
      new FighterRuntime(playerOne, 188, 1),
      new FighterRuntime(playerTwo, 452, -1),
    ];
    if (mode === 'training') {
      this.trainingCpuEnabled = false;
      this.fighters[0].forceMeter(100);
      this.fighters[1].forceMeter(100);
    }
    this.emit({ type: 'roundStart', frame: this.frame, text: 'ROUND 1' });
  }

  step(playerOneInput: InputFrame, playerTwoInput: InputFrame): void {
    if (this.paused) return;
    this.frame += 1;
    this.phaseFrame += 1;

    if (this.phase === 'matchOver') {
      this.stepPresentationFrame();
      return;
    }

    if (this.phase === 'intro') {
      this.stepIntro();
      return;
    }

    if (this.phase === 'roundOver') {
      this.stepRoundOver();
      return;
    }

    this.stepActive(playerOneInput, playerTwoInput);
  }

  togglePause(): boolean {
    this.paused = !this.paused;
    return this.paused;
  }

  setPaused(value: boolean): void {
    this.paused = value;
  }

  resetTrainingPositions(): void {
    if (this.mode !== 'training') return;
    this.activeGrab?.defender.cancelGrab();
    this.activeGrab = null;
    this.fighters[0].resetPosition(220, 1);
    this.fighters[1].resetPosition(420, -1);
    this.projectiles = [];
    this.comboHits[0] = 0;
    this.comboHits[1] = 0;
    this.lastDamage = 0;
  }

  toggleTrainingCpu(): boolean {
    if (this.mode !== 'training') return false;
    this.trainingCpuEnabled = !this.trainingCpuEnabled;
    return this.trainingCpuEnabled;
  }

  toggleDebugBoxes(): boolean {
    this.debugBoxes = !this.debugBoxes;
    return this.debugBoxes;
  }

  drainEvents(): readonly CombatEvent[] {
    return this.events.splice(0);
  }

  snapshot(): CombatWorldSnapshot {
    return {
      frame: this.frame,
      phase: this.phase,
      phaseFrame: this.phaseFrame,
      round: this.round,
      timeSeconds: Math.max(0, Math.ceil(this.timeFrames / 60)),
      paused: this.paused,
      fighters: [this.fighters[0].snapshot(), this.fighters[1].snapshot()],
      roundWins: [this.fighters[0].roundWins, this.fighters[1].roundWins],
      projectiles: this.projectiles.map((projectile) => ({
        runtimeId: projectile.runtimeId,
        projectileId: projectile.projectileId,
        sourceMoveId: projectile.sourceMove.id,
        ownerId: projectile.owner.id,
        ageFrames: projectile.ageFrames,
        x: projectile.x,
        y: projectile.y,
        facing: projectile.facing,
        hitbox: this.projectileRect(projectile),
        armingFrames: projectile.armingFrames,
        state: projectile.ageFrames < projectile.armingFrames ? 'arming' : 'active',
      })),
      activeGrab: this.activeGrab
        ? {
            attackerId: this.activeGrab.attacker.id,
            victimId: this.activeGrab.defender.id,
            moveId: this.activeGrab.move.id,
            attackerFrame: this.activeGrab.attacker.stateFrame,
            holdStartFrame: this.activeGrab.definition.holdStartFrame,
            releaseFrame: this.activeGrab.definition.releaseFrame,
          }
        : null,
      combo: [this.comboHits[0], this.comboHits[1]],
      lastDamage: this.lastDamage,
      debugBoxes: this.debugBoxes,
      trainingCpuEnabled: this.trainingCpuEnabled,
      roundDraw: this.roundDraw,
    };
  }

  get winner(): FighterRuntime | null {
    if (this.phase !== 'matchOver' || this.roundWinner === null) return null;
    return this.fighters[this.roundWinner];
  }

  get loser(): FighterRuntime | null {
    if (this.phase !== 'matchOver' || this.roundWinner === null) return null;
    return this.fighters[this.roundWinner === 0 ? 1 : 0];
  }

  private stepIntro(): void {
    const [one, two] = this.fighters;
    one.facing = one.x <= two.x ? 1 : -1;
    two.facing = two.x <= one.x ? 1 : -1;
    one.beginFrame(EMPTY_INPUT, this.frame, two.x);
    two.beginFrame(EMPTY_INPUT, this.frame, one.x);
    one.finishFrame();
    two.finishFrame();

    if (this.phaseFrame === 60) this.emit({ type: 'fight', frame: this.frame, text: 'FIGHT' });
    if (this.phaseFrame >= 105) {
      this.phase = 'active';
      this.phaseFrame = 0;
    }
  }

  private stepActive(playerOneInput: InputFrame, playerTwoInput: InputFrame): void {
    const [one, two] = this.fighters;
    // Facing congela no ar: o lutador só vira ao aterrissar.
    if (!one.currentMove?.lockFacing && one.grounded) one.facing = one.x <= two.x ? 1 : -1;
    if (!two.currentMove?.lockFacing && two.grounded) two.facing = two.x <= one.x ? 1 : -1;

    const onePreviousMove = one.currentMove;
    const twoPreviousMove = two.currentMove;
    one.beginFrame(playerOneInput, this.frame, two.x);
    two.beginFrame(playerTwoInput, this.frame, one.x);
    this.emitMoveStart(one, onePreviousMove);
    this.emitMoveStart(two, twoPreviousMove);
    this.resolvePushboxes();

    this.consumeFighterEvents(one);
    this.consumeFighterEvents(two);
    this.updateProjectiles();

    const oneContact = this.findContact(one, two);
    const twoContact = this.findContact(two, one);
    if (oneContact && twoContact) {
      if (oneContact.hitbox.priority > twoContact.hitbox.priority) {
        this.applyContact(oneContact, 0);
      } else if (twoContact.hitbox.priority > oneContact.hitbox.priority) {
        this.applyContact(twoContact, 1);
      } else {
        this.applyContact(oneContact, 0);
        this.applyContact(twoContact, 1);
      }
    } else if (oneContact) {
      this.applyContact(oneContact, 0);
    } else if (twoContact) {
      this.applyContact(twoContact, 1);
    }

    this.resolveProjectileContacts();
    one.finishFrame();
    two.finishFrame();
    // O snapshot apresenta o stateFrame já finalizado. Atualizar o agarrão
    // aqui mantém pose, âncora e liberação da vítima na mesma fase visual
    // do atacante, além de cancelar no mesmo step se um projétil o interromper.
    this.updateActiveGrab();
    this.tickCombos();

    if (this.mode === 'training') {
      one.forceMeter(100);
      two.forceMeter(100);
      return;
    }

    this.timeFrames = Math.max(0, this.timeFrames - 1);
    if (one.health <= 0 || two.health <= 0 || this.timeFrames === 0) {
      const knockout = one.health <= 0 || two.health <= 0;
      const oneRatio = one.health / one.definition.stats.maxHealth;
      const twoRatio = two.health / two.definition.stats.maxHealth;
      const winner: 0 | 1 | null = Math.abs(oneRatio - twoRatio) < 0.0001
        ? null
        : oneRatio > twoRatio ? 0 : 1;
      this.finishRound(winner, knockout);
    }
  }

  private stepRoundOver(): void {
    this.stepPresentationFrame();
    if (this.phaseFrame < 150) return;
    const winner = this.roundWinner;
    if (winner === null && !this.roundDraw) return;
    if (winner !== null && this.fighters[winner].roundWins >= ROUNDS_TO_WIN) {
      this.phase = 'matchOver';
      this.phaseFrame = 0;
      this.emit({
        type: 'matchEnd',
        frame: this.frame,
        attacker: this.fighters[winner].id,
        defender: this.fighters[winner === 0 ? 1 : 0].id,
      });
      return;
    }

    if (winner !== null) this.round += 1;
    this.timeFrames = ROUND_TIME_FRAMES;
    this.projectiles = [];
    this.activeGrab = null;
    this.comboHits[0] = 0;
    this.comboHits[1] = 0;
    this.comboTimers[0] = 0;
    this.comboTimers[1] = 0;
    this.fighters[0].resetRound(188, 1, true);
    this.fighters[1].resetRound(452, -1, true);
    this.roundWinner = null;
    this.roundDraw = false;
    this.phase = 'intro';
    this.phaseFrame = 0;
    this.emit({ type: 'roundStart', frame: this.frame, text: 'ROUND ' + this.round });
  }

  private emitMoveStart(fighter: FighterRuntime, previousMove: MoveDefinition | null): void {
    const move = fighter.currentMove;
    if (!move || move === previousMove || move.state !== 'specialAttack') return;
    if (move.isSuper) {
      this.fighters[0].addHitStop(30);
      this.fighters[1].addHitStop(30);
    }
    
    this.emit({
      type: 'special',
      frame: this.frame,
      attacker: fighter.id,
      text: move.label,
      moveId: move.id,
      isSuper: move.isSuper ?? false,
      ...(move.cinematic ? { cinematic: move.cinematic } : {}),
    });
  }

  private consumeFighterEvents(fighter: FighterRuntime): void {
    for (const event of fighter.consumeMoveEvents()) {
      if (event.type === 'spawnProjectile') this.spawnProjectile(fighter, event.projectileId);
      if (event.type === 'grantBuff') {
        this.emit({
          type: 'passive',
          frame: this.frame,
          attacker: fighter.id,
          text: fighter.definition.passive?.label ?? fighter.currentMove?.label ?? 'BUFF',
        });
      }
    }
  }

  private spawnProjectile(owner: FighterRuntime, projectileId: string): void {
    const definition = Object.values(owner.definition.projectiles ?? {})
      .find((candidate) => candidate.id === projectileId);
    const sourceMove = owner.currentMove;
    if (!definition || !sourceMove) return;

    // Limite por dono: não substitui, teleporta nem reposiciona o existente.
    if (definition.maxActivePerOwner !== undefined) {
      const ownerCount = this.projectiles.filter(
        (p) => p.owner === owner && p.projectileId === definition.id,
      ).length;
      if (ownerCount >= definition.maxActivePerOwner) return;
    }

    const spawnMode = definition.spawnMode ?? 'ownerOffset';
    let x = owner.x + owner.facing * definition.offsetX;
    let y = GROUND_Y + definition.offsetY;
    let facing = owner.facing;
    let velocityX = owner.facing * definition.velocityX;

    if (spawnMode === 'targetSnapshot') {
      const target = this.fighters.find(f => f !== owner)!;
      x = target.x + definition.offsetX;
      y = target.y + definition.offsetY;
    }

    this.projectileSequence += 1;
    this.projectiles.push({
      runtimeId: this.projectileSequence,
      projectileId: definition.id,
      owner,
      x,
      y,
      velocityX,
      facing,
      life: definition.lifeFrames,
      ageFrames: 0,
      armingFrames: definition.armingFrames ?? 0,
      sourceMove,
      hitbox: {
        ...definition.hitbox,
        id: definition.hitbox.id + '-' + this.projectileSequence,
      },
    });
  }

  private updateProjectiles(): void {
    for (const projectile of this.projectiles) {
      projectile.x += projectile.velocityX;
      projectile.life -= 1;
      projectile.ageFrames += 1;
    }
    this.projectiles = this.projectiles.filter((projectile) => projectile.life > 0 && projectile.x > STAGE_LEFT - 30 && projectile.x < STAGE_RIGHT + 30);
  }

  private findContact(attacker: FighterRuntime, defender: FighterRuntime): Contact | null {
    if (attacker.isBeingGrabbed || defender.isBeingGrabbed) return null;
    const move = attacker.currentMove;
    const combatHurtboxes = defender.getHurtboxes();
    const targetHurtboxes = combatHurtboxes.length > 0
      && move?.usesVisualHurtboxes
      && defender.definition.visualHurtboxes
      ? defender.definition.visualHurtboxes
      : combatHurtboxes;
    const hurtboxes = targetHurtboxes.map((box) => toWorldRect(box, defender));
    const hitboxes = attacker.getActiveHitboxes()
      .filter((box) => attacker.canRegisterHit(box.id, defender.id))
      .sort((a, b) => b.priority - a.priority);
    for (const hitbox of hitboxes) {
      const worldHitbox = toWorldRect(hitbox, attacker);
      if (hurtboxes.some((hurtbox) => intersects(worldHitbox, hurtbox))) {
        return { attacker, defender, hitbox, move };
      }
    }
    return null;
  }

  private applyContact(contact: Contact, attackerIndex: 0 | 1): void {
    const { attacker, defender, hitbox, move } = contact;
    if (
      attacker.isBeingGrabbed
      || defender.isBeingGrabbed
      || !attacker.canRegisterHit(hitbox.id, defender.id)
    ) return;
    const blocked = defender.isBlocking(hitbox.level, hitbox.kind);
    const comboDepth = defender.state === 'hitStun' ? this.comboHits[attackerIndex] + 1 : 1;

    if (hitbox.kind === 'throw' && move?.grab) {
      attacker.registerHit(hitbox.id, defender.id, 'hit');
      attacker.addHitStop(hitbox.hitStop);
      defender.addHitStop(hitbox.hitStop);
      this.activeGrab = {
        attacker,
        defender,
        hitbox,
        move,
        definition: move.grab,
        attackerIndex,
        comboDepth,
      };
      this.positionGrabVictim(this.activeGrab);
      return;
    }

    const result = defender.applyHit(hitbox, attacker.facing, blocked, comboDepth, this.mode === 'training');
    attacker.registerHit(hitbox.id, defender.id, blocked ? 'block' : 'hit');
    attacker.addHitStop(hitbox.hitStop);
    this.resolveContactResult(contact, attackerIndex, blocked, comboDepth, result);
  }

  private resolveContactResult(
    contact: Contact,
    attackerIndex: 0 | 1,
    blocked: boolean,
    comboDepth: number,
    result: AppliedHit,
  ): void {
    const { attacker, defender, hitbox, move } = contact;
    if (result.armored) {
      this.comboHits[attackerIndex] = 0;
      this.comboTimers[attackerIndex] = 0;
      this.emit({ type: 'blocked', frame: this.frame, attacker: attacker.id, defender: defender.id, text: 'ARMOR' });
      return;
    }

    attacker.addMeter(blocked ? move?.meterGainOnBlock ?? 0 : move?.meterGainOnHit ?? 0);
    defender.addMeter(Math.ceil(result.damage * 0.055));
    this.lastDamage = result.damage;

    if (blocked) {
      this.comboHits[attackerIndex] = 0;
      this.comboTimers[attackerIndex] = 0;
      this.emit({
        type: 'blocked',
        frame: this.frame,
        attacker: attacker.id,
        defender: defender.id,
        value: result.damage,
        text: move?.label ?? hitbox.id,
        ...(move ? { moveId: move.id, isSuper: move.isSuper ?? false } : {}),
        ...(move?.cinematic ? { cinematic: move.cinematic } : {}),
      });
    } else {
      this.comboHits[attackerIndex] = comboDepth;
      this.comboTimers[attackerIndex] = 90;
      this.emit({
        type: 'hit',
        frame: this.frame,
        attacker: attacker.id,
        defender: defender.id,
        value: result.damage,
        text: move?.label ?? hitbox.id,
        ...(move ? { moveId: move.id, isSuper: move.isSuper ?? false } : {}),
        ...(move?.cinematic ? { cinematic: move.cinematic } : {}),
      });
    }
    if (result.passiveActivated) {
      this.emit({ type: 'passive', frame: this.frame, attacker: defender.id, text: defender.definition.passive?.label ?? 'PASSIVA' });
    }
  }

  private updateActiveGrab(): void {
    const grab = this.activeGrab;
    if (!grab) return;

    if (grab.attacker.currentMove !== grab.move || grab.attacker.state === 'knockout') {
      grab.defender.cancelGrab();
      this.activeGrab = null;
      return;
    }

    if (grab.attacker.stateFrame >= grab.definition.releaseFrame) {
      this.activeGrab = null;
      const result = grab.defender.releaseGrab(
        grab.hitbox,
        grab.attacker.facing,
        grab.comboDepth,
        this.mode === 'training',
        grab.definition.throwVelocityX,
        grab.definition.throwVelocityY,
      );
      grab.attacker.addHitStop(grab.hitbox.hitStop);
      this.resolveContactResult(
        { attacker: grab.attacker, defender: grab.defender, hitbox: grab.hitbox, move: grab.move },
        grab.attackerIndex,
        false,
        grab.comboDepth,
        result,
      );
      return;
    }

    this.positionGrabVictim(grab);
  }

  private positionGrabVictim(grab: ActiveGrab): void {
    const { attacker, defender, definition } = grab;
    const frame = attacker.stateFrame;
    const timelinePose = resolveGrabVictimPose(definition, frame);
    const phase = definition.victimPhases?.find(({ range }) => frame >= range.from && frame <= range.to);
    const state: HeldVictimState = timelinePose?.state ?? phase?.state
      ?? (frame < definition.holdStartFrame ? 'grabbedFront' : 'grabbedLifted');
    const offset = definition.victimOffsets?.[defender.id];
    const anchorX = (timelinePose?.victimAnchorX ?? phase?.victimAnchorX ?? definition.victimAnchorX)
      + (offset?.anchorOffsetX ?? 0);
    const anchorY = (timelinePose?.victimAnchorY ?? phase?.victimAnchorY ?? definition.victimAnchorY)
      + (offset?.anchorOffsetY ?? 0);
    const rotation = (timelinePose?.victimRotation ?? phase?.victimRotation ?? definition.victimRotation)
      + (offset?.rotationOffset ?? 0);
    const captureStart = Math.min(
      ...grab.move.hitboxes.map(({ range }) => range.from),
      definition.holdStartFrame,
    );
    const phaseStart = phase?.range.from
      ?? (state === 'grabbedFront' ? captureStart : definition.holdStartFrame);
    const phaseEnd = phase?.range.to
      ?? (state === 'grabbedFront' ? definition.holdStartFrame - 1 : definition.releaseFrame - 1);

    const victimX = attacker.x + attacker.facing * anchorX;
    const victimY = attacker.y + anchorY;

    attacker.grabbedVictimX = victimX;
    attacker.grabbedVictimY = victimY;
    attacker.grabbedVictimRotation = attacker.facing * rotation;

    defender.setGrabbedPose(
      attacker.id,
      state,
      victimX,
      victimY,
      attacker.facing,
      attacker.facing * rotation,
      frame - phaseStart,
      phaseEnd - phaseStart + 1,
      timelinePose?.poseFrame ?? null,
      timelinePose?.depth ?? 'behind',
    );
  }

  private stepPresentationFrame(): void {
    const [one, two] = this.fighters;
    one.beginFrame(EMPTY_INPUT, this.frame, two.x);
    two.beginFrame(EMPTY_INPUT, this.frame, one.x);
    one.finishFrame();
    two.finishFrame();
  }

  private resolveProjectileContacts(): void {
    const consumed = new Set<number>();
    for (const projectile of this.projectiles) {
      if (projectile.ageFrames < projectile.armingFrames) continue;

      const targetIndex: 0 | 1 = projectile.owner === this.fighters[0] ? 1 : 0;
      const target = this.fighters[targetIndex];
      const projectileRect = this.projectileRect(projectile);
      const hit = target.getHurtboxes().some((box) => intersects(projectileRect, toWorldRect(box, target)));
      if (!hit) continue;

      const blocked = target.isBlocking(projectile.hitbox.level, projectile.hitbox.kind);
      const ownerIndex: 0 | 1 = targetIndex === 0 ? 1 : 0;
      const comboDepth = target.state === 'hitStun' ? this.comboHits[ownerIndex] + 1 : 1;
      const result = target.applyHit(
        projectile.hitbox,
        projectile.facing,
        blocked,
        comboDepth,
        this.mode === 'training',
      );
      projectile.owner.addHitStop(projectile.hitbox.hitStop);
      consumed.add(projectile.runtimeId);
      this.lastDamage = result.damage;

      if (result.armored) {
        this.comboHits[ownerIndex] = 0;
        this.comboTimers[ownerIndex] = 0;
        this.emit({ type: 'blocked', frame: this.frame, attacker: projectile.owner.id, defender: target.id, text: 'ARMOR' });
        continue;
      }

      projectile.owner.addMeter(
        blocked ? projectile.sourceMove.meterGainOnBlock : projectile.sourceMove.meterGainOnHit,
      );
      target.addMeter(Math.ceil(result.damage * 0.055));
      if (blocked) {
        this.comboHits[ownerIndex] = 0;
        this.comboTimers[ownerIndex] = 0;
        this.emit({
          type: 'blocked',
          frame: this.frame,
          attacker: projectile.owner.id,
          defender: target.id,
          value: result.damage,
          text: projectile.sourceMove.label,
          moveId: projectile.sourceMove.id,
        });
      } else {
        this.comboHits[ownerIndex] = comboDepth;
        this.comboTimers[ownerIndex] = 90;
        this.emit({
          type: 'hit',
          frame: this.frame,
          attacker: projectile.owner.id,
          defender: target.id,
          value: result.damage,
          text: projectile.sourceMove.label,
          moveId: projectile.sourceMove.id,
          isSuper: projectile.sourceMove.isSuper ?? false,
          ...(projectile.sourceMove.cinematic ? { cinematic: projectile.sourceMove.cinematic } : {}),
        });
      }
      if (result.passiveActivated) {
        this.emit({ type: 'passive', frame: this.frame, attacker: target.id, text: target.definition.passive?.label ?? 'PASSIVA' });
      }
    }
    this.projectiles = this.projectiles.filter((projectile) => !consumed.has(projectile.runtimeId));
  }

  private projectileRect(projectile: ProjectileRuntime): LocalRect {
    return toWorldRect(projectile.hitbox, {
      id: projectile.owner.id,
      x: projectile.x,
      y: projectile.y,
      facing: projectile.facing,
    });
  }

  private resolvePushboxes(): void {
    const [one, two] = this.fighters;
    if (
      one.isBeingGrabbed
      || two.isBeingGrabbed
      || one.state === 'thrown'
      || two.state === 'thrown'
    ) return;
    if (Math.abs(one.y - two.y) > 96) return;
    const oneBox = toWorldRect(one.definition.stats.pushbox, one);
    const twoBox = toWorldRect(two.definition.stats.pushbox, two);
    const overlap = horizontalOverlap(oneBox, twoBox);
    if (overlap <= 0 || !intersects(oneBox, twoBox)) return;

    const oneIsLeft = one.x <= two.x;
    const totalWeight = one.definition.stats.weight + two.definition.stats.weight;
    const moveOne = overlap * (two.definition.stats.weight / totalWeight);
    const moveTwo = overlap * (one.definition.stats.weight / totalWeight);
    one.x += oneIsLeft ? -moveOne : moveOne;
    two.x += oneIsLeft ? moveTwo : -moveTwo;
    one.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, one.x));
    two.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, two.x));
  }

  private tickCombos(): void {
    for (const index of [0, 1] as const) {
      const defender = this.fighters[index === 0 ? 1 : 0];
      if (
        defender.state !== 'hitStun'
        && defender.state !== 'thrown'
        && defender.state !== 'knockdown'
      ) {
        this.comboTimers[index] = 0;
        this.comboHits[index] = 0;
        continue;
      }
      this.comboTimers[index] = Math.max(0, this.comboTimers[index] - 1);
      if (this.comboTimers[index] === 0) this.comboHits[index] = 0;
    }
  }

  private finishRound(winner: 0 | 1 | null, knockout: boolean): void {
    if (this.phase !== 'active') return;
    this.activeGrab = null;
    // O round acabou: projéteis não continuam simulando e também não
    // podem permanecer como efeitos congelados durante roundOver/matchOver.
    this.projectiles = [];
    this.roundWinner = winner;
    this.roundDraw = winner === null;
    this.phase = 'roundOver';
    this.phaseFrame = 0;

    if (winner === null) {
      this.fighters[0].setRoundDraw(knockout);
      this.fighters[1].setRoundDraw(knockout);
      this.emit({ type: 'roundEnd', frame: this.frame, text: 'EMPATE' });
      return;
    }

    const loser: 0 | 1 = winner === 0 ? 1 : 0;
    this.fighters[winner].roundWins += 1;
    this.fighters[winner].setMatchState('victory');
    this.fighters[loser].setMatchState('knockout');
    this.emit({
      type: knockout ? 'knockout' : 'roundEnd',
      frame: this.frame,
      attacker: this.fighters[winner].id,
      defender: this.fighters[loser].id,
      text: knockout ? 'KO' : 'TEMPO',
    });
  }

  private emit(event: CombatEvent): void {
    this.events.push(event);
  }
}
