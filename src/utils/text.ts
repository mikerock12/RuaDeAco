import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { PALETTE } from '../config/pixelArtConfig';
import {
  fitPixelText,
  pixelTextOrigin,
  pixelTextPadding,
  toPixelFontText,
  type PixelTextMeasure,
  type PixelTextOptions,
} from './textLayout';

export {
  fitPixelText,
  pixelTextOrigin,
  toPixelFontText,
  wrapPixelText,
  type PixelTextLayout,
  type PixelTextMeasure,
  type PixelTextOptions,
} from './textLayout';

export interface UiLayoutDebugEntry {
  readonly scene: string;
  readonly name: string;
  readonly kind: 'panel' | 'text';
  readonly nested: boolean;
  readonly visible: boolean;
  readonly panelName?: string;
  readonly padding: Readonly<{ x: number; y: number }>;
  readonly bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly text?: string;
  readonly fontSize?: number;
}

interface UiLayoutMetadata {
  readonly kind: 'panel' | 'text';
  readonly name: string;
  readonly panelName?: string;
  readonly padding: Readonly<{ x: number; y: number }>;
}

function tintFrom(color: string | number | undefined): number {
  if (typeof color === 'number') return color;
  if (!color) return PALETTE.ivory;
  return Phaser.Display.Color.HexStringToColor(color).color;
}

function setBitmapAlignment(
  bitmap: Phaser.GameObjects.BitmapText,
  align: NonNullable<PixelTextOptions['align']>,
): void {
  const origin = pixelTextOrigin(align);
  bitmap.setOrigin(origin.x, origin.y);
  if (align === 'center') bitmap.setCenterAlign();
  else if (align === 'right') bitmap.setRightAlign();
  else bitmap.setLeftAlign();
}

function attachResponsiveLayout(
  bitmap: Phaser.GameObjects.BitmapText,
  initialText: string,
  options: PixelTextOptions,
): void {
  const nativeSetText = bitmap.setText.bind(bitmap);
  const lineSpacing = Math.round(options.lineSpacing ?? 0);
  const measure: PixelTextMeasure = (candidate, size, spacing) => {
    bitmap.setFontSize(size);
    bitmap.setLineSpacing(spacing);
    nativeSetText(candidate);
    const bounds = bitmap.getTextBounds(true).local;
    return { width: bounds.width, height: bounds.height };
  };
  const apply = (value: string | string[]): void => {
    const source = Array.isArray(value) ? value.join('\n') : value;
    const layout = fitPixelText(source, options, measure);
    bitmap.setFontSize(layout.size);
    bitmap.setLineSpacing(lineSpacing);
    nativeSetText(layout.text);
    bitmap.setData('pixelTextLayout', layout);
  };

  bitmap.setText = ((value: string | string[]) => {
    apply(value);
    return bitmap;
  }) as typeof bitmap.setText;
  apply(initialText);
}

export function pixelText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  options: PixelTextOptions = {},
): Phaser.GameObjects.BitmapText {
  const align = options.align ?? 'left';
  const roundedX = Math.round(x);
  const roundedY = Math.round(y);
  const horizontalRoom = align === 'left'
    ? scene.scale.width - roundedX - 8
    : align === 'right'
      ? roundedX - 8
      : Math.min(roundedX, scene.scale.width - roundedX) * 2 - 16;
  const verticalRoom = Math.min(roundedY, scene.scale.height - roundedY) * 2 - 8;
  const inferredMaxWidth = roundedX > 0 && roundedX < scene.scale.width
    ? Math.max(8, Math.round(horizontalRoom))
    : undefined;
  const inferredMaxHeight = roundedY > 0 && roundedY < scene.scale.height
    ? Math.max(8, Math.round(verticalRoom))
    : undefined;
  const responsiveOptions: PixelTextOptions = {
    ...options,
    ...(options.maxWidth === undefined && inferredMaxWidth !== undefined
      ? { maxWidth: inferredMaxWidth }
      : {}),
    ...(options.maxHeight === undefined && inferredMaxHeight !== undefined
      ? { maxHeight: inferredMaxHeight }
      : {}),
  };
  const bitmap = scene.add.bitmapText(
    roundedX,
    roundedY,
    ASSET_MANIFEST.font.key,
    toPixelFontText(text),
    options.size ?? 16,
  );
  setBitmapAlignment(bitmap, align);
  bitmap.setTint(tintFrom(options.color));
  if (options.letterSpacing !== undefined) bitmap.setLetterSpacing(Math.round(options.letterSpacing));
  attachResponsiveLayout(bitmap, text, responsiveOptions);
  if (options.layoutName) {
    const metadata: UiLayoutMetadata = {
      kind: 'text',
      name: options.layoutName,
      padding: pixelTextPadding(responsiveOptions.padding),
      ...(options.panelName ? { panelName: options.panelName } : {}),
    };
    bitmap.setName(`ui-text:${options.layoutName}`).setData('uiLayout', metadata);
  }
  return bitmap;
}

export function tagLayoutPanel<
  T extends Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.GetBounds,
>(gameObject: T, name: string, padding: PixelTextOptions['padding'] = 0): T {
  const metadata: UiLayoutMetadata = {
    kind: 'panel',
    name,
    padding: pixelTextPadding(padding),
  };
  gameObject.setName(`ui-panel:${name}`).setData('uiLayout', metadata);
  return gameObject;
}

export function inspectUiLayout(scenes: readonly Phaser.Scene[]): readonly UiLayoutDebugEntry[] {
  const entries: UiLayoutDebugEntry[] = [];
  const effectivelyVisible = (gameObject: Phaser.GameObjects.GameObject): boolean => {
    let current: (Phaser.GameObjects.GameObject & { visible?: boolean }) | null = gameObject;
    while (current) {
      if (current.visible === false) return false;
      current = current.parentContainer;
    }
    return true;
  };
  for (const scene of scenes) {
    const visited = new Set<Phaser.GameObjects.GameObject>();
    const visit = (child: Phaser.GameObjects.GameObject): void => {
      if (visited.has(child)) return;
      visited.add(child);
      const metadata = child.getData('uiLayout') as UiLayoutMetadata | undefined;
      if (metadata && 'getBounds' in child && typeof child.getBounds === 'function') {
        const bounds = child.getBounds();
        const bitmap = child instanceof Phaser.GameObjects.BitmapText ? child : undefined;
        entries.push({
          scene: scene.scene.key,
          name: metadata.name,
          kind: metadata.kind,
          nested: child.parentContainer !== null,
          visible: effectivelyVisible(child),
          padding: metadata.padding,
          bounds: {
            x: Math.round(bounds.x),
            y: Math.round(bounds.y),
            width: Math.round(bounds.width),
            height: Math.round(bounds.height),
          },
          ...(metadata.panelName ? { panelName: metadata.panelName } : {}),
          ...(bitmap ? { text: bitmap.text, fontSize: bitmap.fontSize } : {}),
        });
      }
      if (child instanceof Phaser.GameObjects.Container) {
        for (const nested of child.list) visit(nested);
      }
    };
    for (const child of scene.children.list) {
      visit(child);
    }
  }
  return entries;
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
