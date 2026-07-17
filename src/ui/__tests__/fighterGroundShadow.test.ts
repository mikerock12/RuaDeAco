import { describe, expect, it, vi } from 'vitest';
import { FighterRuntime } from '../../combat/FighterRuntime';
import { VISUAL_GROUND_Y } from '../../config/pixelArtConfig';
import { rafaMare } from '../../fighters/rafaMare';
import {
  FighterGroundShadow,
  resolveGroundShadowStyle,
  type GroundShadowNode,
} from '../fighterGroundShadow';

class FakeShadowNode implements GroundShadowNode {
  readonly destroy = vi.fn();
  alpha = 1;
  position: readonly [number, number] = [0, 0];
  scale: readonly [number, number] = [1, 1];
  visible = true;

  setAlpha(alpha: number): this { this.alpha = alpha; return this; }
  setPosition(x: number, y: number): this { this.position = [x, y]; return this; }
  setScale(x: number, y: number): this { this.scale = [x, y]; return this; }
  setVisible(visible: boolean): this { this.visible = visible; return this; }
}

describe('sombra de contato dos lutadores', () => {
  it('fica no piso e diminui suavemente quando o lutador sobe', () => {
    const grounded = resolveGroundShadowStyle(VISUAL_GROUND_Y);
    const airborne = resolveGroundShadowStyle(VISUAL_GROUND_Y - 100);
    expect(grounded.y).toBe(VISUAL_GROUND_Y + 2);
    expect(airborne.y).toBe(grounded.y);
    expect(airborne.scaleX).toBeLessThan(grounded.scaleX);
    expect(airborne.scaleY).toBeLessThan(grounded.scaleY);
    expect(airborne.alpha).toBeLessThan(grounded.alpha);
  });

  it('acompanha o eixo horizontal sem sair do chão', () => {
    const node = new FakeShadowNode();
    const shadow = new FighterGroundShadow(node);
    const snapshot = new FighterRuntime(rafaMare, 200, 1).snapshot();
    shadow.sync(snapshot, 218);
    expect(node.position).toEqual([218, VISUAL_GROUND_Y + 2]);
    expect(node.visible).toBe(true);
    expect(node.alpha).toBeCloseTo(0.44);
  });

  it('respeita visibilidade e destrói o objeto uma única vez', () => {
    const node = new FakeShadowNode();
    const shadow = new FighterGroundShadow(node);
    const snapshot = new FighterRuntime(rafaMare, 200, 1).snapshot();
    shadow.setVisible(false);
    shadow.sync(snapshot, 300);
    expect(node.visible).toBe(false);

    shadow.destroy();
    shadow.destroy();
    shadow.sync(snapshot, 320);
    expect(node.destroy).toHaveBeenCalledOnce();
    expect(node.position).toEqual([300, VISUAL_GROUND_Y + 2]);
  });
});
