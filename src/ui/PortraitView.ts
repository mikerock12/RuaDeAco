import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, PALETTE } from '../config/pixelArtConfig';
import type { FighterId } from '../types/combat';
import type { AssetCrop, PortraitUse } from '../types/assets';
import { pixelText } from '../utils/text';
import { fitPortraitCropToAspect, portraitFrameKey } from './portraitLayout';

export { fitPortraitCropToAspect, portraitFrameKey } from './portraitLayout';

export interface ConceptPortraitOptions {
  readonly crop?: PortraitUse;
  readonly locked?: boolean;
  readonly frameColor?: number;
}

export interface PortraitDebugEntry {
  readonly scene: string;
  readonly fighterId: FighterId;
  readonly use: PortraitUse;
  readonly width: number;
  readonly height: number;
  readonly frameKey: string;
}

interface PortraitDebugMetadata {
  readonly fighterId: FighterId;
  readonly use: PortraitUse;
  readonly width: number;
  readonly height: number;
  readonly frameKey: string;
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
  const mode = options.crop ?? 'hud';
  const children: Phaser.GameObjects.GameObject[] = [];
  const outerWidth = Math.max(1, Math.round(width));
  const outerHeight = Math.max(1, Math.round(height));
  const innerWidth = Math.max(1, outerWidth - 8);
  const innerHeight = Math.max(1, outerHeight - 8);

  const backing = scene.add.rectangle(0, 0, outerWidth, outerHeight, PALETTE.black)
    .setStrokeStyle(2, frameColor);
  children.push(backing);

  if (scene.textures.exists(asset.key)) {
    const crop = fitPortraitCropToAspect(asset.crops[mode], innerWidth, innerHeight);
    const frame = cropFrame(
      scene,
      asset.key,
      portraitFrameKey(asset.key, mode, innerWidth, innerHeight),
      crop,
    );
    const portrait = scene.add.image(0, 0, asset.key, frame);
    portrait.setDisplaySize(innerWidth, innerHeight).setOrigin(0.5);
    children.push(portrait);
  } else {
    const missingKey = ASSET_MANIFEST.ui.missingAsset.key;
    if (scene.textures.exists(missingKey)) {
      const missing = scene.add.image(0, 0, missingKey);
      children.push(missing.setDisplaySize(innerWidth, innerHeight));
    } else {
      children.push(pixelText(scene, 0, 0, 'ASSET\nAUSENTE', {
        size: 12,
        minSize: 8,
        maxWidth: innerWidth,
        maxHeight: innerHeight,
        color: PALETTE.danger,
        align: 'center',
      }));
    }
    console.error(`[Rua de Aço] Retrato conceitual ausente no cache: ${asset.key}`);
  }

  if (options.locked) {
    children.push(scene.add.rectangle(0, 0, outerWidth - 4, outerHeight - 4, PALETTE.black, 0.58));
    children.push(pixelText(scene, 0, 0, 'EM DEV', {
      size: 12,
      minSize: 8,
      maxWidth: innerWidth,
      maxHeight: innerHeight,
      padding: 4,
      color: PALETTE.gold,
      align: 'center',
    }));
  }

  const frameKey = portraitFrameKey(asset.key, mode, innerWidth, innerHeight);
  const metadata: PortraitDebugMetadata = {
    fighterId,
    use: mode,
    width: outerWidth,
    height: outerHeight,
    frameKey,
  };
  return scene.add.container(Math.round(x), Math.round(y), children)
    .setName(`portrait:${fighterId}:${mode}`)
    .setData('portraitDebug', metadata);
}

export function inspectPortraits(scenes: readonly Phaser.Scene[]): readonly PortraitDebugEntry[] {
  const entries: PortraitDebugEntry[] = [];
  const visited = new Set<Phaser.GameObjects.GameObject>();
  const visit = (scene: Phaser.Scene, child: Phaser.GameObjects.GameObject): void => {
    if (visited.has(child)) return;
    visited.add(child);
    const metadata = child.getData('portraitDebug') as PortraitDebugMetadata | undefined;
    if (metadata) entries.push({ scene: scene.scene.key, ...metadata });
    if (child instanceof Phaser.GameObjects.Container) {
      for (const nested of child.list) visit(scene, nested);
    }
  };
  for (const scene of scenes) {
    for (const child of scene.children.list) visit(scene, child);
  }
  return entries;
}

export function createPortraitAuditGallery(
  scene: Phaser.Scene,
  use: PortraitUse,
): Phaser.GameObjects.Container {
  const root = scene.add.container(0, 0).setDepth(10_000);
  root.add(scene.add.rectangle(
    INTERNAL_WIDTH / 2,
    INTERNAL_HEIGHT / 2,
    INTERNAL_WIDTH,
    INTERNAL_HEIGHT,
    PALETTE.black,
    0.98,
  ));
  root.add(pixelText(scene, INTERNAL_WIDTH / 2, 22, `PORTRAITS ${use.toUpperCase()}`, {
    size: 16,
    maxWidth: 500,
    maxHeight: 24,
    align: 'center',
  }).setTint(PALETTE.gold));

  const dimensions: Readonly<Record<PortraitUse, readonly [number, number]>> = {
    hud: [68, 76],
    card: [92, 64],
    profile: [72, 96],
    hero: [90, 108],
  };
  const [width, height] = dimensions[use];
  const fighterIds = Object.keys(ASSET_MANIFEST.concepts) as FighterId[];
  fighterIds.forEach((fighterId, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = 110 + column * 210;
    const y = 100 + row * 150;
    root.add(createConceptPortrait(scene, x, y, fighterId, width, height, {
      crop: use,
      frameColor: PALETTE.steelLight,
    }));
    root.add(pixelText(scene, x, y + height / 2 + 14, fighterId.toUpperCase(), {
      size: 8,
      maxWidth: 160,
      maxHeight: 14,
      align: 'center',
    }).setTint(PALETTE.ivory));
  });
  return root;
}
