import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { pixelText } from '../utils/text';

export const UI_THEME = {
  panel: 0x071422, selected: 0x112d40, border: 0x315369,
  cyan: 0x65ddeb, gold: 0xffd269, text: 0xe4f1f2, muted: 0x9ab6c6, danger: 0xf27498,
} as const;

export function drawRemasterBackdrop(scene: Phaser.Scene, shade = 0.18): void {
  const art = ASSET_MANIFEST.caisRemaster;
  scene.add.image(320, 180, art.background.key);
  scene.add.image(542, 90, art.moon.key).setScale(0.8);
  scene.add.rectangle(320, 180, 640, 360, 0x040c18, shade);
}

export function uiPanel(scene: Phaser.Scene, x: number, y: number, width: number, height: number, color: number = UI_THEME.border): Phaser.GameObjects.Rectangle {
  return scene.add.rectangle(x, y, width, height, UI_THEME.panel, 0.86).setStrokeStyle(1, color, 0.9);
}

export function panelCorners(scene: Phaser.Scene, x: number, y: number, width: number, height: number, color: number = UI_THEME.cyan): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().lineStyle(1, color, 0.9);
  const left = x - width / 2, right = x + width / 2, top = y - height / 2, bottom = y + height / 2;
  for (const [px, py, dx, dy] of [[left, top, 1, 1], [right, top, -1, 1], [left, bottom, 1, -1], [right, bottom, -1, -1]] as const) {
    g.lineBetween(px, py + dy * 8, px, py).lineBetween(px, py, px + dx * 14, py);
  }
  return g;
}

export function focusPanel(panel: Phaser.GameObjects.Rectangle, selected: boolean, primary = false): void {
  panel.setFillStyle(selected ? UI_THEME.selected : UI_THEME.panel, selected ? 0.95 : 0.82)
    .setStrokeStyle(selected ? 2 : 1, selected ? primary ? UI_THEME.gold : UI_THEME.cyan : UI_THEME.border);
}

export function sectionTitle(scene: Phaser.Scene, title: string, y = 28, width = 350): Phaser.GameObjects.BitmapText {
  scene.add.rectangle(320 - width / 2 - 17, y, 24, 1, UI_THEME.cyan, 0.8);
  scene.add.rectangle(320 + width / 2 + 17, y, 24, 1, UI_THEME.cyan, 0.8);
  return pixelText(scene, 320, y, title, { size: 20, minSize: 16, maxWidth: width, maxHeight: 24, align: 'center', color: UI_THEME.gold, layoutName: scene.scene.key + '-heading' });
}

const ICONS = {
  person: ['0011100','0011100','0001000','0111110','1111111','1101011','1101011'],
  group: ['0110110','0110110','0000000','1111111','1111111','1011101','1011101'],
  gamepad: ['0000000','0111110','1100011','1110101','1101011','1100011','0100010'],
  online: ['0011100','0101010','1001001','1111111','1001001','0101010','0011100'],
  gear: ['0101010','0011100','1111111','0110110','1111111','0011100','0101010'],
  screen: ['1111111','1000001','1000001','1000001','1111111','0001000','0011100'],
  volume: ['0001000','0011001','1111010','1111011','1111010','0011001','0001000'],
  music: ['0011111','0010001','0010001','0010001','1110111','1110111','0000000'],
  effects: ['0000001','0000101','0010101','0010101','1010101','1010101','1010101'],
  mute: ['0001000','0011000','1111001','1111010','1111001','0011000','0001000'],
  skull: ['0111110','1100011','1010101','1010101','1101011','0111110','0010100'],
  touch: ['0010000','0010000','0011100','0011110','1111110','0111110','0011100'],
  eye: ['0000000','0011100','0100010','1011101','0100010','0011100','0000000'],
  left: ['0001000','0011000','0111111','1111111','0111111','0011000','0001000'],
  right: ['0001000','0001100','1111110','1111111','1111110','0001100','0001000'],
  up: ['0001000','0011100','0111110','1111111','0011100','0011100','0011100'],
  down: ['0011100','0011100','0011100','1111111','0111110','0011100','0001000'],
  light: ['0001100','0111100','1111110','1111110','1111100','0111000','0010000'],
  heavy: ['0001110','0111110','1111111','1111111','1111110','0111100','0011000'],
  special: ['0001000','0101010','0011100','1111111','0011100','0101010','0001000'],
  block: ['0111110','1111111','1101011','1101011','0111110','0011100','0001000'],
  reset: ['0011100','0100010','1100001','1110001','0000001','0100010','0011100'],
  back: ['0010000','0110000','1111110','0110001','0010001','0000001','0001110'],
  check: ['0000000','0000001','0000011','1000110','1101100','0111000','0010000'],
  copy: ['1111100','1000100','1011111','1010001','1110001','0010001','0011111'],
} as const;
export type UiIcon = keyof typeof ICONS;

/** Ícones pequenos feitos na grade de pixels; uma geometria estática por ícone. */
export function uiIcon(scene: Phaser.Scene, x: number, y: number, icon: UiIcon, color: number = UI_THEME.cyan, pixel = 2): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x: Math.round(x - 3.5 * pixel), y: Math.round(y - 3.5 * pixel) });
  g.fillStyle(color);
  ICONS[icon].forEach((row, yy) => [...row].forEach((bit, xx) => { if (bit === '1') g.fillRect(xx * pixel, yy * pixel, pixel, pixel); }));
  return g;
}
