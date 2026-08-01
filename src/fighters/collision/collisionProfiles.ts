import type {
  FighterId,
  HitboxDefinition,
  HurtboxDefinition,
  LocalRect,
  MoveDefinition,
  TimedHitbox,
} from '../../types/combat';
import { GROUND_Y } from '../../config/gameConfig';

/** Versão do contrato raster/colisão. Alterações exigem nova auditoria offline. */
export const COLLISION_PROFILE_VERSION = 1;
/** Margem lógica além do último pixel ofensivo aprovado. */
export const COLLISION_RESPONSE_MARGIN = 3;
const NO_ACTIVE_HITBOXES: readonly HitboxDefinition[] = Object.freeze([]);

export type CollisionPoseKind = 'standing' | 'crouching' | 'airborne' | 'landing';

export interface CollisionPoseProfile {
  readonly hurtboxes: readonly HurtboxDefinition[];
  readonly pushbox: LocalRect;
}

export interface FighterCollisionProfile {
  readonly version: typeof COLLISION_PROFILE_VERSION;
  readonly measuredFrameSize: 256 | 288;
  readonly poses: Readonly<Record<CollisionPoseKind, CollisionPoseProfile>>;
  /** Uma entrada por range de `move.hitboxes`; cada range aceita 1..3 AABBs. */
  readonly moves: Readonly<Record<string, readonly (readonly LocalRect[])[]>>;
}

type RectTuple = readonly [x: number, top: number, right: number, bottom: number];
type MoveTupleProfile = Readonly<Record<string, readonly (readonly RectTuple[])[]>>;

const rect = ([x, top, right, bottom]: RectTuple): LocalRect => ({
  x,
  y: top,
  width: right - x,
  height: bottom - top,
});

const hurt = (
  region: HurtboxDefinition['region'],
  tuple: RectTuple,
): HurtboxDefinition => ({ ...rect(tuple), region });

const pose = (
  head: RectTuple,
  body: RectTuple,
  legs: RectTuple,
  pushbox: RectTuple,
): CollisionPoseProfile => ({
  hurtboxes: [hurt('head', head), hurt('body', body), hurt('legs', legs)],
  pushbox: rect(pushbox),
});

function poses(
  standing: CollisionPoseProfile,
  crouching: CollisionPoseProfile,
  airborne: CollisionPoseProfile,
): Readonly<Record<CollisionPoseKind, CollisionPoseProfile>> {
  return { standing, crouching, airborne, landing: crouching };
}

function moves(source: MoveTupleProfile): FighterCollisionProfile['moves'] {
  return Object.fromEntries(Object.entries(source).map(([moveId, phases]) => [
    moveId,
    phases.map((boxes) => boxes.map(rect)),
  ]));
}

const STANDARD_AIR = pose(
  [-24, -168, 24, -126],
  [-34, -134, 34, -58],
  [-40, -66, 40, -4],
  [-23, -124, 23, -18],
);

const RAFA_POSES = poses(
  pose([-24, -172, 24, -128], [-35, -138, 35, -58], [-45, -66, 45, 0], [-25, -132, 25, 0]),
  pose([-27, -143, 27, -104], [-43, -112, 43, -45], [-54, -52, 54, 0], [-34, -96, 34, 0]),
  STANDARD_AIR,
);

const ASTRO_POSES = poses(
  pose([-24, -163, 24, -124], [-34, -133, 34, -57], [-43, -65, 43, 0], [-24, -126, 24, 0]),
  pose([-25, -136, 25, -100], [-39, -108, 39, -43], [-48, -51, 48, 0], [-31, -92, 31, 0]),
  STANDARD_AIR,
);

const DANTE_POSES = poses(
  pose([-24, -185, 24, -139], [-34, -147, 34, -63], [-43, -71, 43, 0], [-24, -139, 24, 0]),
  pose([-27, -166, 27, -120], [-40, -128, 40, -49], [-49, -57, 49, 0], [-32, -106, 32, 0]),
  pose([-24, -182, 24, -137], [-34, -145, 34, -62], [-42, -70, 42, -4], [-23, -136, 23, -18]),
);

const LEO_POSES = poses(
  pose([-25, -178, 25, -134], [-36, -143, 36, -61], [-46, -69, 46, 0], [-26, -136, 26, 0]),
  pose([-28, -148, 28, -108], [-43, -116, 43, -46], [-55, -54, 55, 0], [-34, -99, 34, 0]),
  pose([-25, -166, 25, -126], [-36, -136, 36, -59], [-44, -67, 44, -4], [-24, -126, 24, -18]),
);

const NOIR_POSES = poses(
  pose([-24, -176, 24, -132], [-35, -141, 35, -60], [-44, -68, 44, 0], [-25, -134, 25, 0]),
  pose([-27, -132, 27, -96], [-41, -105, 41, -42], [-52, -50, 52, 0], [-33, -90, 33, 0]),
  pose([-24, -160, 24, -120], [-35, -130, 35, -56], [-43, -64, 43, -4], [-23, -121, 23, -18]),
);

const GUTO_POSES = poses(
  pose([-31, -208, 31, -158], [-46, -170, 46, -73], [-55, -82, 55, 0], [-35, -160, 35, 0]),
  pose([-34, -182, 34, -136], [-51, -145, 51, -58], [-62, -68, 62, 0], [-43, -122, 43, 0]),
  pose([-30, -207, 30, -158], [-45, -168, 45, -72], [-53, -81, 53, -5], [-34, -154, 34, -20]),
);

const PROFILES: Readonly<Record<FighterId, FighterCollisionProfile>> = {
  'rafa-mare': {
    version: 1,
    measuredFrameSize: 256,
    poses: RAFA_POSES,
    moves: moves({
      lightPunch: [[ [50, -144, 84, -124] ]],
      heavyPunch: [[ [50, -143, 84, -123] ]],
      lowKick: [[ [59, -115, 93, -94] ]],
      avancoMare: [[ [70, -155, 104, -123] ]],
      rasteira: [[ [77, -41, 113, -11] ]],
      jumpLightNeutral: [[ [10, -136, 44, -92] ]],
      jumpHeavyNeutral: [[ [21, -121, 56, -74] ]],
      jumpLightForward: [[ [44, -146, 78, -92] ]],
      jumpHeavyForward: [[ [84, -90, 119, -62] ]],
      jumpLightBackward: [[ [54, -159, 88, -118] ]],
      jumpHeavyBackward: [[ [59, -174, 94, -121] ]],
      highKick: [[ [58, -127, 95, -101] ]],
      chuteRessaca: [[ [43, -169, 87, -134] ]],
    }),
  },
  'astro-riso': {
    version: 1,
    measuredFrameSize: 256,
    poses: ASTRO_POSES,
    moves: moves({
      lightPunch: [[ [50, -138, 84, -120] ]],
      heavyPunch: [[ [50, -132, 84, -114] ]],
      lowKick: [[ [15, -54, 49, -3] ]],
      passoEstelar: [[ [57, -133, 91, -101] ]],
      rasteira: [[ [63, -33, 100, 2] ]],
      highKick: [[ [23, -197, 60, -140] ]],
      jumpLightNeutral: [[ [31, -85, 65, -39] ]],
      jumpHeavyNeutral: [[ [43, -70, 78, 2] ]],
      jumpLightForward: [[ [54, -124, 88, -105] ]],
      jumpHeavyForward: [[ [55, -64, 91, -27] ]],
      jumpLightBackward: [[ [53, -125, 87, -107] ]],
      jumpHeavyBackward: [[ [60, -72, 95, -46] ]],
      sorrisoRelampago: [[ [53, -134, 96, -112] ]],
      rajadaNeon: [
        [[45, -149, 79, -130]], [[45, -149, 79, -130]],
        [[45, -149, 79, -130]], [[45, -149, 79, -130]],
      ],
      astroGiro: [
        [[58, -109, 99, -84]], [[58, -109, 99, -84]],
        [[58, -109, 99, -84]], [[58, -109, 99, -84]],
        [[58, -109, 99, -84]],
      ],
    }),
  },
  'guto-barba': {
    version: 1,
    measuredFrameSize: 288,
    poses: GUTO_POSES,
    moves: moves({
      elbow: [[ [79, -176, 113, -149] ]],
      heavyPunch: [[ [62, -157, 101, -127] ]],
      frontKick: [[ [52, -118, 110, -56] ]],
      ombrada: [[ [83, -179, 117, -129] ]],
      rasteiraUrso: [[ [67, -71, 125, -20] ]],
      jumpLightNeutral: [[ [35, -173, 69, -119] ]],
      jumpHeavyNeutral: [[ [67, -144, 125, -84] ]],
      jumpLightForward: [[ [41, -203, 75, -82] ]],
      jumpHeavyForward: [[ [73, -139, 131, -75] ]],
      jumpLightBackward: [[ [88, -174, 122, -146] ]],
      jumpHeavyBackward: [[ [71, -149, 108, -87] ]],
      // Referência positiva aprovada: preservada byte a byte na geometria.
      descendingBlow: [[ [16, -169, 109, -117] ]],
      muralhaNorte: [[[55, -197, 89, -126], [55, -75, 89, -5]]],
      ganchoUrso: [[ [28, -150, 90, -84] ]],
      abracoGlacial: [[ [30, -156, 102, -82] ]],
    }),
  },
  'dante-sinal': {
    version: 1,
    measuredFrameSize: 256,
    poses: DANTE_POSES,
    moves: moves({
      lightPunch: [[ [44, -140, 78, -118] ]],
      heavyPunch: [[ [44, -140, 78, -117] ]],
      lowKick: [[ [45, -73, 82, -24] ]],
      avancoLeve: [[ [23, -151, 57, -113] ]],
      rasteira: [[ [47, -45, 88, 2] ]],
      highKick: [[ [34, -188, 71, -122] ]],
      jumpLightNeutral: [[ [41, -143, 75, -121] ]],
      jumpHeavyNeutral: [[ [58, -143, 93, -72] ]],
      jumpLightForward: [[ [42, -145, 76, -122] ]],
      jumpHeavyForward: [[ [41, -122, 76, -45] ]],
      jumpLightBackward: [[ [38, -157, 72, -116] ]],
      jumpHeavyBackward: [[ [41, -117, 76, -75] ]],
    }),
  },
  'leo-violeta': {
    version: 1,
    measuredFrameSize: 256,
    poses: LEO_POSES,
    moves: moves({
      lightPunch: [[ [60, -139, 94, -118] ]],
      heavyPunch: [[ [67, -140, 102, -117] ]],
      lowKick: [[ [55, -49, 90, -7] ]],
      forwardLight: [[ [62, -158, 96, -120] ]],
      sweep: [[ [72, -40, 112, -3] ]],
      forwardHeavy: [[[35, -149, 75, -103], [35, -72, 75, -3]]],
      jumpLightNeutral: [[ [51, -134, 85, -113] ]],
      jumpHeavyNeutral: [[ [66, -87, 104, -48] ]],
      jumpLightForward: [[ [78, -128, 112, -105] ]],
      jumpHeavyForward: [[ [37, -105, 76, -70] ]],
      jumpLightBackward: [[ [47, -127, 81, -105] ]],
      jumpHeavyBackward: [[ [53, -109, 90, -78] ]],
      impactoSombrio: [[ [28, -111, 74, -3] ]],
      pressaoVioleta: [
        [[31, -186, 76, -128]], [[31, -126, 76, -68]],
        [[31, -100, 76, -35]], [[31, -72, 76, -3]],
        [[31, -186, 76, -3]],
      ],
    }),
  },
  'noir-reflexo': {
    version: 1,
    measuredFrameSize: 256,
    poses: NOIR_POSES,
    moves: moves({
      lightPunch: [[ [51, -133, 85, -111] ]],
      heavyPunch: [[ [57, -144, 92, -124] ]],
      lowKick: [[ [43, -53, 78, -15] ]],
      forwardLight: [[ [53, -133, 87, -113] ]],
      sweep: [[ [65, -76, 105, -49] ]],
      // Braço descendente + pé frontal no frame de impacto. A caixa antiga
      // superior ficava quase toda no vazio à frente do personagem.
      forwardHeavy: [[[18, -111, 48, -42], [45, -52, 85, 2]]],
      jumpLightNeutral: [[ [43, -100, 77, -66] ]],
      jumpHeavyNeutral: [[ [30, -127, 68, -37] ]],
      jumpLightForward: [[ [61, -104, 95, -65] ]],
      jumpHeavyForward: [[ [64, -65, 103, -33] ]],
      jumpLightBackward: [[ [73, -108, 107, -78] ]],
      jumpHeavyBackward: [[ [68, -74, 105, -51] ]],
    }),
  },
};

export const FIGHTER_COLLISION_PROFILES = PROFILES;

export function getFighterCollisionProfile(id: FighterId): FighterCollisionProfile | null {
  return PROFILES[id] ?? null;
}

/** Materializa payload de gameplay + geometria medida uma única vez por runtime. */
export function buildCalibratedMoveHitboxes(
  fighterId: FighterId,
  move: MoveDefinition,
): readonly TimedHitbox[] {
  const profile = getFighterCollisionProfile(fighterId);
  if (!profile) return move.hitboxes;
  const phases = profile.moves[move.id];
  if (!phases) {
    if (move.hitboxes.length === 0) return [];
    throw new Error(`Perfil de colisão ausente: fighter=${fighterId} move=${move.id}`);
  }
  if (phases.length !== move.hitboxes.length) {
    throw new Error(`Fases de colisão divergentes: fighter=${fighterId} move=${move.id}`);
  }
  return move.hitboxes.map((timed, phaseIndex) => {
    const source = timed.boxes[0];
    const geometryPhase = phases[phaseIndex];
    if (!source) throw new Error(`Hitbox sem payload: fighter=${fighterId} move=${move.id}`);
    if (!geometryPhase) throw new Error(`Fase vazia: fighter=${fighterId} move=${move.id}`);
    return {
      range: timed.range,
      boxes: geometryPhase.map((geometry): HitboxDefinition => ({
        ...source,
        ...geometry,
      })),
    };
  });
}

/** Combina explicitamente todas as fases coincidentes; nunca depende de `.find()`. */
export function activeHitboxesAtFrame(
  phases: readonly TimedHitbox[],
  stateFrame: number,
): readonly HitboxDefinition[] {
  let active: readonly HitboxDefinition[] | undefined;
  for (const { range, boxes } of phases) {
    if (stateFrame < range.from || stateFrame > range.to) continue;
    // O caso normal retorna o array estático da metadata sem alocar a 60 Hz.
    // Só materializamos uma união se metadata futura declarar fases sobrepostas.
    active = active === undefined ? boxes : [...active, ...boxes];
  }
  return active ?? NO_ACTIVE_HITBOXES;
}

export function collisionPoseKind(
  state: string,
  y: number,
  activeMove: MoveDefinition | null,
): CollisionPoseKind {
  if (activeMove?.air || y < GROUND_Y) return 'airborne';
  if (state === 'landing') return 'landing';
  if (
    state === 'crouch'
    || state === 'blockCrouching'
    || activeMove?.animation === 'crouchLight'
    || activeMove?.animation === 'crouchHeavy'
  ) return 'crouching';
  return 'standing';
}
