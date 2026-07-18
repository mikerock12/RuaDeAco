import type {
  GrabDefinition,
  GrabVictimDepth,
  GrabVictimKeyframe,
  HeldVictimState,
} from '../types/combat';

export interface ResolvedGrabVictimPose {
  readonly state: HeldVictimState;
  readonly poseFrame: number;
  readonly victimAnchorX: number;
  readonly victimAnchorY: number;
  readonly victimRotation: number;
  readonly depth: GrabVictimDepth;
}

const lerp = (from: number, to: number, alpha: number): number =>
  from + (to - from) * alpha;

function orderedTimeline(definition: GrabDefinition): readonly GrabVictimKeyframe[] {
  const timeline = definition.victimTimeline ?? [];
  for (let index = 1; index < timeline.length; index += 1) {
    if (timeline[index]!.frame <= timeline[index - 1]!.frame) {
      throw new Error('grab victim timeline frames must be strictly increasing');
    }
  }
  return timeline;
}

export function resolveGrabVictimPose(
  definition: GrabDefinition,
  frame: number,
): ResolvedGrabVictimPose | null {
  const timeline = orderedTimeline(definition);
  if (timeline.length === 0) return null;

  const first = timeline[0]!;
  const last = timeline[timeline.length - 1]!;
  let previous = first;
  let next = last;
  for (const keyframe of timeline) {
    if (keyframe.frame <= frame) previous = keyframe;
    if (keyframe.frame >= frame) {
      next = keyframe;
      break;
    }
  }
  const span = Math.max(1, next.frame - previous.frame);
  const alpha = Math.max(0, Math.min(1, (frame - previous.frame) / span));
  const sameState = previous.state === next.state;

  return {
    state: sameState || frame < next.frame ? previous.state : next.state,
    poseFrame: sameState
      ? Math.round(lerp(previous.poseFrame, next.poseFrame, alpha))
      : previous.poseFrame,
    victimAnchorX: lerp(previous.victimAnchorX, next.victimAnchorX, alpha),
    victimAnchorY: lerp(previous.victimAnchorY, next.victimAnchorY, alpha),
    victimRotation: lerp(previous.victimRotation, next.victimRotation, alpha),
    depth: previous.depth ?? 'behind',
  };
}
