import type { FighterSnapshot } from '../combat/FighterRuntime';
import { VISUAL_GROUND_Y } from '../config/pixelArtConfig';

type FighterGroundSnapshot = Pick<FighterSnapshot, 'y'>;

export interface GroundShadowStyle {
  readonly alpha: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly y: number;
}

export interface GroundShadowNode {
  destroy(): void;
  setAlpha(alpha: number): this;
  setPosition(x: number, y: number): this;
  setScale(x: number, y: number): this;
  setVisible(visible: boolean): this;
}

export function resolveGroundShadowStyle(worldY: number): GroundShadowStyle {
  const elevation = Math.max(0, VISUAL_GROUND_Y - worldY);
  const airRatio = Math.min(1, elevation / 120);
  return {
    alpha: 0.44 - airRatio * 0.24,
    scaleX: 1 - airRatio * 0.42,
    scaleY: 1 - airRatio * 0.28,
    // Dois pixels abaixo da sola: a elipse fica parcialmente encoberta pelo
    // corpo e cria contato, sem uma faixa vazia entre o pé e a sombra.
    y: VISUAL_GROUND_Y + 2,
  };
}

export class FighterGroundShadow {
  private viewVisible = true;
  private destroyed = false;

  constructor(private readonly node: GroundShadowNode) {}

  sync(snapshot: FighterGroundSnapshot, x: number): void {
    if (this.destroyed) return;
    const style = resolveGroundShadowStyle(snapshot.y);
    this.node
      .setPosition(x, style.y)
      .setScale(style.scaleX, style.scaleY)
      .setAlpha(style.alpha)
      .setVisible(this.viewVisible);
  }

  setVisible(visible: boolean): void {
    if (this.destroyed) return;
    this.viewVisible = visible;
    this.node.setVisible(visible);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.node.destroy();
  }
}
