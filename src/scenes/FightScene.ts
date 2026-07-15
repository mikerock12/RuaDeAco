import Phaser from 'phaser';
import { CpuController } from '../ai/CpuController';
import { audioManager } from '../audio/AudioManager';
import { CombatWorld } from '../combat/CombatWorld';
import { FixedStepRunner } from '../combat/FixedStepRunner';
import { toWorldRect } from '../combat/geometry';
import { gameSession } from '../config/session';
import { settingsStore } from '../config/settings';
import { RASTER_ASSET_SCALE, worldRectToScreen, worldToScreen } from '../config/pixelArtConfig';
import { getFighterDefinition } from '../fighters';
import { inputManager } from '../input/InputManager';
import { touchControls } from '../input/TouchControls';
import type { CombatEvent, InputFrame } from '../types/combat';
import { CaisStageView } from '../ui/CaisStageView';
import { createFighterView, type FighterView } from '../ui/FighterSpriteView';
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
  private views!: readonly [FighterView, FighterView];
  private stageView!: CaisStageView;
  private projectileSprites: Phaser.GameObjects.Sprite[] = [];
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private debugOverlayEnabled = DEBUG_OVERLAY_DEFAULT;
  private debugOverlayText: Phaser.GameObjects.BitmapText | null = null;
  private resultScheduled = false;
  private orientationQuery: MediaQueryList | null = null;

  constructor() {
    super('FightScene');
  }

  create(): void {
    this.resultScheduled = false;
    this.cpu = null;
    this.runner.reset();
    const selection = gameSession.selection;
    const playerOne = getFighterDefinition(selection.playerOne);
    const playerTwo = getFighterDefinition(selection.playerTwo);
    this.world = new CombatWorld(playerOne, playerTwo, selection.mode);
    // Gancho de inspeção para testes instrumentados (apenas em dev).
    if (import.meta.env.DEV) {
      (globalThis as { __ruaWorld?: CombatWorld }).__ruaWorld = this.world;
    }
    this.stageView = new CaisStageView(this);
    this.views = [
      createFighterView(this, playerOne),
      createFighterView(this, playerTwo),
    ];
    this.projectileSprites = [];
    this.debugGraphics = this.add.graphics().setDepth(80);

    if (selection.mode === 'cpu' || selection.mode === 'training') {
      this.cpu = new CpuController(playerTwo, 1, settingsStore.get().difficulty);
    }

    this.scene.stop('UIScene');
    this.scene.launch('UIScene', { world: this.world });
    touchControls.setGameplayActive(true);

    this.game.events.on('fight:pause', this.togglePause, this);
    this.game.events.on('training:reset', this.resetTraining, this);
    this.game.events.on('training:debug', this.toggleTrainingDebug, this);
    this.game.events.on('training:cpu', this.toggleTrainingCpu, this);
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
    this.runner.update(delta, () => this.simulateStep());
    const snapshot = this.world.snapshot();
    this.views[0].sync(snapshot.fighters[0], this.runner.alpha);
    this.views[1].sync(snapshot.fighters[1], this.runner.alpha);
    this.drawProjectiles(snapshot);
    this.drawDebug(snapshot);
    this.drawDebugOverlay();
  }

  private simulateStep(): void {
    const playerOneInput = inputManager.sample(0);
    const keyboardTwo = inputManager.sample(1);
    const pausePressed = playerOneInput.pressed.has('pause')
      || playerOneInput.pressed.has('cancel')
      || keyboardTwo.pressed.has('pause')
      || keyboardTwo.pressed.has('cancel');

    if (pausePressed || this.world.paused && playerOneInput.pressed.has('confirm')) {
      this.togglePause();
      return;
    }
    if (this.world.paused) return;

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
    const playerWon = winner === this.world.fighters[0];
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

    this.time.delayedCall(1100, () => {
      this.scene.stop('UIScene');
      this.scene.start('ResultScene');
    });
  }

  private togglePause(): void {
    this.world.togglePause();
    inputManager.clear();
    this.runner.reset();
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
      this.projectileSprites.push(
        this.add.sprite(0, 0, 'effectWave', 0).setScale(RASTER_ASSET_SCALE).setDepth(18),
      );
    }
    this.projectileSprites.forEach((sprite, index) => {
      const projectile = snapshot.projectiles[index];
      if (!projectile) {
        sprite.setVisible(false);
        return;
      }
      sprite
        .setVisible(true)
        .setPosition(worldToScreen(projectile.x), worldToScreen(projectile.y))
        .setFrame(Math.floor(snapshot.frame / 4) % 4)
        .setFlipX(projectile.facing < 0);
    });
    for (let index = snapshot.projectiles.length; index < this.projectileSprites.length; index += 1) {
      this.projectileSprites[index]?.setVisible(false);
    }
  }

  private drawDebug(snapshot: ReturnType<CombatWorld['snapshot']>): void {
    this.debugGraphics.clear();
    if (!this.world.debugBoxes) return;
    for (const fighter of this.world.fighters) {
      this.debugGraphics.lineStyle(1, 0x38ff80, 0.95);
      for (const hurtbox of fighter.getHurtboxes()) {
        const rect = worldRectToScreen(toWorldRect(hurtbox, fighter));
        this.debugGraphics.strokeRect(rect.x, rect.y, rect.width, rect.height);
      }
      this.debugGraphics.lineStyle(2, 0xff3b5c, 0.95);
      for (const hitbox of fighter.getActiveHitboxes()) {
        const rect = worldRectToScreen(toWorldRect(hitbox, fighter));
        this.debugGraphics.strokeRect(rect.x, rect.y, rect.width, rect.height);
      }
      this.debugGraphics.lineStyle(1, 0xffd55c, 0.9);
      const pushbox = worldRectToScreen(toWorldRect(fighter.definition.stats.pushbox, fighter));
      this.debugGraphics.strokeRect(pushbox.x, pushbox.y, pushbox.width, pushbox.height);
    }
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
      this.world.setPaused(true);
      this.runner.reset();
      touchControls.releaseAll();
      inputManager.clear();
    }
  };

  private handleOrientation = (): void => {
    if (!this.orientationQuery?.matches) return;
    this.world.setPaused(true);
    this.runner.reset();
    touchControls.releaseAll();
    inputManager.clear();
  };

  private shutdown(): void {
    touchControls.setGameplayActive(false);
    inputManager.clear();
    this.runner.reset();
    this.game.events.off('fight:pause', this.togglePause, this);
    this.game.events.off('training:reset', this.resetTraining, this);
    this.game.events.off('training:debug', this.toggleTrainingDebug, this);
    this.game.events.off('training:cpu', this.toggleTrainingCpu, this);
    this.input.keyboard?.off('keydown-F1', this.toggleTrainingDebug, this);
    this.input.keyboard?.off('keydown-F2', this.resetTraining, this);
    this.input.keyboard?.off('keydown-F3', this.toggleTrainingCpu, this);
    this.input.keyboard?.off('keydown-F9', this.toggleDebugOverlay, this);
    this.debugOverlayText = null;
    globalThis.document?.removeEventListener('visibilitychange', this.handleVisibility);
    this.orientationQuery?.removeEventListener('change', this.handleOrientation);
    this.orientationQuery = null;
  }
}
