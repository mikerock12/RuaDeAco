import type { FighterId } from '../types/combat';
import { grabVictimArtPose } from '../fighters/grabArtTiming';
/** Fixed-frame timings shared by simulation, rendering and sound events. */
export const FINISH_WINDOW = 480;
export const FINISH_THROW = 60;
export const FINISH_SPLASH = 112;
export const FINISH_BITE = 170;
export const FINISH_END = 300;
export const FINISH_LAKE_X = 320;
export const FINISH_LAKE_Y = 242;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => { const t=clamp(x); return t*t*(3-2*t); };
const mix = (a:number,b:number,t:number)=>a+(b-a)*t;
const MOUTHS = [[56,-57],[33,-115],[24,-114],[33,-111],[20,-132],[100,-82],[61,-82],[58,-82],[24,-115],[24,-113],[47,-59],[68,-31]] as const;
const MONSTER_KEYS = [[116,0],[124,1],[134,2],[144,3],[152,4],[160,5],[166,6],
  [170,7],[183,8],[194,9],[207,8],[221,9],[240,10],[262,11]] as const;
/** Separate timeline: 12 actual monster drawings plus waterline emergence. */
export function finisherMonsterPose(frame: number) {
  let pose = 0;
  for(const [start,index] of MONSTER_KEYS) if(frame>=start)pose=index;
  const rise=ease((frame-116)/35), sink=ease((frame-244)/45);
  const reveal=rise*(1-sink);
  const lunge=ease((frame-152)/14)*(1-ease((frame-183)/15));
  const x=FINISH_LAKE_X+12*lunge;
  const waterY=FINISH_LAKE_Y+(1-reveal)*160;
  const [mx,my]=MOUTHS[pose]!;
  return { frame:pose, x, y:waterY, reveal, mouthX:x+mx, mouthY:waterY+my };
}
/** Slower anticipation/overhead hold, fast release, then recovery. */
export function finisherAttackerFrame(frame: number): number {
  if(frame<12)return 6+Math.floor(frame/3);
  if(frame<30)return 10+Math.floor((frame-12)*13/18);
  if(frame<46)return 23;
  if(frame<54)return 29;
  if(frame<60)return 35;
  return Math.min(65,40+Math.floor((frame-60)*1.1));
}
export function finisherVictimPose(frame: number, originX: number, facing: number,
  attacker: FighterId='rafa-mare', victim: FighterId='noir-reflexo') {
  const held = grabVictimArtPose(attacker,victim,finisherAttackerFrame(Math.min(frame,59)));
  if(frame<FINISH_THROW)return {x:originX+facing*held.x,y:304+held.y,rotation:facing*held.rotation,scale:1,visible:true};
  const flight=clamp((frame-FINISH_THROW)/(FINISH_SPLASH-FINISH_THROW));
  const startX=originX+facing*held.x,startY=304+held.y;
  const angle=facing*mix(held.rotation,Math.PI*2.5,flight);
  if(frame<FINISH_SPLASH)return {
    x:mix(startX,FINISH_LAKE_X-18,flight),
    y:mix(startY,FINISH_LAKE_Y,flight)-72*4*flight*(1-flight),
    rotation:angle,scale:mix(1,0.42,ease(flight)),visible:true,
  };
  const monster=finisherMonsterPose(frame);
  const caught=ease((frame-139)/17);
  const swallow=ease((frame-158)/12);
  const rotation = facing * mix(Math.PI * 2.5, Math.PI * 2 + 1.35, caught);
  const scale = 0.42 * (1 - swallow);
  const torso = (victim === 'guto-barba' ? 112 : 94) * scale;
  // Root is at the feet: align the rotated torso, rather than the feet, to the jaws.
  return {x:mix(FINISH_LAKE_X-18,monster.mouthX-Math.sin(rotation)*torso,caught),
    y:mix(FINISH_LAKE_Y-2,monster.mouthY+Math.cos(rotation)*torso,caught),rotation,
    scale,visible:frame<FINISH_BITE};
}

/** Boca do panelão no espaço 640×360. O interior escuro cobre o caldo verde. */
export const KITCHEN_POT_X = 442;
export const KITCHEN_POT_Y = 152;
export const KITCHEN_POT_FEET_Y = 170;
export const KITCHEN_DROP = 108;
export const KITCHEN_BONES = 210;
const KITCHEN_STIR_AT = [140, 164, 188] as const;

/** Deslocamento inteiro, sem seno: o hash online não depende de libm. */
function stirShift(frame: number): number {
  const t = frame % 16;
  return t < 8 ? t - 4 : 12 - t;
}

export function kitchenFinishCue(frame: number): 'potDrop' | 'witchStir' | 'bonesLeft' | null {
  if (frame === KITCHEN_DROP) return 'potDrop';
  if ((KITCHEN_STIR_AT as readonly number[]).includes(frame)) return 'witchStir';
  if (frame === KITCHEN_BONES) return 'bonesLeft';
  return null;
}

/**
 * Mesmo levantamento do agarrão, arco até o panelão e encolhimento enquanto a
 * bruxa mexe. A partir de KITCHEN_BONES o corpo some: a panela mostra só ossos.
 */
export function kitchenVictimPose(frame: number, originX: number, facing: number,
  attacker: FighterId = 'rafa-mare', victim: FighterId = 'noir-reflexo') {
  const held = grabVictimArtPose(attacker, victim, finisherAttackerFrame(Math.min(frame, 59)));
  if (frame < FINISH_THROW) {
    return { x: originX + facing * held.x, y: 304 + held.y, rotation: facing * held.rotation, scale: 1, visible: true };
  }
  const startX = originX + facing * held.x;
  const startY = 304 + held.y;
  if (frame < KITCHEN_DROP) {
    const flight = clamp((frame - FINISH_THROW) / (KITCHEN_DROP - FINISH_THROW));
    return {
      x: mix(startX, KITCHEN_POT_X, flight),
      y: mix(startY, KITCHEN_POT_FEET_Y, flight) - 78 * 4 * flight * (1 - flight),
      rotation: facing * mix(held.rotation, 0.6, flight),
      scale: mix(1, 0.42, ease(flight)),
      visible: true,
    };
  }
  const sink = ease(clamp((frame - KITCHEN_DROP) / (KITCHEN_BONES - KITCHEN_DROP)));
  const shift = stirShift(frame);
  return {
    x: KITCHEN_POT_X + shift,
    y: KITCHEN_POT_FEET_Y + (frame % 2),
    rotation: shift * 0.08,
    scale: mix(0.42, 0.28, sink),
    visible: frame < KITCHEN_BONES,
  };
}
