import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { audioManager } from '../audio/AudioManager';
import type { CombatWorld, CombatWorldSnapshot } from '../combat/CombatWorld';
import { MAX_METER } from '../config/gameConfig';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, PALETTE } from '../config/pixelArtConfig';
import { getFighterDefinition } from '../fighters';
import { createConceptPortrait } from '../ui/PortraitView';
import { buildPauseMoveList, type MoveListLineTone } from '../ui/moveListPresenter';
import { pixelText, toPixelFontText } from '../utils/text';

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
  private pauseMoveTexts: Phaser.GameObjects.BitmapText[] = [];
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
    this.pauseMoveTexts = [];
    this.infoText = null;
    this.previousBanner = '';
  }

  // Faixa do HUD: 64px de altura (safe area superior). Os lutadores em pé
  // ficam abaixo de y=88, garantindo margem visual para a arena.
  private createHudFrame(): void {
    this.add.rectangle(INTERNAL_WIDTH / 2, 32, INTERNAL_WIDTH, 64, PALETTE.black, 0.94).setDepth(4);
    this.add.image(0, 0, ASSET_MANIFEST.ui.hudFrame.key).setOrigin(0).setScale(2).setDepth(5);

    this.timerText = pixelText(this, INTERNAL_WIDTH / 2, 20, '99', { size: 32, align: 'center' })
      .setTint(PALETTE.gold)
      .setDepth(9);
  }

  private createFighterHud(index: 0 | 1, fighterId: CombatWorldSnapshot['fighters'][number]['id']): void {
    const fighter = getFighterDefinition(fighterId);
    const playerOne = index === 0;
    const portraitX = playerOne ? 28 : INTERNAL_WIDTH - 28;
    const barStart = playerOne ? 56 : INTERNAL_WIDTH - 56;
    const direction = playerOne ? 1 : -1;
    const tint = playerOne ? PALETTE.cyan : PALETTE.pink;

    createConceptPortrait(this, portraitX, 31, fighterId, 34, 38, {
      crop: 'hud',
      frameColor: tint,
    }).setDepth(8);

    // Margem superior segura: topo do texto (12 - 8) fica a 4px da borda.
    pixelText(this, barStart, 12, fighter.name.toUpperCase(), {
      size: 16,
      align: playerOne ? 'left' : 'right',
    }).setTint(PALETTE.ivory).setDepth(9);

    this.add.rectangle(
      barStart + direction * 70,
      26,
      140,
      10,
      PALETTE.metalDark,
    ).setStrokeStyle(2, PALETTE.steel).setDepth(6);
    for (let segment = 0; segment < HEALTH_SEGMENTS; segment += 1) {
      const cell = this.add.rectangle(
        barStart + direction * (7 + segment * 14),
        26,
        12,
        6,
        tint,
      ).setDepth(8);
      this.healthSegments[index].push(cell);
    }

    this.add.rectangle(
      barStart + direction * 70,
      40,
      140,
      8,
      PALETTE.ink,
    ).setStrokeStyle(2, PALETTE.steelDark).setDepth(6);
    for (let segment = 0; segment < METER_SEGMENTS; segment += 1) {
      const cell = this.add.rectangle(
        barStart + direction * (7 + segment * 14),
        40,
        12,
        4,
        PALETTE.gold,
      ).setDepth(8);
      this.meterSegments[index].push(cell);
    }

    for (let round = 0; round < 2; round += 1) {
      const markerX = INTERNAL_WIDTH / 2 + (playerOne ? -1 : 1) * (26 + round * 10);
      const marker = this.add.rectangle(markerX, 44, 6, 6, PALETTE.metalDark)
        .setStrokeStyle(2, tint)
        .setDepth(9);
      this.roundMarkers[index].push(marker);
    }
  }

  private createAnnouncements(): void {
    this.bannerBackground = this.add.rectangle(INTERNAL_WIDTH / 2, 156, 348, 58, PALETTE.black, 0.9)
      .setStrokeStyle(4, PALETTE.steelLight)
      .setVisible(false)
      .setDepth(30);
    this.bannerText = pixelText(this, INTERNAL_WIDTH / 2, 156, '', { size: 48, align: 'center' })
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
    this.pausePanel = this.add.rectangle(INTERNAL_WIDTH / 2, 200, 608, 280, PALETTE.panel, 1)
      .setStrokeStyle(4, PALETTE.steelLight)
      .setVisible(false)
      .setDepth(91);
    this.pauseTitle = pixelText(this, INTERNAL_WIDTH / 2, 74, 'PAUSA', { size: 24, align: 'center' })
      .setTint(PALETTE.gold)
      .setVisible(false)
      .setDepth(92);
    this.pauseHint = pixelText(this, INTERNAL_WIDTH / 2, 328, 'ESC OU II PARA CONTINUAR', {
      size: 16,
      align: 'center',
    }).setTint(PALETTE.ivory).setVisible(false).setDepth(92);
    this.createPauseMoveList();
  }

  private createPauseMoveList(): void {
    if (!this.world) return;
    const legend = pixelText(this, INTERNAL_WIDTH / 2, 96, 'FRENTE = EM DIRECAO AO ADVERSARIO', {
      size: 8,
      align: 'center',
    }).setTint(PALETTE.cyanLight).setVisible(false).setDepth(92);
    legend.setOrigin(0.5, 0).setCenterAlign();
    this.pauseMoveTexts.push(legend);

    for (const index of [0, 1] as const) {
      const definition = this.world.fighters[index].definition;
      const model = buildPauseMoveList(definition, index);
      const playerTint = index === 0 ? PALETTE.cyan : PALETTE.pink;
      model.lines.forEach((line, lineIndex) => {
        const text = pixelText(this, index === 0 ? 24 : 328, 110 + lineIndex * 10, line.text, { size: 8 })
          .setTint(this.pauseLineTint(line.tone, playerTint))
          .setVisible(false)
          .setDepth(92);
        text.setOrigin(0, 0);
        this.pauseMoveTexts.push(text);
      });
    }
  }

  private pauseLineTint(tone: MoveListLineTone, playerTint: number): number {
    if (tone === 'section') return PALETTE.gold;
    if (tone === 'controls') return PALETTE.cyanLight;
    if (tone === 'note') return PALETTE.steelLight;
    return playerTint;
  }

  private createButtons(snapshot: CombatWorldSnapshot): void {
    this.pauseButton = this.createButton(INTERNAL_WIDTH / 2, 55, 40, 14, 'II', () => {
      this.game.events.emit('fight:pause');
    });
    this.pauseButton.container.setDepth(100);

    if (this.world?.mode !== 'training') return;

    const controls: ReadonlyArray<readonly [number, string, string]> = [
      [126, 'REPOS.', 'training:reset'],
      [320, 'BOXES', 'training:debug'],
      [514, 'CPU', 'training:cpu'],
    ];
    this.trainingButtons = controls.map(([x, label, eventName]) => (
      this.createButton(x, 78, label === 'REPOS.' ? 92 : 76, 24, label, () => this.game.events.emit(eventName))
    ));

    this.infoText = pixelText(this, 8, 302, '', { size: 16 })
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
      .setStrokeStyle(2, PALETTE.steelLight);
    const label = pixelText(this, 0, 0, text, { size: 16, align: 'center' }).setTint(PALETTE.ivory);
    const container = this.add.container(x, y, [background, label]);
    container.setSize(width + 20, height + 16).setInteractive({ useHandCursor: true });
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
    this.bannerText?.setVisible(true).setText(toPixelFontText(banner.text)).setTint(banner.tint);
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
    for (const text of this.pauseMoveTexts) text.setVisible(paused);
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
    boxes?.background.setStrokeStyle(2, snapshot.debugBoxes ? PALETTE.gold : PALETTE.steelLight);
    cpu?.label.setText(snapshot.trainingCpuEnabled ? 'CPU:ON' : 'CPU:OFF');
    cpu?.background.setStrokeStyle(2, snapshot.trainingCpuEnabled ? PALETTE.gold : PALETTE.steelLight);
  }
}
