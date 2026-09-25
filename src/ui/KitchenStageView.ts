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
  private readonly skull: Phaser.GameObjects.Image;
  private readonly potRim: Phaser.GameObjects.Graphics;
  private readonly splashFx: Phaser.GameObjects.Graphics;
  private finisherFrame: number | null = null;

  constructor(scene: Phaser.Scene) {
    const assets = ASSET_MANIFEST.kitchen;
    scene.add.image(320, 180, assets.background.key)
      .setDisplaySize(640, 360).setDepth(-40).setName('kitchen-background');
    this.witch = scene.add.sprite(408, 163, assets.witch.key)
      .setDepth(-25).setName('kitchen-witch');
    this.potInterior = scene.add.graphics().setDepth(-24.2).setName('kitchen-pot-interior');
    // A vítima é desenhada em -23.6 pelo FightScene: entre o interior e a borda.
    this.skull = scene.add.image(KITCHEN_POT_X, KITCHEN_POT_Y, assets.skull.key)
      .setOrigin(0.5, 0.6).setDepth(-23.5).setVisible(false).setName('kitchen-pot-bones');
    this.potRim = scene.add.graphics().setDepth(-23.15).setName('kitchen-pot-rim');
    this.splashFx = scene.add.graphics().setDepth(-23.1).setName('kitchen-pot-splash');
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
      const boil = cooking ? 1.6 : 1;
      const progress = ((clock + index * 430) % 2600) / 2600;
      puff.setPosition(443 + Math.round(Math.sin(progress * 6 + index) * 7 * boil), 148 - Math.round(progress * 30 * boil))
        .setFillStyle(cooking ? 0xd9d2c3 : 0xa8bf78, (1 - progress) * (cooking ? 0.5 : 0.28))
        .setSize(2 + Math.floor(progress * 4), 3 + Math.floor(progress * 5));
    });
  }

  /** O caldo verde da arte some: o interior escuro mostra o que afunda na panela. */
  private renderPot(): void {
    const interior = this.potInterior;
    const rim = this.potRim;
    const splash = this.splashFx;
    interior.clear();
    rim.clear();
    splash.clear();
    const frame = this.finisherFrame;
    if (frame === null || frame < KITCHEN_DROP) { this.skull.setVisible(false); return; }
    // Caldo escuro em anéis, sem o verde da arte: o que afunda fica visível.
    interior.fillStyle(0x24160e, 1).fillEllipse(KITCHEN_POT_X, KITCHEN_POT_Y, 62, 42);
    interior.fillStyle(0x3a2416, 1).fillEllipse(KITCHEN_POT_X, KITCHEN_POT_Y - 1, 52, 34);
    interior.fillStyle(0x4c3020, 1).fillEllipse(KITCHEN_POT_X + 2, KITCHEN_POT_Y - 3, 36, 20);
    // Caldo escuro fervendo: bolhas inteiras que sobem e estouram na borda.
    for (let i = 0; i < 7; i++) {
      const p = ((frame * 3 + i * 37) % 90) / 90;
      const bx = KITCHEN_POT_X + Math.round(Math.cos(i * 2.1) * 18 * (1 - p * 0.4));
      const by = KITCHEN_POT_Y + 10 - Math.round(p * 14);
      interior.fillStyle(i % 2 ? 0x7d5330 : 0xa5743f, (1 - p) * 0.9).fillRect(bx, by, 2 + (i % 2), 2);
    }
    const shift = frame % 16;
    const spoon = shift < 8 ? shift - 4 : 12 - shift;
    if (frame >= KITCHEN_BONES) {
      const wobble = spoon;
      this.skull.setVisible(true).setPosition(KITCHEN_POT_X + wobble, KITCHEN_POT_Y + 4 + (frame % 2));
    } else {
      this.skull.setVisible(false);
    }
    rim.lineStyle(3, 0x161616, 1).strokeEllipse(KITCHEN_POT_X, KITCHEN_POT_Y, 58, 40);
    rim.lineStyle(1, 0x3a3a3a, 1).strokeEllipse(KITCHEN_POT_X, KITCHEN_POT_Y - 2, 46, 30);
    rim.lineStyle(3, 0x6b3e22, 1).lineBetween(
      KITCHEN_POT_X - 18, KITCHEN_POT_Y - 30,
      KITCHEN_POT_X + spoon * 2, KITCHEN_POT_Y + 2,
    );
    rim.fillStyle(0x8d5a32, 1).fillRect(KITCHEN_POT_X + spoon * 2 - 2, KITCHEN_POT_Y, 5, 3);
    // Respingos do mergulho: gotas de caldo lançadas para fora da panela.
    const age = frame - KITCHEN_DROP;
    if (age < 26) {
      for (let drop = 0; drop < 14; drop++) {
        const t = age / 26;
        const dx = Math.cos(drop * 2.4) * (10 + (drop % 5) * 8) * t;
        const dy = -Math.abs(Math.sin(drop * 1.7)) * 34 * t + 60 * t * t;
        splash.fillStyle(drop % 2 ? 0x8fb24a : 0x5b7d2a, 1 - t)
          .fillRect(Math.round(KITCHEN_POT_X + dx), Math.round(KITCHEN_POT_Y - 8 + dy), 2, 3);
      }
    }
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
