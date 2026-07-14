import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from '../config/pixelArtConfig';

export class CaisStageView {
  private readonly far: Phaser.GameObjects.TileSprite;
  private readonly mid: Phaser.GameObjects.TileSprite;
  private readonly water: Phaser.GameObjects.Sprite;
  private time = 0;

  constructor(scene: Phaser.Scene) {
    this.far = scene.add.tileSprite(
      INTERNAL_WIDTH / 2,
      INTERNAL_HEIGHT / 2,
      INTERNAL_WIDTH,
      INTERNAL_HEIGHT,
      ASSET_MANIFEST.stage.far.key,
    ).setDepth(-30);
    this.mid = scene.add.tileSprite(
      INTERNAL_WIDTH / 2,
      INTERNAL_HEIGHT / 2,
      INTERNAL_WIDTH,
      INTERNAL_HEIGHT,
      ASSET_MANIFEST.stage.mid.key,
    ).setDepth(-24);
    this.water = scene.add.sprite(
      INTERNAL_WIDTH / 2,
      INTERNAL_HEIGHT / 2,
      ASSET_MANIFEST.stage.water.key,
      0,
    ).setDepth(-20);
    scene.add.image(
      INTERNAL_WIDTH / 2,
      INTERNAL_HEIGHT / 2,
      ASSET_MANIFEST.stage.foreground.key,
    ).setDepth(-10);
  }

  update(delta: number): void {
    this.time += delta;
    this.far.tilePositionX = Math.floor(this.time / 3600) % INTERNAL_WIDTH;
    this.mid.tilePositionX = Math.floor(this.time / 2100) % INTERNAL_WIDTH;
    this.water.setFrame(Math.floor(this.time / 150) % 4);
  }
}
