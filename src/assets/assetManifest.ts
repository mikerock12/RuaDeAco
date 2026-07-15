import type { FighterId } from '../types/combat';
import type { ImageAsset, PortraitAsset, SpriteSheetAsset } from '../types/assets';

const concept = (
  fighterId: FighterId,
  key: string,
  file: string,
  hudCrop: PortraitAsset['hudCrop'],
): PortraitAsset => ({
  fighterId,
  key,
  path: `assets/references/${file}`,
  hudCrop,
  // Altura termina antes do letreiro embutido na ficha conceitual,
  // evitando texto cortado nos retratos.
  framedCrop: { x: 600, y: 30, width: 480, height: 520 },
});

export const CONCEPT_ASSETS: Readonly<Record<FighterId, PortraitAsset>> = {
  'rafa-mare': concept('rafa-mare', 'rafaMareConcept', 'rafa-mare-concept.png', { x: 630, y: 55, width: 430, height: 430 }),
  'noir-reflexo': concept('noir-reflexo', 'noirReflexoConcept', 'noir-reflexo-concept.png', { x: 630, y: 45, width: 430, height: 430 }),
  'astro-riso': concept('astro-riso', 'astroRisoConcept', 'astro-riso-concept.png', { x: 635, y: 55, width: 420, height: 420 }),
  'dante-sinal': concept('dante-sinal', 'danteSinalConcept', 'dante-sinal-concept.png', { x: 620, y: 50, width: 440, height: 440 }),
  'leo-violeta': concept('leo-violeta', 'leoVioletaConcept', 'leo-violeta-concept.png', { x: 630, y: 50, width: 430, height: 430 }),
  // Retrato oficial aprovado manualmente (1254x1254, moldura e letreiro embutidos);
  // a ficha conceitual guto-barba-concept.png segue em public/assets/references como referencia.
  'guto-barba': {
    fighterId: 'guto-barba',
    key: 'gutoBarbaPortrait',
    path: 'assets/references/guto-barba-portrait-final.png',
    hudCrop: { x: 270, y: 70, width: 720, height: 880 },
    framedCrop: { x: 0, y: 0, width: 1254, height: 1254 },
  },
};

const logo: ImageAsset = { key: 'ruaDeAcoLogo', path: 'assets/references/rua-de-aco-logo.png' };

const stage = {
  far: { key: 'caisFar', path: 'assets/stages/cais-da-cidade/far.png' },
  mid: { key: 'caisMid', path: 'assets/stages/cais-da-cidade/mid.png' },
  water: { key: 'caisWater', path: 'assets/stages/cais-da-cidade/water.png', frameWidth: 320, frameHeight: 180 },
  foreground: { key: 'caisForeground', path: 'assets/stages/cais-da-cidade/foreground.png' },
} satisfies Record<string, ImageAsset | SpriteSheetAsset>;

const ui = {
  panel: { key: 'uiPanel', path: 'assets/ui/panel.png' },
  button: { key: 'uiButton', path: 'assets/ui/button.png' },
  hudFrame: { key: 'uiHudFrame', path: 'assets/ui/hud-frame.png' },
  selectionFrame: { key: 'uiSelectionFrame', path: 'assets/ui/selection-frame.png' },
  missingAsset: { key: 'uiMissingAsset', path: 'assets/ui/missing-asset.png' },
} satisfies Record<string, ImageAsset>;

const effects = {
  wave: { key: 'effectWave', path: 'assets/effects/wave.png', frameWidth: 32, frameHeight: 16 },
  ice: { key: 'effectIce', path: 'assets/effects/ice.png', frameWidth: 32, frameHeight: 32 },
} satisfies Record<string, SpriteSheetAsset>;

export const ASSET_MANIFEST = {
  concepts: CONCEPT_ASSETS,
  logo,
  font: {
    key: 'ruaPixel',
    texturePath: 'assets/fonts/rua-de-aco-pixel.png',
    dataPath: 'assets/fonts/rua-de-aco-pixel.xml',
  },
  stage,
  ui,
  effects,
} as const;

export const IMAGE_ASSETS: readonly ImageAsset[] = [
  ...Object.values(CONCEPT_ASSETS),
  logo,
  stage.far,
  stage.mid,
  stage.foreground,
  ...Object.values(ui),
];

export const SPRITESHEET_ASSETS: readonly SpriteSheetAsset[] = [stage.water, effects.wave, effects.ice];

export const REQUIRED_TEXTURE_KEYS: readonly string[] = [
  ...IMAGE_ASSETS.map((asset) => asset.key),
  ...SPRITESHEET_ASSETS.map((asset) => asset.key),
];
