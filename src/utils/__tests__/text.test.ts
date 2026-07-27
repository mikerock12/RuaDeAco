import { describe, expect, it } from 'vitest';
import {
  fitPixelText,
  pixelTextOrigin,
  toPixelFontText,
  wrapPixelText,
  type PixelTextMeasure,
} from '../textLayout';

const measure: PixelTextMeasure = (text, size, lineSpacing) => {
  const lines = text.split('\n');
  return {
    width: Math.ceil(Math.max(0, ...lines.map((line) => line.length * size * 0.55))),
    height: text.length === 0 ? 0 : lines.length * size + (lines.length - 1) * lineSpacing,
  };
};

describe('texto da fonte pixel', () => {
  it('centraliza a conversão ASCII sem perder palavras', () => {
    expect(toPixelFontText('Configurações — Abraço Glacial')).toBe('Configuracoes — Abraco Glacial');
  });

  it('preserva a origem coerente para esquerda, centro e direita', () => {
    expect(pixelTextOrigin('left')).toEqual({ x: 0, y: 0.5 });
    expect(pixelTextOrigin('center')).toEqual({ x: 0.5, y: 0.5 });
    expect(pixelTextOrigin('right')).toEqual({ x: 1, y: 0.5 });
  });
});

describe('wrapping mensurável', () => {
  it('quebra em espaços antes de cortar palavras', () => {
    const original = 'FRENTE BAIXO BAIXO FRENTE RAJADA NEON';
    const lines = wrapPixelText(original, 12, 120, 0, measure);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ').replace(/\s+/gu, ' ')).toBe(original);
    expect(lines.every((line) => measure(line, 12, 0).width <= 120)).toBe(true);
  });

  it('divide um identificador indivisível somente quando necessário', () => {
    const word = 'CONTROLEEXTREMAMENTELONGO';
    const lines = wrapPixelText(word, 8, 44, 0, measure);
    expect(lines.join('')).toBe(word);
    expect(lines.length).toBeGreaterThan(1);
  });
});

describe('ajuste ao retângulo', () => {
  it.each([
    ['CONFIGURACOES', 32, 440, 40],
    ['CIMA/BAIXO ITEM  ESQ/DIR ALTERA  CONFIRMA CAPTURA  ESC VOLTA', 16, 600, 20],
    ['FRENTE+BAIXO+BAIXO-FRENTE+L SORRISO RELAMPAGO', 16, 288, 20],
    ['BAIXO+L ABRACO GLACIAL [100 ENERGIA]', 16, 238, 20],
  ])('encaixa texto real: %s', (text, size, maxWidth, maxHeight) => {
    const layout = fitPixelText(text, {
      size,
      minSize: 8,
      maxWidth,
      maxHeight,
      maxLines: 1,
    }, measure);
    expect(layout.fits).toBe(true);
    expect(layout.width).toBeLessThanOrEqual(maxWidth);
    expect(layout.height).toBeLessThanOrEqual(maxHeight);
    expect(layout.size).toBeGreaterThanOrEqual(8);
  });

  it('refaz a medição quando o conteúdo dinâmico cresce', () => {
    const options = {
      size: 16,
      minSize: 8,
      maxWidth: 180,
      maxHeight: 20,
      maxLines: 1,
    } as const;
    const short = fitPixelText('PADRAO', options, measure);
    const remapped = fitPixelText('FRENTE+R1 GANCHO DO URSO', options, measure);
    expect(short.size).toBe(16);
    expect(remapped.size).toBeLessThan(short.size);
    expect(remapped.fits).toBe(true);
  });

  it('considera padding e nunca reduz abaixo de 8 px', () => {
    const layout = fitPixelText('EM DESENVOLVIMENTO', {
      size: 16,
      minSize: 4,
      maxWidth: 100,
      maxHeight: 24,
      padding: { x: 8, y: 3 },
      maxLines: 1,
    }, measure);
    expect(layout.size).toBeGreaterThanOrEqual(8);
    expect(layout.width).toBeLessThanOrEqual(84);
    expect(layout.height).toBeLessThanOrEqual(18);
  });
});
