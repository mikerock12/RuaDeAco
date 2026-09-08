import type Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { SitioAmbience } from './sitioAmbience';

export class SitioStageView {
  private readonly ambience = new SitioAmbience();
  private readonly animals: Phaser.GameObjects.Sprite[];
  private readonly eggs: Phaser.GameObjects.Graphics[];
  private readonly dust: Phaser.GameObjects.Rectangle[];

  constructor(scene: Phaser.Scene) {
    const assets = ASSET_MANIFEST.sitio;
    scene.add.image(320, 180, assets.background.key)
      .setDisplaySize(640, 360).setDepth(-40).setName('sitio-background');
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
    this.ambience.update(delta);
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
  }

  snapshot() {
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
    };
  }
}
