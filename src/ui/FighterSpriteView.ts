import Phaser from 'phaser';
// Adaptador raster: as fichas conceituais nunca são usadas como corpos de luta.
import {
  phaserAnimationKey,
  spriteSheetFrameIndex,
} from '../assets/spriteSheetContract';
import type { FighterSnapshot } from '../combat/FighterRuntime';
import { roundPixel, worldToScreen } from '../config/pixelArtConfig';
import { getFighterSpriteAsset } from '../fighters/visual';
import type { FighterDefinition } from '../types/combat';
import type {
  AnimatedSpriteSheetAsset,
  FighterAnimationId,
  FighterSpriteAsset,
} from '../types/assets';
import { resolveAttachedEffect, resolveFighterAnimation } from './fighterAnimationResolver';

export interface FighterView {
  sync(snapshot: FighterSnapshot, alpha: number): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}

class SpriteFighterView implements FighterView {
  private readonly definition: FighterDefinition;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly moveEffect: Phaser.GameObjects.Sprite | null;
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
    const firstAttachedEffect = asset.effects.find((effect) => effect.usage === 'attached');
    this.moveEffect = firstAttachedEffect
      ? scene.add.sprite(0, 0, firstAttachedEffect.key, 0)
        .setOrigin(firstAttachedEffect.origin.x, firstAttachedEffect.origin.y)
        .setVisible(false)
        .setDepth(21)
      : null;

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
      .setDepth(snapshot.grabbedBy === null ? 20 : 19);

    const activeMove = snapshot.activeMoveId ? this.definition.moves[snapshot.activeMoveId] ?? null : null;
    const resolved = resolveFighterAnimation(snapshot, activeMove, this.asset, this.definition);
    this.currentAnimation = resolved.id;
    const animation = this.asset.animations[this.currentAnimation];

    if (!animation) {
      console.error(`[Rua de Aço] Animação ausente: key=${this.currentAnimation} fighter=${this.definition.id} state=${snapshot.state} move=${snapshot.activeMoveId}`);
      const fallback = this.asset.animations['idle'];
      this.applyAnimationFrame(
        this.sprite,
        fallback,
        spriteSheetFrameIndex(fallback, snapshot.stateFrame),
      );
    } else {
      this.applyAnimationFrame(
        this.sprite,
        animation,
        resolved.explicitFrame
          ?? spriteSheetFrameIndex(animation, resolved.localFrame, resolved.phaseFrames),
      );
    }

    if (snapshot.freezeEffectFrames > 0) this.sprite.setTint(0xa8e9ff);
    else if (snapshot.armorHits > 0) this.sprite.setTint(0xd8f8ff);
    else if (snapshot.passiveFrames > 0) this.sprite.setTint(0x9af7ff);
    else this.sprite.clearTint();

    const attachedEffect = resolveAttachedEffect(snapshot, activeMove, this.asset);
    this.moveEffectActive = attachedEffect !== undefined;
    if (this.moveEffect && attachedEffect) {
      const effectFrame = snapshot.stateFrame - (attachedEffect.activeRange?.from ?? 0);
      this.applyAnimationFrame(
        this.moveEffect,
        attachedEffect,
        spriteSheetFrameIndex(
          attachedEffect,
          effectFrame,
          attachedEffect.activeRange
            ? attachedEffect.activeRange.to - attachedEffect.activeRange.from + 1
            : undefined,
        ),
      );
      this.moveEffect
        .setVisible(this.viewVisible)
        .setOrigin(attachedEffect.origin.x, attachedEffect.origin.y)
        .setPosition(
          roundPixel(x + snapshot.facing * attachedEffect.offset.x),
          roundPixel(y + attachedEffect.offset.y),
        )
        .setScale(snapshot.facing * attachedEffect.scale, attachedEffect.scale)
        .setRotation(snapshot.victimRotation);
    } else {
      this.moveEffect?.setVisible(false);
    }
  }

  setVisible(visible: boolean): void {
    if (this.destroyed) return;
    this.viewVisible = visible;
    this.sprite.setVisible(visible);
    this.moveEffect?.setVisible(visible && this.moveEffectActive);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.sprite.destroy();
    this.moveEffect?.destroy();
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
    const phaserFrame = phaserAnimation?.frames[frameIndex];
    if (!phaserFrame) {
      const message = `[Rua de Aço] Frame ${frameIndex} ausente em ${animation.key}`;
      console.error(message);
      throw new Error(message);
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
