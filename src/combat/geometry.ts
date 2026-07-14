import type { LocalRect, WorldRect, FighterId } from '../types/combat';

export interface BoxOwner {
  readonly id: FighterId;
  readonly x: number;
  readonly y: number;
  readonly facing: 1 | -1;
}

export function toWorldRect(rect: LocalRect, owner: BoxOwner): WorldRect {
  return {
    ownerId: owner.id,
    x: owner.facing === 1 ? owner.x + rect.x : owner.x - rect.x - rect.width,
    y: owner.y + rect.y,
    width: rect.width,
    height: rect.height,
  };
}

export function intersects(a: LocalRect, b: LocalRect): boolean {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

export function horizontalOverlap(a: LocalRect, b: LocalRect): number {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
}
