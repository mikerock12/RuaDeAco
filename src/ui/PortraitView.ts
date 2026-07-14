import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { PALETTE } from '../config/pixelArtConfig';
import type { FighterId } from '../types/combat';
import type { AssetCrop } from '../types/assets';
import { pixelText } from '../utils/text';

export interface ConceptPortraitOptions {
  readonly crop?: 'hud' | 'framed' | 'full';
  readonly locked?: boolean;
  readonly frameColor?: number;
}

function cropFrame(
  scene: Phaser.Scene,
  textureKey: string,
  frameName: string,
  crop: AssetCrop,
): string {
  const texture = scene.textures.get(textureKey);
  if (!texture.has(frameName)) {
    texture.add(frameName, 0, crop.x, crop.y, crop.width, crop.height);
  }
  return frameName;
}

export function createConceptPortrait(
  scene: Phaser.Scene,
  x: number,
  y: number,
  fighterId: FighterId,
  width: number,
  height: number,
  options: ConceptPortraitOptions = {},
): Phaser.GameObjects.Container {
  const asset = ASSET_MANIFEST.concepts[fighterId];
  const frameColor = options.frameColor ?? PALETTE.steelLight;
  const children: Phaser.GameObjects.GameObject[] = [];

  const backing = scene.add.rectangle(0, 0, Math.round(width), Math.round(height), PALETTE.black)
    .setStrokeStyle(1, frameColor);
  children.push(backing);

  if (scene.textures.exists(asset.key)) {
    const mode = options.crop ?? 'hud';
    let frame: string | undefined;
    if (mode !== 'full') {
      const crop = mode === 'hud' ? asset.hudCrop : asset.framedCrop;
      frame = cropFrame(scene, asset.key, `${asset.key}-${mode}`, crop);
    }
    const portrait = frame
      ? scene.add.image(0, 0, asset.key, frame)
      : scene.add.image(0, 0, asset.key);
    const innerWidth = Math.max(1, Math.round(width) - 4);
    const innerHeight = Math.max(1, Math.round(height) - 4);
    const scale = Math.min(innerWidth / portrait.width, innerHeight / portrait.height);
    portrait.setScale(scale).setOrigin(0.5);
    children.push(portrait);
  } else {
    const missingKey = ASSET_MANIFEST.ui.missingAsset.key;
    if (scene.textures.exists(missingKey)) {
      const missing = scene.add.image(0, 0, missingKey);
      const scale = Math.min((width - 4) / missing.width, (height - 4) / missing.height);
      children.push(missing.setScale(scale));
    } else {
      children.push(pixelText(scene, 0, 0, 'ASSET\nAUSENTE', { size: 6, color: PALETTE.danger, align: 'center' }));
    }
    console.error(`[Rua de Aço] Retrato conceitual ausente no cache: ${asset.key}`);
  }

  if (options.locked) {
    children.push(scene.add.rectangle(0, 0, Math.round(width) - 2, Math.round(height) - 2, PALETTE.black, 0.58));
    children.push(pixelText(scene, 0, 0, 'EM DEV', { size: 6, color: PALETTE.gold, align: 'center' }));
  }

  return scene.add.container(Math.round(x), Math.round(y), children);
}
