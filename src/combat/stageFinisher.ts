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
