import Phaser from 'phaser';
import {
  ASSET_MANIFEST,
  IMAGE_ASSETS,
  REQUIRED_TEXTURE_KEYS,
  SPRITESHEET_ASSETS,
} from '../assets/assetManifest';
import { fighterAssetUrl } from '../assets/assetUrl';
import {
  animatedSpriteSheetContractErrors,
  isFlatFighterAssetPath,
  phaserAnimationKey,
  spriteSheetContractErrors,
  spriteSheetManifestErrors,
  spriteSheetPreloadConfig,
} from '../assets/spriteSheetContract';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, PALETTE } from '../config/pixelArtConfig';
import { FIGHTER_SPRITE_ASSETS } from '../fighters/visual';
import type { AnimatedSpriteSheetAsset, SpriteSheetAsset } from '../types/assets';

export class PreloadScene extends Phaser.Scene {
  private loadingFill: Phaser.GameObjects.Rectangle | null = null;
  private readonly loadFailures = new Set<string>();

  constructor() {
    super('PreloadScene');
  }

  preload(): void {
    this.loadFailures.clear();
    this.cameras.main.setBackgroundColor(PALETTE.black);
    this.load.setBaseURL(import.meta.env.BASE_URL);
    this.drawLoadingScreen();

    for (const asset of IMAGE_ASSETS) this.load.image(asset.key, asset.path);
    for (const asset of SPRITESHEET_ASSETS) {
      this.load.spritesheet(asset.key, asset.path, spriteSheetPreloadConfig(asset));
    }
    for (const fighter of FIGHTER_SPRITE_ASSETS) {
      const fighterSheets = [...Object.values(fighter.animations), ...fighter.effects];
      for (const sheet of fighterSheets) {
        if (!isFlatFighterAssetPath(sheet, fighter.fighterId)) {
          this.loadFailures.add(sheet.key);
          console.error(
            `[Rua de Aço] Caminho de lutador deve ser plano: ${sheet.key} (${sheet.path})`,
          );
          continue;
        }
        this.load.spritesheet(
          sheet.key,
          fighterAssetUrl(sheet.path),
          spriteSheetPreloadConfig(sheet),
        );
      }
    }
    this.load.bitmapFont(
      ASSET_MANIFEST.font.key,
      ASSET_MANIFEST.font.texturePath,
      ASSET_MANIFEST.font.dataPath,
    );

    this.load.on('progress', (progress: number) => {
      this.loadingFill?.setDisplaySize(Math.max(1, Math.round(272 * progress)), 8);
    });
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.loadFailures.add(file.key);
      console.error(`[Rua de Aço] Falha ao carregar asset: ${file.key} (${file.url})`);
    });
  }

  create(): void {
    const fighterAnimations = FIGHTER_SPRITE_ASSETS.flatMap((fighter) =>
      Object.values(fighter.animations));
    const fighterEffects = FIGHTER_SPRITE_ASSETS.flatMap((fighter) => fighter.effects);
    const fighterSheets = [...fighterAnimations, ...fighterEffects];
    const spriteKeys = fighterSheets.map((sheet) => sheet.key);
    const missingTextures = [...REQUIRED_TEXTURE_KEYS, ...spriteKeys]
      .filter((key) => !this.textures.exists(key));
    const fontMissing = !this.cache.bitmapFont.exists(ASSET_MANIFEST.font.key);
    if (fontMissing) missingTextures.push(ASSET_MANIFEST.font.key);
    for (const key of this.loadFailures) {
      if (!missingTextures.includes(key)) missingTextures.push(key);
    }

    const invalidSpriteSheets = [
      ...SPRITESHEET_ASSETS,
      ...fighterSheets,
    ].flatMap((asset) => this.validateLoadedSpriteSheet(asset));
    const manifestErrors = spriteSheetManifestErrors([
      ...SPRITESHEET_ASSETS,
      ...fighterSheets,
    ]).map((error) => `manifest: ${error}`);
    const animationErrors = fighterSheets.flatMap((asset) =>
      animatedSpriteSheetContractErrors(asset)
        .map((error) => `${asset.key}: ${error}`));

    if (
      missingTextures.length > 0
      || invalidSpriteSheets.length > 0
      || manifestErrors.length > 0
      || animationErrors.length > 0
    ) {
      for (const key of missingTextures) console.error(`[Rua de Aço] Textura obrigatória ausente: ${key}`);
      for (const error of invalidSpriteSheets) console.error(`[Rua de Aço] Spritesheet inválida: ${error}`);
      for (const error of manifestErrors) console.error(`[Rua de Aço] Manifest inválido: ${error}`);
      for (const error of animationErrors) console.error(`[Rua de Aço] Animação inválida: ${error}`);
      this.showDebugFailure([
        ...missingTextures,
        ...invalidSpriteSheets,
        ...manifestErrors,
        ...animationErrors,
      ]);
      return;
    }

    for (const animation of fighterSheets) this.registerPhaserAnimation(animation);

    const validatedTextures = REQUIRED_TEXTURE_KEYS.length + fighterSheets.length;
    console.info(`[Rua de Aço] ${validatedTextures} texturas visuais validadas.`);
    this.children.removeAll();
    this.add.image(INTERNAL_WIDTH / 2, 156, ASSET_MANIFEST.logo.key)
      .setDisplaySize(264, 198)
      .setOrigin(0.5);
    this.add.bitmapText(INTERNAL_WIDTH / 2, 290, ASSET_MANIFEST.font.key, 'ASSETS OK', 16)
      .setOrigin(0.5)
      .setTint(PALETTE.cyanLight);
    this.time.delayedCall(220, () => this.scene.start('MainMenuScene'));
  }

  private validateLoadedSpriteSheet(asset: SpriteSheetAsset): readonly string[] {
    if (!this.textures.exists(asset.key)) return [];

    const texture = this.textures.get(asset.key);
    const source = texture.getSourceImage();
    const errors = spriteSheetContractErrors(asset, {
      width: source.width,
      height: source.height,
    });
    const parsedFrames = texture.getFrameNames(false).length;
    const parserErrors = parsedFrames === asset.frames
      ? []
      : [`Phaser recortou ${parsedFrames} frames, esperados ${asset.frames}`];

    return [...errors, ...parserErrors].map((error) => `${asset.key}: ${error}`);
  }

  private registerPhaserAnimation(animation: AnimatedSpriteSheetAsset): void {
    const key = phaserAnimationKey(animation.key);
    if (this.anims.exists(key)) return;

    this.anims.create({
      key,
      frames: this.anims.generateFrameNumbers(animation.key, {
        start: 0,
        end: animation.frames - 1,
      }),
      frameRate: animation.frameRate,
      repeat: animation.repeat,
    });
  }

  private drawLoadingScreen(): void {
    this.add.rectangle(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, INTERNAL_WIDTH, INTERNAL_HEIGHT, PALETTE.ink);
    for (let y = 0; y < INTERNAL_HEIGHT; y += 8) {
      this.add.rectangle(INTERNAL_WIDTH / 2, y, INTERNAL_WIDTH, 2, PALETTE.black, 0.32).setOrigin(0.5, 0);
    }
    this.add.rectangle(INTERNAL_WIDTH / 2, 188, 288, 20, PALETTE.steelDark)
      .setStrokeStyle(2, PALETTE.steelLight);
    this.loadingFill = this.add.rectangle(180, 188, 1, 8, PALETTE.cyan)
      .setOrigin(0, 0.5);
  }

  private showDebugFailure(missing: readonly string[]): void {
    this.children.removeAll();
    this.add.rectangle(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, INTERNAL_WIDTH, INTERNAL_HEIGHT, PALETTE.ink);
    this.add.rectangle(INTERNAL_WIDTH / 2, 176, 608, 328, PALETTE.panel)
      .setStrokeStyle(4, PALETTE.danger);

    const addLine = (y: number, text: string, tint: number, size = 11): void => {
      this.add.text(24, y, text, {
        color: `#${tint.toString(16).padStart(6, '0')}`,
        fontFamily: 'Consolas, "Lucida Console", monospace',
        fontSize: `${size}px`,
      }).setResolution(2);
    };

    addLine(24, 'ERRO DE ASSET', PALETTE.danger, 16);
    missing.slice(0, 16).forEach((key, index) => addLine(56 + index * 16, `- ${key}`, PALETTE.ivory));
    addLine(328, 'CONSULTE O CONSOLE', PALETTE.gold);
  }
}
