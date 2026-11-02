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
import { ASSET_MANIFEST, CONCEPT_ASSETS } from '../assets/assetManifest';
import { FIGHTER_SPRITE_ASSETS } from '../fighters/visual';
import { buildCalibratedMoveHitboxes, FIGHTER_COLLISION_PROFILES } from '../fighters/collision/collisionProfiles';
import { MUSIC_CATALOG } from '../audio/musicCatalog';
import { SAMPLES, SPECIAL_SOUNDS } from '../audio/sfxCatalog';
import { NETWORK_ACTIONS, wireInputFrame } from '../online/inputCodec';
import type { WireInputFrame } from '../online/protocol';
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
import { grabVictimArtPose, GRAB_HANDS, GRAB_LIFT_ART } from '../fighters/grabArtTiming';
import { GRAB_VICTIM_LANDMARKS } from '../fighters/grabVictimLandmarks';

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
  readonly roundWins: number;
  readonly grounded: boolean;
  readonly moveId: string | null;
  readonly mechanics: readonly number[];
}

export interface GoldenFrameCheckpoint {
  /** Invocation index, distinct from world.frame during hitstop and transitions. */
  readonly step: number;
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
  readonly inputs: readonly { readonly step: number; readonly p1: WireInputFrame; readonly p2: WireInputFrame }[];
}

export interface CppParityFixturesBundle {
  readonly schemaVersion: 2;
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
  readonly inputActions: typeof NETWORK_ACTIONS;
  readonly universalGrabPoses: Readonly<Record<string, ReturnType<typeof grabVictimArtPose>[]>>;
  readonly collisionProfiles: typeof FIGHTER_COLLISION_PROFILES;
  readonly effectiveHitboxes: Readonly<Record<string, Readonly<Record<string, ReturnType<typeof buildCalibratedMoveHitboxes>>>>>;
  readonly presentation: {
    readonly worldToScreen: 1;
    readonly fighterSprites: typeof FIGHTER_SPRITE_ASSETS;
    readonly portraits: typeof CONCEPT_ASSETS;
    readonly assets: typeof ASSET_MANIFEST;
    readonly music: typeof MUSIC_CATALOG;
    readonly samples: typeof SAMPLES;
    readonly specialSounds: typeof SPECIAL_SOUNDS;
    readonly grabGeometry: { readonly hands: typeof GRAB_HANDS; readonly liftArt: typeof GRAB_LIFT_ART; readonly landmarks: typeof GRAB_VICTIM_LANDMARKS };
  };
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

function captureCheckpoint(world: CombatWorld, step: number): GoldenFrameCheckpoint {
  const snap = world.snapshot();
  const [f1, f2] = world.fighters;
  return {
    step,
    frame: snap.frame,
    phase: snap.phase,
    phaseFrame: snap.phaseFrame,
    stateHash: combatStateHash(world),
    fighters: [
      {
        id: f1.id,
        x: f1.x,
        y: f1.y,
        velocityX: f1.velocityX,
        velocityY: f1.velocityY,
        facing: f1.facing,
        state: f1.state,
        stateFrame: f1.stateFrame,
        health: f1.health,
        meter: f1.meter,
        roundWins: f1.roundWins,
        grounded: f1.grounded,
        moveId: f1.currentMove?.id ?? null,
        mechanics: captureMechanics(f1),
      },
      {
        id: f2.id,
        x: f2.x,
        y: f2.y,
        velocityX: f2.velocityX,
        velocityY: f2.velocityY,
        facing: f2.facing,
        state: f2.state,
        stateFrame: f2.stateFrame,
        health: f2.health,
        meter: f2.meter,
        roundWins: f2.roundWins,
        grounded: f2.grounded,
        moveId: f2.currentMove?.id ?? null,
        mechanics: captureMechanics(f2),
      },
    ],
    activeProjectiles: snap.projectiles.length,
    activeGrabMoveId: snap.activeGrab?.moveId ?? null,
  };
}

/** Ordem estável consumida pelo runner C++; não arredondar os dados da origem. */
function captureMechanics(fighter: CombatWorld['fighters'][0]): readonly number[] {
  return [fighter.armorHits, fighter.passiveFrames, fighter.invulnerableFrames,
    fighter.damageReductionFrames, fighter.damageReductionMultiplier, fighter.damageReductionCooldownFrames,
    fighter.parryFrames, fighter.parryRiposteDamage, fighter.offensiveDebuffFrames, fighter.offensiveDebuffMultiplier,
    fighter.freezeEffectFrames, fighter.victimRotation, fighter.victimPoseFrame ?? -1];
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
  initial?: { readonly p1?: Partial<Pick<CombatWorld['fighters'][0], 'x' | 'health' | 'roundWins'>>; readonly p2?: Partial<Pick<CombatWorld['fighters'][0], 'x' | 'health' | 'roundWins'>> },
): GoldenReplayScenario {
  const world = new CombatWorld(
    getFighterDefinition(playerOne),
    getFighterDefinition(playerTwo),
    mode,
    arena,
  );
  if (initial?.p1) Object.assign(world.fighters[0], initial.p1);
  if (initial?.p2) Object.assign(world.fighters[1], initial.p2);
  const initialStateHash = combatStateHash(world);
  const checkpoints: GoldenFrameCheckpoint[] = [captureCheckpoint(world, 0)];
  const inputs: Array<{ step: number; p1: WireInputFrame; p2: WireInputFrame }> = [];
  let previousP1Mask = 0;
  let previousP2Mask = 0;
  let prevP1 = new Set<InputAction>();
  let prevP2 = new Set<InputAction>();

  for (let step = 1; step <= totalSteps; step += 1) {
    const actions = resolver(step);
    const curP1 = new Set<InputAction>(actions.p1 ?? []);
    const curP2 = new Set<InputAction>(actions.p2 ?? []);
    const input1 = makeInputFrame(curP1, prevP1);
    const input2 = makeInputFrame(curP2, prevP2);
    const p1 = wireInputFrame(step, input1, previousP1Mask);
    const p2 = wireInputFrame(step, input2, previousP2Mask);
    inputs.push({ step, p1, p2 });
    previousP1Mask = p1.heldMask;
    previousP2Mask = p2.heldMask;
    world.step(input1, input2);
    prevP1 = curP1;
    prevP2 = curP2;
    checkpoints.push(captureCheckpoint(world, step));
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
    inputs,
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
    ),
  ];

  // Cada especial é acionado pelo mesmo CommandBuffer do jogo original.
  // Os cenários não usam atalhos artificiais de botões do port nativo.
  for (const fighter of FIGHTERS) {
    for (const move of Object.values(fighter.moves).filter(candidate => candidate.state === 'specialAttack')) {
      const directions = move.command.directions ?? [];
      scenarios.push(runScenario(
        `${fighter.id}-${move.id}-canonical-command`,
        `Comando canônico, eventos e recuperação de ${move.label}`,
        'cais-da-cidade', fighter.id, fighter.id === 'guto-barba' ? 'rafa-mare' : 'guto-barba',
        'training', 360,
        step => {
          const index = step - 110;
          if (index < 0 || index > directions.length) return {};
          const token = directions[Math.min(index, directions.length - 1)];
          const actions: InputAction[] = [];
          if (token === 'down' || token === 'downForward' || token === 'downBack') actions.push('down');
          if (token === 'forward' || token === 'downForward') actions.push('right');
          if (token === 'back' || token === 'downBack') actions.push('left');
          if (token === 'up') actions.push('up');
          if (index === directions.length) actions.push(...move.command.buttons);
          return { p1: actions };
        },
        { p1: { x: 240 }, p2: { x: 370 } },
      ));
    }
    scenarios.push(runScenario(
      `${fighter.id}-normals-air-defense-and-grab`,
      'Fraco/forte em pé, agachado, avanço, ataques aéreos, defesa e agarrão universal',
      'cozinha-macabra',fighter.id,fighter.id === 'guto-barba' ? 'rafa-mare' : 'guto-barba','training',900,
      step => {
        if (step===110) return {p1:['light']};
        if (step===180) return {p1:['heavy']};
        if (step===250) return {p1:['down','light']};
        if (step===320) return {p1:['down','heavy']};
        if (step===390) return {p1:['right','light']};
        if (step===460) return {p1:['right','heavy']};
        if (step===530) return {p1:['up','right']};
        if (step===536) return {p1:['light']};
        if (step===610) return {p1:['up','left']};
        if (step===616) return {p1:['heavy']};
        if (step>=700&&step<720) return {p1:['right'],p2:['left']};
        if (step===722) return {p1:['light','heavy']};
        if (step>=810&&step<825) return {p1:['block'],p2:step===812?['light']:[]};
        return {};
      },
      {p1:{x:240},p2:{x:370}},
    ));
  }
  for (const arena of ARENAS) {
    for (const reverse of [false, true]) {
      scenarios.push(runScenario(
        `finisher-${arena.id}-${reverse ? 'left' : 'right'}`,
        'KO no round decisivo, agarrão e coreografia integral da finalização de palco',
        arena.id, reverse ? 'noir-reflexo' : 'guto-barba', reverse ? 'astro-riso' : 'rafa-mare',
        'versus', 600,
        step => step===110 ? {p1:['light']} : step===150 ? {p1:['light','heavy']} : {},
        {p1:{x:reverse?390:250,roundWins:1},p2:{x:reverse?310:330,health:1}},
      ));
    }
  }

  return {
    schemaVersion: 2,
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
    inputActions: NETWORK_ACTIONS,
    universalGrabPoses: Object.fromEntries(FIGHTERS.flatMap(attacker => FIGHTERS.map(victim => [
      `${attacker.id}:${victim.id}`,
      Array.from({ length: 67 }, (_, frame) => grabVictimArtPose(attacker.id, victim.id, frame)),
    ]))),
    collisionProfiles: FIGHTER_COLLISION_PROFILES,
    effectiveHitboxes: Object.fromEntries(FIGHTERS.map(fighter => [fighter.id,
      Object.fromEntries(Object.values(fighter.moves).map(move => [move.id,
        buildCalibratedMoveHitboxes(fighter.id, move)])),
    ])),
    presentation: {
      worldToScreen: 1,
      fighterSprites: FIGHTER_SPRITE_ASSETS,
      portraits: CONCEPT_ASSETS,
      assets: ASSET_MANIFEST,
      music: MUSIC_CATALOG,
      samples: SAMPLES,
      specialSounds: SPECIAL_SOUNDS,
      grabGeometry: { hands: GRAB_HANDS, liftArt: GRAB_LIFT_ART, landmarks: GRAB_VICTIM_LANDMARKS },
    },
  };
}

/** Mantém cada passo em uma linha para revisar e versionar replays extensos. */
export function serializeCppParityFixtures(bundle: CppParityFixturesBundle): string {
  const { goldenScenarios, ...metadata } = bundle;
  const prefix = JSON.stringify(metadata, null, 2).slice(0, -2);
  const scenarios = goldenScenarios.map(scenario => {
    const { checkpoints, inputs, ...description } = scenario;
    return `${JSON.stringify(description, null, 2).slice(0, -2)},\n"checkpoints": [\n${checkpoints.map(cp => JSON.stringify(cp)).join(',\n')}\n],\n"inputs": [\n${inputs.map(input => JSON.stringify(input)).join(',\n')}\n]\n}`;
  });
  return `${prefix},\n"goldenScenarios": [\n${scenarios.join(',\n')}\n]\n}\n`;
}
