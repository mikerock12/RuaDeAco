import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
vi.mock('phaser', () => ({ default: {} }));
import { pixelText } from '../text';

function fixture() {
  const bitmap = {
    text: '', fontSize: 16, lineSpacing: 0, letterSpacing: 0,
    setText(value: string) { this.text = value; return this; },
    setFontSize(value: number) { this.fontSize = value; return this; },
    setLineSpacing(value: number) { this.lineSpacing = value; return this; },
    setOrigin() { return this; },
    setLeftAlign() { return this; },
    setTint() { return this; },
    setData() { return this; },
    getTextBounds: vi.fn(function (this: { text: string; fontSize: number; letterSpacing: number }) {
      return { local: { width: this.text.length * (this.fontSize / 2 + this.letterSpacing), height: this.fontSize } };
    }),
  };
  const scene = { scale: { width: 640, height: 360 }, add: { bitmapText: () => bitmap } };
  const text = pixelText(scene as unknown as Phaser.Scene, 100, 50, '99', { size: 16, maxWidth: 200 });
  return { bitmap, text };
}

describe('cache de layout do texto', () => {
  it('não mede novamente a HUD inalterada em 60 frames', () => {
    const { bitmap, text } = fixture();
    bitmap.getTextBounds.mockClear();
    for (let frame = 0; frame < 60; frame++) text.setText('99');
    expect(bitmap.getTextBounds).not.toHaveBeenCalled();
    text.setText('98');
    expect(bitmap.getTextBounds).toHaveBeenCalled();
    expect(text.text).toBe('98');
  });

  it('recalcula texto longo, tamanho ou espaçamento alterados', () => {
    const { bitmap, text } = fixture();
    text.setText('FRENTE + S');
    bitmap.getTextBounds.mockClear();
    bitmap.fontSize = 9;
    text.setText('FRENTE + S');
    expect(bitmap.getTextBounds).toHaveBeenCalled();
    bitmap.getTextBounds.mockClear();
    bitmap.letterSpacing = 1;
    text.setText('FRENTE + S');
    expect(bitmap.getTextBounds).toHaveBeenCalled();
  });
});
