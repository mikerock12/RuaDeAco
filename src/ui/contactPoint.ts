import type { LocalRect } from '../types/combat';

/** Use the overlapping collision region; projectiles/grabs fall back to the victim's body. */
export function contactPoint(hits: readonly LocalRect[], hurts: readonly LocalRect[], fallback: { x: number; y: number }): { x: number; y: number } {
  for (const hit of hits) for (const hurt of hurts) {
    const left = Math.max(hit.x, hurt.x), right = Math.min(hit.x + hit.width, hurt.x + hurt.width);
    const top = Math.max(hit.y, hurt.y), bottom = Math.min(hit.y + hit.height, hurt.y + hurt.height);
    if (right > left && bottom > top) return { x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) };
  }
  const body = hurts[0];
  return body ? { x: Math.round(body.x + body.width / 2), y: Math.round(body.y + body.height / 2) } : fallback;
}
