import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, RASTER_ASSET_SCALE } from '../config/pixelArtConfig';

export class CaisStageView {
  private readonly far: Phaser.GameObjects.TileSprite;
  private readonly mid: Phaser.GameObjects.TileSprite;
  private readonly water: Phaser.GameObjects.Sprite;
  private time = 0;

  constructor(scene: Phaser.Scene) {
    // Camadas do palco rasterizadas em 320x180: exibidas em escala inteira 2x.
    this.far = scene.add.tileSprite(
      INTERNAL_WIDTH / 2,
      INTERNAL_HEIGHT / 2,
      INTERNAL_WIDTH / RASTER_ASSET_SCALE,
      INTERNAL_HEIGHT / RASTER_ASSET_SCALE,
      ASSET_MANIFEST.stage.far.key,
    ).setScale(RASTER_ASSET_SCALE).setDepth(-30);
    this.mid = scene.add.tileSprite(
      INTERNAL_WIDTH / 2,
      INTERNAL_HEIGHT / 2,
      INTERNAL_WIDTH / RASTER_ASSET_SCALE,
      INTERNAL_HEIGHT / RASTER_ASSET_SCALE,
      ASSET_MANIFEST.stage.mid.key,
    ).setScale(RASTER_ASSET_SCALE).setDepth(-24);
    this.water = scene.add.sprite(
      INTERNAL_WIDTH / 2,
      INTERNAL_HEIGHT / 2,
      ASSET_MANIFEST.stage.water.key,
      0,
    ).setScale(RASTER_ASSET_SCALE).setDepth(-20);
    scene.add.image(
      INTERNAL_WIDTH / 2,
      INTERNAL_HEIGHT / 2,
      ASSET_MANIFEST.stage.foreground.key,
    ).setScale(RASTER_ASSET_SCALE).setDepth(-10);
  }

  update(delta: number): void {
    this.time += delta;
    const textureWidth = INTERNAL_WIDTH / RASTER_ASSET_SCALE;
    this.far.tilePositionX = Math.floor(this.time / 3600) % textureWidth;
    this.mid.tilePositionX = Math.floor(this.time / 2100) % textureWidth;
    this.water.setFrame(Math.floor(this.time / 150) % 4);
  }
}
