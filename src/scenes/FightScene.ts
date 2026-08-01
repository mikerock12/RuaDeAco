import Phaser from 'phaser';
import { CpuController } from '../ai/CpuController';
import { audioManager } from '../audio/AudioManager';
import { MUSIC_TRACK_BY_SCENE } from '../audio/musicCatalog';
import { phaserAnimationKey } from '../assets/spriteSheetContract';
import { resolveProjectileVisualFrame } from '../ui/fighterAnimationResolver';
import { CombatWorld } from '../combat/CombatWorld';
import { FixedStepRunner } from '../combat/FixedStepRunner';
import { toWorldRect } from '../combat/geometry';
import { gameSession } from '../config/session';
import { settingsStore } from '../config/settings';
import {
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
  PALETTE,
  worldRectToScreen,
  worldToScreen,
} from '../config/pixelArtConfig';
import { getFighterDefinition } from '../fighters';
import { getFighterEffectAsset } from '../fighters/visual';
import { inputManager } from '../input/InputManager';
import { touchControls } from '../input/TouchControls';
import { LockstepController } from '../online/LockstepController';
import { onlineSession } from '../online/OnlineSession';
import type { PlayerSlot } from '../online/protocol';
import { deterministicHash } from '../online/stateHash';
import type { CombatEvent, InputAction, InputFrame } from '../types/combat';
import type { FighterEffectAsset } from '../types/assets';
import { CaisStageView } from '../ui/CaisStageView';
import { createFighterView, type FighterView } from '../ui/FighterSpriteView';
import { PauseMenuModel, type PauseMenuAction, type PauseNavigationTarget } from '../ui/pauseMenu';
import { pixelText } from '../utils/text';

const EMPTY_INPUT: InputFrame = {
  held: new Set(),
  pressed: new Set(),
  released: new Set(),
};

// Overlay de desenvolvimento (estado, entradas, velocidades). Sempre
// desligado por padrão; alterne com F9 durante a luta.
const DEBUG_OVERLAY_DEFAULT = false;

export class FightScene extends Phaser.Scene {
  private world!: CombatWorld;
  private readonly runner = new FixedStepRunner();
  private cpu: CpuController | null = null;
  private views: readonly [FighterView, FighterView] | null = null;
  private stageView!: CaisStageView;
  private projectileSprites: Phaser.GameObjects.Sprite[] = [];
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private debugOverlayEnabled = DEBUG_OVERLAY_DEFAULT;
  private debugOverlayText: Phaser.GameObjects.BitmapText | null = null;
  private resultScheduled = false;
  private orientationQuery: MediaQueryList | null = null;
  private readonly pauseMenu = new PauseMenuModel();
  private transitionLocked = false;
  private capturePaused = false;
  private onlineLockstep: LockstepController | null = null;
  private onlineSlot: PlayerSlot | null = null;
  private onlineClockStarted = false;
  private onlineLocalPaused = false;
  private onlinePauseChoice: 'continue' | 'leave' = 'continue';
  private onlineStatusText: Phaser.GameObjects.BitmapText | null = null;
  private onlineWaitText: Phaser.GameObjects.BitmapText | null = null;
  private onlinePauseLayer: Phaser.GameObjects.Container | null = null;
  private onlinePauseLabels: readonly Phaser.GameObjects.BitmapText[] = [];

  constructor() {
    super('FightScene');
  }

  create(): void {
    void audioManager.playMusic(MUSIC_TRACK_BY_SCENE.FightScene);
    this.destroyFightSprites();
    this.resultScheduled = false;
    this.transitionLocked = false;
    this.capturePaused = false;
    this.onlineLockstep?.dispose();
    this.onlineLockstep = null;
    this.onlineSlot = null;
    this.onlineClockStarted = false;
    this.onlineLocalPaused = false;
    this.onlinePauseChoice = 'continue';
    this.pauseMenu.reset();
    this.cpu = null;
    this.runner.reset();
    const selection = gameSession.selection;
    const playerOne = getFighterDefinition(selection.playerOne);
    const playerTwo = getFighterDefinition(selection.playerTwo);
    this.world = new CombatWorld(playerOne, playerTwo, selection.mode);
    if (selection.mode === 'online') {
      const start = onlineSession.snapshot.start;
      const slot = onlineSession.snapshot.slot;
      if (!start || !slot) {
        gameSession.onlineResult = {
          kind: 'interrupted',
          message: 'A sessão sincronizada não estava mais disponível.',
        };
        this.scene.start('ResultScene');
        return;
      }
      this.onlineSlot = slot;
      this.onlineLockstep = new LockstepController(slot, start.inputDelay);
      onlineSession.markFightEntered();
    }
    // Gancho de inspeção para testes instrumentados (apenas em dev).
    if (import.meta.env.DEV) {
      const debugGlobal = globalThis as typeof globalThis & {
        __ruaWorld?: CombatWorld;
        __RUA_PAUSE_DEBUG__?: () => { paused: boolean; selectedAction: PauseMenuAction };
        __RUA_CAPTURE_DEBUG__?: {
          pause: () => void;
          resume: () => void;
          step: (
            held?: readonly InputAction[],
            pressed?: readonly InputAction[],
            heldTwo?: readonly InputAction[],
            pressedTwo?: readonly InputAction[],
          ) => void;
        };
        __RUA_FIGHTER_DEBUG__?: () => {
          fighterIds: readonly string[];
          bodySprites: readonly { name: string; texture: string; visible: boolean; active: boolean }[];
          moveEffects: readonly { name: string; texture: string; visible: boolean; active: boolean }[];
          projectileSprites: readonly {
            texture: string;
            visible: boolean;
            active: boolean;
            x: number;
            y: number;
          }[];
        };
      };
      debugGlobal.__ruaWorld = this.world;
      debugGlobal.__RUA_PAUSE_DEBUG__ = () => ({
        paused: this.world.paused,
        selectedAction: this.pauseMenu.selected,
      });
      debugGlobal.__RUA_CAPTURE_DEBUG__ = {
        pause: () => {
          this.capturePaused = true;
          this.runner.reset();
        },
        resume: () => {
          this.capturePaused = false;
          this.runner.reset();
        },
        step: (held = [], pressed = [], heldTwo = [], pressedTwo = []) => {
          if (!this.capturePaused) throw new Error('Capture frame-step requer pause().');
          const frameOne: InputFrame = {
            held: new Set(held),
            pressed: new Set(pressed),
            released: new Set(),
          };
          const frameTwo: InputFrame = {
            held: new Set(heldTwo),
            pressed: new Set(pressedTwo),
            released: new Set(),
          };
          this.world.step(frameOne, frameTwo);
          for (const event of this.world.drainEvents()) this.handleCombatEvent(event);
        },
      };
      debugGlobal.__RUA_FIGHTER_DEBUG__ = () => ({
        fighterIds: this.world.fighters.map(({ id }) => id),
        bodySprites: this.children.list
          .filter((child): child is Phaser.GameObjects.Sprite =>
            child instanceof Phaser.GameObjects.Sprite && child.name.endsWith('-fighter-sprite'))
          .map((sprite) => ({
            name: sprite.name,
            texture: sprite.texture.key,
            visible: sprite.visible,
            active: sprite.active,
          })),
        moveEffects: this.children.list
          .filter((child): child is Phaser.GameObjects.Sprite =>
            child instanceof Phaser.GameObjects.Sprite && child.name.endsWith('-move-effect'))
          .map((sprite) => ({
            name: sprite.name,
            texture: sprite.texture.key,
            visible: sprite.visible,
            active: sprite.active,
          })),
        projectileSprites: this.projectileSprites.map((sprite) => ({
          texture: sprite.texture.key,
          visible: sprite.visible,
          active: sprite.active,
          x: sprite.x,
          y: sprite.y,
        })),
      });
      (debugGlobal as typeof debugGlobal & {
        __RUA_ONLINE_FIGHT_DEBUG__?: () => {
          slot: PlayerSlot | null;
          inputDelay: number | null;
          startFingerprint: string | null;
          captureFrame: number | null;
          simulationFrame: number | null;
          waitingForPeer: boolean | null;
          lastHashFrame: number | null;
          lastHash: string | null;
        };
      }).__RUA_ONLINE_FIGHT_DEBUG__ = () => {
        const status = this.onlineLockstep?.status;
        const start = onlineSession.snapshot.start;
        return {
          slot: this.onlineSlot,
          inputDelay: start?.inputDelay ?? null,
          startFingerprint: start
            ? deterministicHash({
                seed: start.seed,
                startAt: start.startAt,
                inputDelay: start.inputDelay,
                players: start.players,
              })
            : null,
          captureFrame: status?.captureFrame ?? null,
          simulationFrame: status?.simulationFrame ?? null,
          waitingForPeer: status?.waitingForPeer ?? null,
          lastHashFrame: status?.lastHashFrame ?? null,
          lastHash: status?.lastHash ?? null,
        };
      };
    }
    this.stageView = new CaisStageView(this);
    this.views = [
      createFighterView(this, playerOne),
      createFighterView(this, playerTwo),
    ];
    this.assertMainBodySpriteCount();
    this.projectileSprites = [];
    this.debugGraphics = this.add.graphics().setDepth(80);

    if (selection.mode === 'cpu' || selection.mode === 'training') {
      this.cpu = new CpuController(playerTwo, 1, settingsStore.get().difficulty);
    }

    this.scene.stop('UIScene');
    this.scene.launch('UIScene', {
      world: this.world,
      online: selection.mode === 'online',
      localSlot: this.onlineSlot,
    });
    if (selection.mode === 'online') this.createOnlineOverlay();
    touchControls.setGameplayActive(true);

    this.game.events.on('fight:pause', this.togglePause, this);
    this.game.events.on('fight:pause-action', this.handlePauseAction, this);
    this.game.events.on('training:reset', this.resetTraining, this);
    this.game.events.on('training:debug', this.toggleTrainingDebug, this);
    this.game.events.on('training:cpu', this.toggleTrainingCpu, this);
    this.game.events.on('online:background', this.handleOnlineBackground, this);
    this.input.keyboard?.on('keydown-F1', this.toggleTrainingDebug, this);
    this.input.keyboard?.on('keydown-F2', this.resetTraining, this);
    this.input.keyboard?.on('keydown-F3', this.toggleTrainingCpu, this);
    this.input.keyboard?.on('keydown-F9', this.toggleDebugOverlay, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    globalThis.document?.addEventListener('visibilitychange', this.handleVisibility);
    this.orientationQuery = globalThis.matchMedia?.('(orientation: portrait)') ?? null;
    this.orientationQuery?.addEventListener('change', this.handleOrientation);
    this.handleOrientation();
  }

  update(_time: number, delta: number): void {
    this.stageView.update(delta);
    if (this.onlineLockstep) {
      this.updateOnlineClock(delta);
    } else if (!this.capturePaused) {
      this.runner.update(delta, () => this.simulateStep());
    }
    const snapshot = this.world.snapshot();
    const renderAlpha = this.capturePaused ? 1 : this.runner.alpha;
    this.views?.[0].sync(snapshot.fighters[0], renderAlpha);
    this.views?.[1].sync(snapshot.fighters[1], renderAlpha);
    this.drawProjectiles(snapshot);
    this.drawDebug(snapshot);
    this.drawDebugOverlay();
    this.updateOnlineOverlay();
  }

  private updateOnlineClock(delta: number): void {
    const start = onlineSession.snapshot.start;
    const lockstep = this.onlineLockstep;
    if (!start || !lockstep || this.resultScheduled) return;
    if (onlineSession.snapshot.status === 'error') {
      this.finishOnlineInterrupted(onlineSession.snapshot.message);
      return;
    }
    if (onlineSession.serverNow() < start.startAt) return;
    if (!this.onlineClockStarted) {
      const elapsedFrames = Math.max(
        0,
        Math.floor((onlineSession.serverNow() - start.startAt) / (1000 / 60)),
      );
      if (elapsedFrames > 30) {
        this.finishOnlineInterrupted('O início sincronizado foi perdido.');
        return;
      }
      for (let frame = 0; frame < elapsedFrames; frame += 1) lockstep.capture(EMPTY_INPUT);
      lockstep.flush();
      this.onlineClockStarted = true;
      this.runner.reset();
    }
    this.runner.update(delta, () => this.simulateOnlineTick());
    const fatal = lockstep.status.fatalMessage;
    if (fatal) this.finishOnlineInterrupted(fatal);
  }

  private simulateOnlineTick(): void {
    const lockstep = this.onlineLockstep;
    if (!lockstep) return;
    const input = inputManager.sample(0);
    const pausePressed = input.pressed.has('pause');
    if (pausePressed) {
      this.onlineLocalPaused = !this.onlineLocalPaused;
      this.onlinePauseChoice = 'continue';
      inputManager.clear();
      touchControls.releaseAll();
      touchControls.setGameplayActive(!this.onlineLocalPaused);
    } else if (this.onlineLocalPaused) {
      const navigation = Number(
        input.pressed.has('down') || input.pressed.has('right'),
      ) - Number(
        input.pressed.has('up') || input.pressed.has('left'),
      );
      if (navigation !== 0) {
        this.onlinePauseChoice = this.onlinePauseChoice === 'continue' ? 'leave' : 'continue';
      }
      if (input.pressed.has('confirm') || input.pressed.has('light')) {
        if (this.onlinePauseChoice === 'leave') {
          this.finishOnlineInterrupted('Você saiu da partida online.');
          return;
        }
        this.onlineLocalPaused = false;
        touchControls.setGameplayActive(true);
        inputManager.clear();
      }
    }
    const prefill = lockstep.status.captureFrame < lockstep.inputDelay;
    lockstep.capture(prefill || this.onlineLocalPaused ? EMPTY_INPUT : input);
    lockstep.advance(this.world);
    for (const event of this.world.drainEvents()) this.handleCombatEvent(event);
  }

  private simulateStep(): void {
    const playerOneInput = inputManager.sample(0);
    const keyboardTwo = inputManager.sample(1);
    // Apenas a ação lógica 'pause' alterna a pausa. 'cancel' não entra aqui
    // porque, no gamepad, o botão de cancelar compartilha o físico com o
    // ataque forte; Esc continua pausando por mapear também para 'pause'.
    const pausePressed = playerOneInput.pressed.has('pause')
      || keyboardTwo.pressed.has('pause');

    if (this.world.paused) {
      if (pausePressed) {
        this.handlePauseAction('continue');
        return;
      }
      const horizontal = Number(
        playerOneInput.pressed.has('right') || keyboardTwo.pressed.has('right'),
      ) - Number(
        playerOneInput.pressed.has('left') || keyboardTwo.pressed.has('left'),
      );
      if (horizontal !== 0) {
        const selected = this.pauseMenu.move(horizontal > 0 ? 1 : -1);
        this.game.events.emit('fight:pause-selection', selected);
      }
      if (playerOneInput.pressed.has('confirm')) {
        this.handlePauseAction(this.pauseMenu.selected);
      }
      return;
    }

    if (pausePressed) {
      this.togglePause();
      return;
    }

    let playerTwoInput = keyboardTwo;
    if (gameSession.selection.mode === 'cpu') {
      playerTwoInput = this.cpu?.sample(this.world.snapshot()) ?? EMPTY_INPUT;
    } else if (gameSession.selection.mode === 'training') {
      playerTwoInput = this.world.trainingCpuEnabled
        ? this.cpu?.sample(this.world.snapshot()) ?? EMPTY_INPUT
        : EMPTY_INPUT;
    }

    this.world.step(playerOneInput, playerTwoInput);
    for (const event of this.world.drainEvents()) this.handleCombatEvent(event);
  }

  private handleCombatEvent(event: CombatEvent): void {
    this.game.events.emit('combat:event', event);
    if (event.type === 'hit') {
      audioManager.play('hit');
    }
    if (event.type === 'blocked') audioManager.play('block');
    if (event.type === 'special' || event.type === 'passive') {
      audioManager.play('special');
      if (event.isSuper) {
        const freeze = event.cinematic === 'freeze';
        this.cameras.main.flash(400, freeze ? 168 : 90, freeze ? 233 : 210, 255);
        this.cameras.main.setScroll(event.attacker === this.world.fighters[0].id ? -4 : 4, 0);
        this.time.delayedCall(freeze ? 200 : 150, () => this.cameras.main.setScroll(0, 0));
      }
    }
    if (event.type === 'roundStart' || event.type === 'fight') audioManager.play('round');
    if (event.type === 'knockout') audioManager.play('ko');
    if (event.type === 'matchEnd') this.scheduleResult();
  }

  private scheduleResult(): void {
    if (this.resultScheduled) return;
    const winner = this.world.winner;
    const loser = this.world.loser;
    if (!winner || !loser) return;
    this.resultScheduled = true;
    const playerWon = gameSession.selection.mode === 'online'
      ? (winner === this.world.fighters[0]) === (this.onlineSlot === 'p1')
      : winner === this.world.fighters[0];
    gameSession.result = {
      winner: winner.id,
      loser: loser.id,
      playerWon,
      rounds: [this.world.fighters[0].roundWins, this.world.fighters[1].roundWins],
    };
    if (gameSession.selection.mode === 'cpu') {
      const settings = settingsStore.get();
      settingsStore.update(playerWon ? { wins: settings.wins + 1 } : { losses: settings.losses + 1 });
    }
    if (gameSession.selection.mode === 'online') {
      gameSession.onlineResult = { kind: 'completed', message: 'Partida online concluída.' };
      onlineSession.leave();
    }

    this.time.delayedCall(1100, () => {
      this.scene.stop('UIScene');
      this.scene.start('ResultScene');
    });
  }

  private togglePause(): void {
    if (this.onlineLockstep) {
      this.onlineLocalPaused = !this.onlineLocalPaused;
      this.onlinePauseChoice = 'continue';
      inputManager.clear();
      touchControls.releaseAll();
      touchControls.setGameplayActive(!this.onlineLocalPaused);
      return;
    }
    const paused = this.world.togglePause();
    if (paused) {
      this.pauseMenu.reset();
      this.game.events.emit('fight:pause-selection', this.pauseMenu.selected);
    }
    inputManager.clear();
    touchControls.releaseAll();
    touchControls.setGameplayActive(!paused);
    this.runner.reset();
  }

  private readonly handlePauseAction = (action: PauseMenuAction): void => {
    if (this.onlineLockstep) return;
    if (!this.world.paused || this.transitionLocked) return;
    const command = this.pauseMenu.activate(action);
    if (!command) return;
    if (command.type === 'continue') {
      this.world.setPaused(false);
      inputManager.clear();
      touchControls.releaseAll();
      touchControls.setGameplayActive(true);
      this.runner.reset();
      return;
    }
    this.exitFight(command.target);
  };

  private exitFight(target: PauseNavigationTarget): void {
    if (this.transitionLocked) return;
    this.transitionLocked = true;
    this.resultScheduled = true;
    this.world.setPaused(false);
    gameSession.result = null;
    touchControls.releaseAll();
    touchControls.setGameplayActive(false);
    inputManager.clear();
    this.runner.reset();
    this.scene.stop('UIScene');
    this.scene.start(target);
  }

  private resetTraining(): void {
    if (gameSession.selection.mode !== 'training') return;
    this.world.resetTrainingPositions();
    this.cpu?.reset();
  }

  private toggleTrainingDebug(): void {
    if (gameSession.selection.mode !== 'training') return;
    this.world.toggleDebugBoxes();
  }

  private toggleTrainingCpu(): void {
    if (gameSession.selection.mode !== 'training') return;
    this.world.toggleTrainingCpu();
    this.cpu?.reset();
  }

  private drawProjectiles(snapshot: ReturnType<CombatWorld['snapshot']>): void {
    while (this.projectileSprites.length < snapshot.projectiles.length) {
      const projectile = snapshot.projectiles[this.projectileSprites.length];
      if (!projectile) break;
      const effect = this.projectileEffect(projectile);
      this.projectileSprites.push(
        this.add.sprite(0, 0, effect.key, 0).setDepth(18),
      );
    }
    while (this.projectileSprites.length > snapshot.projectiles.length) {
      this.projectileSprites.pop()?.destroy();
    }
    this.projectileSprites.forEach((sprite, index) => {
      const projectile = snapshot.projectiles[index];
      if (!projectile) return;
      const effect = this.projectileEffect(projectile);
      this.syncProjectileEffect(sprite, effect, projectile);
      sprite
        .setVisible(true)
        .setPosition(
          worldToScreen(projectile.x) + projectile.facing * effect.offset.x,
          worldToScreen(projectile.y) + effect.offset.y,
        )
        .setFlipX(projectile.facing < 0);
    });
  }

  private projectileEffect(
    projectile: ReturnType<CombatWorld['snapshot']>['projectiles'][number],
  ): FighterEffectAsset {
    const effect = getFighterEffectAsset(
      projectile.ownerId,
      projectile.sourceMoveId,
      'projectile',
    );
    if (effect) return effect;

    const message = `[Rua de Aço] Efeito de projétil ausente: fighter=${projectile.ownerId} move=${projectile.sourceMoveId} projectile=${projectile.projectileId}`;
    console.error(message);
    throw new Error(message);
  }

  private syncProjectileEffect(
    sprite: Phaser.GameObjects.Sprite,
    effect: FighterEffectAsset,
    projectile: {
      readonly ageFrames: number;
      readonly armingFrames: number;
      readonly state: 'arming' | 'active';
    },
  ): void {
    const animationKey = phaserAnimationKey(effect.key);
    if (sprite.anims.getName() !== animationKey) {
      sprite.play(animationKey);
      sprite.anims.pause();
    }
    const frameIndex = resolveProjectileVisualFrame(effect, projectile);
    const frame = sprite.anims.currentAnim?.frames[frameIndex];
    if (!frame) return;
    sprite.anims.setCurrentFrame(frame);
    sprite
      .setOrigin(effect.origin.x, effect.origin.y)
      .setScale(effect.scale);
  }

  private drawDebug(snapshot: ReturnType<CombatWorld['snapshot']>): void {
    this.debugGraphics.clear();
    if (!this.world.debugBoxes) return;
    this.world.fighters.forEach((fighter) => {
      this.debugGraphics.lineStyle(1, 0x38ff80, 0.95);
      for (const hurtbox of fighter.getEvaluatedHurtboxes()) {
        const rect = worldRectToScreen(toWorldRect(hurtbox, fighter));
        this.debugGraphics.strokeRect(rect.x, rect.y, rect.width, rect.height);
      }
      this.debugGraphics.lineStyle(2, 0xff3b5c, 0.95);
      for (const hitbox of fighter.getEvaluatedHitboxes()) {
        const rect = worldRectToScreen(toWorldRect(hitbox, fighter));
        this.debugGraphics.strokeRect(rect.x, rect.y, rect.width, rect.height);
      }
      this.debugGraphics.lineStyle(1, 0xffd55c, 0.9);
      const pushbox = worldRectToScreen(toWorldRect(fighter.getEvaluatedPushbox(), fighter));
      this.debugGraphics.strokeRect(pushbox.x, pushbox.y, pushbox.width, pushbox.height);
    });
    this.debugGraphics.lineStyle(2, 0x29d9ff, 0.95);
    for (const projectile of snapshot.projectiles) {
      const rect = worldRectToScreen(projectile.hitbox);
      this.debugGraphics.strokeRect(
        rect.x,
        rect.y,
        rect.width,
        rect.height,
      );
    }
  }

  private toggleDebugOverlay(): void {
    this.debugOverlayEnabled = !this.debugOverlayEnabled;
    if (!this.debugOverlayEnabled) {
      this.debugOverlayText?.destroy();
      this.debugOverlayText = null;
    }
  }

  private drawDebugOverlay(): void {
    if (!this.debugOverlayEnabled) return;
    if (!this.debugOverlayText) {
      this.debugOverlayText = pixelText(this, 8, 70, '', { size: 16 })
        .setTint(0xffd55c)
        .setDepth(200)
        .setOrigin(0, 0);
    }
    const lines = this.world.fighters.map((fighter, index) => {
      const vx = (fighter.x - fighter.previousX).toFixed(1);
      const vy = (fighter.y - fighter.previousY).toFixed(1);
      const hitboxActive = fighter.getActiveHitboxes().length > 0;
      return [
        `P${index + 1} ${fighter.state}:${fighter.stateFrame}`,
        `GOLPE ${fighter.currentMove?.id ?? fighter.lastMoveId ?? '-'}`,
        `VX ${vx} VY ${vy}`,
        `CHAO ${fighter.grounded ? 'SIM' : 'NAO'}`,
        `DIR ${fighter.lastDirection}`,
        `HITBOX ${hitboxActive ? 'ATIVA' : 'OFF'}`,
      ].join('  ');
    });
    this.debugOverlayText.setText(lines.join('\n'));
  }

  private handleVisibility = (): void => {
    if (document.hidden) {
      if (this.onlineLockstep) {
        this.finishOnlineInterrupted('A página ficou em segundo plano; partida encerrada com segurança.');
      } else {
        this.pauseForInterruption();
      }
    }
  };

  private handleOrientation = (): void => {
    if (!this.orientationQuery?.matches) return;
    this.pauseForInterruption();
  };

  private pauseForInterruption(): void {
    if (this.onlineLockstep) {
      this.onlineLocalPaused = true;
      this.onlinePauseChoice = 'continue';
      touchControls.releaseAll();
      touchControls.setGameplayActive(false);
      inputManager.clear();
      return;
    }
    this.world.setPaused(true);
    this.pauseMenu.reset();
    this.game.events.emit('fight:pause-selection', this.pauseMenu.selected);
    this.runner.reset();
    touchControls.releaseAll();
    touchControls.setGameplayActive(false);
    inputManager.clear();
  }

  private shutdown(): void {
    this.destroyFightSprites();
    touchControls.setGameplayActive(false);
    inputManager.clear();
    this.runner.reset();
    this.game.events.off('fight:pause', this.togglePause, this);
    this.game.events.off('fight:pause-action', this.handlePauseAction, this);
    this.game.events.off('training:reset', this.resetTraining, this);
    this.game.events.off('training:debug', this.toggleTrainingDebug, this);
    this.game.events.off('training:cpu', this.toggleTrainingCpu, this);
    this.game.events.off('online:background', this.handleOnlineBackground, this);
    this.input.keyboard?.off('keydown-F1', this.toggleTrainingDebug, this);
    this.input.keyboard?.off('keydown-F2', this.resetTraining, this);
    this.input.keyboard?.off('keydown-F3', this.toggleTrainingCpu, this);
    this.input.keyboard?.off('keydown-F9', this.toggleDebugOverlay, this);
    this.debugOverlayText = null;
    globalThis.document?.removeEventListener('visibilitychange', this.handleVisibility);
    this.orientationQuery?.removeEventListener('change', this.handleOrientation);
    this.orientationQuery = null;
    this.onlineLockstep?.dispose();
    this.onlineLockstep = null;
    this.onlineStatusText = null;
    this.onlineWaitText = null;
    this.onlinePauseLayer = null;
    this.onlinePauseLabels = [];
    if (import.meta.env.DEV) {
      const debugGlobal = globalThis as typeof globalThis & {
        __ruaWorld?: CombatWorld;
        __RUA_PAUSE_DEBUG__?: () => unknown;
        __RUA_CAPTURE_DEBUG__?: unknown;
        __RUA_FIGHTER_DEBUG__?: () => unknown;
        __RUA_ONLINE_FIGHT_DEBUG__?: () => unknown;
      };
      if (debugGlobal.__ruaWorld === this.world) delete debugGlobal.__ruaWorld;
      delete debugGlobal.__RUA_PAUSE_DEBUG__;
      delete debugGlobal.__RUA_CAPTURE_DEBUG__;
      delete debugGlobal.__RUA_FIGHTER_DEBUG__;
      delete debugGlobal.__RUA_ONLINE_FIGHT_DEBUG__;
    }
  }

  private createOnlineOverlay(): void {
    this.onlineStatusText = pixelText(this, INTERNAL_WIDTH / 2, 70, '', {
      size: 8,
      maxWidth: 500,
      maxHeight: 14,
      color: '#9af7ff',
      align: 'center',
      layoutName: 'online-fight-status',
    }).setDepth(190);
    this.onlineWaitText = pixelText(this, INTERNAL_WIDTH / 2, 94, '', {
      size: 16,
      minSize: 8,
      maxWidth: 480,
      maxHeight: 22,
      color: '#ffd55c',
      align: 'center',
      layoutName: 'online-fight-wait',
    }).setDepth(190);

    const shade = this.add.rectangle(
      INTERNAL_WIDTH / 2,
      INTERNAL_HEIGHT / 2,
      INTERNAL_WIDTH,
      INTERNAL_HEIGHT,
      0x000000,
      0.78,
    );
    const panel = this.add.rectangle(
      INTERNAL_WIDTH / 2,
      200,
      430,
      174,
      0x101827,
      0.98,
    ).setStrokeStyle(4, PALETTE.cyan);
    const title = pixelText(this, INTERNAL_WIDTH / 2, 146, 'A PARTIDA ONLINE NAO PAUSA', {
      size: 24,
      minSize: 16,
      maxWidth: 400,
      maxHeight: 30,
      color: '#ffd55c',
      align: 'center',
    });
    const warning = pixelText(this, INTERNAL_WIDTH / 2, 176, 'INPUT NEUTRO • VOCE AINDA PODE RECEBER GOLPES', {
      size: 8,
      maxWidth: 380,
      maxHeight: 14,
      color: '#ff91b2',
      align: 'center',
    });
    const continueLabel = pixelText(this, INTERNAL_WIDTH / 2, 216, 'CONTINUAR', {
      size: 16,
      maxWidth: 280,
      maxHeight: 22,
      color: '#f7f2d0',
      align: 'center',
    }).setInteractive({ useHandCursor: true });
    const leaveLabel = pixelText(this, INTERNAL_WIDTH / 2, 250, 'ABANDONAR PARTIDA', {
      size: 16,
      maxWidth: 280,
      maxHeight: 22,
      color: '#f7f2d0',
      align: 'center',
    }).setInteractive({ useHandCursor: true });
    continueLabel.on('pointerdown', () => {
      this.onlineLocalPaused = false;
      touchControls.setGameplayActive(true);
      inputManager.clear();
    });
    leaveLabel.on('pointerdown', () => this.finishOnlineInterrupted('Você saiu da partida online.'));
    this.onlinePauseLabels = [continueLabel, leaveLabel];
    this.onlinePauseLayer = this.add.container(0, 0, [
      shade,
      panel,
      title,
      warning,
      continueLabel,
      leaveLabel,
    ]).setDepth(200).setVisible(false);
  }

  private updateOnlineOverlay(): void {
    const lockstep = this.onlineLockstep;
    if (!lockstep) return;
    const state = lockstep.status;
    this.onlineStatusText?.setText(
      `LOCKSTEP • FRAME ${state.simulationFrame} • BUFFER ${state.bufferedRemoteFrames}`,
    );
    const start = onlineSession.snapshot.start;
    if (start && onlineSession.serverNow() < start.startAt) {
      const seconds = Math.max(0, Math.ceil((start.startAt - onlineSession.serverNow()) / 1000));
      this.onlineWaitText?.setText(`SINCRONIZANDO ${seconds}`);
    } else {
      this.onlineWaitText?.setText(state.waitingForPeer ? 'AGUARDANDO INPUT DO RIVAL' : '');
    }
    this.onlinePauseLayer?.setVisible(this.onlineLocalPaused);
    this.onlinePauseLabels.forEach((label, index) => {
      const selected = (index === 0) === (this.onlinePauseChoice === 'continue');
      label.setTint(selected ? PALETTE.gold : PALETTE.ivory);
    });
  }

  private readonly handleOnlineBackground = (): void => {
    if (this.onlineLockstep) {
      this.finishOnlineInterrupted('Aplicativo enviado ao fundo; partida encerrada com segurança.');
    }
  };

  private finishOnlineInterrupted(message: string): void {
    if (this.resultScheduled) return;
    this.resultScheduled = true;
    gameSession.result = null;
    gameSession.onlineResult = { kind: 'interrupted', message };
    touchControls.releaseAll();
    touchControls.setGameplayActive(false);
    inputManager.clear();
    this.onlineLockstep?.dispose();
    this.onlineLockstep = null;
    onlineSession.leave();
    this.time.delayedCall(120, () => {
      this.scene.stop('UIScene');
      this.scene.start('ResultScene');
    });
  }

  private destroyFightSprites(): void {
    this.views?.forEach((view) => view.destroy());
    this.views = null;
    for (const sprite of this.projectileSprites) sprite.destroy();
    this.projectileSprites = [];
  }

  private assertMainBodySpriteCount(): void {
    const bodySprites = this.children.list.filter(({ name }) => name.endsWith('-fighter-sprite'));
    if (bodySprites.length === 2) return;

    const message = `[Rua de Aço] Contagem inválida de sprites corporais: ${bodySprites.length} (esperado 2)`;
    console.error(message);
    throw new Error(message);
  }
}
