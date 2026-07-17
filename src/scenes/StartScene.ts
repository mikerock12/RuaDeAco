import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { audioManager } from '../audio/AudioManager';
import { MUSIC_TRACK_BY_SCENE } from '../audio/musicCatalog';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, PALETTE } from '../config/pixelArtConfig';
import { InputManager, inputManager } from '../input/InputManager';
import { pixelText } from '../utils/text';
import { StartGate } from './startGate';
import { StartTransition } from './startTransition';

const STAGE_LAYER_SCALE = 2;

export class StartScene extends Phaser.Scene {
  private gate: StartGate | null = null;
  private transition: StartTransition | null = null;
  private startZone: Phaser.GameObjects.Zone | null = null;

  constructor() {
    super('StartScene');
  }

  create(): void {
    inputManager.clear();
    this.drawBackdrop();
    this.drawPrompt();

    // Baixa e decodifica a faixa sem solicitá-la nem tentar reproduzi-la.
    void audioManager.preloadMusic(MUSIC_TRACK_BY_SCENE.MainMenuScene);

    this.transition = new StartTransition({
      unlockAudio: audioManager.unlock,
      openMainMenu: () => this.scene.start('MainMenuScene'),
      reportUnlockFailure: (error) => console.warn(
        '[Audio] Não foi possível liberar o contexto na tela inicial; o jogo continuará e tentará novamente.',
        error ?? 'policy',
      ),
    });

    const canvas = this.game.canvas;
    this.gate = new StartGate(globalThis.window, this.enterGame, [globalThis.window, canvas]);
    this.gate.attach();
    this.startZone = this.add.zone(
      INTERNAL_WIDTH / 2,
      INTERNAL_HEIGHT / 2,
      INTERNAL_WIDTH,
      INTERNAL_HEIGHT,
    ).setInteractive().setDepth(1_000);
    this.startZone.on(Phaser.Input.Events.POINTER_DOWN, this.handlePhaserPointer);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePhaserPointer);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePhaserPointer);
      this.startZone?.off(Phaser.Input.Events.POINTER_DOWN, this.handlePhaserPointer);
      this.startZone = null;
      this.gate?.dispose();
      this.gate = null;
      this.transition = null;
    });
  }

  private drawBackdrop(): void {
    this.cameras.main.setBackgroundColor(PALETTE.black);
    const { stage } = ASSET_MANIFEST;
    this.add.image(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.far.key).setScale(STAGE_LAYER_SCALE);
    this.add.image(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.mid.key).setScale(STAGE_LAYER_SCALE);
    this.add.sprite(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.water.key, 1).setScale(STAGE_LAYER_SCALE);
    this.add.image(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.foreground.key).setScale(STAGE_LAYER_SCALE);
    this.add.rectangle(
      INTERNAL_WIDTH / 2,
      INTERNAL_HEIGHT / 2,
      INTERNAL_WIDTH,
      INTERNAL_HEIGHT,
      PALETTE.ink,
      0.72,
    );

    const scanlines = this.add.graphics();
    scanlines.fillStyle(PALETTE.black, 0.28);
    for (let y = 2; y < INTERNAL_HEIGHT; y += 6) scanlines.fillRect(0, y, INTERNAL_WIDTH, 2);

    this.add.rectangle(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, 552, 300, PALETTE.black, 0.54)
      .setStrokeStyle(4, PALETTE.steelLight);
    this.add.rectangle(INTERNAL_WIDTH / 2, 30, 500, 4, PALETTE.cyan);
    this.add.rectangle(INTERNAL_WIDTH / 2, 36, 420, 2, PALETTE.gold);
  }

  private drawPrompt(): void {
    if (this.textures.exists(ASSET_MANIFEST.logo.key)) {
      this.add.image(INTERNAL_WIDTH / 2, 112, ASSET_MANIFEST.logo.key)
        .setDisplaySize(238, 178)
        .setOrigin(0.5);
    } else {
      pixelText(this, INTERNAL_WIDTH / 2, 106, 'RUA DE ACO', {
        size: 32,
        color: PALETTE.gold,
        align: 'center',
      });
    }

    pixelText(this, INTERNAL_WIDTH / 2, 202, 'A CIDADE LUTA DE VOLTA', {
      size: 16,
      color: PALETTE.cyanLight,
      align: 'center',
    });

    const touchCapable = InputManager.isTouchCapable();
    const prompt = pixelText(
      this,
      INTERNAL_WIDTH / 2,
      260,
      touchCapable ? 'TOQUE PARA INICIAR' : 'PRESSIONE ENTER PARA INICIAR',
      {
        size: 16,
        color: PALETTE.ivory,
        align: 'center',
      },
    );
    this.tweens.add({
      targets: prompt,
      alpha: { from: 1, to: 0.3 },
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Stepped',
      easeParams: [4],
    });

    pixelText(this, INTERNAL_WIDTH / 2, 318, 'ENTER / ESPACO / TOQUE', {
      size: 16,
      color: PALETTE.muted,
      align: 'center',
    });
  }

  private readonly handlePhaserPointer = (): void => {
    this.gate?.trigger();
  };

  private readonly enterGame = (): void => {
    this.transition?.start();
  };
}
