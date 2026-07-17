import type { FighterSnapshot } from '../combat/FighterRuntime';

type FighterStatusSnapshot = Pick<
  FighterSnapshot,
  'armorHits' | 'facing' | 'freezeEffectFrames' | 'passiveFrames' | 'stateFrame'
>;

export interface FighterBodyTintTarget {
  clearTint(): unknown;
}

export interface FighterIndicatorNode {
  setAlpha(alpha: number): this;
  setVisible(visible: boolean): this;
}

export interface FighterIndicatorRoot extends FighterIndicatorNode {
  destroy(): void;
  setDepth(depth: number): this;
  setPosition(x: number, y: number): this;
  setScale(x: number, y: number): this;
}

export interface FighterIndicatorObjects {
  readonly root: FighterIndicatorRoot;
  readonly passive: FighterIndicatorNode;
  readonly armor: FighterIndicatorNode;
  readonly freeze: readonly FighterIndicatorNode[];
}

export function keepFighterBodyColorsNeutral(
  body: FighterBodyTintTarget,
  status: FighterStatusSnapshot,
): void {
  // O status existe somente para deixar explícito que nenhum desses estados
  // pode voltar a decidir a cor do spritesheet corporal.
  void status;
  body.clearTint();
}

function pulse(frames: number, period: number): number {
  const phase = Math.abs((frames % period) - period / 2) / (period / 2);
  return phase;
}

export class FighterStatusPresentation {
  private readonly objects: FighterIndicatorObjects;
  private viewVisible = true;
  private passiveActive = false;
  private armorActive = false;
  private freezeActive = false;
  private destroyed = false;

  constructor(objects: FighterIndicatorObjects) {
    this.objects = objects;
    this.applyVisibility();
  }

  sync(status: FighterStatusSnapshot, x: number, y: number, depth: number): void {
    if (this.destroyed) return;

    this.passiveActive = status.passiveFrames > 0;
    this.armorActive = status.armorHits > 0;
    this.freezeActive = status.freezeEffectFrames > 0;
    this.objects.root
      .setPosition(x, y)
      .setScale(status.facing, 1)
      .setDepth(depth);

    this.objects.passive.setAlpha(0.48 + pulse(status.passiveFrames, 30) * 0.34);
    this.objects.armor.setAlpha(0.58 + pulse(status.stateFrame, 24) * 0.2);
    this.objects.freeze.forEach((particle, index) => {
      particle.setAlpha(0.48 + pulse(status.freezeEffectFrames + index * 5, 20) * 0.42);
    });
    this.applyVisibility();
  }

  setVisible(visible: boolean): void {
    if (this.destroyed) return;
    this.viewVisible = visible;
    this.applyVisibility();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.objects.root.destroy();
  }

  private applyVisibility(): void {
    const showPassive = this.viewVisible && this.passiveActive;
    const showArmor = this.viewVisible && this.armorActive;
    const showFreeze = this.viewVisible && this.freezeActive;
    this.objects.passive.setVisible(showPassive);
    this.objects.armor.setVisible(showArmor);
    for (const particle of this.objects.freeze) particle.setVisible(showFreeze);
    this.objects.root.setVisible(showPassive || showArmor || showFreeze);
  }
}
