import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { PALETTE } from '../config/pixelArtConfig';

export interface PixelTextOptions {
  readonly size?: number;
  readonly color?: string | number;
  readonly align?: 'left' | 'center' | 'right';
  readonly stroke?: string;
  readonly strokeThickness?: number;
  readonly letterSpacing?: number;
}

function tintFrom(color: string | number | undefined): number {
  if (typeof color === 'number') return color;
  if (!color) return PALETTE.ivory;
  return Phaser.Display.Color.HexStringToColor(color).color;
}

export function pixelText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  options: PixelTextOptions = {},
): Phaser.GameObjects.BitmapText {
  const align = options.align ?? 'left';
  const bitmap = scene.add.bitmapText(
    Math.round(x),
    Math.round(y),
    ASSET_MANIFEST.font.key,
    text,
    options.size ?? 8,
  );
  bitmap
    .setOrigin(align === 'center' ? 0.5 : align === 'right' ? 1 : 0, 0.5)
    .setTint(tintFrom(options.color));
  if (options.letterSpacing !== undefined) bitmap.setLetterSpacing(Math.round(options.letterSpacing));
  return bitmap;
}

export function makeInteractiveText(
  label: Phaser.GameObjects.BitmapText,
  onActivate: () => void,
): Phaser.GameObjects.BitmapText {
  label.setInteractive({ useHandCursor: true });
  label.on('pointerover', () => label.setTint(PALETTE.cyanLight));
  label.on('pointerout', () => label.setTint(PALETTE.ivory));
  label.on('pointerdown', () => label.setPosition(label.x + 1, label.y + 1));
  label.on('pointerup', () => {
    label.setPosition(label.x - 1, label.y - 1);
    onActivate();
  });
  return label;
}
