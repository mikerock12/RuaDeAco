import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import {
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
  PALETTE,
  RASTER_ASSET_SCALE,
} from '../config/pixelArtConfig';
import {
  CAIS_SKYLINE_BUILDINGS,
  CAIS_SKY_STARS,
  CAIS_STAGE_DEPTHS,
  CAIS_STAGE_LAYOUT,
  MOON_PIXEL_ROWS,
  resolveBoatPose,
} from './stagePresentation';

export class CaisStageView {
  private readonly mid: Phaser.GameObjects.TileSprite;
  private readonly water: Phaser.GameObjects.Sprite;
  private readonly boat: Phaser.GameObjects.Container;
  private readonly boatLight: Phaser.GameObjects.Rectangle;
  private readonly moonReflection: readonly Phaser.GameObjects.Rectangle[];
  private time = 0;

  constructor(scene: Phaser.Scene) {
    this.createSkyAtmosphere(scene);
    this.createMoon(scene);
    this.createDistantSkyline(scene);
    // As demais camadas rasterizadas em 320x180 continuam em escala inteira 2x.
    this.mid = scene.add.tileSprite(
      INTERNAL_WIDTH / 2,
      INTERNAL_HEIGHT / 2,
      INTERNAL_WIDTH / RASTER_ASSET_SCALE,
      INTERNAL_HEIGHT / RASTER_ASSET_SCALE,
      ASSET_MANIFEST.stage.mid.key,
    ).setScale(RASTER_ASSET_SCALE).setDepth(CAIS_STAGE_DEPTHS.nearStructures).setName('cais-mid-layer');
    this.water = scene.add.sprite(
      INTERNAL_WIDTH / 2,
      INTERNAL_HEIGHT / 2,
      ASSET_MANIFEST.stage.water.key,
      0,
    ).setScale(RASTER_ASSET_SCALE).setDepth(CAIS_STAGE_DEPTHS.water).setName('cais-water-layer');
    const boat = this.createBoat(scene);
    this.boat = boat.root;
    this.boatLight = boat.light;
    this.moonReflection = this.createMoonReflection(scene);
    scene.add.image(
      INTERNAL_WIDTH / 2,
      INTERNAL_HEIGHT / 2,
      ASSET_MANIFEST.stage.foreground.key,
    ).setScale(RASTER_ASSET_SCALE).setDepth(CAIS_STAGE_DEPTHS.foreground).setName('cais-foreground-layer');
    this.createDock(scene);
  }

  update(delta: number): void {
    this.time += delta;
    const textureWidth = INTERNAL_WIDTH / RASTER_ASSET_SCALE;
    this.mid.tilePositionX = Math.floor(this.time / 2100) % textureWidth;
    this.water.setFrame(Math.floor(this.time / 150) % 4);
    const boat = resolveBoatPose(this.time);
    this.boat.setPosition(boat.x, boat.y);
    this.boatLight.setAlpha(boat.lightAlpha);
    const reflectionPhase = Math.floor(this.time / 260);
    this.moonReflection.forEach((segment, index) => {
      segment.setAlpha(0.12 + ((reflectionPhase + index) % 3) * 0.08);
    });
  }

  private createSkyAtmosphere(scene: Phaser.Scene): void {
    const sky = scene.add.graphics().setDepth(CAIS_STAGE_DEPTHS.sky).setName('cais-sky-atmosphere');
    sky.fillStyle(0x030914, 1).fillRect(0, 0, INTERNAL_WIDTH, 62);
    sky.fillStyle(0x07142a, 1).fillRect(0, 62, INTERNAL_WIDTH, 34);
    sky.fillStyle(0x0b1e37, 1).fillRect(0, 96, INTERNAL_WIDTH, 34);
    sky.fillStyle(0x102b45, 1).fillRect(0, 130, INTERNAL_WIDTH, CAIS_STAGE_LAYOUT.waterHorizonY - 130);

    const stars = scene.add.graphics().setDepth(CAIS_STAGE_DEPTHS.stars).setName('cais-sky-stars');
    for (const [x, y, size] of CAIS_SKY_STARS) {
      stars.fillStyle(size === 2 ? PALETTE.ivory : PALETTE.cyanLight, size === 2 ? 0.78 : 0.55);
      stars.fillRect(x, y, size, size);
    }
  }

  private createDistantSkyline(scene: Phaser.Scene): void {
    const skyline = scene.add.graphics()
      .setDepth(CAIS_STAGE_DEPTHS.skyline)
      .setName('cais-distant-skyline');
    const horizon = CAIS_STAGE_LAYOUT.waterHorizonY;

    CAIS_SKYLINE_BUILDINGS.forEach((building, buildingIndex) => {
      skyline.fillStyle(building.color, 1)
        .fillRect(building.x, building.top, building.width, horizon - building.top);
      skyline.fillStyle(0x1a3851, 0.8)
        .fillRect(building.x + 2, building.top + 3, Math.max(2, building.width - 4), 2);

      if (buildingIndex % 3 === 1) {
        skyline.fillStyle(PALETTE.steelDark, 0.9)
          .fillRect(building.x + building.width - 8, building.top - 10, 2, 10);
      }

      for (let y = building.top + 14; y < horizon - 8; y += 18) {
        for (let x = building.x + 10; x < building.x + building.width - 7; x += 17) {
          const lit = (x + y + buildingIndex * 7) % 4 !== 0;
          skyline.fillStyle(lit ? PALETTE.gold : 0x26445c, lit ? 0.72 : 0.5)
            .fillRect(x, y, 4, 6);
        }
      }
    });
    skyline.fillStyle(0x07111d, 1).fillRect(0, horizon - 4, INTERNAL_WIDTH, 4);
  }

  private createMoon(scene: Phaser.Scene): void {
    const { moon } = CAIS_STAGE_LAYOUT;
    scene.add.ellipse(moon.x, moon.y, 62, 62, PALETTE.cyanLight, 0.055)
      .setDepth(CAIS_STAGE_DEPTHS.moonGlow)
      .setName('cais-moon-glow');
    scene.add.ellipse(moon.x, moon.y, 50, 50, PALETTE.ivory, 0.08)
      .setDepth(CAIS_STAGE_DEPTHS.moonGlow)
      .setName('cais-moon-inner-glow');

    const moonPixels = scene.add.graphics().setDepth(CAIS_STAGE_DEPTHS.moon).setName('cais-full-moon');
    MOON_PIXEL_ROWS.forEach(([offsetY, offsetX, width], index) => {
      const shade = index < 5 ? 0xd8e7d1 : index > 14 ? 0xbaccc8 : 0xf3e7bd;
      moonPixels.fillStyle(shade, 1).fillRect(moon.x + offsetX, moon.y + offsetY, width, 2);
    });
    moonPixels.fillStyle(0x9eada9, 0.72);
    moonPixels.fillRect(moon.x - 12, moon.y - 10, 7, 5);
    moonPixels.fillRect(moon.x + 7, moon.y - 4, 9, 6);
    moonPixels.fillRect(moon.x - 4, moon.y + 7, 6, 4);
    moonPixels.fillStyle(0x748b8d, 0.48);
    moonPixels.fillRect(moon.x - 15, moon.y + 2, 4, 3);
    moonPixels.fillRect(moon.x + 11, moon.y + 10, 4, 3);
  }

  private createMoonReflection(scene: Phaser.Scene): readonly Phaser.GameObjects.Rectangle[] {
    const { moon } = CAIS_STAGE_LAYOUT;
    const layout: readonly (readonly [number, number, number])[] = [
      [238, -9, 18], [247, -13, 26], [257, -7, 14],
      [268, -16, 32], [280, -10, 20], [290, -5, 10],
    ];
    return layout.map(([y, offsetX, width], index) => scene.add.rectangle(
      moon.x + offsetX,
      y,
      width,
      2,
      index % 2 === 0 ? PALETTE.ivory : PALETTE.cyanLight,
      0.2,
    ).setOrigin(0, 0.5).setDepth(CAIS_STAGE_DEPTHS.reflection).setName(`cais-moon-reflection-${index}`));
  }

  private createBoat(scene: Phaser.Scene): {
    readonly root: Phaser.GameObjects.Container;
    readonly light: Phaser.GameObjects.Rectangle;
  } {
    const hullTop = scene.add.rectangle(0, 0, 48, 5, 0x070b12);
    const hullBottom = scene.add.rectangle(2, 5, 36, 5, 0x0b1420);
    const rim = scene.add.rectangle(-1, -3, 52, 2, PALETTE.steel, 0.9);
    const cabin = scene.add.rectangle(-7, -11, 20, 11, 0x15283a);
    const roof = scene.add.rectangle(-7, -17, 24, 3, PALETTE.steelDark);
    const mast = scene.add.rectangle(7, -27, 2, 25, PALETTE.steelLight);
    const flag = scene.add.rectangle(13, -34, 12, 4, PALETTE.pink, 0.8).setOrigin(0, 0.5);
    const windowOne = scene.add.rectangle(-12, -12, 4, 4, PALETTE.gold, 0.9);
    const windowTwo = scene.add.rectangle(-5, -12, 4, 4, PALETTE.gold, 0.78);
    const light = scene.add.rectangle(19, -6, 3, 3, PALETTE.cyanLight, 0.9);
    const wakeOne = scene.add.rectangle(-24, 11, 24, 2, PALETTE.cyanLight, 0.25);
    const wakeTwo = scene.add.rectangle(18, 13, 18, 2, PALETTE.steelLight, 0.18);
    const root = scene.add.container(
      CAIS_STAGE_LAYOUT.boat.x,
      CAIS_STAGE_LAYOUT.boat.y,
      [hullTop, hullBottom, rim, cabin, roof, mast, flag, windowOne, windowTwo, light, wakeOne, wakeTwo],
    ).setDepth(CAIS_STAGE_DEPTHS.boat).setName('cais-distant-boat');
    return { root, light };
  }

  private createDock(scene: Phaser.Scene): void {
    const { dockSurfaceY, dockContactY, dockFrontY } = CAIS_STAGE_LAYOUT;
    const dock = scene.add.graphics().setDepth(CAIS_STAGE_DEPTHS.dock).setName('cais-dock-polish');

    // Superfície superior ampla: o contato está dentro do plano, não na borda frontal.
    dock.fillStyle(0x0a1723, 1).fillRect(0, dockSurfaceY, INTERNAL_WIDTH, dockFrontY - dockSurfaceY);
    dock.fillStyle(PALETTE.steel, 0.9).fillRect(0, dockSurfaceY, INTERNAL_WIDTH, 2);
    dock.fillStyle(0x13283a, 1).fillRect(0, dockSurfaceY + 2, INTERNAL_WIDTH, 8);
    dock.fillStyle(0x0d1d2a, 1).fillRect(0, dockSurfaceY + 10, INTERNAL_WIDTH, dockFrontY - dockSurfaceY - 10);
    dock.fillStyle(PALETTE.blue, 0.28).fillRect(0, dockContactY + 8, INTERNAL_WIDTH, 2);

    for (let y = dockSurfaceY + 14; y < dockFrontY; y += 14) {
      dock.fillStyle(PALETTE.steelDark, 0.38).fillRect(0, y, INTERNAL_WIDTH, 1);
    }

    dock.lineStyle(1, PALETTE.steel, 0.5);
    for (let x = 0; x <= INTERNAL_WIDTH; x += 80) {
      dock.lineBetween(x, dockSurfaceY, x - 18, dockFrontY);
    }

    dock.fillStyle(PALETTE.ink, 1).fillRect(0, dockFrontY, INTERNAL_WIDTH, INTERNAL_HEIGHT - dockFrontY);
    for (let x = 0; x < INTERNAL_WIDTH; x += 64) {
      dock.fillStyle(x % 128 === 0 ? 0x111c29 : 0x0c1722, 1);
      dock.fillRect(x + 2, dockFrontY + 3, 60, INTERNAL_HEIGHT - dockFrontY - 5);
      dock.fillStyle(PALETTE.steelDark, 0.9).fillRect(x, dockFrontY, 2, INTERNAL_HEIGHT - dockFrontY);
      dock.fillStyle(PALETTE.steelLight, 0.65).fillRect(x + 8, dockFrontY + 8, 2, 2);
      dock.fillStyle(PALETTE.steel, 0.5).fillRect(x + 54, dockFrontY + 8, 2, 2);
    }
    dock.fillStyle(PALETTE.steelLight, 0.92).fillRect(0, dockFrontY, INTERNAL_WIDTH, 2);
    dock.fillStyle(PALETTE.steelDark, 1).fillRect(0, dockFrontY + 2, INTERNAL_WIDTH, 3);
    dock.fillStyle(PALETTE.gold, 0.72);
    for (let x = 16; x < INTERNAL_WIDTH; x += 48) dock.fillRect(x, dockFrontY + 4, 20, 2);
  }
}
