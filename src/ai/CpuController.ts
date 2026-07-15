import type { CombatWorldSnapshot } from '../combat/CombatWorld';
import type {
  DirectionToken,
  FighterDefinition,
  InputAction,
  InputFrame,
  MoveDefinition,
} from '../types/combat';
import type { Difficulty } from '../types/game';
import { CPU_DIFFICULTIES } from './difficulties';

interface PlanStep {
  frames: number;
  readonly actions: readonly InputAction[];
}

const LOCKED_STATES = new Set([
  'lightAttack',
  'heavyAttack',
  'kickAttack',
  'specialAttack',
  'hitStun',
  'knockdown',
  'wakeUp',
  'victory',
  'knockout',
]);

const createInputFrame = (current: ReadonlySet<InputAction>, previous: ReadonlySet<InputAction>): InputFrame => {
  const pressed = new Set<InputAction>();
  const released = new Set<InputAction>();
  for (const action of current) if (!previous.has(action)) pressed.add(action);
  for (const action of previous) if (!current.has(action)) released.add(action);
  return { held: new Set(current), pressed, released };
};

export class CpuController {
  private difficulty: Difficulty;
  private readonly definition: FighterDefinition;
  private readonly playerIndex: 0 | 1;
  private readonly random: () => number;
  private readonly observations: CombatWorldSnapshot[] = [];
  private readonly plan: PlanStep[] = [];
  private readonly preferredRange: number;
  private previousActions = new Set<InputAction>();
  private decisionCooldown = 0;

  constructor(
    definition: FighterDefinition,
    playerIndex: 0 | 1,
    difficulty: Difficulty,
    random: () => number = Math.random,
  ) {
    this.definition = definition;
    this.playerIndex = playerIndex;
    this.difficulty = difficulty;
    this.random = random;
    const reaches = Object.values(definition.moves).flatMap((move) =>
      move.hitboxes.flatMap((timed) => timed.boxes.map((box) => Math.max(0, box.x + box.width))),
    );
    this.preferredRange = Math.max(62, ...reaches) + 18;
  }

  setDifficulty(difficulty: Difficulty): void {
    this.difficulty = difficulty;
    this.reset();
  }

  sample(snapshot: CombatWorldSnapshot): InputFrame {
    if (snapshot.phase !== 'active') {
      this.resetPlanning();
      return this.releaseInput();
    }

    const config = CPU_DIFFICULTIES[this.difficulty];
    this.observations.push(snapshot);
    while (this.observations.length > config.reactionFrames + 2) this.observations.shift();
    if (this.observations.length <= config.reactionFrames) return this.releaseInput();

    const currentOwn = snapshot.fighters[this.playerIndex];
    if (LOCKED_STATES.has(currentOwn.state)) return this.releaseInput();
    const observed = this.observations[0] ?? snapshot;

    this.decisionCooldown = Math.max(0, this.decisionCooldown - 1);
    if (this.plan.length === 0 && this.decisionCooldown === 0) {
      this.choosePlan(observed);
      this.decisionCooldown = config.decisionFrames;
    }

    const step = this.plan[0];
    const actions = new Set<InputAction>(step?.actions ?? []);
    if (step) {
      step.frames -= 1;
      if (step.frames <= 0) this.plan.shift();
    }
    const frame = createInputFrame(actions, this.previousActions);
    this.previousActions = actions;
    return frame;
  }

  reset(): void {
    this.resetPlanning();
    this.previousActions.clear();
  }

  private choosePlan(snapshot: CombatWorldSnapshot): void {
    const config = CPU_DIFFICULTIES[this.difficulty];
    const own = snapshot.fighters[this.playerIndex];
    const opponent = snapshot.fighters[this.playerIndex === 0 ? 1 : 0];
    if (this.random() < config.mistakeChance) {
      this.plan.push({ frames: 8, actions: [] });
      return;
    }

    const distance = Math.abs(own.x - opponent.x);
    const toward: InputAction = opponent.x > own.x ? 'right' : 'left';
    const away: InputAction = toward === 'right' ? 'left' : 'right';
    const opponentThreat = opponent.activeMoveId !== null
      || ['lightAttack', 'heavyAttack', 'kickAttack', 'specialAttack'].includes(opponent.state);

    if (opponentThreat && distance < 105 && this.random() < config.guardChance) {
      const crouch = this.random() < 0.35;
      this.plan.push({ frames: 12, actions: crouch ? ['block', 'down'] : ['block'] });
      return;
    }

    if (distance > 145) {
      this.queueApproach(toward, config.jumpChance);
      return;
    }

    const canSuper = own.meter >= 100;
    const wantsSpecial = canSuper || this.random() < config.specialChance;
    if (wantsSpecial) {
      const move = this.selectSpecial(canSuper, distance);
      if (move) {
        this.queueMove(move, toward, away);
        return;
      }
    }

    if (distance > this.preferredRange) {
      this.queueApproach(toward, config.jumpChance * 0.5);
      return;
    }

    const throwMove = this.findThrow();
    if (distance < 48 && throwMove && this.random() < 0.28) {
      this.queueMove(throwMove, toward, away);
      return;
    }

    if (distance < 36 && this.random() < 0.22) {
      this.plan.push({ frames: 10, actions: [away] });
      return;
    }

    const heavy = this.random() < 0.42;
    const low = this.random() < 0.25;
    const actions: InputAction[] = [];
    if (low) actions.push('down');
    else if (heavy && this.random() < 0.35) actions.push(toward);
    actions.push(heavy ? 'heavy' : 'light');
    this.plan.push({ frames: 1, actions }, { frames: 5, actions: [] });
  }

  private selectSpecial(superMove: boolean, distance: number): MoveDefinition | null {
    const candidates = Object.values(this.definition.moves)
      .filter((move) => move.state === 'specialAttack' && Boolean(move.isSuper) === superMove)
      .filter((move) => distance < 60 || !this.isThrow(move))
      .sort((one, two) => two.command.priority - one.command.priority);
    return candidates[0] ?? null;
  }

  private findThrow(): MoveDefinition | null {
    return Object.values(this.definition.moves).find((move) => this.isThrow(move) && !move.isSuper) ?? null;
  }

  private isThrow(move: MoveDefinition): boolean {
    return move.hitboxes.some((timed) => timed.boxes.some((box) => box.kind === 'throw'));
  }

  private queueApproach(toward: InputAction, jumpChance: number): void {
    if (this.random() < jumpChance) {
      this.plan.push({ frames: 1, actions: ['up', toward] }, { frames: 16, actions: [toward] });
    } else {
      this.plan.push({ frames: 10, actions: [toward] });
    }
  }

  private queueMove(move: MoveDefinition, toward: InputAction, away: InputAction): void {
    for (const direction of move.command.directions ?? []) {
      this.plan.push({ frames: 3, actions: this.directionActions(direction, toward, away) });
    }
    const lastDirection = move.command.directions?.at(-1);
    const finalActions: InputAction[] = lastDirection
      ? [...this.directionActions(lastDirection, toward, away)]
      : [];
    finalActions.push(...move.command.buttons);
    this.plan.push({ frames: 1, actions: finalActions }, { frames: 8, actions: [] });
  }

  private directionActions(
    direction: DirectionToken,
    toward: InputAction,
    away: InputAction,
  ): readonly InputAction[] {
    switch (direction) {
      case 'down': return ['down'];
      case 'downForward': return ['down', toward];
      case 'downBack': return ['down', away];
      case 'forward': return [toward];
      case 'back': return [away];
      case 'up': return ['up'];
      case 'neutral': return [];
    }
  }

  private releaseInput(): InputFrame {
    const idle = createInputFrame(new Set<InputAction>(), this.previousActions);
    this.previousActions = new Set();
    return idle;
  }

  private resetPlanning(): void {
    this.observations.length = 0;
    this.plan.length = 0;
    this.decisionCooldown = 0;
  }
}
