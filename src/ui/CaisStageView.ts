import Phaser from 'phaser';
import { FINISH_SPLASH, FINISH_BITE, FINISH_WATER_Y, finisherMonsterPose } from '../combat/stageFinisher';
import type { FinisherContext } from './createStageView';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { CaisAmbience, type CaisActorPose } from './caisAmbience';
import { CAIS_STAGE_DEPTHS as DEPTH, CAIS_STAGE_LAYOUT as LAYOUT } from './stagePresentation';

/** Arte estática detalhada com poucos objetos reutilizados para os eventos. */
export class CaisStageView {
  private readonly moon: Phaser.GameObjects.Image;
  private readonly moonGlows: Phaser.GameObjects.Ellipse[] = [];
  private skyOffset = 0;
  private finisherFrame: number | null = null;
  private finisherContext: FinisherContext = { originX: 280, facing: 1 };
  private readonly dread: Phaser.GameObjects.Rectangle;
  private readonly reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  private readonly water: Phaser.GameObjects.TileSprite[];
  private readonly reflections: Phaser.GameObjects.Rectangle[];
  private readonly ufo: Phaser.GameObjects.Image;
  private readonly witch: Phaser.GameObjects.Image;
  private readonly ship: Phaser.GameObjects.Image;
  private readonly monster: Phaser.GameObjects.Sprite;
  private readonly finisherMonster: Phaser.GameObjects.Sprite;
  private readonly fire: Phaser.GameObjects.Sprite;
  private readonly splash: Phaser.GameObjects.Sprite;
  private readonly beam: Phaser.GameObjects.Graphics;
  private readonly seaFx: Phaser.GameObjects.Graphics;
  private readonly cannonFx: Phaser.GameObjects.Graphics;
  private readonly heatReflection: Phaser.GameObjects.Ellipse;
  private readonly floorLight: Phaser.GameObjects.Ellipse;

  constructor(scene: Phaser.Scene, private readonly ambience = new CaisAmbience()) {
    const assets = ASSET_MANIFEST.caisRemaster;
    this.dread = scene.add.rectangle(320, 180, 640, 360, 0x080016, 0).setDepth(14).setName('cais-finisher-dread');
    scene.add.rectangle(320, 180, 640, 360, 0x040d20).setDepth(DEPTH.background - 1);
    scene.add.image(320, 180 + LAYOUT.backgroundOffsetY, assets.background.key)
      .setDepth(DEPTH.background).setName('cais-remastered-background');
    for (const [diameter, alpha] of [[96, 0.008], [80, 0.012], [66, 0.018]] as const) {
      this.moonGlows.push(scene.add.ellipse(LAYOUT.moon.x, LAYOUT.moon.y, diameter, diameter, 0xa9daf1, alpha)
        .setDepth(DEPTH.moonGlow).setName('cais-moon-glow-' + diameter));
    }
    this.moon = scene.add.image(LAYOUT.moon.x, LAYOUT.moon.y, assets.moon.key)
      .setDepth(DEPTH.moon).setName('cais-full-moon');
    this.water = [assets.water0, assets.water1, assets.water2].map((asset, i) => scene.add.tileSprite(
      320, 196 + i * 15 + 7 + LAYOUT.backgroundOffsetY, 512, 14, asset.key,
    ).setDepth(DEPTH.water).setAlpha(0.22).setName('cais-water-band-' + i));
    this.reflections = Array.from({ length: 12 }, (_, i) => scene.add.rectangle(
      LAYOUT.moon.x + Math.sin(i * 2.4) * 9, 206 + i * 4.5, 5 + i * 1.8, 1, 0xb5e5ee,
    ).setDepth(DEPTH.reflection).setAlpha(0.12).setName('cais-moon-reflection-' + i));
    this.heatReflection = scene.add.ellipse(320, 253, 76, 10, 0xfba649, 0)
      .setDepth(DEPTH.reflection).setName('cais-fire-water-light');
    this.floorLight = scene.add.ellipse(320, LAYOUT.dockContactY, 115, 16, 0x75dce9, 0)
      .setDepth(DEPTH.beam).setName('cais-ufo-floor-light');
    this.ufo = scene.add.image(0, 0, assets.ufo.key).setDepth(DEPTH.distantUfo).setName('cais-ufo');
    this.witch = scene.add.image(0, 0, assets.witch.key).setDepth(DEPTH.witch).setName('cais-flying-witch');
    this.ship = scene.add.image(0, 0, assets.ship.key).setOrigin(0.5, 1).setDepth(DEPTH.ship).setName('cais-pirate-ship');
    this.monster = scene.add.sprite(0, 0, assets.monster.key).setOrigin(0.5, 1).setDepth(DEPTH.monster).setName('cais-sea-monster');
    this.finisherMonster = scene.add.sprite(0, 0, assets.finisherMonster.key).setOrigin(0.5, 1).setDepth(DEPTH.monster).setVisible(false).setName('cais-finisher-monster');
    this.fire = scene.add.sprite(0, 0, assets.fire.key).setOrigin(0.5, 1).setDepth(DEPTH.fire).setName('cais-monster-fire');
    this.splash = scene.add.sprite(0, 0, assets.splash.key).setOrigin(0.5, 1).setDepth(DEPTH.splash).setName('cais-monster-splash');
    this.beam = scene.add.graphics().setDepth(DEPTH.beam).setName('cais-abduction-beam');
    this.seaFx = scene.add.graphics().setDepth(DEPTH.splash).setName('cais-water-wakes');
    this.cannonFx = scene.add.graphics().setDepth(DEPTH.fire).setName('cais-cannon-effects');
    this.update(0);
  }

  update(delta: number, playerOneX = 220, playerTwoX = 420): void {
    if (this.finisherFrame === null) this.ambience.update(delta, playerOneX, playerTwoX);
    const a = this.ambience, time = a.elapsed;
    // Three-pixel sky parallax; dock and fighter contact plane stay fixed.
    const target = this.reducedMotion ? 0 : Phaser.Math.Clamp((320 - (playerOneX + playerTwoX) / 2) * 0.025, -3, 3);
    this.skyOffset += (target - this.skyOffset) * Math.min(1, delta / 240);
    const moonX = LAYOUT.moon.x + Math.round(this.skyOffset);
    this.moon.x = moonX;
    for (const glow of this.moonGlows) glow.x = moonX;
    this.water.forEach((band, i) => {
      band.tilePositionX = Math.round(Math.sin(time / (3100 + i * 900) + i) * (2 + i));
      band.setAlpha(0.16 + (1 + Math.sin(time / 2400 + i)) * 0.035);
    });
    this.reflections.forEach((segment, i) => {
      segment.x = Math.round(moonX + Math.sin(time / 2400 + i * 2.4) * (4 + i * 0.65));
      segment.setAlpha(0.06 + (1 + Math.sin(time / 1700 + i)) * 0.055);
    });
    this.sync(this.ufo, a.ufo); this.sync(this.witch, a.witch); this.sync(this.ship, a.ship);
    this.ufo.setDepth(a.event === 'ufo-pass' ? DEPTH.distantUfo : DEPTH.closeUfo);
    this.witch.setFlipX(a.witch.direction < 0); this.ship.setFlipX(a.ship.direction < 0);
    this.sync(this.monster, a.monster);
    this.monster.setFrame(a.monster.frame).setFlipX(a.monster.direction < 0)
      .setY(Math.round(a.monster.y + (1 - a.monsterReveal) * 144 * a.monster.scale))
      .setCrop(0, 0, 128, Math.ceil(144 * a.monsterReveal));
    const mouthX = Math.round(a.monster.x + a.monster.direction * 12 * a.monster.scale);
    const mouthY = Math.round(a.monster.y - 106 * a.monster.scale);
    this.fire.setVisible(a.fireStrength > 0).setPosition(mouthX, mouthY)
      .setFrame(Math.floor(time / 160) % 4).setScale(0.9, 0.9 * a.fireStrength).setAlpha(a.fireStrength * 0.95);
    const disturbing = a.monsterReveal > 0 && a.monsterReveal < 0.99;
    this.splash.setVisible(disturbing).setPosition(Math.round(a.monster.x), Math.round(a.monster.y + 5))
      .setFrame(Math.floor(time / 240) % 4).setAlpha(0.4 + Math.sin(a.monsterReveal * Math.PI) * 0.4);
    this.heatReflection.setPosition(Math.round(a.monster.x), 255).setAlpha(a.fireStrength * 0.12);
    this.floorLight.setPosition(Math.round(a.ufo.x), LAYOUT.dockContactY).setAlpha(a.beamStrength * 0.1);
    this.drawBeam(); this.drawSea(); this.drawCannon();
    this.renderFinisher();
  }

  setFinisherFrame(frame: number | null, context?: FinisherContext): void {
    this.finisherFrame = frame;
    if (context) this.finisherContext = context;
    this.renderFinisher();
  }

  private renderFinisher(): void {
    const f = this.finisherFrame;
    if (f === null) { this.dread.setAlpha(0); this.finisherMonster.setVisible(false); return; }
    this.ufo.setVisible(false); this.witch.setVisible(false); this.ship.setVisible(false);
    this.fire.setVisible(false); this.beam.clear(); this.cannonFx.clear(); this.seaFx.clear();
    this.floorLight.setAlpha(0); this.heatReflection.setAlpha(0);
    this.dread.setAlpha(0.2 + (f >= FINISH_SPLASH ? 0.12 : 0));
    // O monstro emerge grande, à frente do atacante e virado para ele; o corte
    // horizontal na textura faz a linha d'água, logo atrás da borda do cais.
    const monster = finisherMonsterPose(f, this.finisherContext.originX, this.finisherContext.facing);
    const reveal = monster.reveal;
    const chewing = f >= FINISH_BITE && f < 238;
    this.monster.setVisible(false);
    this.finisherMonster.setVisible(reveal > 0).setPosition(Math.round(monster.x), Math.round(monster.y))
      .setScale(monster.scale).setFlipX(monster.flip)
      .setFrame(monster.frame).setCrop(0, 0, 192, Math.ceil(192 - (1 - reveal) * 160));
    const waterX = Math.round(monster.x);
    const waterY = FINISH_WATER_Y - 12;
    const splash = f >= FINISH_SPLASH && f < 155 || f >= 240 && f < 282;
    this.splash.setVisible(splash).setPosition(waterX, waterY + 4).setScale(1.5).setAlpha(0.9).setFrame(Math.floor(f / 6) % 4);
    if (chewing) {
      // Pixels carmesim escorrendo das mandíbulas; a vítima continua sendo seu próprio sprite.
      for (let i = 0; i < 9; i++) {
        const p = ((f - FINISH_BITE + i * 7) % 24) / 24;
        this.seaFx.fillStyle(i % 2 ? 0x8c1736 : 0xc4424f, (1 - p) * 0.85)
          .fillRect(Math.round(monster.mouthX + Math.sin(i * 4) * p * 42), Math.round(monster.mouthY + p * p * 80), 2, 3);
      }
    }
    if (f >= FINISH_SPLASH) {
      for (let ring = 0; ring < 4; ring++) {
        const age = (f - FINISH_SPLASH + ring * 13) % 72, t = age / 72;
        this.seaFx.lineStyle(1, ring % 2 ? 0xc7eff3 : 0x77bfd0, (1 - t) * 0.45)
          .strokeEllipse(waterX, waterY, 40 + t * 180, 5 + t * 20);
      }
      if (f < 150 || f > 248 && f < 280) for (let drop = 0; drop < 18; drop++) {
        const t = ((f + drop * 3) % 26) / 26;
        this.seaFx.fillStyle(drop % 2 ? 0xc4f3ef : 0x55a5bf, (1 - t) * 0.8)
          .fillRect(Math.round(waterX + Math.cos(drop * 2.4) * t * 90), Math.round(waterY - 4 - 56 * 4 * t * (1 - t)), 2, 3);
      }
    }
  }

  private sync(sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite, pose: CaisActorPose): void {
    sprite.setVisible(pose.visible).setPosition(Math.round(pose.x), Math.round(pose.y))
      .setScale(pose.scale).setAlpha(pose.alpha);
  }

  private drawBeam(): void {
    const a = this.ambience, g = this.beam;
    g.clear();
    if (a.beamStrength <= 0) return;
    const x = Math.round(a.ufo.x), top = Math.round(a.ufo.y + 15 * a.ufo.scale), bottom = LAYOUT.dockContactY;
    g.fillStyle(0x72dae8, a.beamStrength * 0.085).fillTriangle(x, top, x - 57, bottom, x + 57, bottom);
    g.fillStyle(0xbeffff, a.beamStrength * 0.06).fillTriangle(x, top, x - 23, bottom, x + 23, bottom);
    g.lineStyle(1, 0x9fe9e9, a.beamStrength * 0.09).lineBetween(x, top, x - 57, bottom).lineBetween(x, top, x + 57, bottom);
    for (let i = 0; i < 8; i++) {
      const p = ((a.elapsed / 4300 + i / 8) % 1);
      const width = (1 - p) * 46;
      g.fillStyle(0xc0ffff, a.beamStrength * (1 - p) * 0.35)
        .fillRect(Math.round(x + Math.sin(i * 5 + a.elapsed / 1600) * width), Math.round(bottom - p * (bottom - top)), 1, 2);
    }
  }

  private drawSea(): void {
    const a = this.ambience, g = this.seaFx;
    g.clear();
    if (a.monster.visible) {
      for (let i = 0; i < 3; i++) {
        const p = (a.elapsed / 2200 + i / 3) % 1;
        g.lineStyle(1, 0x7bb9cb, (1 - p) * 0.3 * a.monsterReveal)
          .strokeEllipse(Math.round(a.monster.x), a.monster.y + 3, 36 + p * 65, 3 + p * 9);
      }
    }
    if (a.ship.visible) {
      const x = Math.round(a.ship.x), y = Math.round(a.ship.y);
      g.lineStyle(1, 0x9ad2de, 0.26).lineBetween(x - 53, y + 1, x + 51, y + 1);
      g.lineStyle(1, 0x6bafc3, 0.18).lineBetween(x - 60, y + 4, x + 44, y + 4);
    }
  }

  private drawCannon(): void {
    const a = this.ambience, g = this.cannonFx;
    g.clear();
    if (a.cannonball.visible) {
      const { x, y } = a.cannonball;
      g.fillStyle(0x02050a).fillCircle(Math.round(x), Math.round(y), 3);
      g.fillStyle(0x97a9b5).fillRect(Math.round(x) - 1, Math.round(y) - 2, 2, 1);
      g.lineStyle(1, 0xa7a7a0, 0.18).lineBetween(x - a.ship.direction * 9, y + 1, x - a.ship.direction * 4, y);
    }
    if (a.muzzleFlash > 0) {
      const x = Math.round(a.ship.x + a.ship.direction * 55), y = Math.round(a.ship.y - 26);
      g.fillStyle(0xf4a249, a.muzzleFlash).fillCircle(x, y, 6);
      g.fillStyle(0xffefbc, a.muzzleFlash).fillRect(x - 2, y - 2, 4, 4);
    }
    if (a.impactStrength > 0) {
      const x = Math.round(a.monster.x - a.ship.direction * 7), y = Math.round(a.monster.y - 66);
      for (let i = 0; i < 6; i++) {
        const radius = (1 - a.impactStrength) * 17;
        g.fillStyle(i % 2 ? 0xf6cc73 : 0x9abdc7, a.impactStrength * 0.75)
          .fillRect(Math.round(x + Math.cos(i * 1.05) * radius), Math.round(y + Math.sin(i * 1.05) * radius), 2, 2);
      }
    }
  }

  snapshot() {
    const a = this.ambience;
    const actor = (pose: CaisActorPose) => ({ ...pose, x: Math.round(pose.x), y: Math.round(pose.y) });
    return { finisherFrame: this.finisherFrame, elapsed: a.elapsed, event: a.event, eventTime: a.eventTime, phase: a.phase,
      idleRemaining: a.idleRemaining, counts: { ...a.counts }, shots: a.shots, breaths: a.breaths, completed: a.completed,
      ufo: { ...actor(a.ufo), depth: this.ufo.depth }, moonDepth: DEPTH.moon,
      witch: actor(a.witch), ship: actor(a.ship), monster: actor(a.monster), cannonball: actor(a.cannonball),
      monsterReveal: a.monsterReveal, beamStrength: a.beamStrength, fireStrength: a.fireStrength,
      waterPhase: this.water[0]!.tilePositionX,
    };
  }
}
