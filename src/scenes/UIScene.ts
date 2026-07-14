import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { audioManager } from '../audio/AudioManager';
import type { CombatWorld, CombatWorldSnapshot } from '../combat/CombatWorld';
import { MAX_METER } from '../config/gameConfig';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, PALETTE } from '../config/pixelArtConfig';
import { getFighterDefinition } from '../fighters';
import { createConceptPortrait } from '../ui/PortraitView';
import { pixelText } from '../utils/text';

export interface UISceneData {
  readonly world: CombatWorld;
}

interface HudButton {
  readonly container: Phaser.GameObjects.Container;
  readonly background: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.BitmapText;
}

interface BannerState {
  readonly text: string;
  readonly tint: number;
}

const HEALTH_SEGMENTS = 10;
const METER_SEGMENTS = 10;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export class UIScene extends Phaser.Scene {
  private world: CombatWorld | null = null;
  private readonly healthSegments: [Phaser.GameObjects.Rectangle[], Phaser.GameObjects.Rectangle[]] = [[], []];
  private readonly meterSegments: [Phaser.GameObjects.Rectangle[], Phaser.GameObjects.Rectangle[]] = [[], []];
  private readonly roundMarkers: [Phaser.GameObjects.Rectangle[], Phaser.GameObjects.Rectangle[]] = [[], []];
  private timerText: Phaser.GameObjects.BitmapText | null = null;
  private infoText: Phaser.GameObjects.BitmapText | null = null;
  private bannerBackground: Phaser.GameObjects.Rectangle | null = null;
  private bannerText: Phaser.GameObjects.BitmapText | null = null;
  private pauseShade: Phaser.GameObjects.Rectangle | null = null;
  private pausePanel: Phaser.GameObjects.Rectangle | null = null;
  private pauseTitle: Phaser.GameObjects.BitmapText | null = null;
  private pauseHint: Phaser.GameObjects.BitmapText | null = null;
  private pauseButton: HudButton | null = null;
  private trainingButtons: HudButton[] = [];
  private previousBanner = '';

  constructor() {
    super({ key: 'UIScene' });
  }

  create(data: UISceneData): void {
    this.resetReferences();
    this.world = data.world;
    const snapshot = data.world.snapshot();

    this.createHudFrame();
    this.createFighterHud(0, snapshot.fighters[0].id);
    this.createFighterHud(1, snapshot.fighters[1].id);
    this.createAnnouncements();
    this.createButtons(snapshot);
    this.render(snapshot);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.world = null;
      this.resetReferences();
    });
  }

  update(): void {
    if (this.world) this.render(this.world.snapshot());
  }

  private resetReferences(): void {
    this.healthSegments[0].length = 0;
    this.healthSegments[1].length = 0;
    this.meterSegments[0].length = 0;
    this.meterSegments[1].length = 0;
    this.roundMarkers[0].length = 0;
    this.roundMarkers[1].length = 0;
    this.trainingButtons = [];
    this.infoText = null;
    this.previousBanner = '';
  }

  private createHudFrame(): void {
    this.add.rectangle(INTERNAL_WIDTH / 2, 24, INTERNAL_WIDTH, 48, PALETTE.black, 0.94).setDepth(4);
    this.add.image(0, 0, ASSET_MANIFEST.ui.hudFrame.key).setOrigin(0).setDepth(5);

    this.timerText = pixelText(this, INTERNAL_WIDTH / 2, 16, '99', { size: 16, align: 'center' })
      .setTint(PALETTE.gold)
      .setDepth(9);
    pixelText(this, INTERNAL_WIDTH / 2, 32, 'TEMPO', { size: 8, align: 'center' })
      .setTint(PALETTE.steelLight)
      .setDepth(9);
  }

  private createFighterHud(index: 0 | 1, fighterId: CombatWorldSnapshot['fighters'][number]['id']): void {
    const fighter = getFighterDefinition(fighterId);
    const playerOne = index === 0;
    const portraitX = playerOne ? 22 : INTERNAL_WIDTH - 22;
    const barStart = playerOne ? 45 : INTERNAL_WIDTH - 45;
    const direction = playerOne ? 1 : -1;
    const tint = playerOne ? PALETTE.cyan : PALETTE.pink;

    createConceptPortrait(this, portraitX, 23, fighterId, 28, 30, {
      crop: 'hud',
      frameColor: tint,
    }).setDepth(8);

    pixelText(this, barStart, 6, fighter.name.toUpperCase(), {
      size: 8,
      align: playerOne ? 'left' : 'right',
    }).setTint(PALETTE.ivory).setDepth(9);

    this.add.rectangle(
      barStart + direction * 45,
      16,
      90,
      8,
      PALETTE.metalDark,
    ).setStrokeStyle(1, PALETTE.steel).setDepth(6);
    for (let segment = 0; segment < HEALTH_SEGMENTS; segment += 1) {
      const cell = this.add.rectangle(
        barStart + direction * (4 + segment * 9),
        16,
        7,
        6,
        tint,
      ).setDepth(8);
      this.healthSegments[index].push(cell);
    }

    this.add.rectangle(
      barStart + direction * 45,
      34,
      90,
      5,
      PALETTE.ink,
    ).setStrokeStyle(1, PALETTE.steelDark).setDepth(6);
    for (let segment = 0; segment < METER_SEGMENTS; segment += 1) {
      const cell = this.add.rectangle(
        barStart + direction * (4 + segment * 9),
        34,
        7,
        2,
        PALETTE.gold,
      ).setDepth(8);
      this.meterSegments[index].push(cell);
    }

    for (let round = 0; round < 2; round += 1) {
      const markerX = INTERNAL_WIDTH / 2 + (playerOne ? -1 : 1) * (14 + round * 5);
      const marker = this.add.rectangle(markerX, 41, 3, 3, PALETTE.metalDark)
        .setStrokeStyle(1, tint)
        .setDepth(9);
      this.roundMarkers[index].push(marker);
    }
  }

  private createAnnouncements(): void {
    this.bannerBackground = this.add.rectangle(INTERNAL_WIDTH / 2, 78, 174, 29, PALETTE.black, 0.9)
      .setStrokeStyle(2, PALETTE.steelLight)
      .setVisible(false)
      .setDepth(30);
    this.bannerText = pixelText(this, INTERNAL_WIDTH / 2, 78, '', { size: 24, align: 'center' })
      .setVisible(false)
      .setDepth(32);

    this.pauseShade = this.add.rectangle(
      INTERNAL_WIDTH / 2,
      INTERNAL_HEIGHT / 2,
      INTERNAL_WIDTH,
      INTERNAL_HEIGHT,
      PALETTE.black,
      0.78,
    ).setVisible(false).setDepth(90);
    this.pausePanel = this.add.rectangle(INTERNAL_WIDTH / 2, 87, 180, 66, PALETTE.panel, 1)
      .setStrokeStyle(2, PALETTE.steelLight)
      .setVisible(false)
      .setDepth(91);
    this.pauseTitle = pixelText(this, INTERNAL_WIDTH / 2, 77, 'PAUSA', { size: 24, align: 'center' })
      .setTint(PALETTE.gold)
      .setVisible(false)
      .setDepth(92);
    this.pauseHint = pixelText(this, INTERNAL_WIDTH / 2, 105, 'ESC OU II PARA CONTINUAR', {
      size: 8,
      align: 'center',
    }).setTint(PALETTE.ivory).setVisible(false).setDepth(92);
  }

  private createButtons(snapshot: CombatWorldSnapshot): void {
    this.pauseButton = this.createButton(INTERNAL_WIDTH / 2, 36, 20, 10, 'II', () => {
      this.game.events.emit('fight:pause');
    });
    this.pauseButton.container.setDepth(100);

    if (this.world?.mode !== 'training') return;

    const controls: ReadonlyArray<readonly [number, string, string]> = [
      [63, 'REPOS.', 'training:reset'],
      [160, 'BOXES', 'training:debug'],
      [257, 'CPU', 'training:cpu'],
    ];
    this.trainingButtons = controls.map(([x, label, eventName]) => (
      this.createButton(x, 39, label === 'REPOS.' ? 46 : 38, 12, label, () => this.game.events.emit(eventName))
    ));

    this.infoText = pixelText(this, 4, 151, '', { size: 8 })
      .setTint(PALETTE.cyanLight)
      .setDepth(80);
    this.updateTrainingLabels(snapshot);
  }

  private createButton(
    x: number,
    y: number,
    width: number,
    height: number,
    text: string,
    onActivate: () => void,
  ): HudButton {
    const background = this.add.rectangle(0, 0, width, height, PALETTE.metalDark, 0.96)
      .setStrokeStyle(1, PALETTE.steelLight);
    const label = pixelText(this, 0, 0, text, { size: 8, align: 'center' }).setTint(PALETTE.ivory);
    const container = this.add.container(x, y, [background, label]);
    container.setSize(width + 10, height + 8).setInteractive({ useHandCursor: true });
    container.on('pointerdown', () => background.setFillStyle(PALETTE.panelLight));
    container.on('pointerout', () => background.setFillStyle(PALETTE.metalDark));
    container.on('pointerup', () => {
      background.setFillStyle(PALETTE.metalDark);
      audioManager.play('confirm');
      onActivate();
    });
    return { container, background, label };
  }

  private render(snapshot: CombatWorldSnapshot): void {
    for (const index of [0, 1] as const) {
      const fighter = snapshot.fighters[index];
      const health = clamp01(fighter.health / fighter.maxHealth);
      const healthCells = Math.ceil(health * HEALTH_SEGMENTS);
      const healthTint = health <= 0.25 ? PALETTE.danger : index === 0 ? PALETTE.cyan : PALETTE.pink;
      this.healthSegments[index].forEach((segment, cell) => {
        segment.setFillStyle(cell < healthCells ? healthTint : PALETTE.metalDark);
      });

      const meterCells = Math.floor(clamp01(fighter.meter / MAX_METER) * METER_SEGMENTS);
      this.meterSegments[index].forEach((segment, cell) => {
        segment.setFillStyle(cell < meterCells ? PALETTE.gold : PALETTE.metalDark);
      });

      this.roundMarkers[index].forEach((marker, round) => {
        marker.setFillStyle(
          round < snapshot.roundWins[index]
            ? index === 0 ? PALETTE.cyan : PALETTE.pink
            : PALETTE.metalDark,
        );
      });
    }

    this.timerText?.setText(String(snapshot.timeSeconds).padStart(2, '0'));
    this.updateBanner(snapshot);
    this.updatePause(snapshot.paused);
    this.updateTrainingLabels(snapshot);
  }

  private updateBanner(snapshot: CombatWorldSnapshot): void {
    let banner: BannerState | null = null;
    if (snapshot.phase === 'intro') {
      banner = snapshot.phaseFrame < 60
        ? { text: 'ROUND ' + snapshot.round, tint: PALETTE.ivory }
        : { text: 'FIGHT', tint: PALETTE.gold };
    } else if (snapshot.phase === 'roundOver') {
      const winner = snapshot.fighters.find((fighter) => fighter.state === 'victory');
      const knockout = snapshot.timeSeconds > 0;
      banner = snapshot.roundDraw
        ? { text: snapshot.phaseFrame < 80 ? 'EMPATE' : 'NOVO ROUND', tint: PALETTE.gold }
        : snapshot.phaseFrame < 66
          ? { text: knockout ? 'KO' : 'TEMPO', tint: PALETTE.danger }
          : { text: winner ? winner.name.toUpperCase() + ' VENCE' : 'FIM DO ROUND', tint: PALETTE.gold };
    } else if (snapshot.phase === 'matchOver') {
      const winner = snapshot.fighters.find((fighter) => fighter.state === 'victory');
      banner = {
        text: winner ? winner.name.toUpperCase() + ' CAMPEAO' : 'FIM DA LUTA',
        tint: PALETTE.gold,
      };
    }

    if (!banner || snapshot.paused) {
      this.bannerBackground?.setVisible(false);
      this.bannerText?.setVisible(false);
      this.previousBanner = '';
      return;
    }

    this.bannerBackground?.setVisible(true);
    this.bannerText?.setVisible(true).setText(banner.text).setTint(banner.tint);
    if (banner.text === this.previousBanner || !this.bannerText) return;

    this.previousBanner = banner.text;
    this.bannerText.setScale(2);
    this.time.delayedCall(70, () => this.bannerText?.setScale(1));
  }

  private updatePause(paused: boolean): void {
    this.pauseShade?.setVisible(paused);
    this.pausePanel?.setVisible(paused);
    this.pauseTitle?.setVisible(paused);
    this.pauseHint?.setVisible(paused);
    this.pauseButton?.label.setText(paused ? '>' : 'II');
  }

  private updateTrainingLabels(snapshot: CombatWorldSnapshot): void {
    if (!this.infoText || this.trainingButtons.length === 0) return;
    const [one, two] = snapshot.fighters;
    this.infoText.setText([
      'P1 ' + one.state + (one.activeMoveId ? '/' + one.activeMoveId : ''),
      'P2 ' + two.state + (two.activeMoveId ? '/' + two.activeMoveId : ''),
      'DANO ' + snapshot.lastDamage + '  COMBO ' + Math.max(...snapshot.combo),
    ].join('\n'));

    const boxes = this.trainingButtons[1];
    const cpu = this.trainingButtons[2];
    boxes?.label.setText(snapshot.debugBoxes ? 'BOX:ON' : 'BOXES');
    boxes?.background.setStrokeStyle(1, snapshot.debugBoxes ? PALETTE.gold : PALETTE.steelLight);
    cpu?.label.setText(snapshot.trainingCpuEnabled ? 'CPU:ON' : 'CPU:OFF');
    cpu?.background.setStrokeStyle(1, snapshot.trainingCpuEnabled ? PALETTE.gold : PALETTE.steelLight);
  }
}
