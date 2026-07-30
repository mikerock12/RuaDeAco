import Phaser from 'phaser';
import { audioManager } from '../audio/AudioManager';
import { MUSIC_TRACK_BY_SCENE } from '../audio/musicCatalog';
import { gameSession } from '../config/session';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, PALETTE } from '../config/pixelArtConfig';
import { AVAILABLE_FIGHTERS, getFighterDefinition } from '../fighters';
import { inputManager } from '../input/InputManager';
import { onlineSession, type OnlineSnapshot } from '../online/OnlineSession';
import type { FighterId } from '../types/combat';
import { createConceptPortrait } from '../ui/PortraitView';
import { pixelText, tagLayoutPanel } from '../utils/text';

type OnlineView = 'home' | 'join' | 'lobby';
type HomeAction = 'create' | 'join' | 'back';

interface Button {
  readonly container: Phaser.GameObjects.Container;
  readonly background: Phaser.GameObjects.Rectangle;
}

const HOME_ACTIONS: readonly HomeAction[] = ['create', 'join', 'back'];
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function formatRoomCode(code: string | null): string {
  if (!code) return '----- -----';
  return `${code.slice(0, 5)} ${code.slice(5)}`;
}

export class OnlineScene extends Phaser.Scene {
  private dynamic!: Phaser.GameObjects.Container;
  private view: OnlineView = 'home';
  private selectedHome = 0;
  private fighterCursor = 0;
  private joinCode = '';
  private busy = false;
  private transitioning = false;
  private unsubscribe: (() => void) | null = null;
  private latest: OnlineSnapshot = onlineSession.snapshot;
  private binaryRows: Phaser.GameObjects.BitmapText[] = [];
  private lastBackdropTick = -1;
  private reducedMotion = false;
  private liveRegion: HTMLDivElement | null = null;

  constructor() {
    super('OnlineScene');
  }

  create(): void {
    void audioManager.playMusic(MUSIC_TRACK_BY_SCENE.OnlineScene);
    this.view = onlineSession.snapshot.roomCode ? 'lobby' : 'home';
    this.selectedHome = 0;
    this.fighterCursor = 0;
    this.joinCode = '';
    this.busy = false;
    this.transitioning = false;
    this.lastBackdropTick = -1;
    this.reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    inputManager.clear();
    this.createLiveRegion();
    this.drawBackdrop();
    this.dynamic = this.add.container(0, 0);
    this.input.keyboard?.on('keydown', this.handleRawKey);
    globalThis.window?.addEventListener('paste', this.handlePaste);
    this.unsubscribe = onlineSession.subscribe((snapshot) => {
      this.latest = snapshot;
      if (this.liveRegion) this.liveRegion.textContent = snapshot.message;
      if (snapshot.roomCode && this.view !== 'lobby') {
        this.view = 'lobby';
        inputManager.clear();
      }
      this.render();
      if (snapshot.start && !this.transitioning) this.beginFight(snapshot);
    });

    if (import.meta.env.DEV) {
      const debugGlobal = globalThis as typeof globalThis & {
        __RUA_ONLINE_DEBUG__?: () => {
          status: string;
          roomCode: string | null;
          slot: string | null;
          phase: string | null;
          players: readonly {
            slot: string;
            connected: boolean;
            ready: boolean;
            fighterId: string | null;
          }[];
          inputDelay: number | null;
          reconnectCount: number;
        };
      };
      debugGlobal.__RUA_ONLINE_DEBUG__ = () => ({
        status: this.latest.status,
        roomCode: this.latest.roomCode,
        slot: this.latest.slot,
        phase: this.latest.room?.phase ?? null,
        players: this.latest.room?.players.map((player) => ({
          slot: player.slot,
          connected: player.connected,
          ready: player.ready,
          fighterId: player.fighterId,
        })) ?? [],
        inputDelay: this.latest.start?.inputDelay ?? null,
        reconnectCount: this.latest.reconnectCount,
      });
      (debugGlobal as typeof debugGlobal & {
        __RUA_ONLINE_TRANSPORT_DEBUG__?: () => boolean;
      }).__RUA_ONLINE_TRANSPORT_DEBUG__ = () => onlineSession.debugDropTransport();
      (debugGlobal as typeof debugGlobal & {
        __RUA_ONLINE_VISUAL_DEBUG__?: () => {
          scene: 'OnlineScene';
          jupiter: { x: number; y: number; radius: number };
          roadWidths: readonly number[];
          binaryPoolSize: number;
          dynamicObjects: number;
        };
      }).__RUA_ONLINE_VISUAL_DEBUG__ = () => ({
        scene: 'OnlineScene',
        jupiter: { x: 520, y: 72, radius: 42 },
        roadWidths: [22, 86, 176, 286, 460],
        binaryPoolSize: this.binaryRows.length,
        dynamicObjects: this.dynamic.length,
      });
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.handleRawKey);
      globalThis.window?.removeEventListener('paste', this.handlePaste);
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.binaryRows = [];
      this.liveRegion?.remove();
      this.liveRegion = null;
      if (import.meta.env.DEV) {
        delete (globalThis as typeof globalThis & { __RUA_ONLINE_DEBUG__?: unknown })
          .__RUA_ONLINE_DEBUG__;
        delete (globalThis as typeof globalThis & { __RUA_ONLINE_TRANSPORT_DEBUG__?: unknown })
          .__RUA_ONLINE_TRANSPORT_DEBUG__;
        delete (globalThis as typeof globalThis & { __RUA_ONLINE_VISUAL_DEBUG__?: unknown })
          .__RUA_ONLINE_VISUAL_DEBUG__;
      }
    });

    if (this.latest.available && !this.latest.roomCode) {
      this.busy = true;
      this.render();
      void onlineSession.checkHealth().then((healthy) => {
        onlineSession.reportHealth(healthy);
      }).finally(() => {
        this.busy = false;
        this.render();
      });
    }
  }

  update(): void {
    this.animateBackdrop();
    if (this.busy || this.transitioning || this.view === 'join') return;
    const frame = inputManager.sample(0);
    if (this.view === 'home') {
      if (frame.pressed.has('up')) this.moveHome(-1);
      if (frame.pressed.has('down')) this.moveHome(1);
      if (frame.pressed.has('confirm') || frame.pressed.has('light')) {
        this.activateHome(HOME_ACTIONS[this.selectedHome] ?? 'back');
      }
      if (frame.pressed.has('cancel')) this.scene.start('MainMenuScene');
      return;
    }

    const horizontal = Number(frame.pressed.has('right')) - Number(frame.pressed.has('left'));
    const vertical = Number(frame.pressed.has('down')) - Number(frame.pressed.has('up'));
    if (horizontal !== 0 || vertical !== 0) this.moveFighter(horizontal, vertical);
    if (frame.pressed.has('confirm') || frame.pressed.has('light')) this.confirmLobby();
    if (frame.pressed.has('cancel')) this.leaveLobby();
  }

  private drawBackdrop(): void {
    this.cameras.main.setBackgroundColor(0x02050d);
    const graphics = this.add.graphics();
    graphics.fillGradientStyle(0x040a1a, 0x07172c, 0x01030a, 0x020610, 1);
    graphics.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

    let starSeed = 0x51a7c0de;
    for (let index = 0; index < 46; index += 1) {
      starSeed = Math.imul(starSeed ^ (starSeed >>> 15), 2246822519) >>> 0;
      const x = starSeed % INTERNAL_WIDTH;
      starSeed = Math.imul(starSeed ^ (starSeed >>> 13), 3266489917) >>> 0;
      const y = 58 + starSeed % 86;
      graphics.fillStyle(index % 7 === 0 ? 0xffe6a0 : 0x658aa8, index % 5 === 0 ? 0.9 : 0.55);
      graphics.fillRect(x, y, index % 9 === 0 ? 2 : 1, 1);
    }

    graphics.fillStyle(PALETTE.cyan, 0.1);
    graphics.fillCircle(520, 72, 47);
    graphics.fillStyle(0xb98c64, 1);
    graphics.fillCircle(520, 72, 42);
    graphics.fillStyle(0x5c3847, 0.75);
    for (let stripe = -30; stripe <= 30; stripe += 10) {
      const half = Math.sqrt(Math.max(0, 42 * 42 - stripe * stripe));
      graphics.fillRect(520 - half, 72 + stripe, half * 2, 4);
    }
    graphics.fillStyle(0xa94743, 0.95);
    graphics.fillEllipse(532, 82, 15, 8);
    graphics.lineStyle(2, PALETTE.gold, 0.7);
    graphics.strokeCircle(520, 72, 44);

    graphics.fillStyle(0x07111f, 1);
    graphics.fillTriangle(90, INTERNAL_HEIGHT, 320, 88, 550, INTERNAL_HEIGHT);
    graphics.lineStyle(2, PALETTE.cyan, 0.65);
    graphics.lineBetween(90, INTERNAL_HEIGHT, 320, 88);
    graphics.lineBetween(550, INTERNAL_HEIGHT, 320, 88);
    for (let y = 106; y < INTERNAL_HEIGHT; y += 26) {
      const width = (y - 88) * 0.85;
      graphics.lineBetween(320 - width, y, 320 + width, y);
    }
    graphics.lineStyle(1, PALETTE.pink, 0.45);
    graphics.lineBetween(320, 112, 320, INTERNAL_HEIGHT);

    this.binaryRows = Array.from({ length: 10 }, (_, index) => pixelText(
      this,
      index % 2 === 0 ? 10 : 500,
      104 + (index % 5) * 48,
      index % 2 === 0 ? '01001101 10110010' : '11010010 00101101',
      {
        size: 8,
        maxWidth: 160,
        maxHeight: 12,
        color: index % 2 === 0 ? '#28758f' : '#754765',
      },
    ).setAlpha(0.5));

    tagLayoutPanel(
      this.add.rectangle(230, 34, 430, 48, PALETTE.black, 0.82)
        .setStrokeStyle(2, PALETTE.cyan),
      'online-header',
      { x: 12, y: 5 },
    );
    pixelText(this, 230, 26, 'RUA DE ACO // ONLINE', {
      size: 24,
      minSize: 16,
      maxWidth: 420,
      maxHeight: 30,
      color: '#ffd55c',
      align: 'center',
      layoutName: 'online-title',
      panelName: 'online-header',
    });
    pixelText(this, 230, 50, 'SINAL ORBITAL • BETA LOCAL', {
      size: 8,
      maxWidth: 400,
      maxHeight: 12,
      color: '#9af7ff',
      align: 'center',
    });
  }

  private animateBackdrop(): void {
    if (globalThis.document?.hidden || this.reducedMotion) return;
    const tick = Math.floor(this.time.now / 220);
    if (tick === this.lastBackdropTick) return;
    this.lastBackdropTick = tick;
    this.binaryRows.forEach((row, index) => {
      row.setAlpha(0.24 + ((tick + index) % 4) * 0.12);
      row.x += index % 2 === 0 ? 1 : -1;
      if (row.x > 170) row.x = 10;
      if (row.x < 450) row.x = 600;
    });
  }

  private render(): void {
    if (!this.dynamic) return;
    this.dynamic.removeAll(true);
    if (this.view === 'home') this.renderHome();
    else if (this.view === 'join') this.renderJoin();
    else this.renderLobby();
  }

  private renderHome(): void {
    const statusColor = this.latest.status === 'error' || !this.latest.available
      ? '#ff6f88'
      : '#aebbd0';
    const statusMessage = this.busy && !this.latest.roomCode
      ? 'VERIFICANDO SERVIDOR'
      : this.latest.message.toUpperCase();
    this.dynamic.add(pixelText(this, INTERNAL_WIDTH / 2, 92, statusMessage, {
      size: 8,
      minSize: 8,
      maxWidth: 540,
      maxHeight: 26,
      maxLines: 2,
      color: statusColor,
      align: 'center',
      layoutName: 'online-status',
    }).setOrigin(0.5, 0.5));

    const labels = ['CRIAR SALA', 'ENTRAR COM CODIGO', 'VOLTAR'];
    labels.forEach((label, index) => {
      const selected = index === this.selectedHome;
      const button = this.createButton(
        INTERNAL_WIDTH / 2,
        154 + index * 54,
        330,
        38,
        label,
        () => this.activateHome(HOME_ACTIONS[index] ?? 'back'),
      );
      button.background
        .setFillStyle(selected ? PALETTE.panelLight : PALETTE.panel, 0.96)
        .setStrokeStyle(selected ? 4 : 2, selected ? PALETTE.gold : PALETTE.steelLight);
      this.dynamic.add(button.container);
    });
    this.dynamic.add(pixelText(this, INTERNAL_WIDTH / 2, 328, 'W/S ESCOLHE • ENTER CONFIRMA', {
      size: 8,
      maxWidth: 420,
      maxHeight: 14,
      color: '#9af7ff',
      align: 'center',
    }));
  }

  private renderJoin(): void {
    const panel = tagLayoutPanel(
      this.add.rectangle(INTERNAL_WIDTH / 2, 205, 600, 270, PALETTE.panel, 0.98)
        .setStrokeStyle(4, PALETTE.cyan),
      'online-join-panel',
      { x: 18, y: 12 },
    );
    const title = pixelText(this, INTERNAL_WIDTH / 2, 82, 'DIGITE O CODIGO DA SALA', {
      size: 16,
      maxWidth: 440,
      maxHeight: 22,
      color: '#ffd55c',
      align: 'center',
    });
    const code = pixelText(this, INTERNAL_WIDTH / 2, 108, formatRoomCode(this.joinCode.padEnd(10, '-')), {
      size: 24,
      minSize: 16,
      maxWidth: 440,
      maxHeight: 42,
      color: '#9af7ff',
      align: 'center',
      layoutName: 'online-room-input',
    });
    const status = pixelText(this, INTERNAL_WIDTH / 2, 132, this.latest.message.toUpperCase(), {
      size: 8,
      maxWidth: 440,
      maxHeight: 24,
      maxLines: 2,
      color: this.latest.status === 'error' ? '#ff6f88' : '#aebbd0',
      align: 'center',
    });
    const keys: Phaser.GameObjects.Container[] = [];
    [...ROOM_ALPHABET].forEach((character, index) => {
      const column = index % 8;
      const row = Math.floor(index / 8);
      const key = this.createButton(
        82 + column * 68,
        166 + row * 36,
        62,
        34,
        character,
        () => this.appendCode(character),
      );
      keys.push(key.container);
    });
    const erase = this.createButton(92, 318, 130, 34, 'APAGAR', () => {
      this.joinCode = this.joinCode.slice(0, -1);
      this.render();
    });
    const join = this.createButton(320, 318, 220, 34, 'CONECTAR', () => void this.connectJoin());
    const back = this.createButton(548, 318, 130, 34, 'VOLTAR', () => {
      this.view = 'home';
      onlineSession.dismissError();
      this.render();
    });
    this.dynamic.add([
      panel,
      title,
      code,
      status,
      ...keys,
      erase.container,
      join.container,
      back.container,
    ]);
  }

  private renderLobby(): void {
    const room = this.latest.room;
    const local = room?.players.find((player) => player.slot === this.latest.slot);
    const peer = room?.players.find((player) => player.slot !== this.latest.slot);
    const roomCode = pixelText(this, INTERNAL_WIDTH / 2, 79, `SALA ${formatRoomCode(this.latest.roomCode)}`, {
      size: 16,
      minSize: 8,
      maxWidth: 420,
      maxHeight: 22,
      color: '#ffd55c',
      align: 'center',
      layoutName: 'online-room-code',
    });
    const status = pixelText(this, INTERNAL_WIDTH / 2, 99, this.latest.message.toUpperCase(), {
      size: 8,
      maxWidth: 520,
      maxHeight: 18,
      color: this.latest.status === 'error' ? '#ff6f88' : '#9af7ff',
      align: 'center',
    });
    this.dynamic.add([roomCode, status]);

    AVAILABLE_FIGHTERS.forEach((fighter, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = 86 + column * 234;
      const y = 140 + row * 84;
      const selected = index === this.fighterCursor;
      const chosen = local?.fighterId === fighter.id;
      const frame = this.add.rectangle(x, y, 132, 76, PALETTE.panel, 0.98)
        .setStrokeStyle(selected ? 4 : 2, chosen ? PALETTE.gold : selected ? PALETTE.cyan : PALETTE.steel)
        .setInteractive({ useHandCursor: true });
      const portrait = createConceptPortrait(this, x, y - 10, fighter.id, 112, 46, {
        crop: 'card',
        frameColor: fighter.visual.accent,
      });
      const name = pixelText(this, x, y + 27, fighter.name.toUpperCase(), {
        size: 8,
        maxWidth: 120,
        maxHeight: 10,
        maxLines: 1,
        color: chosen ? '#ffd55c' : '#f7f2d0',
        align: 'center',
      });
      frame.on('pointerdown', () => {
        this.fighterCursor = index;
        this.chooseFighter(fighter.id);
      });
      this.dynamic.add([frame, portrait, name]);
    });

    const localLabel = local?.ready ? 'VOCE: PRONTO' : local?.fighterId ? 'VOCE: SELECIONADO' : 'VOCE: ESCOLHENDO';
    const peerName = peer?.fighterId ? getFighterDefinition(peer.fighterId).name.toUpperCase() : 'AGUARDANDO';
    const peerLabel = peer?.ready ? `RIVAL: ${peerName} • PRONTO` : `RIVAL: ${peerName}`;
    const localStatus = pixelText(this, 18, 270, localLabel, {
      size: 8,
      maxWidth: 292,
      maxHeight: 16,
      color: local?.ready ? '#ffd55c' : '#9af7ff',
    }).setOrigin(0, 0.5);
    const peerStatus = pixelText(this, INTERNAL_WIDTH - 18, 270, peerLabel, {
      size: 8,
      maxWidth: 292,
      maxHeight: 16,
      color: peer?.ready ? '#ffd55c' : '#ff91b2',
      align: 'right',
    }).setOrigin(1, 0.5);
    this.dynamic.add([localStatus, peerStatus]);

    const readyLabel = local?.ready ? 'CANCELAR PRONTO' : local?.fighterId ? 'FICAR PRONTO' : 'ESCOLHER LUTADOR';
    const readyButton = this.createButton(INTERNAL_WIDTH / 2, 297, 260, 32, readyLabel, () => this.confirmLobby());
    const leaveButton = this.createButton(62, 329, 100, 26, 'SAIR', () => this.leaveLobby());
    const copyButton = this.createButton(190, 329, 142, 26, 'COPIAR CODIGO', () => void this.copyRoomCode());
    this.dynamic.add([readyButton.container, leaveButton.container, copyButton.container]);
    const ping = pixelText(this, INTERNAL_WIDTH - 12, 342, `PING ${this.latest.latencyMs ?? '--'} MS • ${this.latest.slot?.toUpperCase() ?? '--'}`, {
      size: 8,
      maxWidth: 260,
      maxHeight: 14,
      color: '#8796ae',
      align: 'right',
    }).setOrigin(1, 0.5);
    this.dynamic.add(ping);
  }

  private createButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    action: () => void,
  ): Button {
    const background = this.add.rectangle(0, 0, width, height, PALETTE.panel, 0.98)
      .setStrokeStyle(2, PALETTE.steelLight);
    const text = pixelText(this, 0, 0, label, {
      size: 16,
      minSize: 8,
      maxWidth: width - 20,
      maxHeight: height - 8,
      color: '#f7f2d0',
      align: 'center',
    });
    const container = this.add.container(x, y, [background, text])
      .setSize(width, height)
      .setInteractive({ useHandCursor: true });
    container.on('pointerover', () => background.setStrokeStyle(4, PALETTE.gold));
    container.on('pointerout', () => background.setStrokeStyle(2, PALETTE.steelLight));
    container.on('pointerdown', () => {
      audioManager.unlock();
      audioManager.play('confirm');
      action();
    });
    return { container, background };
  }

  private moveHome(direction: -1 | 1): void {
    this.selectedHome = (this.selectedHome + direction + HOME_ACTIONS.length) % HOME_ACTIONS.length;
    audioManager.play('confirm');
    this.render();
  }

  private activateHome(action: HomeAction): void {
    if (this.busy) return;
    if (action === 'back') {
      this.scene.start('MainMenuScene');
      return;
    }
    if (!this.latest.available) return;
    if (action === 'join') {
      this.view = 'join';
      onlineSession.dismissError();
      this.render();
      return;
    }
    this.busy = true;
    this.render();
    void onlineSession.createRoom().finally(() => {
      this.busy = false;
      this.render();
    });
  }

  private handleRawKey = (event: KeyboardEvent): void => {
    if (this.view !== 'join' || this.busy || event.repeat) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.view = 'home';
      onlineSession.dismissError();
      this.render();
      return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      this.joinCode = this.joinCode.slice(0, -1);
      this.render();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void this.connectJoin();
      return;
    }
    const next = event.key.toUpperCase();
    if (/^[A-HJ-NP-Z2-9]$/u.test(next) && this.joinCode.length < 10) {
      event.preventDefault();
      this.appendCode(next);
    }
  };

  private readonly handlePaste = (event: ClipboardEvent): void => {
    if (this.view !== 'join' || this.busy) return;
    const pasted = event.clipboardData?.getData('text') ?? '';
    const normalized = pasted.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/gu, '').slice(0, 10);
    if (!normalized) return;
    event.preventDefault();
    this.joinCode = normalized;
    this.render();
  };

  private appendCode(character: string): void {
    if (this.joinCode.length >= 10 || !ROOM_ALPHABET.includes(character)) return;
    this.joinCode += character;
    this.render();
  }

  private async copyRoomCode(): Promise<void> {
    const roomCode = this.latest.roomCode;
    if (!roomCode) return;
    try {
      await globalThis.navigator?.clipboard?.writeText(roomCode);
      if (this.liveRegion) this.liveRegion.textContent = 'Código copiado.';
    } catch {
      if (this.liveRegion) this.liveRegion.textContent = 'Não foi possível copiar; o código continua visível.';
    }
  }

  private async connectJoin(): Promise<void> {
    if (this.joinCode.length !== 10 || this.busy) return;
    this.busy = true;
    this.render();
    await onlineSession.joinRoom(this.joinCode);
    this.busy = false;
    this.render();
  }

  private moveFighter(horizontal: number, vertical: number): void {
    const columns = 3;
    const rows = 2;
    const column = (
      this.fighterCursor % columns + Math.sign(horizontal) + columns
    ) % columns;
    const row = (
      Math.floor(this.fighterCursor / columns) + Math.sign(vertical) + rows
    ) % rows;
    this.fighterCursor = row * columns + column;
    audioManager.play('confirm');
    this.render();
  }

  private chooseFighter(fighterId: FighterId): void {
    if (this.latest.status === 'error') onlineSession.dismissError();
    onlineSession.selectFighter(fighterId);
    audioManager.play('confirm');
  }

  private confirmLobby(): void {
    const room = this.latest.room;
    const local = room?.players.find((player) => player.slot === this.latest.slot);
    if (!local?.fighterId) {
      const fighter = AVAILABLE_FIGHTERS[this.fighterCursor];
      if (fighter) this.chooseFighter(fighter.id);
      return;
    }
    onlineSession.setReady(!local.ready);
    audioManager.play('confirm');
  }

  private leaveLobby(): void {
    onlineSession.leave();
    this.view = 'home';
    this.render();
  }

  private beginFight(snapshot: OnlineSnapshot): void {
    const start = snapshot.start;
    if (!start) return;
    const playerOne = start.players.find((player) => player.slot === 'p1');
    const playerTwo = start.players.find((player) => player.slot === 'p2');
    if (!playerOne || !playerTwo) return;
    this.transitioning = true;
    gameSession.setSelection({
      mode: 'online',
      playerOne: playerOne.fighterId,
      playerTwo: playerTwo.fighterId,
      arena: 'cais-da-cidade',
    });
    gameSession.result = null;
    gameSession.onlineResult = null;
    inputManager.clear();
    this.time.delayedCall(80, () => this.scene.start('FightScene'));
  }

  private createLiveRegion(): void {
    const region = globalThis.document?.createElement('div');
    if (!region) return;
    region.className = 'sr-only';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.textContent = 'Abrindo modo online.';
    globalThis.document.body.append(region);
    this.liveRegion = region;
  }
}
