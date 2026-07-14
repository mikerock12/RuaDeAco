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

    createConceptPortrait(this, 69, 101, winnerId, 112, 132, {
      crop: 'framed',
      frameColor: PALETTE.gold,
    }).setDepth(4);
    this.add.rectangle(69, 35, 104, 3, PALETTE.gold).setDepth(6);
    pixelText(this, 69, 27, 'CAMPEAO', { size: 8, align: 'center' })
      .setTint(PALETTE.gold)
      .setDepth(7);

    createConceptPortrait(this, 136, 135, loserId, 38, 46, {
      crop: 'hud',
      frameColor: PALETTE.steel,
    }).setAlpha(0.74).setDepth(6);
    pixelText(this, 136, 163, 'RIVAL', { size: 8, align: 'center' })
      .setTint(PALETTE.muted)
      .setDepth(7);

    pixelText(this, 225, 24, title, { size: 16, align: 'center' })
      .setTint(titleTint)
      .setDepth(7);
    pixelText(this, 225, 45, winner.name.toUpperCase(), { size: 8, align: 'center' })
      .setTint(PALETTE.cyanLight)
      .setDepth(7);
    pixelText(this, 225, 55, 'VENCEU ' + loser.name.toUpperCase(), { size: 8, align: 'center' })
      .setTint(PALETTE.ivory)
      .setDepth(7);

    if (result) {
      pixelText(this, 225, 68, result.rounds[0] + ' - ' + result.rounds[1], {
        size: 16,
        align: 'center',
      }).setTint(PALETTE.gold).setDepth(7);
    }

    this.options.push(
      this.createOption(225, 94, 'REVANCHE', () => this.goTo('FightScene')),
      this.createOption(225, 120, 'SELECAO', () => this.goTo('CharacterSelectScene')),
      this.createOption(225, 146, 'MENU PRINCIPAL', () => this.goTo('MainMenuScene')),
    );
    this.refreshSelection();

    this.input.keyboard?.on('keydown', this.handleKeyDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.handleKeyDown);
      this.options.length = 0;
    });

    pixelText(this, INTERNAL_WIDTH / 2, 174, 'W/S ESCOLHE  ENTER CONFIRMA', { size: 8, align: 'center' })
      .setTint(PALETTE.steelLight);
  }

  private drawBackground(): void {
    this.cameras.main.setBackgroundColor(PALETTE.black);
    const { stage } = ASSET_MANIFEST;
    this.add.image(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.far.key);
    this.add.image(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.mid.key);
    this.add.sprite(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.water.key, 0);
    this.add.image(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.foreground.key);
    this.add.rectangle(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, INTERNAL_WIDTH, INTERNAL_HEIGHT, PALETTE.ink, 0.74);

    this.add.rectangle(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, 304, 168, PALETTE.black, 0.78)
      .setStrokeStyle(2, PALETTE.steelLight);
    this.add.image(225, 116, ASSET_MANIFEST.ui.panel.key).setDepth(1);
    this.add.rectangle(INTERNAL_WIDTH / 2, 7, 294, 2, PALETTE.cyan);
    this.add.rectangle(INTERNAL_WIDTH / 2, 9, 294, 1, PALETTE.gold);
    this.add.rectangle(158, 94, 2, 142, PALETTE.steelDark);
    this.add.rectangle(160, 94, 1, 142, PALETTE.gold);
  }

  private createOption(x: number, y: number, text: string, activate: () => void): ResultOption {
    const background = this.add.rectangle(0, 0, 144, 20, PALETTE.metalDark)
      .setStrokeStyle(1, PALETTE.steel);
    const label = pixelText(this, 0, 0, text, { size: 8, align: 'center' }).setTint(PALETTE.ivory);
    const container = this.add.container(x, y, [background, label]).setDepth(8);
    container.setSize(152, 24).setInteractive({ useHandCursor: true });
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
        .setStrokeStyle(selected ? 2 : 1, selected ? PALETTE.gold : PALETTE.steel);
      option.label.setTint(selected ? PALETTE.gold : PALETTE.ivory);
    });
  }

  private goTo(sceneKey: 'FightScene' | 'CharacterSelectScene' | 'MainMenuScene'): void {
    audioManager.play('confirm');
    gameSession.result = null;
    this.scene.start(sceneKey);
  }
}
