import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONCEPT_ASSETS } from '../../assets/assetManifest';
import type { PortraitUse } from '../../types/assets';
import {
  fitPortraitCropToAspect,
  portraitFrameKey,
} from '../portraitLayout';

const TARGETS: Readonly<Record<PortraitUse, readonly [number, number]>> = {
  hud: [34, 38],
  card: [92, 64],
  profile: [72, 96],
  hero: [224, 264],
};

function dimensions(path: string): readonly [number, number] {
  const png = readFileSync(resolve(process.cwd(), 'public', path));
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

describe('recortes semânticos de retrato', () => {
  it('mantém os quatro usos dos seis lutadores dentro da imagem fonte', () => {
    for (const asset of Object.values(CONCEPT_ASSETS)) {
      const [sourceWidth, sourceHeight] = dimensions(asset.path);
      for (const use of Object.keys(TARGETS) as PortraitUse[]) {
        const crop = asset.crops[use];
        expect(crop.width, `${asset.fighterId}/${use}`).toBeGreaterThan(0);
        expect(crop.height, `${asset.fighterId}/${use}`).toBeGreaterThan(0);
        expect(crop.x, `${asset.fighterId}/${use}`).toBeGreaterThanOrEqual(0);
        expect(crop.y, `${asset.fighterId}/${use}`).toBeGreaterThanOrEqual(0);
        expect(crop.x + crop.width, `${asset.fighterId}/${use}`).toBeLessThanOrEqual(sourceWidth);
        expect(crop.y + crop.height, `${asset.fighterId}/${use}`).toBeLessThanOrEqual(sourceHeight);
      }
    }
  });

  it('preenche o destino sem barras e sem sair do recorte-base', () => {
    for (const asset of Object.values(CONCEPT_ASSETS)) {
      for (const use of Object.keys(TARGETS) as PortraitUse[]) {
        const [width, height] = TARGETS[use];
        const base = asset.crops[use];
        const fitted = fitPortraitCropToAspect(base, width, height);
        expect(fitted.width / fitted.height, `${asset.fighterId}/${use}`)
          .toBeCloseTo(width / height, 10);
        expect(fitted.x).toBeGreaterThanOrEqual(base.x);
        expect(fitted.y).toBeGreaterThanOrEqual(base.y);
        expect(fitted.x + fitted.width).toBeLessThanOrEqual(base.x + base.width);
        expect(fitted.y + fitted.height).toBeLessThanOrEqual(base.y + base.height);
      }
    }
  });

  it('gera frame keys únicas por personagem, uso e tamanho', () => {
    const keys = Object.values(CONCEPT_ASSETS).flatMap((asset) =>
      (Object.keys(TARGETS) as PortraitUse[]).map((use) => {
        const [width, height] = TARGETS[use];
        return portraitFrameKey(asset.key, use, width, height);
      }));
    expect(new Set(keys).size).toBe(24);
  });

  it('repete cálculo e frame keys sem acumular variantes duplicadas', () => {
    const frames = new Set<string>();
    for (let repetition = 0; repetition < 20; repetition += 1) {
      for (const asset of Object.values(CONCEPT_ASSETS)) {
        for (const use of Object.keys(TARGETS) as PortraitUse[]) {
          const [width, height] = TARGETS[use];
          frames.add(portraitFrameKey(asset.key, use, width, height));
          expect(fitPortraitCropToAspect(asset.crops[use], width, height).width).toBeGreaterThan(0);
        }
      }
    }
    expect(frames.size).toBe(24);

    const source = readFileSync(resolve(process.cwd(), 'src/ui/PortraitView.ts'), 'utf8');
    expect(source).not.toContain('createGeometryMask');
    expect(source).not.toContain('.setMask(');
  });

  it('usa os modos corretos em HUD, cards, ficha, VS e resultado', () => {
    const ui = readFileSync(resolve(process.cwd(), 'src/scenes/UIScene.ts'), 'utf8');
    const main = readFileSync(resolve(process.cwd(), 'src/scenes/MainMenuScene.ts'), 'utf8');
    const select = readFileSync(resolve(process.cwd(), 'src/scenes/CharacterSelectScene.ts'), 'utf8');
    const result = readFileSync(resolve(process.cwd(), 'src/scenes/ResultScene.ts'), 'utf8');
    expect(ui).toContain("crop: 'hud'");
    expect(main).toContain("crop: 'card'");
    expect(select).toContain("crop: 'card'");
    expect(select).toContain("crop: 'profile'");
    expect(select).toContain("crop: 'hero'");
    expect(result).toContain("crop: 'hero'");
    expect(result).toContain("crop: 'profile'");
    expect([ui, main, select, result].join('\n')).not.toContain("crop: 'framed'");
  });
});
