import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { audioManager } from '../audio/AudioManager';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, PALETTE } from '../config/pixelArtConfig';
import { gameSession } from '../config/session';
import { getFighterDefinition } from '../fighters';
import { gamepadButtonLabel, keyLabel, movementKeysSummary } from '../input/controlLabels';
import { controlsStore } from '../input/controlsStore';
import { gamepadManager } from '../input/GamepadManager';
import { InputManager } from '../input/InputManager';
import { createConceptPortrait } from '../ui/PortraitView';
import { pixelText, tagLayoutPanel } from '../utils/text';

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
    const onlineResult = gameSession.selection.mode === 'online'
      ? gameSession.onlineResult
      : null;
    if (onlineResult?.kind === 'interrupted') {
      this.renderInterruptedOnline(onlineResult.message);
      this.bindNavigation();
      return;
    }
    const winnerId = result?.winner ?? gameSession.selection.playerOne;
    const loserId = result?.loser ?? gameSession.selection.playerTwo;
    const winner = getFighterDefinition(winnerId);
    const loser = getFighterDefinition(loserId);
    const title = result ? (result.playerWon ? 'VITORIA!' : 'DERROTA') : 'FIM DA LUTA';
    const titleTint = result?.playerWon === false ? PALETTE.danger : PALETTE.gold;

    createConceptPortrait(this, 130, 202, winnerId, 200, 252, {
      crop: 'hero',
      frameColor: PALETTE.gold,
    }).setDepth(4);
    this.add.rectangle(130, 72, 188, 6, PALETTE.gold).setDepth(6);
    pixelText(this, 130, 56, 'CAMPEAO', { size: 16, align: 'center' })
      .setTint(PALETTE.gold)
      .setDepth(7);

    // Retrato do rival opaco: o rebaixamento visual vem do tom aço, não de alpha.
    createConceptPortrait(this, 270, 260, loserId, 64, 78, {
      crop: 'profile',
      frameColor: PALETTE.steel,
    }).setDepth(6);
    pixelText(this, 270, 314, 'RIVAL', { size: 12, align: 'center' })
      .setTint(PALETTE.muted)
      .setDepth(7);

    pixelText(this, 466, 48, title, {
      size: 32,
      minSize: 16,
      maxWidth: 288,
      maxHeight: 42,
      align: 'center',
      layoutName: 'result-title',
    })
      .setTint(titleTint)
      .setDepth(7);
    pixelText(this, 466, 90, winner.name.toUpperCase(), {
      size: 16,
      minSize: 8,
      maxWidth: 288,
      maxHeight: 22,
      align: 'center',
      layoutName: 'result-winner',
    })
      .setTint(PALETTE.cyanLight)
      .setDepth(7);
    pixelText(this, 466, 110, 'VENCEU ' + loser.name.toUpperCase(), {
      size: 16,
      minSize: 8,
      maxWidth: 288,
      maxHeight: 22,
      align: 'center',
      layoutName: 'result-loser',
    })
      .setTint(PALETTE.ivory)
      .setDepth(7);

    if (result) {
      pixelText(this, 466, 136, result.rounds[0] + ' - ' + result.rounds[1], {
        size: 32,
        align: 'center',
      }).setTint(PALETTE.gold).setDepth(7);
    }

    if (gameSession.selection.mode === 'online') {
      this.options.push(
        this.createOption(466, 214, 'VOLTAR AO ONLINE', () => this.goTo('OnlineScene')),
        this.createOption(466, 270, 'MENU PRINCIPAL', () => this.goTo('MainMenuScene')),
      );
      pixelText(this, 466, 166, 'BETA LOCAL • SEM RANKING', {
        size: 8,
        maxWidth: 288,
        maxHeight: 14,
        color: '#8796ae',
        align: 'center',
      }).setDepth(7);
    } else {
      this.options.push(
        this.createOption(466, 188, 'REVANCHE', () => this.goTo('FightScene')),
        this.createOption(466, 240, 'SELECAO', () => this.goTo('CharacterSelectScene')),
        this.createOption(466, 292, 'MENU PRINCIPAL', () => this.goTo('MainMenuScene')),
      );
    }
    this.refreshSelection();
    this.bindNavigation();
  }

  private renderInterruptedOnline(message: string): void {
    this.add.rectangle(
      INTERNAL_WIDTH / 2,
      160,
      576,
      250,
      PALETTE.black,
      0.97,
    ).setStrokeStyle(2, PALETTE.steelLight).setDepth(6);
    pixelText(this, INTERNAL_WIDTH / 2, 72, 'PARTIDA INTERROMPIDA', {
      size: 32,
      minSize: 16,
      maxWidth: 560,
      maxHeight: 42,
      color: '#ffd55c',
      align: 'center',
      layoutName: 'online-result-interrupted',
    }).setDepth(7);
    pixelText(this, INTERNAL_WIDTH / 2, 128, 'SEM VENCEDOR • SEM DERROTA', {
      size: 16,
      maxWidth: 520,
      maxHeight: 22,
      color: '#9af7ff',
      align: 'center',
    }).setDepth(7);
    pixelText(this, INTERNAL_WIDTH / 2, 170, message.toUpperCase(), {
      size: 8,
      maxWidth: 500,
      maxHeight: 42,
      maxLines: 3,
      color: '#f7f2d0',
      align: 'center',
      layoutName: 'online-result-message',
    }).setDepth(7);
    this.options.push(
      this.createOption(INTERNAL_WIDTH / 2, 240, 'VOLTAR AO ONLINE', () => this.goTo('OnlineScene')),
      this.createOption(INTERNAL_WIDTH / 2, 294, 'MENU PRINCIPAL', () => this.goTo('MainMenuScene')),
    );
    this.refreshSelection();
  }

  private bindNavigation(): void {
    this.input.keyboard?.on('keydown', this.handleKeyDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.handleKeyDown);
      this.options.length = 0;
    });
    pixelText(this, INTERNAL_WIDTH / 2, 336, this.navigationHint(), {
      size: 8,
      maxWidth: 600,
      maxHeight: 16,
      align: 'center',
      layoutName: 'result-footer',
    }).setTint(PALETTE.steelLight);
  }

  private navigationHint(): string {
    if (InputManager.isTouchCapable()) return 'TOQUE EM UMA OPCAO';
    const pad = gamepadManager.assignedPad(0);
    const config = controlsStore.get();
    if (pad) {
      const confirm = gamepadButtonLabel(pad.family, config.gamepad[0].bindings.light);
      return `D-PAD ESCOLHE  ${confirm} CONFIRMA`;
    }
    const keyboard = config.keyboard[0];
    return `${movementKeysSummary(keyboard)} ESCOLHE  ENTER / ${keyLabel(keyboard.bindings.light)} CONFIRMA`;
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
    const panelName = `result-option-${this.options.length}`;
    const background = tagLayoutPanel(
      this.add.rectangle(0, 0, 288, 40, PALETTE.metalDark)
        .setStrokeStyle(2, PALETTE.steel),
      panelName,
      { x: 12, y: 6 },
    );
    const label = pixelText(this, 0, 0, text, {
      size: 16,
      minSize: 8,
      maxWidth: 264,
      maxHeight: 28,
      align: 'center',
      layoutName: `${panelName}-label`,
      panelName,
      padding: { x: 12, y: 6 },
    }).setTint(PALETTE.ivory);
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

  private goTo(sceneKey: 'FightScene' | 'CharacterSelectScene' | 'OnlineScene' | 'MainMenuScene'): void {
    audioManager.play('confirm');
    gameSession.result = null;
    gameSession.onlineResult = null;
    this.scene.start(sceneKey);
  }
}
