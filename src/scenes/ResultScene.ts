import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { audioManager } from '../audio/AudioManager';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, PALETTE } from '../config/pixelArtConfig';
import { gameSession } from '../config/session';
import { getFighterDefinition } from '../fighters';
import { createConceptPortrait } from '../ui/PortraitView';
import { pixelText } from '../utils/text';

interface ResultOption {
  readonly container: Phaser.GameObjects.Container;
  readonly background: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.BitmapText;
  readonly activate: () => void;
}

export class ResultScene extends Phaser.Scene {
  private readonly options: ResultOption[] = [];
  private selectedIndex = 0;

  constructor() {
    super({ key: 'ResultScene' });
  }

  create(): void {
    this.scene.stop('UIScene');
    this.options.length = 0;
    this.selectedIndex = 0;
    this.drawBackground();

    const result = gameSession.result;
    const winnerId = result?.winner ?? gameSession.selection.playerOne;
    const loserId = result?.loser ?? gameSession.selection.playerTwo;
    const winner = getFighterDefinition(winnerId);
    const loser = getFighterDefinition(loserId);
    const title = result ? (result.playerWon ? 'VITORIA!' : 'DERROTA') : 'FIM DA LUTA';
    const titleTint = result?.playerWon === false ? PALETTE.danger : PALETTE.gold;

    createConceptPortrait(this, 138, 202, winnerId, 224, 264, {
      crop: 'framed',
      frameColor: PALETTE.gold,
    }).setDepth(4);
    this.add.rectangle(138, 70, 208, 6, PALETTE.gold).setDepth(6);
    pixelText(this, 138, 54, 'CAMPEAO', { size: 16, align: 'center' })
      .setTint(PALETTE.gold)
      .setDepth(7);

    // Retrato do rival opaco: o rebaixamento visual vem do tom aço, não de alpha.
    createConceptPortrait(this, 272, 270, loserId, 76, 92, {
      crop: 'hud',
      frameColor: PALETTE.steel,
    }).setDepth(6);
    pixelText(this, 272, 326, 'RIVAL', { size: 16, align: 'center' })
      .setTint(PALETTE.muted)
      .setDepth(7);

    pixelText(this, 450, 48, title, { size: 32, align: 'center' })
      .setTint(titleTint)
      .setDepth(7);
    pixelText(this, 450, 90, winner.name.toUpperCase(), { size: 16, align: 'center' })
      .setTint(PALETTE.cyanLight)
      .setDepth(7);
    pixelText(this, 450, 110, 'VENCEU ' + loser.name.toUpperCase(), { size: 16, align: 'center' })
      .setTint(PALETTE.ivory)
      .setDepth(7);

    if (result) {
      pixelText(this, 450, 136, result.rounds[0] + ' - ' + result.rounds[1], {
        size: 32,
        align: 'center',
      }).setTint(PALETTE.gold).setDepth(7);
    }

    this.options.push(
      this.createOption(450, 188, 'REVANCHE', () => this.goTo('FightScene')),
      this.createOption(450, 240, 'SELECAO', () => this.goTo('CharacterSelectScene')),
      this.createOption(450, 292, 'MENU PRINCIPAL', () => this.goTo('MainMenuScene')),
    );
    this.refreshSelection();

    this.input.keyboard?.on('keydown', this.handleKeyDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.handleKeyDown);
      this.options.length = 0;
    });

    pixelText(this, INTERNAL_WIDTH / 2, 348, 'W/S ESCOLHE  ENTER CONFIRMA', { size: 16, align: 'center' })
      .setTint(PALETTE.steelLight);
  }

  private drawBackground(): void {
    this.cameras.main.setBackgroundColor(PALETTE.black);
    const { stage } = ASSET_MANIFEST;
    this.add.image(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.far.key).setScale(2);
    this.add.image(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.mid.key).setScale(2);
    this.add.sprite(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.water.key, 0).setScale(2);
    this.add.image(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.foreground.key).setScale(2);
    this.add.rectangle(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, INTERNAL_WIDTH, INTERNAL_HEIGHT, PALETTE.ink, 0.74);

    this.add.rectangle(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, 608, 336, PALETTE.black, 0.78)
      .setStrokeStyle(4, PALETTE.steelLight);
    this.add.image(450, 232, ASSET_MANIFEST.ui.panel.key).setScale(2).setDepth(1);
    this.add.rectangle(INTERNAL_WIDTH / 2, 14, 588, 4, PALETTE.cyan);
    this.add.rectangle(INTERNAL_WIDTH / 2, 18, 588, 2, PALETTE.gold);
    this.add.rectangle(316, 188, 4, 284, PALETTE.steelDark);
    this.add.rectangle(320, 188, 2, 284, PALETTE.gold);
  }

  private createOption(x: number, y: number, text: string, activate: () => void): ResultOption {
    const background = this.add.rectangle(0, 0, 288, 40, PALETTE.metalDark)
      .setStrokeStyle(2, PALETTE.steel);
    const label = pixelText(this, 0, 0, text, { size: 16, align: 'center' }).setTint(PALETTE.ivory);
    const container = this.add.container(x, y, [background, label]).setDepth(8);
    container.setSize(304, 48).setInteractive({ useHandCursor: true });
    const option: ResultOption = { container, background, label, activate };

    container.on('pointerover', () => {
      this.selectedIndex = this.options.indexOf(option);
      this.refreshSelection();
    });
    container.on('pointerdown', () => background.setFillStyle(PALETTE.panelLight));
    container.on('pointerout', () => this.refreshSelection());
    container.on('pointerup', () => option.activate());
    return option;
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || this.options.length === 0) return;
    if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') {
      event.preventDefault();
      this.moveSelection(-1);
      return;
    }
    if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.moveSelection(1);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.options[this.selectedIndex]?.activate();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.goTo('MainMenuScene');
    }
  };

  private moveSelection(direction: -1 | 1): void {
    this.selectedIndex = (this.selectedIndex + direction + this.options.length) % this.options.length;
    this.refreshSelection();
  }

  private refreshSelection(): void {
    this.options.forEach((option, index) => {
      const selected = index === this.selectedIndex;
      option.background
        .setFillStyle(selected ? PALETTE.panelLight : PALETTE.metalDark)
        .setStrokeStyle(selected ? 4 : 2, selected ? PALETTE.gold : PALETTE.steel);
      option.label.setTint(selected ? PALETTE.gold : PALETTE.ivory);
    });
  }

  private goTo(sceneKey: 'FightScene' | 'CharacterSelectScene' | 'MainMenuScene'): void {
    audioManager.play('confirm');
    gameSession.result = null;
    this.scene.start(sceneKey);
  }
}
