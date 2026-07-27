import type { AssetCrop, PortraitUse } from '../types/assets';

function greatestCommonDivisor(left: number, right: number): number {
  let first = Math.max(1, Math.round(Math.abs(left)));
  let second = Math.max(1, Math.round(Math.abs(right)));
  while (second !== 0) {
    const remainder = first % second;
    first = second;
    second = remainder;
  }
  return first;
}

export function fitPortraitCropToAspect(
  crop: AssetCrop,
  targetWidth: number,
  targetHeight: number,
): AssetCrop {
  const safeWidth = Math.max(1, Math.round(targetWidth));
  const safeHeight = Math.max(1, Math.round(targetHeight));
  const divisor = greatestCommonDivisor(safeWidth, safeHeight);
  const aspectWidth = safeWidth / divisor;
  const aspectHeight = safeHeight / divisor;
  const multiplier = Math.max(
    1,
    Math.floor(Math.min(crop.width / aspectWidth, crop.height / aspectHeight)),
  );
  const width = Math.min(crop.width, aspectWidth * multiplier);
  const height = Math.min(crop.height, aspectHeight * multiplier);
  return {
    x: Math.round(crop.x + (crop.width - width) / 2),
    y: Math.round(crop.y + (crop.height - height) / 2),
    width,
    height,
  };
}

export function portraitFrameKey(
  textureKey: string,
  use: PortraitUse,
  width: number,
  height: number,
): string {
  return `${textureKey}-${use}-${Math.max(1, Math.round(width))}x${Math.max(1, Math.round(height))}`;
}
