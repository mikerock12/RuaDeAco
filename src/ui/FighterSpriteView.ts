import Phaser from 'phaser';
// Adaptador raster: as fichas conceituais nunca são usadas como corpos de luta.
import {
  phaserAnimationKey,
  spriteSheetFrameIndex,
} from '../assets/spriteSheetContract';
import type { FighterSnapshot } from '../combat/FighterRuntime';
import { PALETTE, roundPixel, worldToScreen } from '../config/pixelArtConfig';
import { getFighterSpriteAsset } from '../fighters/visual';
import type { FighterDefinition } from '../types/combat';
import type {
  AnimatedSpriteSheetAsset,
  FighterAnimationId,
  FighterSpriteAsset,
} from '../types/assets';
import {
  resolveAttachedEffect,
  resolveAttachedEffectFrame,
  resolveFighterAnimation,
  resolveStatusEffectFrame,
  resolveStatusEffects,
} from './fighterAnimationResolver';
import { FighterGroundShadow } from './fighterGroundShadow';
import {
  FighterStatusPresentation,
  keepFighterBodyColorsNeutral,
} from './fighterStatusPresentation';
import type { FighterEffectAsset } from '../types/assets';
import {
  logMissingAnimationFrameOnce,
  resolveSafeFrameIndex,
} from './safeAnimationFrame';

export interface FighterView {
  sync(snapshot: FighterSnapshot, alpha: number): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}

class SpriteFighterView implements FighterView {
  private readonly definition: FighterDefinition;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly moveEffect: Phaser.GameObjects.Sprite | null;
  private readonly statusEffectSprites: ReadonlyArray<{
    readonly effect: FighterEffectAsset;
    readonly sprite: Phaser.GameObjects.Sprite;
  }>;
  private readonly groundShadow: FighterGroundShadow;
  private readonly statusPresentation: FighterStatusPresentation;
  private readonly asset: FighterSpriteAsset;
  private currentAnimation: FighterAnimationId | null = null;
  private viewVisible = true;
  private moveEffectActive = false;
  private destroyed = false;

  constructor(scene: Phaser.Scene, definition: FighterDefinition, asset: FighterSpriteAsset) {
    this.definition = definition;
    this.asset = asset;
    const idle = asset.animations.idle;
    this.assertTexture(scene, idle);
    this.sprite = scene.add.sprite(0, 0, idle.key, 0)
      .setOrigin(asset.origin.x, asset.origin.y)
      .setScale(asset.scale)
      .setDepth(20);
    this.groundShadow = this.createGroundShadow(scene, definition);
    this.statusPresentation = this.createStatusPresentation(scene, definition.id);
    const firstAttachedEffect = asset.effects.find((effect) => effect.usage === 'attached');
    this.moveEffect = firstAttachedEffect
      ? scene.add.sprite(0, 0, firstAttachedEffect.key, 0)
        .setOrigin(firstAttachedEffect.origin.x, firstAttachedEffect.origin.y)
        .setVisible(false)
        .setDepth(21)
      : null;
    this.statusEffectSprites = asset.effects
      .filter((effect) => effect.usage === 'status')
      .map((effect) => {
        const sprite = scene.add.sprite(0, 0, effect.key, 0)
          .setOrigin(effect.origin.x, effect.origin.y)
          .setVisible(false)
          .setDepth(21)
          .setName(`${definition.id}-status-effect-${effect.id}`);
        return { effect, sprite };
      });

    for (const animation of Object.values(asset.animations)) this.assertTexture(scene, animation);
    for (const effect of asset.effects) this.assertTexture(scene, effect);
    this.sprite.setName(`${definition.id}-fighter-sprite`);
    this.moveEffect?.setName(`${definition.id}-move-effect`);
  }

  sync(snapshot: FighterSnapshot, alpha: number): void {
    if (this.destroyed) return;

    const worldX = Phaser.Math.Linear(snapshot.previousX, snapshot.x, alpha);
    const worldY = Phaser.Math.Linear(snapshot.previousY, snapshot.y, alpha);
    const x = worldToScreen(worldX) + this.asset.visualOffset.x;
    const y = worldToScreen(worldY) + this.asset.visualOffset.y;
    this.sprite
      .setPosition(roundPixel(x), roundPixel(y))
      .setScale(snapshot.facing * this.asset.scale, this.asset.scale)
      .setRotation(snapshot.victimRotation)
      // A vítima continua sendo seu próprio sprite, apenas atrás da camada
      // corporal do grappler durante a sustentação.
      .setDepth(snapshot.grabbedBy === null ? 20 : snapshot.victimDepth === 'front' ? 22 : 19);

    const poseSnapshot: FighterSnapshot = {
      ...snapshot,
      state: snapshot.poseState,
      stateFrame: snapshot.poseStateFrame,
      activeMoveId: snapshot.poseMoveId,
      moveConnected: snapshot.poseMoveConnected,
    };
    const activeMove = poseSnapshot.activeMoveId
      ? this.definition.moves[poseSnapshot.activeMoveId] ?? null
      : null;
    const resolved = resolveFighterAnimation(poseSnapshot, activeMove, this.asset, this.definition);
    this.currentAnimation = resolved.id;
    const animation = this.asset.animations[this.currentAnimation];

    if (!animation) {
      console.error(`[Rua de Aço] Animação ausente: key=${this.currentAnimation} fighter=${this.definition.id} state=${snapshot.poseState} move=${snapshot.poseMoveId}`);
      const fallback = this.asset.animations['idle'];
      this.applyAnimationFrame(
        this.sprite,
        fallback,
        spriteSheetFrameIndex(fallback, snapshot.poseStateFrame),
      );
    } else {
      this.applyAnimationFrame(
        this.sprite,
        animation,
        resolved.explicitFrame
          ?? spriteSheetFrameIndex(animation, resolved.localFrame, resolved.phaseFrames),
      );
    }

    keepFighterBodyColorsNeutral(this.sprite, snapshot);
    this.groundShadow.sync(snapshot, roundPixel(worldToScreen(worldX)));
    this.statusPresentation.sync(snapshot, roundPixel(x), roundPixel(y), 18);

    const attachedEffect = resolveAttachedEffect(poseSnapshot, activeMove, this.asset);
    this.moveEffectActive = attachedEffect !== undefined;
    if (this.moveEffect && attachedEffect) {
      this.applyAnimationFrame(
        this.moveEffect,
        attachedEffect,
        resolveAttachedEffectFrame(attachedEffect, snapshot.poseStateFrame),
      );

      const effectX = attachedEffect.attachTo === 'victim'
        ? worldToScreen(snapshot.grabbedVictimX) + this.asset.visualOffset.x
        : x;
      const effectY = attachedEffect.attachTo === 'victim'
        ? worldToScreen(snapshot.grabbedVictimY) + this.asset.visualOffset.y
        : y;

      this.moveEffect
        .setVisible(this.viewVisible)
        .setOrigin(attachedEffect.origin.x, attachedEffect.origin.y)
        .setPosition(
          roundPixel(effectX + snapshot.facing * attachedEffect.offset.x),
          roundPixel(effectY + attachedEffect.offset.y),
        )
        .setScale(snapshot.facing * attachedEffect.scale, attachedEffect.scale)
        .setRotation(
          attachedEffect.attachTo === 'victim'
            ? snapshot.grabbedVictimRotation
            : snapshot.victimRotation,
        );
    } else {
      this.moveEffect?.setVisible(false);
    }

    const activeStatusEffects = resolveStatusEffects(snapshot, this.asset);
    for (const entry of this.statusEffectSprites) {
      const active = activeStatusEffects.find((effect) => effect.id === entry.effect.id);
      if (!active || !active.statusField) {
        entry.sprite.setVisible(false);
        continue;
      }
      const remaining = snapshot[active.statusField];
      this.applyAnimationFrame(
        entry.sprite,
        active,
        resolveStatusEffectFrame(active, typeof remaining === 'number' ? remaining : 0),
      );
      entry.sprite
        .setVisible(this.viewVisible)
        .setOrigin(active.origin.x, active.origin.y)
        .setPosition(
          roundPixel(x + snapshot.facing * active.offset.x),
          roundPixel(y + active.offset.y),
        )
        .setScale(snapshot.facing * active.scale, active.scale)
        .setRotation(snapshot.victimRotation)
        .setDepth(21);
    }
  }

  setVisible(visible: boolean): void {
    if (this.destroyed) return;
    this.viewVisible = visible;
    this.sprite.setVisible(visible);
    this.moveEffect?.setVisible(visible && this.moveEffectActive);
    if (!visible) {
      for (const entry of this.statusEffectSprites) entry.sprite.setVisible(false);
    }
    // reaparece no próximo sync se o status ainda estiver ativo
    this.groundShadow.setVisible(visible);
    this.statusPresentation.setVisible(visible);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.sprite.destroy();
    this.moveEffect?.destroy();
    for (const entry of this.statusEffectSprites) entry.sprite.destroy();
    this.groundShadow.destroy();
    this.statusPresentation.destroy();
  }

  private createGroundShadow(scene: Phaser.Scene, definition: FighterDefinition): FighterGroundShadow {
    const width = Math.max(72, Math.round(definition.stats.pushbox.width * 2.25));
    const ambientEdge = scene.add.ellipse(0, 0, width + 8, 15, PALETTE.blue, 0.2);
    const outer = scene.add.ellipse(0, 0, width, 13, PALETTE.black, 0.9);
    const inner = scene.add.ellipse(0, 0, Math.round(width * 0.7), 7, PALETTE.ink, 0.82);
    const root = scene.add.container(0, 0, [ambientEdge, outer, inner])
      .setDepth(17)
      .setName(`${definition.id}-ground-shadow`);
    return new FighterGroundShadow(root);
  }

  private createStatusPresentation(scene: Phaser.Scene, fighterId: string): FighterStatusPresentation {
    const passive = scene.add.ellipse(0, -3, 58, 11, PALETTE.cyan, 0.08)
      .setStrokeStyle(2, PALETTE.cyan, 0.95)
      .setName(`${fighterId}-passive-indicator`);
    const armor = scene.add.ellipse(0, -43, 52, 84, PALETTE.steelLight, 0.035)
      .setStrokeStyle(2, PALETTE.silver, 0.8)
      .setName(`${fighterId}-armor-indicator`);
    const freeze = [
      scene.add.rectangle(-70, -72, 4, 10, PALETTE.cyanLight, 0.9).setRotation(-0.55),
      scene.add.rectangle(69, -58, 4, 12, PALETTE.cyanLight, 0.9).setRotation(0.48),
      scene.add.rectangle(-62, -34, 3, 8, PALETTE.cyan, 0.9).setRotation(0.62),
      scene.add.rectangle(66, -88, 3, 9, PALETTE.cyan, 0.9).setRotation(-0.48),
      scene.add.rectangle(-78, -14, 3, 7, PALETTE.cyanLight, 0.85).setRotation(0.4),
      scene.add.rectangle(74, -22, 3, 8, PALETTE.cyanLight, 0.85).setRotation(-0.42),
    ];
    freeze.forEach((particle, index) => particle.setName(`${fighterId}-freeze-indicator-${index}`));
    const root = scene.add.container(0, 0, [passive, armor, ...freeze])
      .setDepth(18)
      .setName(`${fighterId}-status-indicators`);

    return new FighterStatusPresentation({ root, passive, armor, freeze });
  }

  private assertTexture(scene: Phaser.Scene, animation: AnimatedSpriteSheetAsset): void {
    const textureReady = scene.textures.exists(animation.key);
    const animationReady = scene.anims.exists(phaserAnimationKey(animation.key));
    if (textureReady && animationReady) return;
    const missing = [
      ...(!textureReady ? ['textura'] : []),
      ...(!animationReady ? ['animação Phaser'] : []),
    ].join(' e ');
    const message = `[Rua de Aço] ${missing} ausente para spritesheet: ${animation.key}`;
    console.error(message);
    throw new Error(message);
  }

  private applyAnimationFrame(
    sprite: Phaser.GameObjects.Sprite,
    animation: AnimatedSpriteSheetAsset,
    frameIndex: number,
  ): void {
    const animationKey = phaserAnimationKey(animation.key);
    if (sprite.anims.getName() !== animationKey) {
      sprite.play(animationKey);
      // O estado de combate é a fonte de tempo. Pausar evita que o relógio
      // visual avance durante hit-stop ou deixe frames antigos sob o novo.
      sprite.anims.pause();
    }

    const phaserAnimation = sprite.anims.currentAnim;
    const available = phaserAnimation?.frames.length
      ?? animation.frames
      ?? 0;
    const safe = resolveSafeFrameIndex(frameIndex, available);
    if (safe.clamped) {
      // Fail-safe visual: não congela o FightScene por asset incompleto.
      // Auditoria/testes de contrato continuam falhando no CI.
      logMissingAnimationFrameOnce(
        animation.key,
        safe.requested,
        safe.available,
        safe.index,
      );
    }
    const phaserFrame = phaserAnimation?.frames[safe.index];
    if (!phaserFrame) {
      // Textura sem frames úteis — log único e segue sem lançar.
      logMissingAnimationFrameOnce(animation.key, frameIndex, 0, 0);
      return;
    }
    sprite.anims.setCurrentFrame(phaserFrame);
  }
}

export function createFighterView(scene: Phaser.Scene, definition: FighterDefinition): FighterView {
  const asset = getFighterSpriteAsset(definition.id);
  if (!asset) {
    const message = `[Rua de Aço] Lutador sem FighterSpriteAsset: ${definition.id}`;
    console.error(message);
    throw new Error(message);
  }
  return new SpriteFighterView(scene, definition, asset);
}
