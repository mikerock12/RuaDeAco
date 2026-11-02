import {
  ARENAS,
  COMBAT_HEIGHT,
  COMBAT_WIDTH,
  GROUND_Y,
  LANDING_FRAMES,
  MAX_METER,
  ROUND_TIME_FRAMES,
  ROUNDS_TO_WIN,
  STAGE_LEFT,
  STAGE_RIGHT,
  WAKE_UP_FRAMES,
} from '../config/gameConfig';
import { FIGHTERS, getFighterDefinition } from '../fighters';
import { combatStateHash } from '../online/stateHash';
import type { ArenaDefinition, GameMode } from '../types/game';
import type {
  FighterDefinition,
  FighterId,
  FighterState,
  InputAction,
  InputFrame,
} from '../types/combat';
import { CombatWorld, type CombatPhase } from './CombatWorld';
import { FINISH_END, FINISH_THROW, FINISH_WINDOW, FINISHER_ARENAS } from './stageFinisher';

export interface GoldenFighterCheckpoint {
  readonly id: FighterId;
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly facing: 1 | -1;
  readonly state: FighterState;
  readonly stateFrame: number;
  readonly health: number;
  readonly meter: number;
  readonly grounded: boolean;
  readonly moveId: string | null;
}

export interface GoldenFrameCheckpoint {
  readonly frame: number;
  readonly phase: CombatPhase;
  readonly phaseFrame: number;
  readonly stateHash: string;
  readonly fighters: readonly [GoldenFighterCheckpoint, GoldenFighterCheckpoint];
  readonly activeProjectiles: number;
  readonly activeGrabMoveId: string | null;
}

export interface GoldenReplayScenario {
  readonly id: string;
  readonly description: string;
  readonly arena: ArenaDefinition['id'];
  readonly playerOne: FighterId;
  readonly playerTwo: FighterId;
  readonly mode: Extract<GameMode, 'versus' | 'training'>;
  readonly totalSteps: number;
  readonly initialStateHash: string;
  readonly finalStateHash: string;
  readonly checkpoints: readonly GoldenFrameCheckpoint[];
}

export interface CppParityFixturesBundle {
  readonly schemaVersion: 1;
  readonly sourceRepository: 'mikerock12/RuaDeAco';
  readonly engineContract: {
    readonly fixedHz: 60;
    readonly combatWidth: number;
    readonly combatHeight: number;
    readonly groundY: number;
    readonly stageLeft: number;
    readonly stageRight: number;
    readonly roundTimeFrames: number;
    readonly roundsToWin: number;
    readonly maxMeter: number;
    readonly landingFrames: number;
    readonly wakeUpFrames: number;
    readonly finishWindowFrames: number;
    readonly finishThrowFrame: number;
    readonly finishEndFrame: number;
    readonly finisherArenas: readonly ArenaDefinition['id'][];
  };
  readonly arenas: readonly ArenaDefinition[];
  readonly fighters: readonly FighterDefinition[];
  readonly goldenScenarios: readonly GoldenReplayScenario[];
}

function makeInputFrame(
  currentHeld: ReadonlySet<InputAction>,
  previousHeld: ReadonlySet<InputAction>,
): InputFrame {
  const pressed = new Set<InputAction>();
  const released = new Set<InputAction>();
  for (const action of currentHeld) {
    if (!previousHeld.has(action)) pressed.add(action);
  }
  for (const action of previousHeld) {
    if (!currentHeld.has(action)) released.add(action);
  }
  return {
    held: currentHeld,
    pressed,
    released,
  };
}

function captureCheckpoint(world: CombatWorld): GoldenFrameCheckpoint {
  const snap = world.snapshot();
  const [f1, f2] = world.fighters;
  return {
    frame: snap.frame,
    phase: snap.phase,
    phaseFrame: snap.phaseFrame,
    stateHash: combatStateHash(world),
    fighters: [
      {
        id: f1.id,
        x: Math.round(f1.x * 1000) / 1000,
        y: Math.round(f1.y * 1000) / 1000,
        velocityX: Math.round(f1.velocityX * 1000) / 1000,
        velocityY: Math.round(f1.velocityY * 1000) / 1000,
        facing: f1.facing,
        state: f1.state,
        stateFrame: f1.stateFrame,
        health: f1.health,
        meter: f1.meter,
        grounded: f1.grounded,
        moveId: f1.currentMove?.id ?? null,
      },
      {
        id: f2.id,
        x: Math.round(f2.x * 1000) / 1000,
        y: Math.round(f2.y * 1000) / 1000,
        velocityX: Math.round(f2.velocityX * 1000) / 1000,
        velocityY: Math.round(f2.velocityY * 1000) / 1000,
        facing: f2.facing,
        state: f2.state,
        stateFrame: f2.stateFrame,
        health: f2.health,
        meter: f2.meter,
        grounded: f2.grounded,
        moveId: f2.currentMove?.id ?? null,
      },
    ],
    activeProjectiles: snap.projectiles.length,
    activeGrabMoveId: snap.activeGrab?.moveId ?? null,
  };
}

function runScenario(
  id: string,
  description: string,
  arena: ArenaDefinition['id'],
  playerOne: FighterId,
  playerTwo: FighterId,
  mode: Extract<GameMode, 'versus' | 'training'>,
  totalSteps: number,
  resolver: (stepIndex: number) => { p1?: readonly InputAction[]; p2?: readonly InputAction[] },
  checkpointEvery = 15,
): GoldenReplayScenario {
  const world = new CombatWorld(
    getFighterDefinition(playerOne),
    getFighterDefinition(playerTwo),
    mode,
    arena,
  );
  const initialStateHash = combatStateHash(world);
  const checkpoints: GoldenFrameCheckpoint[] = [captureCheckpoint(world)];
  let prevP1 = new Set<InputAction>();
  let prevP2 = new Set<InputAction>();

  for (let step = 1; step <= totalSteps; step += 1) {
    const actions = resolver(step);
    const curP1 = new Set<InputAction>(actions.p1 ?? []);
    const curP2 = new Set<InputAction>(actions.p2 ?? []);
    world.step(makeInputFrame(curP1, prevP1), makeInputFrame(curP2, prevP2));
    prevP1 = curP1;
    prevP2 = curP2;
    if (step % checkpointEvery === 0 || step === totalSteps || world.phase === 'stageFinish') {
      if (checkpoints[checkpoints.length - 1]?.frame !== world.frame) {
        checkpoints.push(captureCheckpoint(world));
      }
    }
  }

  return {
    id,
    description,
    arena,
    playerOne,
    playerTwo,
    mode,
    totalSteps,
    initialStateHash,
    finalStateHash: combatStateHash(world),
    checkpoints,
  };
}

export function buildCppParityFixtures(): CppParityFixturesBundle {
  const scenarios: GoldenReplayScenario[] = [
    runScenario(
      'guto-vs-rafa-walk-jump-strikes',
      'Intro 105f + aproximacao, pulo, ataque fraco, forte e defesa entre Guto Barba e Rafa Mare no Cais',
      'cais-da-cidade',
      'guto-barba',
      'rafa-mare',
      'versus',
      240,
      (step) => {
        if (step <= 105) return {};
        if (step >= 106 && step <= 135) return { p1: ['right'], p2: ['left'] };
        if (step === 136) return { p1: ['light'], p2: ['left'] };
        if (step === 160) return { p1: ['heavy'], p2: ['block'] };
        if (step === 195) return { p2: ['up', 'left'] };
        if (step === 205) return { p2: ['heavy'] };
        return {};
      },
      15,
    ),
    runScenario(
      'noir-vs-astro-specials-and-projectiles',
      'Comandos especiais e projeteis em modo treino entre Noir Reflexo e Astro Riso na Cozinha Macabra',
      'cozinha-macabra',
      'noir-reflexo',
      'astro-riso',
      'training',
      210,
      (step) => {
        if (step <= 105) return {};
        if (step === 110) return { p1: ['down'] };
        if (step === 111) return { p1: ['down', 'right'] };
        if (step === 112) return { p1: ['right', 'special'] };
        if (step >= 120 && step <= 145) return { p2: ['left'] };
        if (step === 150) return { p2: ['down'] };
        if (step === 151) return { p2: ['down', 'left'] };
        if (step === 152) return { p2: ['left', 'special'] };
        return {};
      },
      15,
    ),
    runScenario(
      'dante-vs-leo-universal-grab',
      'Aproximacao completa e execucao do agarrao universal (light+heavy simultaneo) entre Dante Sinal e Leo Violeta no Sitio',
      'sitio',
      'dante-sinal',
      'leo-violeta',
      'training',
      240,
      (step) => {
        if (step <= 105) return {};
        if (step >= 106 && step <= 150) return { p1: ['right'], p2: ['left'] };
        if (step === 152) return { p1: ['light', 'heavy'] };
        return {};
      },
      10,
    ),
  ];

  return {
    schemaVersion: 1,
    sourceRepository: 'mikerock12/RuaDeAco',
    engineContract: {
      fixedHz: 60,
      combatWidth: COMBAT_WIDTH,
      combatHeight: COMBAT_HEIGHT,
      groundY: GROUND_Y,
      stageLeft: STAGE_LEFT,
      stageRight: STAGE_RIGHT,
      roundTimeFrames: ROUND_TIME_FRAMES,
      roundsToWin: ROUNDS_TO_WIN,
      maxMeter: MAX_METER,
      landingFrames: LANDING_FRAMES,
      wakeUpFrames: WAKE_UP_FRAMES,
      finishWindowFrames: FINISH_WINDOW,
      finishThrowFrame: FINISH_THROW,
      finishEndFrame: FINISH_END,
      finisherArenas: FINISHER_ARENAS,
    },
    arenas: ARENAS,
    fighters: FIGHTERS,
    goldenScenarios: scenarios,
  };
}
