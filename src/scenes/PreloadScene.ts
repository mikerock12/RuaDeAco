import Phaser from 'phaser';
import {
  ASSET_MANIFEST,
  IMAGE_ASSETS,
  REQUIRED_TEXTURE_KEYS,
  SPRITESHEET_ASSETS,
} from '../assets/assetManifest';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, PALETTE } from '../config/pixelArtConfig';
import { FIGHTER_SPRITE_ASSETS } from '../fighters/visual';

export class PreloadScene extends Phaser.Scene {
  private loadingFill: Phaser.GameObjects.Rectangle | null = null;
  private readonly loadFailures = new Set<string>();

  constructor() {
    super('PreloadScene');
  }

  preload(): void {
    this.cameras.main.setBackgroundColor(PALETTE.black);
    this.load.setBaseURL(import.meta.env.BASE_URL);
    this.drawLoadingScreen();

    for (const asset of IMAGE_ASSETS) this.load.image(asset.key, asset.path);
    for (const asset of SPRITESHEET_ASSETS) {
      this.load.spritesheet(asset.key, asset.path, {
        frameWidth: asset.frameWidth,
        frameHeight: asset.frameHeight,
      });
    }
    for (const fighter of FIGHTER_SPRITE_ASSETS) {
      for (const animation of Object.values(fighter.animations)) {
        this.load.spritesheet(animation.key, animation.path, {
          frameWidth: animation.frameWidth,
          frameHeight: animation.frameHeight,
        });
      }
    }
    this.load.bitmapFont(
      ASSET_MANIFEST.font.key,
      ASSET_MANIFEST.font.texturePath,
      ASSET_MANIFEST.font.dataPath,
    );

    this.load.on('progress', (progress: number) => {
      this.loadingFill?.setDisplaySize(Math.max(1, Math.round(136 * progress)), 4);
    });
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.loadFailures.add(file.key);
      console.error(`[Rua de Aço] Falha ao carregar asset: ${file.key} (${file.url})`);
    });
  }

  create(): void {
    const spriteKeys = FIGHTER_SPRITE_ASSETS.flatMap((fighter) =>
      Object.values(fighter.animations).map((animation) => animation.key));
    const missingTextures = [...REQUIRED_TEXTURE_KEYS, ...spriteKeys]
      .filter((key) => !this.textures.exists(key));
    const fontMissing = !this.cache.bitmapFont.exists(ASSET_MANIFEST.font.key);
    if (fontMissing) missingTextures.push(ASSET_MANIFEST.font.key);
    for (const key of this.loadFailures) {
      if (!missingTextures.includes(key)) missingTextures.push(key);
    }

    if (missingTextures.length > 0) {
      for (const key of missingTextures) console.error(`[Rua de Aço] Textura obrigatória ausente: ${key}`);
      this.showDebugFailure(missingTextures, fontMissing);
      return;
    }

    console.info(`[Rua de Aço] ${REQUIRED_TEXTURE_KEYS.length} texturas visuais validadas.`);
    this.children.removeAll();
    this.add.image(INTERNAL_WIDTH / 2, 78, ASSET_MANIFEST.logo.key)
      .setDisplaySize(132, 99)
      .setOrigin(0.5);
    this.add.bitmapText(INTERNAL_WIDTH / 2, 145, ASSET_MANIFEST.font.key, 'ASSETS OK', 8)
      .setOrigin(0.5)
      .setTint(PALETTE.cyanLight);
    this.time.delayedCall(220, () => this.scene.start('MainMenuScene'));
  }

  private drawLoadingScreen(): void {
    this.add.rectangle(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, INTERNAL_WIDTH, INTERNAL_HEIGHT, PALETTE.ink);
    for (let y = 0; y < INTERNAL_HEIGHT; y += 4) {
      this.add.rectangle(INTERNAL_WIDTH / 2, y, INTERNAL_WIDTH, 1, PALETTE.black, 0.32).setOrigin(0.5, 0);
    }
    this.add.rectangle(INTERNAL_WIDTH / 2, 94, 144, 10, PALETTE.steelDark)
      .setStrokeStyle(1, PALETTE.steelLight);
    this.loadingFill = this.add.rectangle(90, 94, 1, 4, PALETTE.cyan)
      .setOrigin(0, 0.5);
  }

  private showDebugFailure(missing: readonly string[], fontMissing: boolean): void {
    this.children.removeAll();
    this.add.rectangle(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, INTERNAL_WIDTH, INTERNAL_HEIGHT, PALETTE.ink);
    this.add.rectangle(INTERNAL_WIDTH / 2, 88, 304, 164, PALETTE.panel)
      .setStrokeStyle(2, PALETTE.danger);

    const addLine = (y: number, text: string, tint: number): void => {
      if (!fontMissing) {
        this.add.bitmapText(12, y, ASSET_MANIFEST.font.key, text, 8).setTint(tint);
        return;
      }
      this.add.text(12, y, text, {
        color: '#ffffff',
        fontFamily: 'monospace',
        fontSize: '8px',
      }).setResolution(1);
    };

    addLine(12, 'ERRO DE ASSET', PALETTE.danger);
    missing.slice(0, 16).forEach((key, index) => addLine(28 + index * 8, `- ${key}`, PALETTE.ivory));
    addLine(164, 'CONSULTE O CONSOLE', PALETTE.gold);
  }
}
