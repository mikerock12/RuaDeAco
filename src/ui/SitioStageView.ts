import type Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import {
  SHED, SHED_DOORS_CLOSE_END, SITIO_IMPALE, sitioFinisherStage,
} from '../combat/stageFinisher';
import type { FinisherContext } from './createStageView';
import { SitioAmbience } from './sitioAmbience';

const DEPTH = {
  interior: -39,
  farmer: -38,
  blood: -37.4,
  trident: -37.5,
  shadow: -37.2,
  doors: -37,
} as const;

export class SitioStageView {
  private readonly ambience = new SitioAmbience();
  private readonly animals: Phaser.GameObjects.Sprite[];
  private readonly eggs: Phaser.GameObjects.Graphics[];
  private readonly dust: Phaser.GameObjects.Rectangle[];
  private readonly interior: Phaser.GameObjects.Rectangle;
  private readonly doorLeft: Phaser.GameObjects.Image;
  private readonly doorRight: Phaser.GameObjects.Image;
  private readonly farmer: Phaser.GameObjects.Sprite;
  private readonly trident: Phaser.GameObjects.Image;
  private readonly bloodFx: Phaser.GameObjects.Graphics;
  private readonly shadow: Phaser.GameObjects.Rectangle;
  private finisherFrame: number | null = null;
  private finisherContext: FinisherContext = { originX: 280, facing: 1 };

  constructor(scene: Phaser.Scene) {
    const assets = ASSET_MANIFEST.sitio;
    scene.add.image(320, 180, assets.background.key)
      .setDisplaySize(640, 360).setDepth(-40).setName('sitio-background');
    // As duas folhas da porta são recortes da própria parede do galpão no fundo:
    // abrem para dentro (encolhem para a dobradiça e escurecem) e revelam o interior.
    const doorWidth = SHED.right - SHED.left;
    const doorHeight = SHED.bottom - SHED.top;
    const half = Math.floor(doorWidth / 2);
    const texture = scene.textures.get(assets.background.key);
    if (!texture.has('sitio-door-left')) texture.add('sitio-door-left', 0, SHED.left, SHED.top, half, doorHeight);
    if (!texture.has('sitio-door-right')) texture.add('sitio-door-right', 0, SHED.left + half, SHED.top, doorWidth - half, doorHeight);
    this.interior = scene.add.rectangle(SHED.left + doorWidth / 2, SHED.top + doorHeight / 2, doorWidth, doorHeight, 0x120c08)
      .setDepth(DEPTH.interior).setVisible(false).setName('sitio-shed-interior');
    this.doorLeft = scene.add.image(SHED.left, SHED.top, assets.background.key, 'sitio-door-left')
      .setOrigin(0, 0).setDepth(DEPTH.doors).setVisible(false).setName('sitio-shed-door-left');
    this.doorRight = scene.add.image(SHED.right, SHED.top, assets.background.key, 'sitio-door-right')
      .setOrigin(1, 0).setDepth(DEPTH.doors).setVisible(false).setName('sitio-shed-door-right');
    this.farmer = scene.add.sprite(0, 0, assets.farmer.key, 0)
      .setOrigin(0.5, 1).setDepth(DEPTH.farmer).setVisible(false).setName('sitio-masked-farmer');
    this.trident = scene.add.image(0, 0, assets.trident.key)
      .setOrigin(0.5, 1).setDepth(DEPTH.trident).setVisible(false).setName('sitio-trident');
    this.bloodFx = scene.add.graphics().setDepth(DEPTH.blood).setName('sitio-blood');
    this.shadow = scene.add.rectangle(SHED.left + doorWidth / 2, SHED.top + doorHeight / 2, doorWidth, doorHeight, 0x070503, 0)
      .setDepth(DEPTH.shadow).setName('sitio-shed-shadow');
    this.eggs = this.ambience.eggs.map((_, index) => {
      const egg = scene.add.graphics().setDepth(-28).setVisible(false).setName('sitio-egg-' + index);
      egg.fillStyle(0x76553b).fillRect(-2, -7, 4, 7).fillRect(-3, -5, 6, 4);
      egg.fillStyle(0xffefc0).fillRect(-1, -6, 2, 5).fillRect(-2, -4, 4, 3);
      egg.fillStyle(0xffffff).fillRect(-1, -5, 1, 3);
      return egg;
    });
    this.animals = this.ambience.animals.map((animal, index) => scene.add.sprite(
      Math.round(animal.x), Math.round(animal.y), assets[animal.species].key,
    ).setOrigin(0.5, 1).setDepth(-24).setName('sitio-' + animal.species + '-' + index));
    this.dust = Array.from({ length: 5 }, (_, index) => scene.add.rectangle(0, 0, 3, 2, 0xffd18a)
      .setDepth(-22).setVisible(false).setName('sitio-dust-' + index));
    this.update(0);
  }

  update(delta: number): void {
    // A fauna congela durante a finalização: o olhar fica no galpão.
    if (this.finisherFrame === null) this.ambience.update(delta);
    this.ambience.animals.forEach((animal, index) => {
      const tussle = animal.action === 'fight' ? Math.round(Math.sin(animal.timer / 70) * 2) : 0;
      const bob = animal.action === 'eat' ? Math.round(Math.sin(animal.timer / 100)) : 0;
      this.animals[index]!.setPosition(Math.round(animal.x) + tussle, Math.round(animal.y) + bob)
        .setFrame(animal.frame).setFlipX(animal.direction < 0);
    });
    this.ambience.eggs.forEach((egg, index) => this.eggs[index]!
      .setVisible(egg.active).setPosition(Math.round(egg.x), Math.round(egg.y)));
    const snake = this.ambience.animals[4]!;
    const lizard = this.ambience.animals[5]!;
    this.dust.forEach((puff, index) => {
      const progress = ((snake.timer + index * 170) % 650) / 650;
      puff.setVisible(snake.action === 'fight')
        .setPosition(Math.round((snake.x + lizard.x) / 2 + Math.sin(index * 2 + progress * 5) * 13),
          Math.round(snake.y - 3 - progress * 12)).setAlpha((1 - progress) * 0.65);
    });
    this.renderFinisher();
  }

  setFinisherFrame(frame: number | null, context?: FinisherContext): void {
    this.finisherFrame = frame;
    if (context) this.finisherContext = context;
    this.renderFinisher();
  }

  private renderFinisher(): void {
    const frame = this.finisherFrame;
    this.bloodFx.clear();
    if (frame === null) {
      this.interior.setVisible(false);
      this.doorLeft.setVisible(false);
      this.doorRight.setVisible(false);
      this.farmer.setVisible(false);
      this.trident.setVisible(false);
      this.shadow.setAlpha(0);
      return;
    }
    const stage = sitioFinisherStage(frame, this.finisherContext.originX);
    const open = stage.doors;
    const dark = Math.round(255 - open * 190);
    const tint = (dark << 16) | (dark << 8) | dark;
    this.interior.setVisible(open > 0);
    for (const leaf of [this.doorLeft, this.doorRight]) {
      leaf.setVisible(open > 0).setScale(Math.max(0.06, 1 - open * 0.94), 1).setTint(tint);
    }
    this.farmer.setVisible(stage.farmerVisible)
      .setPosition(Math.round(stage.farmerX), Math.round(stage.farmerFeetY))
      .setFrame(stage.farmerFrame).setFlipX(stage.farmerFacing < 0);
    this.trident.setVisible(stage.farmerVisible)
      .setPosition(Math.round(stage.tridentX), Math.round(stage.tridentBaseY));
    this.shadow.setAlpha(stage.shadow * 0.94);
    if (frame >= SITIO_IMPALE && frame < SHED_DOORS_CLOSE_END) this.drawBlood(frame, stage.tridentTipX, stage.tridentTipY, stage.blood);
  }

  /** Respingos no impacto e gotas que escorrem pelo cabo; pixels inteiros, sem blur. */
  private drawBlood(frame: number, tipX: number, tipY: number, burst: number): void {
    const g = this.bloodFx;
    const age = frame - SITIO_IMPALE;
    if (burst > 0) {
      for (let i = 0; i < 18; i++) {
        const t = Math.min(1, age / 20);
        const dx = Math.cos(i * 1.9) * (8 + (i % 5) * 6) * t;
        const dy = -Math.abs(Math.sin(i * 2.3)) * 16 * t + 22 * t * t;
        g.fillStyle(i % 3 ? 0x8c1a1a : 0xc4303a, burst * 0.95)
          .fillRect(Math.round(tipX + dx), Math.round(tipY + dy), 2 + (i % 2), 2 + (i % 2));
      }
    }
    // Mancha que se acumula nas pontas e gotas que escorrem pelo cabo.
    const pool = Math.min(1, age / 30);
    g.fillStyle(0x7a1414, 0.9 * pool).fillRect(Math.round(tipX - 3), Math.round(tipY + 2), 6, 2)
      .fillRect(Math.round(tipX - 2), Math.round(tipY + 4), 4, 1);
    for (let drop = 0; drop < 4; drop++) {
      const p = ((age + drop * 23) % 64) / 64;
      if (age < drop * 23) continue;
      g.fillStyle(0x7a1414, 0.9).fillRect(Math.round(tipX - 1 + (drop % 2)), Math.round(tipY + 6 + p * 26), 1, 2 + (drop % 2));
    }
  }

  snapshot() {
    const frame = this.finisherFrame;
    const stage = frame === null ? null : sitioFinisherStage(frame, this.finisherContext.originX);
    return {
      elapsed: this.ambience.elapsed,
      eggsLaid: this.ambience.eggsLaid,
      eggsEaten: { ...this.ambience.eggsEaten },
      fights: this.ambience.fights,
      animals: this.ambience.animals.map((animal, index) => ({
        species: animal.species, action: animal.action, x: this.animals[index]!.x,
        y: this.animals[index]!.y, frame: animal.frame,
      })),
      eggs: this.ambience.eggs.map(egg => ({ active: egg.active, x: Math.round(egg.x), y: Math.round(egg.y) })),
      finisherFrame: frame,
      doorsOpen: stage ? stage.doors : 0,
      farmerVisible: this.farmer.visible,
      farmerFrame: this.farmer.frame.name,
      tridentTip: stage ? { x: stage.tridentTipX, y: stage.tridentTipY } : null,
    };
  }
}
