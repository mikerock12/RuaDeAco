import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BODY_MAX_BBOX_FILL_RATIO,
  BODY_MIN_DISTINCT_OPAQUE_COLORS,
  EFFECT_MIN_DISTINCT_OPAQUE_COLORS,
  MIN_FRAME_PAIR_DIFF_PIXELS,
  MIN_FRAME_PAIR_DIFF_RATIO,
  decodePng,
  placeholderIssues,
} from '../../../scripts/fighterRasterAnalysis.mjs';
import type { DecodedImage, SheetGeometry } from '../../../scripts/fighterRasterAnalysis.mjs';

// Reproduz exatamente o padrão do gerador rejeitado (tentativa do Antigravity
// para Dante Sinal): um retângulo cinza uniforme por frame e um único pixel
// transparente em posição diferente por frame só para variar o hash.
function antigravityRectangleSheet(frames: number): { image: DecodedImage; sheet: SheetGeometry } {
  const frameSize = 256;
  const width = frameSize * frames;
  const pixels = Buffer.alloc(width * frameSize * 4, 0);
  for (let frame = 0; frame < frames; frame += 1) {
    const originX = frame * frameSize;
    for (let y = 100; y <= 249; y += 1) {
      for (let x = originX + 100; x <= originX + 150; x += 1) {
        const index = (y * width + x) * 4;
        pixels[index] = 120;
        pixels[index + 1] = 120;
        pixels[index + 2] = 120;
        pixels[index + 3] = 255;
      }
    }
    const poked = ((105 + frame * 11) * width + originX + 105 + frame * 7) * 4;
    pixels.fill(0, poked, poked + 4);
  }
  return {
    image: { width, height: frameSize, pixels },
    sheet: { frames, frameWidth: frameSize, frameHeight: frameSize, layout: 'horizontal' },
  };
}

describe('guarda anti-placeholder da auditoria raster', () => {
  it('mantém os limites calibrados nas folhas válidas de Rafa, Guto e Astro', () => {
    // Calibração de 18/07/2026 sobre as 121 folhas aprovadas:
    // - mínimo real de cores opacas por frame: 3.627 (corpo) e 153 (efeito);
    // - diferença mínima real entre pares de frames: 7.080 px (corpo) e
    //   550 px (efeito), sempre >= 99% da massa opaca;
    // - preenchimento máximo do bbox corporal: 74,8% (rafa-mare/frozen.png).
    // Os limites ficam bem abaixo disso para nunca rejeitar arte legítima e
    // ainda barrar qualquer retângulo quase estático.
    expect(BODY_MIN_DISTINCT_OPAQUE_COLORS).toBe(64);
    expect(EFFECT_MIN_DISTINCT_OPAQUE_COLORS).toBe(16);
    expect(MIN_FRAME_PAIR_DIFF_PIXELS).toBe(64);
    expect(MIN_FRAME_PAIR_DIFF_RATIO).toBe(0.02);
    expect(BODY_MAX_BBOX_FILL_RATIO).toBe(0.9);
  });

  it('rejeita explicitamente o gerador de retângulos como sprite corporal', () => {
    const { image, sheet } = antigravityRectangleSheet(4);
    const issues = placeholderIssues(image, sheet, 'body');
    expect(issues.some((issue) => issue.includes('POUCAS CORES OPACAS'))).toBe(true);
    expect(issues.some((issue) => issue.includes('BLOCO RETANGULAR ÚNICO'))).toBe(true);
    expect(issues.some((issue) => issue.includes('QUASE IDÊNTICOS'))).toBe(true);
  });

  it('rejeita o mesmo padrão também sob o contrato próprio de efeitos', () => {
    const { image, sheet } = antigravityRectangleSheet(4);
    const issues = placeholderIssues(image, sheet, 'effect');
    expect(issues.some((issue) => issue.includes('POUCAS CORES OPACAS'))).toBe(true);
    expect(issues.some((issue) => issue.includes('QUASE IDÊNTICOS'))).toBe(true);
  });

  it('não acusa uma folha corporal real aprovada', () => {
    const image = decodePng(readFileSync('public/assets/fighters/rafa-mare/idle.png'));
    const sheet: SheetGeometry = { frames: 4, frameWidth: 256, frameHeight: 256, layout: 'horizontal' };
    expect(placeholderIssues(image, sheet, 'body')).toEqual([]);
  });

  it('não acusa o efeito real com menos cores do elenco (Abraço Glacial)', () => {
    const image = decodePng(readFileSync('public/assets/fighters/guto-barba/abraco-glacial-effect.png'));
    const sheet: SheetGeometry = { frames: 12, frameWidth: 256, frameHeight: 256, layout: 'horizontal' };
    expect(placeholderIssues(image, sheet, 'effect')).toEqual([]);
  });
});
