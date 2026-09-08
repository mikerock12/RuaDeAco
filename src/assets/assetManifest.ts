import type { FighterId } from '../types/combat';
import type {
  AssetCrop,
  ImageAsset,
  PortraitAsset,
  PortraitUse,
  SpriteSheetAsset,
} from '../types/assets';

const concept = (
  fighterId: FighterId,
  key: string,
  file: string,
  crops: Readonly<Record<PortraitUse, AssetCrop>>,
): PortraitAsset => ({
  fighterId,
  key,
  path: `assets/references/${file}`,
  crops,
});

export const CONCEPT_ASSETS: Readonly<Record<FighterId, PortraitAsset>> = {
  'rafa-mare': concept('rafa-mare', 'rafaMareConcept', 'rafa-mare-concept.png', {
    hud: { x: 730, y: 35, width: 320, height: 360 },
    card: { x: 680, y: 40, width: 380, height: 290 },
    profile: { x: 700, y: 25, width: 330, height: 440 },
    hero: { x: 660, y: 20, width: 400, height: 500 },
  }),
  'noir-reflexo': concept('noir-reflexo', 'noirReflexoConcept', 'noir-reflexo-concept.png', {
    hud: { x: 720, y: 35, width: 330, height: 370 },
    card: { x: 675, y: 45, width: 390, height: 290 },
    profile: { x: 700, y: 25, width: 340, height: 450 },
    hero: { x: 655, y: 20, width: 410, height: 500 },
  }),
  'astro-riso': concept('astro-riso', 'astroRisoConcept', 'astro-riso-concept.png', {
    hud: { x: 705, y: 30, width: 300, height: 380 },
    card: { x: 690, y: 100, width: 340, height: 240 },
    profile: { x: 705, y: 20, width: 300, height: 400 },
    hero: { x: 690, y: 15, width: 340, height: 410 },
  }),
  'dante-sinal': concept('dante-sinal', 'danteSinalConcept', 'dante-sinal-concept.png', {
    hud: { x: 715, y: 35, width: 335, height: 375 },
    card: { x: 670, y: 45, width: 395, height: 290 },
    profile: { x: 695, y: 25, width: 345, height: 455 },
    hero: { x: 650, y: 20, width: 420, height: 505 },
  }),
  'leo-violeta': concept('leo-violeta', 'leoVioletaConcept', 'leo-violeta-concept.png', {
    hud: { x: 715, y: 35, width: 330, height: 370 },
    card: { x: 690, y: 145, width: 360, height: 250 },
    profile: { x: 695, y: 25, width: 345, height: 455 },
    hero: { x: 650, y: 20, width: 420, height: 505 },
  }),
  // Retrato oficial aprovado manualmente (1254x1254, moldura e letreiro embutidos);
  // a ficha conceitual guto-barba-concept.png segue em public/assets/references como referencia.
  'guto-barba': {
    fighterId: 'guto-barba',
    key: 'gutoBarbaPortrait',
    path: 'assets/references/guto-barba-portrait-final.png',
    crops: {
      hud: { x: 300, y: 110, width: 650, height: 730 },
      card: { x: 260, y: 220, width: 760, height: 530 },
      profile: { x: 300, y: 70, width: 630, height: 840 },
      hero: { x: 210, y: 55, width: 820, height: 970 },
    },
  },
};

const logo: ImageAsset = { key: 'ruaDeAcoLogo', path: 'assets/references/rua-de-aco-logo.png' };

const caisRemaster = {
  background: {key:'caisRemasterBackground',path:'assets/stages/cais-da-cidade/remaster/background.png'},
  moon: {key:'caisRemasterMoon',path:'assets/stages/cais-da-cidade/remaster/moon.png'},
  ufo: {key:'caisRemasterUfo',path:'assets/stages/cais-da-cidade/remaster/ufo.png'},
  witch: {key:'caisRemasterWitch',path:'assets/stages/cais-da-cidade/remaster/witch.png'},
  ship: {key:'caisRemasterShip',path:'assets/stages/cais-da-cidade/remaster/ship.png'},
  water0: {key:'caisRemasterWater0',path:'assets/stages/cais-da-cidade/remaster/water-0.png'},
  water1: {key:'caisRemasterWater1',path:'assets/stages/cais-da-cidade/remaster/water-1.png'},
  water2: {key:'caisRemasterWater2',path:'assets/stages/cais-da-cidade/remaster/water-2.png'},
  monster: {key:'caisRemasterMonster',path:'assets/stages/cais-da-cidade/remaster/monster.png',frameWidth:128,frameHeight:144,frames:4,layout:'horizontal'},
  fire: {key:'caisRemasterFire',path:'assets/stages/cais-da-cidade/remaster/fire.png',frameWidth:64,frameHeight:96,frames:4,layout:'horizontal'},
  splash: {key:'caisRemasterSplash',path:'assets/stages/cais-da-cidade/remaster/splash.png',frameWidth:112,frameHeight:48,frames:4,layout:'horizontal'},
} satisfies Record<string, ImageAsset | SpriteSheetAsset>;

const kitchen = {
  background: { key: 'kitchenBackground', path: 'assets/stages/cozinha-macabra/background.png' },
  witch: { key: 'kitchenWitch', path: 'assets/stages/cozinha-macabra/witch.png', frameWidth: 160, frameHeight: 160, frames: 4, layout: 'horizontal' },
  bat: { key: 'kitchenBat', path: 'assets/stages/cozinha-macabra/bat.png', frameWidth: 40, frameHeight: 32, frames: 4, layout: 'horizontal' },
  rat: { key: 'kitchenRat', path: 'assets/stages/cozinha-macabra/rat.png', frameWidth: 40, frameHeight: 24, frames: 4, layout: 'horizontal' },
} satisfies Record<string, ImageAsset | SpriteSheetAsset>;

const sitio = {
  background: { key: 'sitioBackground', path: 'assets/stages/sitio/background.png' },
  hen: { key: 'sitioHen', path: 'assets/stages/sitio/hen.png', frameWidth: 64, frameHeight: 48, frames: 4, layout: 'horizontal' },
  duck: { key: 'sitioDuck', path: 'assets/stages/sitio/duck.png', frameWidth: 64, frameHeight: 48, frames: 4, layout: 'horizontal' },
  snake: { key: 'sitioSnake', path: 'assets/stages/sitio/snake.png', frameWidth: 64, frameHeight: 48, frames: 4, layout: 'horizontal' },
  lizard: { key: 'sitioLizard', path: 'assets/stages/sitio/lizard.png', frameWidth: 64, frameHeight: 48, frames: 4, layout: 'horizontal' },
} satisfies Record<string, ImageAsset | SpriteSheetAsset>;

const ui = {
  panel: { key: 'uiPanel', path: 'assets/ui/panel.png' },
  button: { key: 'uiButton', path: 'assets/ui/button.png' },
  hudFrame: { key: 'uiHudFrame', path: 'assets/ui/hud-frame.png' },
  selectionFrame: { key: 'uiSelectionFrame', path: 'assets/ui/selection-frame.png' },
  missingAsset: { key: 'uiMissingAsset', path: 'assets/ui/missing-asset.png' },
} satisfies Record<string, ImageAsset>;

export const ASSET_MANIFEST = {
  concepts: CONCEPT_ASSETS,
  logo,
  font: {
    key: 'ruaPixel',
    texturePath: 'assets/fonts/rua-de-aco-pixel.png',
    dataPath: 'assets/fonts/rua-de-aco-pixel.xml',
  },
  caisRemaster,
  kitchen,
  sitio,
  ui,
} as const;

export const IMAGE_ASSETS: readonly ImageAsset[] = [
  ...Object.values(CONCEPT_ASSETS),
  logo,
  caisRemaster.background, caisRemaster.moon, caisRemaster.ufo, caisRemaster.witch, caisRemaster.ship,
  caisRemaster.water0, caisRemaster.water1, caisRemaster.water2,
  kitchen.background,
  sitio.background,
  ...Object.values(ui),
];

export const SPRITESHEET_ASSETS: readonly SpriteSheetAsset[] = [caisRemaster.monster, caisRemaster.fire, caisRemaster.splash, kitchen.witch, kitchen.bat, kitchen.rat, sitio.hen, sitio.duck, sitio.snake, sitio.lizard];

export const REQUIRED_TEXTURE_KEYS: readonly string[] = [
  ...IMAGE_ASSETS.map((asset) => asset.key),
  ...SPRITESHEET_ASSETS.map((asset) => asset.key),
];
