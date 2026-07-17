import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FighterRuntime, type FighterSnapshot } from '../../combat/FighterRuntime';
import { rafaMare } from '../../fighters/rafaMare';
import {
  FighterStatusPresentation,
  keepFighterBodyColorsNeutral,
  type FighterIndicatorNode,
  type FighterIndicatorRoot,
} from '../fighterStatusPresentation';

class FakeNode implements FighterIndicatorNode {
  alpha = 1;
  visible = true;

  setAlpha(alpha: number): this {
    this.alpha = alpha;
    return this;
  }

  setVisible(visible: boolean): this {
    this.visible = visible;
    return this;
  }
}

class FakeRoot extends FakeNode implements FighterIndicatorRoot {
  readonly destroy = vi.fn();
  depth = 0;
  position: readonly [number, number] = [0, 0];
  scale: readonly [number, number] = [1, 1];

  setDepth(depth: number): this {
    this.depth = depth;
    return this;
  }

  setPosition(x: number, y: number): this {
    this.position = [x, y];
    return this;
  }

  setScale(x: number, y: number): this {
    this.scale = [x, y];
    return this;
  }
}

function snapshot(patch: Partial<FighterSnapshot> = {}): FighterSnapshot {
  return {
    ...new FighterRuntime(rafaMare, 200, 1).snapshot(),
    ...patch,
  };
}

function presentation() {
  const root = new FakeRoot();
  const passive = new FakeNode();
  const armor = new FakeNode();
  const freeze = [new FakeNode(), new FakeNode(), new FakeNode(), new FakeNode()];
  return {
    root,
    passive,
    armor,
    freeze,
    view: new FighterStatusPresentation({ root, passive, armor, freeze }),
  };
}

describe('apresentação visual dos estados do lutador', () => {
  it('neutraliza o corpo em cada sincronização sem aplicar nova tintura', () => {
    const fighterView = readFileSync(resolve(process.cwd(), 'src/ui/FighterSpriteView.ts'), 'utf8');
    expect(fighterView).toContain('keepFighterBodyColorsNeutral(this.sprite, snapshot)');
    expect(fighterView).not.toContain('this.sprite.setTint');
  });

  it.each([
    { passiveFrames: 120 },
    { armorHits: 1 },
    { freezeEffectFrames: 40 },
  ])('mantém a tintura corporal neutra em $patch', (patch) => {
    const body = { clearTint: vi.fn(), setTint: vi.fn() };
    keepFighterBodyColorsNeutral(body, snapshot(patch));

    expect(body.clearTint).toHaveBeenCalledOnce();
    expect(body.setTint).not.toHaveBeenCalled();
  });

  it('mostra somente os indicadores correspondentes aos estados ativos', () => {
    const effect = presentation();
    effect.view.sync(snapshot({ passiveFrames: 120 }), 211, 304, 18);
    expect(effect.passive.visible).toBe(true);
    expect(effect.armor.visible).toBe(false);
    expect(effect.freeze.every(({ visible }) => !visible)).toBe(true);
    expect(effect.root).toMatchObject({ visible: true, position: [211, 304], depth: 18 });

    effect.view.sync(snapshot({ armorHits: 1, facing: -1 }), 216, 304, 18);
    expect(effect.passive.visible).toBe(false);
    expect(effect.armor.visible).toBe(true);
    expect(effect.root.scale).toEqual([-1, 1]);

    effect.view.sync(snapshot({ freezeEffectFrames: 40 }), 220, 304, 18);
    expect(effect.armor.visible).toBe(false);
    expect(effect.freeze.every(({ visible }) => visible)).toBe(true);
  });

  it('oculta todos os indicadores ao terminar o estado ou esconder o lutador', () => {
    const effect = presentation();
    effect.view.sync(snapshot({ passiveFrames: 120, armorHits: 1, freezeEffectFrames: 40 }), 200, 304, 18);
    expect(effect.root.visible).toBe(true);

    effect.view.setVisible(false);
    expect(effect.root.visible).toBe(false);
    expect(effect.passive.visible).toBe(false);
    expect(effect.armor.visible).toBe(false);
    expect(effect.freeze.every(({ visible }) => !visible)).toBe(true);

    effect.view.setVisible(true);
    effect.view.sync(snapshot(), 200, 304, 18);
    expect(effect.root.visible).toBe(false);
  });

  it('destrói o contêiner uma única vez e ignora sincronizações posteriores', () => {
    const effect = presentation();
    effect.view.destroy();
    effect.view.destroy();
    effect.view.sync(snapshot({ passiveFrames: 120 }), 300, 304, 18);

    expect(effect.root.destroy).toHaveBeenCalledOnce();
    expect(effect.root.visible).toBe(false);
  });
});
