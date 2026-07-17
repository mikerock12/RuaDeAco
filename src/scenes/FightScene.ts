import Phaser from 'phaser';
import { CpuController } from '../ai/CpuController';
import { audioManager } from '../audio/AudioManager';
import { MUSIC_TRACK_BY_SCENE } from '../audio/musicCatalog';
import { phaserAnimationKey, spriteSheetFrameIndex } from '../assets/spriteSheetContract';
import { CombatWorld } from '../combat/CombatWorld';
import { FixedStepRunner } from '../combat/FixedStepRunner';
import { toWorldRect } from '../combat/geometry';
import { gameSession } from '../config/session';
import { settingsStore } from '../config/settings';
import { worldRectToScreen, worldToScreen } from '../config/pixelArtConfig';
import { getFighterDefinition } from '../fighters';
import { getFighterEffectAsset } from '../fighters/visual';
import { inputManager } from '../input/InputManager';
import { touchControls } from '../input/TouchControls';
import type { CombatEvent, InputFrame } from '../types/combat';
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

  constructor() {
    super('FightScene');
  }

  create(): void {
    void audioManager.playMusic(MUSIC_TRACK_BY_SCENE.FightScene);
    this.destroyFightSprites();
    this.resultScheduled = false;
    this.transitionLocked = false;
    this.pauseMenu.reset();
    this.cpu = null;
    this.runner.reset();
    const selection = gameSession.selection;
    const playerOne = getFighterDefinition(selection.playerOne);
    const playerTwo = getFighterDefinition(selection.playerTwo);
    this.world = new CombatWorld(playerOne, playerTwo, selection.mode);
    // Gancho de inspeção para testes instrumentados (apenas em dev).
    if (import.meta.env.DEV) {
      const debugGlobal = globalThis as typeof globalThis & {
        __ruaWorld?: CombatWorld;
        __RUA_PAUSE_DEBUG__?: () => { paused: boolean; selectedAction: PauseMenuAction };
      };
      debugGlobal.__ruaWorld = this.world;
      debugGlobal.__RUA_PAUSE_DEBUG__ = () => ({
        paused: this.world.paused,
        selectedAction: this.pauseMenu.selected,
      });
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
    this.scene.launch('UIScene', { world: this.world });
    touchControls.setGameplayActive(true);

    this.game.events.on('fight:pause', this.togglePause, this);
    this.game.events.on('fight:pause-action', this.handlePauseAction, this);
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
    this.views?.[0].sync(snapshot.fighters[0], this.runner.alpha);
    this.views?.[1].sync(snapshot.fighters[1], this.runner.alpha);
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
      this.syncProjectileEffect(sprite, effect, projectile.ageFrames);
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
    projectileAgeFrames: number,
  ): void {
    const animationKey = phaserAnimationKey(effect.key);
    if (sprite.anims.getName() !== animationKey) {
      sprite.play(animationKey);
      sprite.anims.pause();
    }
    const frameIndex = spriteSheetFrameIndex(effect, projectileAgeFrames);
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
      this.pauseForInterruption();
    }
  };

  private handleOrientation = (): void => {
    if (!this.orientationQuery?.matches) return;
    this.pauseForInterruption();
  };

  private pauseForInterruption(): void {
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
    this.input.keyboard?.off('keydown-F1', this.toggleTrainingDebug, this);
    this.input.keyboard?.off('keydown-F2', this.resetTraining, this);
    this.input.keyboard?.off('keydown-F3', this.toggleTrainingCpu, this);
    this.input.keyboard?.off('keydown-F9', this.toggleDebugOverlay, this);
    this.debugOverlayText = null;
    globalThis.document?.removeEventListener('visibilitychange', this.handleVisibility);
    this.orientationQuery?.removeEventListener('change', this.handleOrientation);
    this.orientationQuery = null;
    if (import.meta.env.DEV) {
      const debugGlobal = globalThis as typeof globalThis & {
        __ruaWorld?: CombatWorld;
        __RUA_PAUSE_DEBUG__?: () => unknown;
      };
      if (debugGlobal.__ruaWorld === this.world) delete debugGlobal.__ruaWorld;
      delete debugGlobal.__RUA_PAUSE_DEBUG__;
    }
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
