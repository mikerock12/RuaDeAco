import type Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { KITCHEN_BONES, KITCHEN_DROP, KITCHEN_POT_X, KITCHEN_POT_Y } from '../combat/stageFinisher';
import { KitchenAmbience } from './kitchenAmbience';

export class KitchenStageView {
  private readonly ambience = new KitchenAmbience();
  private readonly witch: Phaser.GameObjects.Sprite;
  private readonly bats: Phaser.GameObjects.Sprite[];
  private readonly rats: Phaser.GameObjects.Sprite[];
  private readonly steam: Phaser.GameObjects.Rectangle[];
  private readonly potInterior: Phaser.GameObjects.Graphics;
  private readonly potBones: Phaser.GameObjects.Graphics;
  private readonly potRim: Phaser.GameObjects.Graphics;
  private finisherFrame: number | null = null;

  constructor(scene: Phaser.Scene) {
    const assets = ASSET_MANIFEST.kitchen;
    scene.add.image(320, 180, assets.background.key)
      .setDisplaySize(640, 360).setDepth(-40).setName('kitchen-background');
    this.witch = scene.add.sprite(408, 163, assets.witch.key)
      .setDepth(-25).setName('kitchen-witch');
    this.potInterior = scene.add.graphics().setDepth(-24.2).setName('kitchen-pot-interior');
    this.potBones = scene.add.graphics().setDepth(-23.5).setName('kitchen-pot-bones');
    this.potRim = scene.add.graphics().setDepth(-23.15).setName('kitchen-pot-rim');
    this.bats = this.ambience.bats.map((_, index) => scene.add.sprite(139, 142, assets.bat.key)
      .setDepth(-20).setVisible(false).setName('kitchen-bat-' + index));
    this.rats = this.ambience.rats.map((_, index) => scene.add.sprite(-30, 260, assets.rat.key)
      .setDepth(-12).setVisible(false).setName('kitchen-rat-' + index));
    this.steam = Array.from({ length: 6 }, (_, index) => scene.add.rectangle(443, 148, 3, 4, 0xa8bf78, 0.2)
      .setDepth(-24).setName('kitchen-steam-' + index));
  }

  update(delta: number): void {
    const cooking = this.potOpen;
    if (!cooking) this.ambience.update(delta);
    this.syncCast(cooking);
    this.renderPot();
  }

  setFinisherFrame(frame: number | null): void {
    this.finisherFrame = frame;
    this.syncCast(this.potOpen);
    this.renderPot();
  }

  private get potOpen(): boolean {
    return this.finisherFrame !== null && this.finisherFrame >= KITCHEN_DROP;
  }

  private syncCast(cooking: boolean): void {
    const time = this.ambience.elapsed;
    const frame = this.finisherFrame;
    const stirring = frame !== null && frame > 0;
    this.witch.setFrame(stirring ? Math.floor(frame / 6) % 4 : Math.floor(time / 220) % 4);
    this.ambience.bats.forEach((actor, index) => {
      this.bats[index]!.setVisible(!cooking && actor.active && actor.age >= 0)
        .setPosition(actor.x, actor.y).setFrame(actor.frame).setFlipX(actor.endX < actor.startX);
    });
    this.ambience.rats.forEach((actor, index) => {
      this.rats[index]!.setVisible(!cooking && actor.active)
        .setPosition(actor.x, actor.y).setFrame(actor.frame).setFlipX(actor.endX < actor.startX);
    });
    this.steam.forEach((puff, index) => {
      const clock = stirring ? frame * 16 : time;
      const progress = ((clock + index * 430) % 2600) / 2600;
      puff.setPosition(443 + Math.round(Math.sin(progress * 6 + index) * 7), 148 - Math.round(progress * 30))
        .setFillStyle(cooking ? 0xd9d2c3 : 0xa8bf78, (1 - progress) * (cooking ? 0.45 : 0.28))
        .setSize(2 + Math.floor(progress * 4), 3 + Math.floor(progress * 5));
    });
  }

  /** O caldo verde da arte some: o que está na panela fica visível, sem ácido. */
  private renderPot(): void {
    const interior = this.potInterior;
    const bones = this.potBones;
    const rim = this.potRim;
    interior.clear();
    bones.clear();
    rim.clear();
    const frame = this.finisherFrame;
    if (frame === null || frame < KITCHEN_DROP) return;
    interior.fillStyle(0x3b291c, 1).fillEllipse(KITCHEN_POT_X, KITCHEN_POT_Y, 62, 42);
    interior.fillStyle(0xc4a06a, 1).fillEllipse(KITCHEN_POT_X, KITCHEN_POT_Y - 1, 48, 30);
    if (frame >= KITCHEN_BONES) this.drawBones(frame);
    rim.lineStyle(3, 0x161616, 1).strokeEllipse(KITCHEN_POT_X, KITCHEN_POT_Y, 58, 40);
    rim.lineStyle(1, 0x3a3a3a, 1).strokeEllipse(KITCHEN_POT_X, KITCHEN_POT_Y - 2, 46, 30);
    const shift = frame % 16;
    const spoon = shift < 8 ? shift - 4 : 12 - shift;
    rim.lineStyle(3, 0x6b3e22, 1).lineBetween(
      KITCHEN_POT_X - 18, KITCHEN_POT_Y - 30,
      KITCHEN_POT_X + spoon * 2, KITCHEN_POT_Y + 2,
    );
    rim.fillStyle(0x8d5a32, 1).fillRect(KITCHEN_POT_X + spoon * 2 - 2, KITCHEN_POT_Y, 5, 3);
  }

  private drawBones(frame: number): void {
    const g = this.potBones;
    const shift = frame % 16;
    const wobble = shift < 8 ? shift - 4 : 12 - shift;
    const x = KITCHEN_POT_X + wobble;
    const y = KITCHEN_POT_Y + 2 + (frame % 2);
    const bone = 0xf3ead8;
    const shade = 0xd7c4a4;
    g.fillStyle(bone, 1);
    g.fillRect(x - 8, y - 18, 16, 12);
    g.fillStyle(0x2a1c14, 1);
    g.fillRect(x - 5, y - 15, 3, 3);
    g.fillRect(x + 2, y - 15, 3, 3);
    g.fillStyle(bone, 1);
    g.fillRect(x - 5, y - 7, 10, 3);
    g.fillRect(x - 2, y - 5, 3, 16);
    g.fillStyle(shade, 1);
    g.fillRect(x - 11, y - 2, 22, 3);
    g.fillRect(x - 10, y + 2, 20, 3);
    g.fillRect(x - 8, y + 6, 16, 3);
    g.fillStyle(bone, 1);
    g.fillRect(x - 16, y - 1, 6, 3);
    g.fillRect(x + 10, y - 1, 6, 3);
    g.fillRect(x - 6, y + 10, 12, 3);
    g.fillRect(x - 7, y + 13, 3, 8);
    g.fillRect(x + 4, y + 13, 3, 8);
  }

  snapshot() {
    const frame = this.finisherFrame;
    return {
      elapsed: this.ambience.elapsed,
      batWaves: this.ambience.batWaves,
      ratSpawns: this.ambience.ratSpawns,
      witchFrame: this.witch.frame.name,
      bats: this.bats.map(sprite => ({ x: sprite.x, y: sprite.y, visible: sprite.visible, frame: sprite.frame.name })),
      rats: this.rats.map(sprite => ({ x: sprite.x, y: sprite.y, visible: sprite.visible, frame: sprite.frame.name })),
      finisherFrame: frame,
      potOpen: this.potOpen,
      bonesVisible: frame !== null && frame >= KITCHEN_BONES,
      acidVisible: !this.potOpen,
    };
  }
}
