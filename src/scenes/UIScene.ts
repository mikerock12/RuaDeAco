import Phaser from 'phaser';
import { audioManager } from '../audio/AudioManager';
import type { CombatWorld, CombatWorldSnapshot } from '../combat/CombatWorld';
import { MAX_METER } from '../config/gameConfig';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, PALETTE } from '../config/pixelArtConfig';
import { getFighterDefinition } from '../fighters';
import { settingsStore } from '../config/settings';
import { gamepadManager } from '../input/GamepadManager';
import { InputManager } from '../input/InputManager';
import { onlineSession } from '../online/OnlineSession';
import type { PlayerSlot } from '../online/protocol';
import { createConceptPortrait } from '../ui/PortraitView';
import {
  buildPauseMoveList,
  pauseHintText,
  type MoveListDevice,
  type MoveListLineTone,
} from '../ui/moveListPresenter';
import { PAUSE_MENU_OPTIONS, type PauseMenuAction } from '../ui/pauseMenu';
import { pixelText, tagLayoutPanel } from '../utils/text';
import { buildTouchMovePages } from '../ui/touchMoveList';

export interface UISceneData {
  readonly world: CombatWorld;
  readonly online?: boolean;
  readonly localSlot?: PlayerSlot | null;
}

interface HudButton {
  readonly container: Phaser.GameObjects.Container;
  readonly background: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.BitmapText;
}

interface PauseOptionButton extends HudButton {
  readonly action: PauseMenuAction;
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
  private infoPanel: Phaser.GameObjects.Rectangle | null = null;
  private bannerBackground: Phaser.GameObjects.Rectangle | null = null;
  private bannerText: Phaser.GameObjects.BitmapText | null = null;
  private pauseShade: Phaser.GameObjects.Rectangle | null = null;
  private pausePanel: Phaser.GameObjects.Rectangle | null = null;
  private pauseTitle: Phaser.GameObjects.BitmapText | null = null;
  private pauseHint: Phaser.GameObjects.BitmapText | null = null;
  private pauseMoveTexts: Phaser.GameObjects.BitmapText[] = [];
  private pauseOptions: PauseOptionButton[] = [];
  private touchPage = 0;
  private touchPageButtons: HudButton[] = [];
  private pauseDevices: [MoveListDevice | null, MoveListDevice | null] = [null, null];
  private selectedPauseAction: PauseMenuAction = 'continue';
  private pauseButton: HudButton | null = null;
  private trainingButtons: HudButton[] = [];
  private previousBanner = '';
  private wasPaused = false;
  private online = false;
  private localSlot: PlayerSlot | null = null;
  private onlineText: Phaser.GameObjects.BitmapText | null = null;

  constructor() {
    super({ key: 'UIScene' });
  }

  create(data: UISceneData): void {
    this.resetReferences();
    this.world = data.world;
    this.online = data.online ?? false;
    this.localSlot = data.localSlot ?? null;
    const snapshot = data.world.snapshot();

    this.createHudFrame();
    if (this.online) {
      this.onlineText = pixelText(this, INTERNAL_WIDTH / 2, 50, '', {
        size: 8,
        maxWidth: 380,
        maxHeight: 12,
        color: '#9af7ff',
        align: 'center',
        layoutName: 'online-hud-status',
      }).setDepth(10);
    }
    this.createFighterHud(0, snapshot.fighters[0].id);
    this.createFighterHud(1, snapshot.fighters[1].id);
    this.createAnnouncements();
    this.createButtons(snapshot);
    this.game.events.on('fight:pause-selection', this.handlePauseSelection, this);
    this.render(snapshot);

    if (import.meta.env.DEV) {
      const debugGlobal = globalThis as typeof globalThis & {
        __RUA_PAUSE_LIST_DEBUG__?: () => { devices: readonly (string | null)[]; lines: readonly string[] };
      };
      debugGlobal.__RUA_PAUSE_LIST_DEBUG__ = () => ({
        devices: [...this.pauseDevices],
        lines: this.pauseMoveTexts.map((text) => text.text),
      });
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('fight:pause-selection', this.handlePauseSelection, this);
      if (import.meta.env.DEV) {
        delete (globalThis as typeof globalThis & { __RUA_PAUSE_LIST_DEBUG__?: unknown })
          .__RUA_PAUSE_LIST_DEBUG__;
      }
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
    this.pauseOptions = [];
    this.touchPage = 0;
    this.touchPageButtons = [];
    this.pauseDevices = [null, null];
    this.selectedPauseAction = 'continue';
    this.wasPaused = false;
    this.infoText = null;
    this.infoPanel = null;
    this.previousBanner = '';
    this.online = false;
    this.localSlot = null;
    this.onlineText = null;
  }

  // 44px: 31% menos altura, sem deslocar os pés ou a simulação.
  private createHudFrame(): void {
    this.add.rectangle(320, 22, 640, 44, PALETTE.ink, 0.72).setDepth(4).setName('fight-hud-compact');
    this.add.rectangle(320, 43, 624, 1, PALETTE.steelDark, 0.5).setDepth(5);
    this.add.rectangle(320, 19, 40, 28, PALETTE.ink, 0.85).setStrokeStyle(1, PALETTE.steel).setDepth(6);
    this.timerText = pixelText(this, 320, 19, '99', {
      size: 24, minSize: 20, maxWidth: 36, maxHeight: 26,
      align: 'center', layoutName: 'fight-timer', color: PALETTE.gold,
    }).setDepth(9);
  }

  private createFighterHud(index: 0 | 1, fighterId: CombatWorldSnapshot['fighters'][number]['id']): void {
    const fighter = getFighterDefinition(fighterId);
    const playerOne = index === 0, direction = playerOne ? 1 : -1;
    const portraitX = playerOne ? 21 : 619, barStart = playerOne ? 42 : 598;
    const tint = playerOne ? PALETTE.cyan : PALETTE.pink;
    createConceptPortrait(this, portraitX, 20, fighterId, 28, 30, { crop: 'hud', frameColor: tint }).setDepth(8);
    pixelText(this, barStart, 9, fighter.name.toUpperCase(), {
      size: 12, minSize: 10, maxWidth: 224, maxHeight: 13, maxLines: 1,
      align: playerOne ? 'left' : 'right', layoutName: 'fight-name-' + index,
      color: PALETTE.ivory,
    }).setDepth(9);
    this.add.rectangle(barStart + direction * 90, 21, 180, 7, PALETTE.navy)
      .setStrokeStyle(1, PALETTE.steel).setDepth(6);
    for (let cell = 0; cell < HEALTH_SEGMENTS; cell++) {
      const bar = this.add.rectangle(barStart + direction * (1 + cell * 18), 21, 17, 5, tint)
        .setOrigin(playerOne ? 0 : 1, 0.5).setDepth(8);
      this.healthSegments[index].push(bar);
    }
    this.add.rectangle(barStart + direction * 90, 31, 180, 4, PALETTE.ink)
      .setStrokeStyle(1, PALETTE.steelDark).setDepth(6);
    for (let cell = 0; cell < METER_SEGMENTS; cell++) {
      this.meterSegments[index].push(this.add.rectangle(barStart + direction * (9 + cell * 18), 31, 16, 2, PALETTE.gold).setDepth(8));
    }
    for (let round = 0; round < 2; round++) {
      this.roundMarkers[index].push(this.add.rectangle(320 + (playerOne ? -1 : 1) * (13 + round * 10), 39, 4, 4, PALETTE.navy)
        .setStrokeStyle(1, tint).setDepth(9));
    }
  }

  private createAnnouncements(): void {
    this.bannerBackground = tagLayoutPanel(
      this.add.rectangle(INTERNAL_WIDTH / 2, 156, 348, 58, PALETTE.black, 0.9)
        .setStrokeStyle(1, PALETTE.cyan)
        .setVisible(false)
        .setDepth(30),
      'fight-banner',
      { x: 12, y: 5 },
    );
    this.bannerText = pixelText(this, INTERNAL_WIDTH / 2, 156, '', {
      size: 48,
      minSize: 16,
      maxWidth: 324,
      maxHeight: 48,
      maxLines: 1,
      align: 'center',
      layoutName: 'fight-banner-text',
      panelName: 'fight-banner',
      padding: { x: 12, y: 5 },
    })
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
    this.pausePanel = tagLayoutPanel(
      this.add.rectangle(INTERNAL_WIDTH / 2, 200, 608, 280, PALETTE.panel, 1)
        .setStrokeStyle(1, PALETTE.cyan)
        .setVisible(false)
        .setDepth(91),
      'pause-panel',
      { x: 12, y: 8 },
    );
    this.pauseTitle = pixelText(this, INTERNAL_WIDTH / 2, 72, 'PAUSA', {
      size: 24,
      maxWidth: 240,
      maxHeight: 30,
      align: 'center',
      layoutName: 'pause-title',
      panelName: 'pause-panel',
    })
      .setTint(PALETTE.gold)
      .setVisible(false)
      .setDepth(92);
    this.pauseHint = pixelText(
      this,
      INTERNAL_WIDTH / 2,
      328,
      pauseHintText(InputManager.isTouchCapable()),
      {
        size: 8,
        maxWidth: 580,
        maxHeight: 14,
        align: 'center',
        layoutName: 'pause-hint',
        panelName: 'pause-panel',
      },
    ).setTint(PALETTE.ivory).setVisible(false).setDepth(92);
    this.createPauseMoveList();
    this.createPauseMenu();
  }

  /** Dispositivos com comandos apresentáveis para o jogador, na ordem de
   * preferência: touch (P1 em telas touch), gamepad atribuído e teclado. */
  private availablePauseDevices(player: 0 | 1): MoveListDevice[] {
    const devices: MoveListDevice[] = [];
    if (player === 0 && InputManager.shouldShowTouch(settingsStore.get())) devices.push('touch');
    if (gamepadManager.assignedPad(player)) devices.push('gamepad');
    devices.push('keyboard');
    return devices;
  }

  private pauseDeviceFor(player: 0 | 1): MoveListDevice {
    const available = this.availablePauseDevices(player);
    const current = this.pauseDevices[player];
    if (current && available.includes(current)) return current;
    const fallback = available[0] ?? 'keyboard';
    this.pauseDevices[player] = fallback;
    return fallback;
  }

  private cyclePauseDevice(player: 0 | 1): void {
    const available = this.availablePauseDevices(player);
    if (available.length < 2) return;
    const current = this.pauseDeviceFor(player);
    const nextIndex = (available.indexOf(current) + 1) % available.length;
    this.pauseDevices[player] = available[nextIndex] ?? 'keyboard';
    audioManager.play('confirm');
    this.rebuildPauseMoveList(true);
  }

  private rebuildPauseMoveList(visible: boolean): void {
    for (const text of this.pauseMoveTexts) text.destroy();
    this.pauseMoveTexts = [];
    for (const button of this.touchPageButtons) button.container.destroy();
    this.touchPageButtons = [];
    this.createPauseMoveList();
    for (const button of this.touchPageButtons) button.container.setVisible(visible);
    for (const text of this.pauseMoveTexts) text.setVisible(visible);
  }

  private createPauseMoveList(): void {
    if (!this.world) return;
    if (this.pauseDeviceFor(0) === 'touch') {
      this.createTouchMoveList();
      return;
    }
    const legend = pixelText(this, INTERNAL_WIDTH / 2, 94, 'FRENTE = EM DIRECAO AO ADVERSARIO', {
      size: 8,
      maxWidth: 560,
      maxHeight: 14,
      align: 'center',
      layoutName: 'pause-legend',
      panelName: 'pause-panel',
    }).setTint(PALETTE.cyanLight).setVisible(false).setDepth(92);
    legend.setOrigin(0.5, 0).setCenterAlign();
    this.pauseMoveTexts.push(legend);

    const touchLayout = this.pauseDeviceFor(0) === 'touch';
    const playersToRender: readonly (0 | 1)[] = touchLayout ? [0] : [0, 1];

    for (const index of playersToRender) {
      const definition = this.world.fighters[index].definition;
      const device = this.pauseDeviceFor(index);
      const model = buildPauseMoveList(definition, index, device, {
        gamepadFamily: gamepadManager.assignedPad(index)?.family ?? 'generic',
      });
      const playerTint = index === 0 ? PALETTE.cyan : PALETTE.pink;

      const xPos = touchLayout ? 170 : (index === 0 ? 24 : 328);

      model.lines.forEach((line, lineIndex) => {
        const text = pixelText(this, xPos, 104 + lineIndex * 9, line.text, {
          size: 8,
          maxWidth: touchLayout ? 440 : 288,
          maxHeight: 9,
          maxLines: 1,
          layoutName: `pause-moves-${index}-${lineIndex}`,
          panelName: 'pause-panel',
        })
          .setTint(this.pauseLineTint(line.tone, playerTint))
          .setVisible(false)
          .setDepth(92);
        text.setOrigin(0, 0);
        if (line.tone === 'player' && this.availablePauseDevices(index).length > 1) {
          // Toque/clique na linha do jogador alterna o dispositivo exibido.
          text.setInteractive({ useHandCursor: true });
          text.on('pointerdown', () => this.cyclePauseDevice(index));
        }
        this.pauseMoveTexts.push(text);
      });
    }
  }

  private createTouchMoveList(): void {
    if (!this.world) return;
    const fighter = this.world.fighters[0].definition;
    const pages = buildTouchMovePages(fighter);
    const current = pages[this.touchPage] ?? pages[0]!;
    const title = pixelText(this, 320, 88, fighter.name.toUpperCase() + ' (TOUCH)', {
      size: 12, minSize: 12, maxWidth: 400, maxHeight: 16,
      align: 'center', layoutName: 'touch-moves-fighter', panelName: 'pause-panel',
    }).setTint(PALETTE.cyan).setDepth(92).setVisible(false);
    title.setInteractive({ useHandCursor: true });
    title.on('pointerdown', () => this.cyclePauseDevice(0));
    this.pauseMoveTexts.push(title);
    this.touchPageButtons = pages.map((page, index) => {
      const button = this.createButton(96 + index * 148, 118, 138, 28, page.title, () => {
        this.touchPage = index;
        this.rebuildPauseMoveList(true);
      });
      button.container.setDepth(96).setVisible(false);
      button.background.setStrokeStyle(2, index === this.touchPage ? PALETTE.gold : PALETTE.steelLight);
      return button;
    });
    current.lines.forEach((line, index) => {
      const text = pixelText(this, 40, 154 + index * 21, line, {
        size: 16, minSize: 14, maxWidth: 560, maxHeight: 20, maxLines: 1,
        layoutName: 'touch-moves-line-' + index, panelName: 'pause-panel',
      }).setOrigin(0, 0).setDepth(92).setVisible(false);
      text.setTint(this.touchPage === 3 && index % 2 === 0 ? PALETTE.gold : PALETTE.ivory);
      this.pauseMoveTexts.push(text);
    });
  }

  private createPauseMenu(): void {
    const layout: ReadonlyArray<readonly [PauseMenuAction, number, number]> = [
      ['continue', 84, 128],
      ['character-select', 320, 224],
      ['main-menu', 548, 160],
    ];
    this.pauseOptions = layout.map(([action, x, width]) => {
      const option = PAUSE_MENU_OPTIONS.find((candidate) => candidate.action === action)!;
      const button = this.createButton(x, 300, width, 28, option.label, () => {
        this.selectedPauseAction = action;
        this.refreshPauseOptions();
        this.game.events.emit('fight:pause-action', action);
      });
      const pauseButton: PauseOptionButton = { ...button, action };
      pauseButton.container.setVisible(false).setDepth(96);
      pauseButton.container.on('pointerdown', () => {
        this.selectedPauseAction = action;
        this.refreshPauseOptions();
      });
      return pauseButton;
    });
  }

  private pauseLineTint(tone: MoveListLineTone, playerTint: number): number {
    if (tone === 'section') return PALETTE.gold;
    if (tone === 'controls') return PALETTE.cyanLight;
    if (tone === 'note') return PALETTE.steelLight;
    return playerTint;
  }

  private createButtons(snapshot: CombatWorldSnapshot): void {
    this.pauseButton = this.createButton(608, 58, 40, 18, 'II', () => this.game.events.emit('fight:pause'));
    this.pauseButton.container.setDepth(100);
    if (this.world?.mode !== 'training') return;
    const controls: ReadonlyArray<readonly [number, string, string]> = [
      [372, 'RESET', 'training:reset'], [450, 'BOXES', 'training:debug'], [528, 'CPU', 'training:cpu'],
    ];
    this.trainingButtons = controls.map(([x, label, eventName]) => this.createButton(x, 58, 60, 18, label, () => this.game.events.emit(eventName)));
    this.infoPanel = tagLayoutPanel(this.add.rectangle(320, 344, 210, 18, PALETTE.ink, 0.78)
      .setStrokeStyle(1, PALETTE.steel).setDepth(79), 'training-readout', { x: 6, y: 2 });
    this.infoText = pixelText(this, 320, 344, '', {
      size: 10, minSize: 10, align: 'center', maxWidth: 196, maxHeight: 14, maxLines: 1,
      layoutName: 'training-info', panelName: 'training-readout', color: PALETTE.cyanLight,
    }).setDepth(80);
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
    const panelName = `hud-button-${text.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}-${x}-${y}`;
    const background = tagLayoutPanel(
      this.add.rectangle(0, 0, width, height, PALETTE.ink, 0.78)
        .setStrokeStyle(1, PALETTE.steel),
      panelName,
      { x: 6, y: 3 },
    );
    const label = pixelText(this, 0, 0, text, {
      size: 16,
      minSize: 8,
      maxWidth: Math.max(8, width - 12),
      maxHeight: Math.max(8, height - 6),
      maxLines: 1,
      align: 'center',
      layoutName: `${panelName}-label`,
      panelName,
      padding: { x: 6, y: 3 },
    }).setTint(PALETTE.ivory);
    const container = this.add.container(x, y, [background, label]);
    container.setName('hud-control:' + text);
    container.setSize(width + 12, Math.max(height + 16, 44)).setInteractive({ useHandCursor: true });
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
        segment.setScale(clamp01(health * HEALTH_SEGMENTS - cell), 1);
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
    if (this.onlineText) {
      this.onlineText.setText(
        `ONLINE  ${this.localSlot?.toUpperCase() ?? '--'}  PING ${onlineSession.snapshot.latencyMs ?? '--'} MS`,
      );
    }
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
    this.bannerText.setAlpha(0.45);
    this.time.delayedCall(70, () => this.bannerText?.setAlpha(1));
  }

  private updatePause(paused: boolean): void {
    if (paused && !this.wasPaused) {
      // Reconstrói ao abrir para refletir bindings e dispositivos atuais.
      this.rebuildPauseMoveList(false);
    }
    this.wasPaused = paused;
    this.pauseShade?.setVisible(paused);
    this.pausePanel?.setVisible(paused);
    this.pauseTitle?.setVisible(paused);
    this.pauseHint?.setVisible(paused);
    for (const text of this.pauseMoveTexts) text.setVisible(paused);
    for (const option of this.pauseOptions) option.container.setVisible(paused);
    for (const button of this.touchPageButtons) button.container.setVisible(paused);
    for (const button of this.trainingButtons) button.container.setVisible(!paused);
    this.infoText?.setVisible(!paused);
    this.infoPanel?.setVisible(!paused);
    if (paused) this.refreshPauseOptions();
    this.pauseButton?.label.setText(paused ? '>' : 'II');
  }

  private readonly handlePauseSelection = (action: PauseMenuAction): void => {
    this.selectedPauseAction = action;
    this.refreshPauseOptions();
  };

  private refreshPauseOptions(): void {
    for (const option of this.pauseOptions) {
      const selected = option.action === this.selectedPauseAction;
      option.background
        .setFillStyle(selected ? PALETTE.panelLight : PALETTE.metalDark, 0.98)
        .setStrokeStyle(selected ? 2 : 1, selected ? PALETTE.gold : PALETTE.steelLight);
      option.label.setTint(selected ? PALETTE.gold : PALETTE.ivory);
    }
  }

  private updateTrainingLabels(snapshot: CombatWorldSnapshot): void {
    if (!this.infoText || this.trainingButtons.length === 0) return;
    this.infoText.setText('DANO ' + snapshot.lastDamage + ' | COMBO ' + Math.max(...snapshot.combo));
    this.infoText.setTint(snapshot.lastDamage > 0 ? PALETTE.gold : PALETTE.cyanLight);

    const boxes = this.trainingButtons[1];
    const cpu = this.trainingButtons[2];
    boxes?.label.setText(snapshot.debugBoxes ? 'BOX:ON' : 'BOXES');
    boxes?.background.setStrokeStyle(1, snapshot.debugBoxes ? PALETTE.gold : PALETTE.steelLight);
    cpu?.label.setText(snapshot.trainingCpuEnabled ? 'CPU:ON' : 'CPU:OFF');
    cpu?.background.setStrokeStyle(1, snapshot.trainingCpuEnabled ? PALETTE.gold : PALETTE.steelLight);
  }
}
