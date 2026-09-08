import type Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { KitchenAmbience } from './kitchenAmbience';

export class KitchenStageView {
  private readonly ambience = new KitchenAmbience();
  private readonly witch: Phaser.GameObjects.Sprite;
  private readonly bats: Phaser.GameObjects.Sprite[];
  private readonly rats: Phaser.GameObjects.Sprite[];
  private readonly steam: Phaser.GameObjects.Rectangle[];

  constructor(scene: Phaser.Scene) {
    const assets = ASSET_MANIFEST.kitchen;
    scene.add.image(320, 180, assets.background.key)
      .setDisplaySize(640, 360).setDepth(-40).setName('kitchen-background');
    this.witch = scene.add.sprite(408, 163, assets.witch.key)
      .setDepth(-25).setName('kitchen-witch');
    this.bats = this.ambience.bats.map((_, index) => scene.add.sprite(139, 142, assets.bat.key)
      .setDepth(-20).setVisible(false).setName('kitchen-bat-' + index));
    this.rats = this.ambience.rats.map((_, index) => scene.add.sprite(-30, 260, assets.rat.key)
      .setDepth(-12).setVisible(false).setName('kitchen-rat-' + index));
    this.steam = Array.from({ length: 6 }, (_, index) => scene.add.rectangle(443, 148, 3, 4, 0xa8bf78, 0.2)
      .setDepth(-24).setName('kitchen-steam-' + index));
  }

  update(delta: number): void {
    this.ambience.update(delta);
    const time = this.ambience.elapsed;
    this.witch.setFrame(Math.floor(time / 220) % 4);
    this.ambience.bats.forEach((actor, index) => {
      this.bats[index]!.setVisible(actor.active && actor.age >= 0)
        .setPosition(actor.x, actor.y).setFrame(actor.frame).setFlipX(actor.endX < actor.startX);
    });
    this.ambience.rats.forEach((actor, index) => {
      this.rats[index]!.setVisible(actor.active)
        .setPosition(actor.x, actor.y).setFrame(actor.frame).setFlipX(actor.endX < actor.startX);
    });
    this.steam.forEach((puff, index) => {
      const progress = ((time + index * 430) % 2600) / 2600;
      puff.setPosition(443 + Math.round(Math.sin(progress * 6 + index) * 7), 148 - Math.round(progress * 30))
        .setAlpha((1 - progress) * 0.28)
        .setSize(2 + Math.floor(progress * 4), 3 + Math.floor(progress * 5));
    });
  }

  snapshot() {
    return {
      elapsed: this.ambience.elapsed,
      batWaves: this.ambience.batWaves,
      ratSpawns: this.ambience.ratSpawns,
      witchFrame: this.witch.frame.name,
      bats: this.bats.map(sprite => ({ x: sprite.x, y: sprite.y, visible: sprite.visible, frame: sprite.frame.name })),
      rats: this.rats.map(sprite => ({ x: sprite.x, y: sprite.y, visible: sprite.visible, frame: sprite.frame.name })),
    };
  }
}
