import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSET_MANIFEST, CONCEPT_ASSETS, IMAGE_ASSETS, SPRITESHEET_ASSETS } from '../assetManifest';
import { FIGHTER_SPRITE_ASSETS } from '../../fighters/visual';

function publicAsset(path: string): string {
  return resolve(process.cwd(), 'public', path);
}

function pngDimensions(path: string): readonly [number, number] {
  const data = readFileSync(path);
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

describe('assetManifest', () => {
  it('declara os seis conceitos com chaves únicas e o logo correto', () => {
    expect(Object.values(CONCEPT_ASSETS).map((asset) => asset.key)).toEqual([
      'rafaMareConcept',
      'noirReflexoConcept',
      'astroRisoConcept',
      'danteSinalConcept',
      'leoVioletaConcept',
      'gutoBarbaConcept',
    ]);
    expect(ASSET_MANIFEST.logo.key).toBe('ruaDeAcoLogo');
    expect(new Set(Object.values(CONCEPT_ASSETS).map((asset) => asset.key)).size).toBe(6);
  });

  it('aponta somente para arquivos presentes em public', () => {
    const files = [
      ...IMAGE_ASSETS.map((asset) => asset.path),
      ...SPRITESHEET_ASSETS.map((asset) => asset.path),
      ASSET_MANIFEST.font.texturePath,
      ASSET_MANIFEST.font.dataPath,
      ...FIGHTER_SPRITE_ASSETS.flatMap((fighter) =>
        Object.values(fighter.animations).map((animation) => animation.path)),
    ];
    expect(files.filter((path) => !existsSync(publicAsset(path)))).toEqual([]);
  });

  it('mantém todas as animações de luta em frames 96x96', () => {
    for (const fighter of FIGHTER_SPRITE_ASSETS) {
      for (const animation of Object.values(fighter.animations)) {
        expect(animation.frameWidth).toBe(96);
        expect(animation.frameHeight).toBe(96);
        expect(pngDimensions(publicAsset(animation.path))).toEqual([384, 96]);
      }
    }
  });
});
