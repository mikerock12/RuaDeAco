import Phaser from 'phaser';
// Adaptador raster: as fichas conceituais nunca são usadas como corpos de luta.
import type { FighterSnapshot } from '../combat/FighterRuntime';
import { RASTER_ASSET_SCALE, roundPixel, worldToScreen } from '../config/pixelArtConfig';
import { getFighterSpriteAsset } from '../fighters/visual';
import type { FighterDefinition, FighterState, MoveDefinition } from '../types/combat';
import type { FighterAnimationAsset, FighterAnimationId, FighterSpriteAsset } from '../types/assets';

export interface FighterView {
  sync(snapshot: FighterSnapshot, alpha: number): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}

function animationForState(state: FighterState, activeMove: MoveDefinition | null): FighterAnimationId {
  if (activeMove) return activeMove.animation as FighterAnimationId;
  if (state === 'lightAttack' || state === 'heavyAttack' || state === 'kickAttack' || state === 'specialAttack') {
    if (state === 'lightAttack') return 'lightAttack';
    if (state === 'heavyAttack' || state === 'kickAttack') return 'heavyAttack';
    return 'special';
  }
  if (state === 'walkForward' || state === 'walkBackward') return 'walk';
  if (state === 'jump' || state === 'fall') return 'jump';
  if (state === 'crouch' || state === 'blockCrouching') return 'crouch';
  if (state === 'hitStun' || state === 'blockStanding') return 'hit';
  if (state === 'knockdown' || state === 'wakeUp' || state === 'knockout') return 'knockdown';
  if (state === 'victory') return 'victory';
  return 'idle';
}

class SpriteFighterView implements FighterView {
  private readonly definition: FighterDefinition;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly effect: Phaser.GameObjects.Sprite;
  private readonly asset: FighterSpriteAsset;
  private currentAnimation: FighterAnimationId = 'idle';

  constructor(scene: Phaser.Scene, definition: FighterDefinition, asset: FighterSpriteAsset) {
    this.definition = definition;
    this.asset = asset;
    const idle = asset.animations.idle;
    this.assertTexture(scene, idle);
    this.sprite = scene.add.sprite(0, 0, idle.key, 0)
      .setOrigin(asset.origin.x, asset.origin.y)
      .setScale(asset.scale)
      .setDepth(20);
    this.effect = scene.add.sprite(0, 0, 'effectIce', 0)
      .setOrigin(0.5)
      .setScale(RASTER_ASSET_SCALE)
      .setVisible(false)
      .setDepth(21);

    for (const animation of Object.values(asset.animations)) this.assertTexture(scene, animation);
    this.sprite.setName(`${definition.id}-fighter-sprite`);
  }

  sync(snapshot: FighterSnapshot, alpha: number): void {
    const worldX = Phaser.Math.Linear(snapshot.previousX, snapshot.x, alpha);
    const worldY = Phaser.Math.Linear(snapshot.previousY, snapshot.y, alpha);
    const x = worldToScreen(worldX) + this.asset.visualOffset.x;
    const y = worldToScreen(worldY) + this.asset.visualOffset.y;
    this.sprite
      .setPosition(roundPixel(x), roundPixel(y))
      .setScale(snapshot.facing * this.asset.scale, this.asset.scale);

    const activeMove = snapshot.activeMoveId ? this.definition.moves[snapshot.activeMoveId] ?? null : null;
    this.currentAnimation = animationForState(snapshot.state, activeMove);
    const animation = this.asset.animations[this.currentAnimation];
    const ticksPerFrame = Math.max(1, Math.round(60 / animation.frameRate));
    const elapsed = Math.floor(snapshot.stateFrame / ticksPerFrame);
    const frame = animation.repeat === -1
      ? elapsed % animation.frames
      : Math.min(animation.frames - 1, elapsed);
    this.sprite.setTexture(animation.key, frame);

    if (snapshot.freezeEffectFrames > 0) this.sprite.setTint(0xa8e9ff);
    else if (snapshot.armorHits > 0) this.sprite.setTint(0xd8f8ff);
    else if (snapshot.passiveFrames > 0) this.sprite.setTint(0x9af7ff);
    else this.sprite.clearTint();

    const showIce = snapshot.freezeEffectFrames > 0 || snapshot.armorHits > 0;
    this.effect
      .setVisible(showIce)
      .setPosition(roundPixel(x), roundPixel(y - 96))
      .setFrame(Math.floor(snapshot.stateFrame / 4) % 4)
      .setFlipX(snapshot.facing < 0);
  }

  setVisible(visible: boolean): void {
    this.sprite.setVisible(visible);
    this.effect.setVisible(visible && this.effect.visible);
  }

  destroy(): void {
    this.sprite.destroy();
    this.effect.destroy();
  }

  private assertTexture(scene: Phaser.Scene, animation: FighterAnimationAsset): void {
    if (scene.textures.exists(animation.key)) return;
    const message = `[Rua de Aço] Spritesheet de luta ausente: ${animation.key}`;
    console.error(message);
    throw new Error(message);
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
