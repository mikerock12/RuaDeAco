import type { ArenaDefinition } from '../types/game';
import type { CombatEvent, FighterId, HeldVictimState } from '../types/combat';
import { GROUND_Y } from '../config/gameConfig';
import {
  GRAB_HOLD_ANGLE,
  grabHandPoint,
  grabLiftArt,
  grabVictimArtPose,
  rootFromHold,
} from '../fighters/grabArtTiming';
import { GRAB_VICTIM_LANDMARKS } from '../fighters/grabVictimLandmarks';

/**
 * Finalizações de fase. Toda a coreografia é função pura do frame fixo, do
 * atacante e da vítima: simulação, desenho e sons leem as mesmas curvas, e os
 * dois clientes online chegam ao mesmo hash.
 */
export type FinisherArena = ArenaDefinition['id'];
export const FINISHER_ARENAS: readonly FinisherArena[] = ['cais-da-cidade', 'cozinha-macabra', 'sitio'];

/** Janela para o vencedor agarrar (frames). */
export const FINISH_WINDOW = 480;
/** Frame em que o corpo deixa as mãos do atacante. */
export const FINISH_THROW = 60;
/** Fim da sequência, comum às três arenas. */
export const FINISH_END = 300;

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const ease = (x: number): number => { const t = clamp01(x); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Oscilação inteira, sem seno: o hash online não depende de libm. */
const wobble = (frame: number, period = 16): number => {
  const t = frame % period;
  const half = period / 2;
  return t < half ? t - half / 2 : period * 0.75 - t;
};

export interface FinisherVictimPose {
  readonly state: HeldVictimState;
  readonly poseFrame: number;
  /** Raiz (pés) absoluta no espaço 640×360. */
  readonly x: number;
  readonly y: number;
  /** Rotação já no espaço da tela (facing aplicado). */
  readonly rotation: number;
  readonly scale: number;
  readonly visible: boolean;
  readonly depth: 'behind' | 'front';
  /** Linha horizontal abaixo da qual o corpo é cortado (dentro do panelão). */
  readonly cutBelowY: number | null;
}

interface Hold {
  readonly poseFrame: number;
  readonly tilt: number;
  readonly landmark: readonly [number, number, number, number, number];
}

/** Quadro deitado e ponto de pega usados depois que o corpo sai das mãos. */
function flightHold(victim: FighterId): Hold {
  const art = grabLiftArt(victim, 1);
  return { poseFrame: art.poseFrame, tilt: art.tilt, landmark: GRAB_VICTIM_LANDMARKS[victim].lifted[art.poseFrame]! };
}

/**
 * Raiz absoluta para que o ponto de pega do corpo fique em (holdX, holdY)
 * com o tronco no ângulo pedido (unidades da frente do atacante).
 */
function placeHold(hold: Hold, holdX: number, holdY: number, bodyAngle: number, facing: 1 | -1, scale: number) {
  const rotation = bodyAngle - hold.tilt;
  const root = rootFromHold({ x: 0, y: 0 }, hold.landmark, rotation);
  return { x: holdX + facing * root.x * scale, y: holdY + root.y * scale, rotation: facing * rotation };
}

/** Ponto de pega absoluto de uma pose já posicionada (inverso de placeHold), para auditoria. */
export function victimHoldPoint(pose: Pick<FinisherVictimPose, 'x' | 'y' | 'rotation' | 'scale' | 'poseFrame' | 'state'>, victim: FighterId, facing: 1 | -1): { x: number; y: number } {
  const landmark = pose.state === 'grabbedFront'
    ? GRAB_VICTIM_LANDMARKS[victim].front[pose.poseFrame]!
    : GRAB_VICTIM_LANDMARKS[victim].lifted[pose.poseFrame]!;
  const rotation = facing * pose.rotation;
  const root = rootFromHold({ x: 0, y: 0 }, landmark, rotation);
  return { x: pose.x - facing * root.x * pose.scale, y: pose.y - root.y * pose.scale };
}

/** Preparação, sustentação lenta acima da cabeça, arremesso rápido e recuperação. */
export function finisherAttackerFrame(frame: number): number {
  if (frame < 12) return 6 + Math.floor(frame / 3);
  if (frame < 30) return 10 + Math.floor((frame - 12) * 13 / 18);
  if (frame < 46) return 23;
  if (frame < 54) return 29;
  if (frame < 60) return 35;
  return Math.min(65, 40 + Math.floor((frame - 60) * 1.1));
}

/** Enquanto o corpo está nas mãos, a pose é a do agarrão universal. */
function heldPose(frame: number, originX: number, facing: 1 | -1, attacker: FighterId, victim: FighterId): FinisherVictimPose {
  const held = grabVictimArtPose(attacker, victim, finisherAttackerFrame(Math.min(frame, FINISH_THROW - 1)));
  return {
    state: held.state, poseFrame: held.poseFrame,
    x: originX + facing * held.x, y: GROUND_Y + held.y,
    rotation: facing * held.rotation, scale: 1, visible: true, depth: held.depth, cutBelowY: null,
  };
}

/** Ponto de pega absoluto no instante do arremesso (mãos da pose 8). */
function throwOrigin(originX: number, facing: 1 | -1, attacker: FighterId): { x: number; y: number } {
  const hand = grabHandPoint(attacker, finisherAttackerFrame(FINISH_THROW - 1));
  return { x: originX + facing * hand.x, y: GROUND_Y + hand.y };
}

interface Flight {
  readonly from: { x: number; y: number };
  readonly to: { x: number; y: number };
  readonly start: number;
  readonly end: number;
  readonly height: number;
  readonly spins: number;
  readonly endAngle: number;
  readonly endScale: number;
}

function flightPose(flight: Flight, frame: number, hold: Hold, facing: 1 | -1): FinisherVictimPose & { t: number } {
  const t = clamp01((frame - flight.start) / (flight.end - flight.start));
  const holdX = mix(flight.from.x, flight.to.x, t);
  const holdY = mix(flight.from.y, flight.to.y, t) - flight.height * 4 * t * (1 - t);
  const scale = mix(1, flight.endScale, ease(t));
  const angle = mix(GRAB_HOLD_ANGLE, flight.endAngle + flight.spins * Math.PI * 2, t);
  const placed = placeHold(hold, holdX, holdY, angle, facing, scale);
  return { state: 'grabbedLifted', poseFrame: hold.poseFrame, ...placed, scale, visible: true, depth: 'front', cutBelowY: null, t };
}

// ---------------------------------------------------------------------------
// Cais da Cidade: o corpo voa para a água atrás do cais e o monstro emerge
// enorme, de frente para o atacante, e o pega no ar com as mandíbulas.
// ---------------------------------------------------------------------------
export const FINISH_SPLASH = 112;
export const FINISH_BITE = 160;
/** Linha d'água logo atrás da borda do cais. */
export const FINISH_WATER_Y = 262;
export const CAIS_MONSTER_SCALE = 1.35;
export const CAIS_MONSTER_DISTANCE = 185;
const CAIS_VICTIM_SCALE = 0.8;
const MOUTHS = [[56, -57], [33, -115], [24, -114], [33, -111], [20, -132], [100, -82], [61, -82], [58, -82], [24, -115], [24, -113], [47, -59], [68, -31]] as const;
const MONSTER_KEYS = [[116, 0], [124, 1], [134, 2], [144, 3], [152, 4], [160, 5], [166, 6],
  [170, 7], [183, 8], [194, 9], [207, 8], [221, 9], [240, 10], [262, 11]] as const;

/** O monstro nasce à frente do atacante, sempre dentro da tela. */
export function caisMonsterX(originX: number, facing: 1 | -1): number {
  return Math.max(150, Math.min(490, originX + facing * CAIS_MONSTER_DISTANCE));
}

/** Doze desenhos reais do monstro mais a emersão pela linha d'água; virado para o atacante. */
export function finisherMonsterPose(frame: number, originX = 280, facing: 1 | -1 = 1) {
  let pose = 0;
  for (const [start, index] of MONSTER_KEYS) if (frame >= start) pose = index;
  const rise = ease((frame - 116) / 34), sink = ease((frame - 244) / 45);
  const reveal = rise * (1 - sink);
  const lunge = ease((frame - 152) / 14) * (1 - ease((frame - 183) / 15));
  const base = caisMonsterX(originX, facing);
  const x = base - facing * 14 * lunge;
  const waterY = FINISH_WATER_Y + (1 - reveal) * 160 * CAIS_MONSTER_SCALE;
  const [mx, my] = MOUTHS[pose]!;
  // A folha olha para a direita; espelhada, ela encara o atacante.
  const flip = facing === 1;
  return {
    frame: pose, x, y: waterY, reveal, flip, scale: CAIS_MONSTER_SCALE,
    mouthX: x + (flip ? -mx : mx) * CAIS_MONSTER_SCALE, mouthY: waterY + my * CAIS_MONSTER_SCALE,
  };
}

function caisVictimPose(frame: number, originX: number, facing: 1 | -1, attacker: FighterId, victim: FighterId): FinisherVictimPose {
  if (frame < FINISH_THROW) return heldPose(frame, originX, facing, attacker, victim);
  const hold = flightHold(victim);
  const landing = { x: caisMonsterX(originX, facing) - facing * 10, y: FINISH_WATER_Y - 6 };
  if (frame < FINISH_SPLASH) {
    return flightPose({
      from: throwOrigin(originX, facing, attacker), to: landing, start: FINISH_THROW, end: FINISH_SPLASH,
      height: 92, spins: 1, endAngle: GRAB_HOLD_ANGLE, endScale: CAIS_VICTIM_SCALE,
    }, frame, hold, facing);
  }
  // Submerso até a cabeça do monstro romper a água; depois preso nas mandíbulas até a mordida.
  const monster = finisherMonsterPose(frame, originX, facing);
  const jaws = frame >= 134 && frame < FINISH_BITE;
  const angle = GRAB_HOLD_ANGLE + wobble(frame, 12) * 0.03;
  const placed = placeHold(hold, monster.mouthX, monster.mouthY, angle, facing, CAIS_VICTIM_SCALE);
  return { state: 'grabbedLifted', poseFrame: hold.poseFrame, ...placed, scale: CAIS_VICTIM_SCALE, visible: jaws, depth: 'front', cutBelowY: null };
}

function caisCue(frame: number): CombatEvent['type'] | null {
  if (frame === FINISH_THROW) return 'monsterRoar';
  if (frame === FINISH_SPLASH) return 'finishSplash';
  if (frame === FINISH_BITE || frame === FINISH_BITE + 24 || frame === FINISH_BITE + 51) return 'monsterBite';
  return null;
}

// ---------------------------------------------------------------------------
// Cozinha Macabra: mergulho de cabeça no panelão, pernas para fora, afunda
// enquanto a bruxa mexe; sobram caveira e ossos.
// ---------------------------------------------------------------------------
/** Boca do panelão no espaço 640×360. */
export const KITCHEN_POT_X = 442;
export const KITCHEN_POT_Y = 152;
/** Borda frontal do panelão: abaixo dela o corpo fica escondido. */
export const KITCHEN_POT_RIM_Y = 160;
export const KITCHEN_DROP = 108;
export const KITCHEN_SUNK = 178;
export const KITCHEN_BONES = 210;
const KITCHEN_STIR_AT = [140, 164, 188] as const;
const KITCHEN_VICTIM_SCALE = 0.55;

export function kitchenFinishCue(frame: number): 'potDrop' | 'witchStir' | 'bonesLeft' | null {
  if (frame === KITCHEN_DROP) return 'potDrop';
  if ((KITCHEN_STIR_AT as readonly number[]).includes(frame)) return 'witchStir';
  if (frame === KITCHEN_BONES) return 'bonesLeft';
  return null;
}

function kitchenVictimPoseInner(frame: number, originX: number, facing: 1 | -1, attacker: FighterId, victim: FighterId): FinisherVictimPose {
  if (frame < FINISH_THROW) return heldPose(frame, originX, facing, attacker, victim);
  const hold = flightHold(victim);
  // O corpo gira até entrar de cabeça (π) na boca do panelão.
  if (frame < KITCHEN_DROP) {
    return flightPose({
      from: throwOrigin(originX, facing, attacker), to: { x: KITCHEN_POT_X, y: KITCHEN_POT_Y - 4 },
      start: FINISH_THROW, end: KITCHEN_DROP, height: 76, spins: 0,
      endAngle: Math.PI, endScale: KITCHEN_VICTIM_SCALE,
    }, frame, hold, facing);
  }
  const sink = ease((frame - KITCHEN_DROP) / (KITCHEN_SUNK - KITCHEN_DROP));
  const kick = wobble(frame, 12) * 0.035 * (1 - sink);
  const placed = placeHold(hold, KITCHEN_POT_X + wobble(frame, 16) * 0.5, KITCHEN_POT_Y - 4 + sink * 78, Math.PI + kick, facing, KITCHEN_VICTIM_SCALE);
  return {
    state: 'grabbedLifted', poseFrame: hold.poseFrame, ...placed, scale: KITCHEN_VICTIM_SCALE,
    visible: frame < KITCHEN_SUNK, depth: 'front', cutBelowY: KITCHEN_POT_RIM_Y,
  };
}

// ---------------------------------------------------------------------------
// Sítio: as portas do galpão se abrem, um mascarado com tridente aparece e o
// corpo é arremessado sobre as pontas; ele recolhe a presa e as portas fecham.
// ---------------------------------------------------------------------------
/** Frente do galpão no fundo do Sítio (espaço 640×360). */
export const SHED = { left: 271, right: 384, top: 129, bottom: 216 } as const;
export const SHED_DOORS_OPEN_START = 30;
export const SHED_DOORS_OPEN_END = 80;
export const SHED_FARMER_APPEAR = 62;
export const SITIO_IMPALE = 112;
export const SITIO_SAG_START = 150;
export const SITIO_SAG_END = 200;
export const SITIO_RETREAT_START = 232;
export const SHED_DOORS_CLOSE_START = 244;
export const SHED_DOORS_CLOSE_END = 282;
const SITIO_VICTIM_SCALE = 0.42;
export const SHED_FARMER_X = (SHED.left + SHED.right) / 2;
export const SHED_FARMER_FEET_Y = SHED.bottom + 1;
/** Mãos do mascarado em cada pose (relativas aos pés, x = frente do sprite). */
const FARMER_HANDS = [[8, -41], [8, -53], [8, -38]] as const;
/** Base das pontas do tridente acima da mão que o segura (cabo de 56 px, pega no meio). */
const TRIDENT_GRIP_TO_PRONGS = 22;
const TRIDENT_GRIP_TO_BASE = 26;

export interface SitioFinisherStage {
  readonly doors: number;
  readonly farmerVisible: boolean;
  readonly farmerFrame: number;
  readonly farmerX: number;
  readonly farmerFeetY: number;
  /** Lado para onde o mascarado olha (1 = direita). */
  readonly farmerFacing: 1 | -1;
  readonly tridentX: number;
  readonly tridentBaseY: number;
  readonly tridentTipX: number;
  readonly tridentTipY: number;
  readonly shadow: number;
  readonly blood: number;
}

/** O mascarado encara o atacante; o tridente fica na mão da frente, vertical. */
export function sitioFinisherStage(frame: number, originX: number): SitioFinisherStage {
  const opening = ease((frame - SHED_DOORS_OPEN_START) / (SHED_DOORS_OPEN_END - SHED_DOORS_OPEN_START));
  const closing = ease((frame - SHED_DOORS_CLOSE_START) / (SHED_DOORS_CLOSE_END - SHED_DOORS_CLOSE_START));
  const doors = opening * (1 - closing);
  const farmerFacing: 1 | -1 = originX <= SHED_FARMER_X ? -1 : 1;
  const farmerFrame = frame < SITIO_IMPALE ? (frame >= 96 ? 1 : 0) : frame < 150 ? 2 : 1;
  const hand = FARMER_HANDS[farmerFrame]!;
  const brace = frame >= SITIO_IMPALE && frame < 150 ? 4 : 0;
  const tridentX = SHED_FARMER_X + farmerFacing * hand[0];
  const gripY = SHED_FARMER_FEET_Y + hand[1] + brace;
  return {
    doors,
    farmerVisible: frame >= SHED_FARMER_APPEAR && frame < SHED_DOORS_CLOSE_END,
    farmerFrame,
    farmerX: SHED_FARMER_X,
    farmerFeetY: SHED_FARMER_FEET_Y,
    farmerFacing,
    tridentX,
    tridentBaseY: gripY + TRIDENT_GRIP_TO_BASE,
    tridentTipX: tridentX,
    tridentTipY: gripY - TRIDENT_GRIP_TO_PRONGS,
    shadow: ease((frame - SITIO_RETREAT_START) / 26),
    blood: frame >= SITIO_IMPALE ? 1 - ease((frame - SITIO_IMPALE) / 40) : 0,
  };
}

function sitioVictimPose(frame: number, originX: number, facing: 1 | -1, attacker: FighterId, victim: FighterId): FinisherVictimPose {
  if (frame < FINISH_THROW) return heldPose(frame, originX, facing, attacker, victim);
  const hold = flightHold(victim);
  const stage = sitioFinisherStage(frame, originX);
  const tip = { x: stage.tridentTipX, y: stage.tridentTipY + 4 };
  if (frame < SITIO_IMPALE) {
    return flightPose({
      from: throwOrigin(originX, facing, attacker), to: tip, start: FINISH_THROW, end: SITIO_IMPALE,
      height: 70, spins: 1, endAngle: GRAB_HOLD_ANGLE, endScale: SITIO_VICTIM_SCALE,
    }, frame, hold, facing);
  }
  // Espasmos após o impacto; depois o corpo cede e pende de leve sobre as pontas
  // enquanto o mascarado recua para a sombra.
  const twitch = frame < 150 ? wobble(frame, 8) * 0.03 : 0;
  const sag = ease((frame - SITIO_SAG_START) / (SITIO_SAG_END - SITIO_SAG_START));
  const angle = GRAB_HOLD_ANGLE + sag * 0.22 + twitch;
  const placed = placeHold(hold, tip.x, tip.y + (frame < 150 ? wobble(frame, 8) * 0.25 : 0) + sag * 3, angle, facing, SITIO_VICTIM_SCALE);
  return {
    state: 'grabbedLifted', poseFrame: hold.poseFrame, ...placed, scale: SITIO_VICTIM_SCALE,
    visible: frame < SHED_DOORS_CLOSE_END, depth: 'front', cutBelowY: null,
  };
}

/**
 * Depois de soltar o corpo, o vencedor recua alguns passos para não cobrir o
 * galpão, que fica no centro do palco. Deslocamento inteiro por frame.
 */
export const SITIO_STEP_BACK_START = 84;
export const SITIO_STEP_BACK_END = 132;
export function sitioAttackerShift(frame: number, originX: number, facing: 1 | -1): number {
  if (frame < SITIO_STEP_BACK_START || frame >= SITIO_STEP_BACK_END) return 0;
  const distance = Math.abs(originX - SHED_FARMER_X);
  if (distance >= 150) return 0;
  return -facing * (frame % 2 === 0 ? 2 : 1);
}

function sitioCue(frame: number): CombatEvent['type'] | null {
  if (frame === SHED_DOORS_OPEN_START) return 'shedDoors';
  if (frame === SITIO_IMPALE) return 'tridentStab';
  if (frame === SHED_DOORS_CLOSE_END) return 'shedSlam';
  return null;
}

// ---------------------------------------------------------------------------

export function finisherVictimPose(
  arena: FinisherArena | null, frame: number, originX: number, facing: 1 | -1,
  attacker: FighterId = 'rafa-mare', victim: FighterId = 'noir-reflexo',
): FinisherVictimPose {
  if (arena === 'cozinha-macabra') return kitchenVictimPoseInner(frame, originX, facing, attacker, victim);
  if (arena === 'sitio') return sitioVictimPose(frame, originX, facing, attacker, victim);
  return caisVictimPose(frame, originX, facing, attacker, victim);
}

export function finisherCue(arena: FinisherArena | null, frame: number): CombatEvent['type'] | null {
  if (arena === 'cozinha-macabra') return kitchenFinishCue(frame);
  if (arena === 'sitio') return sitioCue(frame);
  return caisCue(frame);
}

/** Faixa exibida no fim de cada finalização. */
export function finisherBanner(arena: FinisherArena | null, frame: number): string | null {
  if (arena === 'cozinha-macabra') return frame >= KITCHEN_BONES + 20 ? 'O JANTAR ESTA SERVIDO' : null;
  if (arena === 'sitio') return frame >= SHED_DOORS_CLOSE_END ? 'A COLHEITA ESTA FEITA' : null;
  return frame >= 238 ? 'O CAIS COBRA SUA ALMA' : null;
}
