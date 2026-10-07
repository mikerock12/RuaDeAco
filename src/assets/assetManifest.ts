import type { FighterId } from '../types/combat';
import type {
  AssetCrop,
  ImageAsset,
  PortraitAsset,
  PortraitUse,
  SpriteSheetAsset,
} from '../types/assets';

const portrait = (
  fighterId: FighterId,
  key: string,
  crops: Readonly<Record<PortraitUse, AssetCrop>>,
): PortraitAsset => ({
  fighterId,
  key,
  path: `assets/portraits/${fighterId}.png`,
  crops,
});

/**
 * Retratos de menu, seleção, HUD, versus e resultado (512 × 512), montados com
 * o próprio sprite em pixel art por scripts/faces/portraits.py. As antigas
 * fichas conceituais quase fotográficas foram aposentadas em 07/10/2026.
 * O Guto mantém o retrato aprovado, com contorno frio e flocos de gelo.
 */
export const CONCEPT_ASSETS: Readonly<Record<FighterId, PortraitAsset>> = {
  'rafa-mare': portrait('rafa-mare', 'rafaMareConcept', {
    hud: { x: 227, y: 128, width: 96, height: 108 },
    card: { x: 177, y: 118, width: 196, height: 150 },
    profile: { x: 167, y: 108, width: 216, height: 288 },
    hero: { x: 125, y: 96, width: 320, height: 400 },
  }),
  'noir-reflexo': portrait('noir-reflexo', 'noirReflexoConcept', {
    hud: { x: 225, y: 115, width: 96, height: 108 },
    card: { x: 175, y: 105, width: 196, height: 150 },
    profile: { x: 165, y: 95, width: 216, height: 288 },
    hero: { x: 123, y: 83, width: 320, height: 400 },
  }),
  'astro-riso': portrait('astro-riso', 'astroRisoConcept', {
    hud: { x: 235, y: 144, width: 96, height: 108 },
    card: { x: 185, y: 134, width: 196, height: 150 },
    profile: { x: 175, y: 124, width: 216, height: 288 },
    hero: { x: 133, y: 112, width: 320, height: 400 },
  }),
  'dante-sinal': portrait('dante-sinal', 'danteSinalConcept', {
    hud: { x: 235, y: 129, width: 96, height: 108 },
    card: { x: 185, y: 119, width: 196, height: 150 },
    profile: { x: 175, y: 109, width: 216, height: 288 },
    hero: { x: 133, y: 97, width: 320, height: 400 },
  }),
  'leo-violeta': portrait('leo-violeta', 'leoVioletaConcept', {
    hud: { x: 238, y: 121, width: 96, height: 108 },
    card: { x: 188, y: 111, width: 196, height: 150 },
    profile: { x: 178, y: 101, width: 216, height: 288 },
    hero: { x: 136, y: 89, width: 320, height: 400 },
  }),
  'guto-barba': {
    fighterId: 'guto-barba',
    key: 'gutoBarbaPortrait',
    path: 'assets/portraits/guto-barba.png',
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
  finisherMonster: {key:'caisFinisherMonsterV2',path:'assets/stages/cais-da-cidade/remaster/monster-finisher-v2.png',frameWidth:192,frameHeight:192,frames:12,layout:'horizontal'},
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
  // Arte pixel autoral (art-source/stages/cozinha-macabra/skull-bones.txt): sobra da finalização.
  skull: { key: 'kitchenSkull', path: 'assets/stages/cozinha-macabra/skull-bones.png' },
} satisfies Record<string, ImageAsset | SpriteSheetAsset>;

const sitio = {
  background: { key: 'sitioBackground', path: 'assets/stages/sitio/background.png' },
  hen: { key: 'sitioHen', path: 'assets/stages/sitio/hen.png', frameWidth: 64, frameHeight: 48, frames: 4, layout: 'horizontal' },
  duck: { key: 'sitioDuck', path: 'assets/stages/sitio/duck.png', frameWidth: 64, frameHeight: 48, frames: 4, layout: 'horizontal' },
  snake: { key: 'sitioSnake', path: 'assets/stages/sitio/snake.png', frameWidth: 64, frameHeight: 48, frames: 4, layout: 'horizontal' },
  lizard: { key: 'sitioLizard', path: 'assets/stages/sitio/lizard.png', frameWidth: 64, frameHeight: 48, frames: 4, layout: 'horizontal' },
  // Finalização: arte pixel autoral em art-source/stages/sitio-finisher (npm run assets:finisher).
  farmer: { key: 'sitioMaskedFarmer', path: 'assets/stages/sitio/masked-farmer.png', frameWidth: 32, frameHeight: 72, frames: 3, layout: 'horizontal' },
  trident: { key: 'sitioTrident', path: 'assets/stages/sitio/trident.png' },
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
  kitchen.background, kitchen.skull,
  sitio.background, sitio.trident,
  ...Object.values(ui),
];

export const SPRITESHEET_ASSETS: readonly SpriteSheetAsset[] = [caisRemaster.finisherMonster, caisRemaster.monster, caisRemaster.fire, caisRemaster.splash, kitchen.witch, kitchen.bat, kitchen.rat, sitio.hen, sitio.duck, sitio.snake, sitio.lizard, sitio.farmer];

export const REQUIRED_TEXTURE_KEYS: readonly string[] = [
  ...IMAGE_ASSETS.map((asset) => asset.key),
  ...SPRITESHEET_ASSETS.map((asset) => asset.key),
];
