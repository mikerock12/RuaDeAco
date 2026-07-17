import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSET_MANIFEST, CONCEPT_ASSETS, IMAGE_ASSETS, SPRITESHEET_ASSETS } from '../assetManifest';
import { FIGHTER_SPRITE_ASSETS } from '../../fighters/visual';
import { STANDARD_ANIMATIONS } from '../../fighters/shared';
import { isFlatFighterAssetPath } from '../spriteSheetContract';

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
      'gutoBarbaPortrait',
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
        [...Object.values(fighter.animations), ...fighter.effects].map((sheet) => sheet.path)),
    ];
    expect(files.filter((path) => !existsSync(publicAsset(path)))).toEqual([]);
  });

  it('não mantém os efeitos genéricos legados no public/precache', () => {
    expect(existsSync(publicAsset('assets/effects/wave.png'))).toBe(false);
    expect(existsSync(publicAsset('assets/effects/ice.png'))).toBe(false);
  });

  it('mantém todos os sheets horizontais no padrão real por lutador', () => {
    const expectedFrameSize: Record<string, number> = {
      'rafa-mare': 256,
      'astro-riso': 256,
      'guto-barba': 288,
    };
    for (const fighter of FIGHTER_SPRITE_ASSETS) {
      const frameSize = expectedFrameSize[fighter.fighterId] ?? 0;
      expect(frameSize).toBeGreaterThan(0);
      const sheets = [...Object.values(fighter.animations), ...fighter.effects];
      for (const sheet of sheets) {
        expect(sheet.layout).toBe('horizontal');
        expect(sheet.frameWidth).toBe(frameSize);
        expect(sheet.frameHeight).toBe(frameSize);
        expect(sheet.frames).toBe(4);
        expect(Number.isFinite(sheet.frameRate)).toBe(true);
        expect(sheet.frameRate).toBeGreaterThan(0);
        expect(Number.isInteger(sheet.repeat)).toBe(true);
        expect(isFlatFighterAssetPath(sheet, fighter.fighterId)).toBe(true);
        if (!existsSync(publicAsset(sheet.path))) continue;
        expect(pngDimensions(publicAsset(sheet.path))).toEqual([frameSize * sheet.frames, frameSize]);
      }
    }
  });

  it('não mantém contagens antigas de frames nas fighter definitions', () => {
    expect(STANDARD_ANIMATIONS.map(({ frames }) => frames)).toEqual(
      STANDARD_ANIMATIONS.map(() => 4),
    );
  });

  it('registra a lista plana completa dos lutadores disponíveis sem agregados antigos', () => {
    const rafa = FIGHTER_SPRITE_ASSETS.find(({ fighterId }) => fighterId === 'rafa-mare');
    const astro = FIGHTER_SPRITE_ASSETS.find(({ fighterId }) => fighterId === 'astro-riso');
    const guto = FIGHTER_SPRITE_ASSETS.find(({ fighterId }) => fighterId === 'guto-barba');
    expect(rafa).toBeDefined();
    expect(astro).toBeDefined();
    expect(guto).toBeDefined();

    const common = [
      'idle.png', 'corrida.png', 'walk-backward.png', 'crouch.png',
      'jump-neutral.png', 'jump-forward.png', 'jump-backward.png', 'fall.png', 'landing.png',
      'standing-light.png', 'standing-heavy.png', 'forward-light.png', 'forward-heavy.png',
      'crouch-light.png', 'crouch-heavy.png',
      'air-light-neutral.png', 'air-heavy-neutral.png',
      'air-light-forward.png', 'air-heavy-forward.png',
      'air-light-backward.png', 'air-heavy-backward.png',
      'block-standing.png', 'block-crouching.png', 'hit.png', 'knockdown.png', 'wake-up.png',
      'grabbed-front.png', 'grabbed-lifted.png', 'thrown.png', 'frozen.png',
      'victory.png', 'knockout.png',
    ];
    const names = (fighter: NonNullable<typeof rafa>): string[] =>
      [...Object.values(fighter.animations), ...fighter.effects]
        .map(({ path }) => basename(path))
        .sort();

    expect(names(rafa!)).toEqual([
      ...common,
      'mao-da-mare.png', 'mao-da-mare-effect.png',
      'chute-da-ressaca.png', 'chute-da-ressaca-effect.png',
      'eco-tatuado.png', 'eco-tatuado-effect.png',
    ].sort());
    expect(names(astro!)).toEqual([
      ...common,
      'sorriso-relampago.png', 'sorriso-relampago-effect.png',
      'rajada-neon.png', 'rajada-neon-effect.png',
      'astro-giro.png', 'astro-giro-effect.png',
    ].sort());
    expect(names(guto!)).toEqual([
      ...common,
      'muralha-norte.png', 'muralha-norte-effect.png',
      'gancho-do-urso-startup.png', 'gancho-do-urso-grab.png',
      'gancho-do-urso-hold.png', 'gancho-do-urso-throw.png',
      'gancho-do-urso-recovery.png',
      'abraco-glacial-startup.png', 'abraco-glacial-grab.png',
      'abraco-glacial-hold.png', 'abraco-glacial-freeze.png',
      'abraco-glacial-finish.png', 'abraco-glacial-effect.png',
    ].sort());

    expect(names(guto!)).not.toContain('gancho-do-urso.png');
    expect(names(guto!)).not.toContain('abraco-glacial.png');
  });

  it('não reutiliza chaves nem caminhos no manifest de luta', () => {
    const sheets = FIGHTER_SPRITE_ASSETS.flatMap((fighter) => [
      ...Object.values(fighter.animations),
      ...fighter.effects,
    ]);
    expect(new Set(sheets.map(({ key }) => key)).size).toBe(sheets.length);
    expect(new Set(sheets.map(({ path }) => path)).size).toBe(sheets.length);
  });

  it('inclui todos os lutadores raster no versionamento de cache do PWA', () => {
    const viteConfig = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    for (const fighter of FIGHTER_SPRITE_ASSETS) {
      expect(viteConfig, fighter.fighterId).toContain(fighter.fighterId);
    }
  });

  it('cobre Gancho e Abraço com fases contíguas sem sprites agregados', () => {
    const guto = FIGHTER_SPRITE_ASSETS.find(({ fighterId }) => fighterId === 'guto-barba');
    expect(guto?.movePhases.ganchoUrso).toEqual([
      { animation: 'special2', range: { from: 0, to: 8 } },
      { animation: 'special2Grab', range: { from: 9, to: 12 } },
      { animation: 'special2Hold', range: { from: 13, to: 26 } },
      { animation: 'special2Throw', range: { from: 27, to: 32 } },
      { animation: 'special2Recovery', range: { from: 33, to: 42 } },
    ]);
    expect(guto?.movePhases.abracoGlacial).toEqual([
      { animation: 'special3', range: { from: 0, to: 14 } },
      { animation: 'special3Grab', range: { from: 15, to: 19 } },
      { animation: 'special3Hold', range: { from: 20, to: 34 } },
      { animation: 'special3Freeze', range: { from: 35, to: 79 } },
      { animation: 'special3Finish', range: { from: 80, to: 93 } },
    ]);
  });
});
