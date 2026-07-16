import type {
  CombatButton,
  DirectionToken,
  InputAction,
  InputCommand,
  InputFrame,
  MoveDefinition,
} from '../types/combat';
import { canSpendEnergy } from './calculations';

export interface DirectionSample {
  readonly token: DirectionToken;
  readonly frame: number;
}

export interface ButtonSample {
  readonly button: CombatButton;
  readonly frame: number;
}

const buttonToAction: Readonly<Record<CombatButton, InputAction>> = {
  light: 'light',
  heavy: 'heavy',
  special: 'special',
  block: 'block',
};

export function directionFromInput(input: InputFrame, facing: 1 | -1): DirectionToken {
  const down = input.held.has('down');
  const up = input.held.has('up');
  const worldForward = facing === 1 ? input.held.has('right') : input.held.has('left');
  const worldBack = facing === 1 ? input.held.has('left') : input.held.has('right');
  if (up) return 'up';
  if (down && worldForward) return 'downForward';
  if (down && worldBack) return 'downBack';
  if (down) return 'down';
  if (worldForward) return 'forward';
  if (worldBack) return 'back';
  return 'neutral';
}

function buttonActivationFrame(
  command: InputCommand,
  input: InputFrame,
  currentFrame: number,
  samples: readonly ButtonSample[],
): number | null {
  if (command.buttons.length === 0) return null;
  let activationFrame: number | null = null;
  for (const button of command.buttons) {
    const action = buttonToAction[button];
    let recentFrame: number | null = null;
    for (let index = samples.length - 1; index >= 0; index -= 1) {
      const sample = samples[index];
      if (sample?.button === button && currentFrame - sample.frame <= command.bufferFrames) {
        recentFrame = sample.frame;
        break;
      }
    }
    if (input.pressed.has(action)) recentFrame = currentFrame;
    if (!input.held.has(action) && recentFrame === null) return null;
    if (recentFrame !== null) activationFrame = Math.max(activationFrame ?? recentFrame, recentFrame);
  }
  return activationFrame;
}

// Golpes de direção única "baixo" aceitam as diagonais (ex.: baixo-frente
// + fraco ainda dispara o golpe agachado), sem afrouxar sequências de
// quarto de círculo nem os golpes de frente/trás.
function tokenMatches(expected: DirectionToken, actual: DirectionToken, singleDirection: boolean): boolean {
  if (expected === actual) return true;
  return singleDirection && expected === 'down' && (actual === 'downForward' || actual === 'downBack');
}

export function matchCommand(
  command: InputCommand,
  samples: readonly DirectionSample[],
  input: InputFrame,
  currentFrame: number,
  buttonSamples: readonly ButtonSample[] = [],
): boolean {
  const activationFrame = buttonActivationFrame(command, input, currentFrame, buttonSamples);
  if (activationFrame === null || currentFrame - activationFrame > command.bufferFrames) return false;
  const sequence = command.directions;
  if (!sequence || sequence.length === 0) return true;

  const singleDirection = sequence.length === 1;
  let sampleIndex = samples.length - 1;
  let previousFrame = activationFrame;
  for (let commandIndex = sequence.length - 1; commandIndex >= 0; commandIndex -= 1) {
    const expected = sequence[commandIndex];
    let found: DirectionSample | undefined;
    while (sampleIndex >= 0) {
      const sample = samples[sampleIndex];
      sampleIndex -= 1;
      if (sample && sample.frame > activationFrame) continue;
      if (sample && expected !== undefined && tokenMatches(expected, sample.token, singleDirection)) {
        found = sample;
        break;
      }
    }
    if (!found || previousFrame - found.frame > command.maxGapFrames) return false;
    previousFrame = found.frame;
  }
  return true;
}

export class CommandBuffer {
  private readonly samples: DirectionSample[] = [];
  private readonly buttonSamples: ButtonSample[] = [];

  push(frame: number, input: InputFrame, facing: 1 | -1): void {
    const token = directionFromInput(input, facing);
    this.samples.push({ token, frame });
    for (const button of Object.keys(buttonToAction) as CombatButton[]) {
      if (input.pressed.has(buttonToAction[button])) this.buttonSamples.push({ button, frame });
    }
    const earliest = frame - 45;
    while ((this.samples[0]?.frame ?? frame) < earliest) this.samples.shift();
    while ((this.buttonSamples[0]?.frame ?? frame) < earliest) this.buttonSamples.shift();
  }

  findMove(
    moves: Readonly<Record<string, MoveDefinition>>,
    input: InputFrame,
    frame: number,
    meter: number,
    airborne = false,
    trajectory: 'neutral' | 'forward' | 'backward' = 'neutral',
  ): MoveDefinition | null {
    const candidates = Object.values(moves)
      .filter((move) => Boolean(move.air) === airborne)
      .filter((move) => !move.jumpTrajectory || move.jumpTrajectory === trajectory)
      .sort((a, b) => b.command.priority - a.command.priority);
    const intendedMove = candidates.find(
      (move) => matchCommand(move.command, this.samples, input, frame, this.buttonSamples),
    );
    if (!intendedMove || !canSpendEnergy(meter, intendedMove.meterCost)) return null;
    return intendedMove;
  }

  clear(): void {
    this.samples.length = 0;
    this.buttonSamples.length = 0;
  }

  get history(): readonly DirectionSample[] {
    return this.samples;
  }
}
