import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { decodePng } = require('../../../scripts/fighterRasterAnalysis.mjs') as {
  decodePng: (buffer: Buffer) => {
    width: number;
    height: number;
    pixels: Uint8Array;
  };
};

const FRAME = 256;
const FOOTLINE = 249;
const PADDING = 6;
const STANDING_CANONICAL = [
  'idle.png',
  'corrida.png',
  'walk-backward.png',
  'block-standing.png',
  'standing-light.png',
  'standing-heavy.png',
] as const;

function loadSheet(fighterId: string, file: string) {
  const path = resolve(process.cwd(), 'public/assets/fighters', fighterId, file);
  return decodePng(readFileSync(path));
}

function opaqueHeights(png: { width: number; height: number; pixels: Uint8Array }): number[] {
  const heights: number[] = [];
  const frames = Math.floor(png.width / FRAME);
  for (let frame = 0; frame < frames; frame += 1) {
    let minY = FRAME;
    let maxY = -1;
    for (let y = 0; y < FRAME; y += 1) {
      for (let x = 0; x < FRAME; x += 1) {
        const sx = frame * FRAME + x;
        const idx = (y * png.width + sx) * 4 + 3;
        if (png.pixels[idx]! >= 128) {
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (maxY >= minY) heights.push(maxY - minY + 1);
  }
  return heights;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function baselineOk(png: { width: number; height: number; pixels: Uint8Array }): boolean {
  const frames = Math.floor(png.width / FRAME);
  for (let frame = 0; frame < frames; frame += 1) {
    let maxY = -1;
    for (let y = 0; y < FRAME; y += 1) {
      for (let x = 0; x < FRAME; x += 1) {
        const sx = frame * FRAME + x;
        const idx = (y * png.width + sx) * 4 + 3;
        if (png.pixels[idx]! >= 128) maxY = Math.max(maxY, y);
      }
    }
    if (maxY < 0) continue;
    if (maxY !== FOOTLINE) return false;
    for (let y = FOOTLINE + 1; y < FRAME; y += 1) {
      for (let x = 0; x < FRAME; x += 1) {
        const sx = frame * FRAME + x;
        const idx = (y * png.width + sx) * 4 + 3;
        if (png.pixels[idx]! >= 128) return false;
      }
    }
  }
  return true;
}

describe('Dante Sinal proporção relativa ao elenco', () => {
  it('altura opaca mediana canônica em pé fica entre 176 e 182 px', () => {
    const heights: number[] = [];
    for (const file of STANDING_CANONICAL) {
      heights.push(...opaqueHeights(loadSheet('dante-sinal', file)));
    }
    const med = median(heights);
    expect(med).toBeGreaterThanOrEqual(176);
    expect(med).toBeLessThanOrEqual(182);
  });

  it('idle de Dante fica próximo de Rafa e coerente com Guto', () => {
    const dante = median(opaqueHeights(loadSheet('dante-sinal', 'idle.png')));
    const rafa = median(opaqueHeights(loadSheet('rafa-mare', 'idle.png')));
    const guto = median(opaqueHeights(loadSheet('guto-barba', 'idle.png')));
    expect(Math.abs(dante - rafa)).toBeLessThanOrEqual(20);
    expect(dante).toBeLessThanOrEqual(guto + 5);
    expect(dante).toBeGreaterThanOrEqual(170);
  });

  it('sheets grounded canônicos de Dante respeitam baseline 249 e padding 6', () => {
    for (const file of STANDING_CANONICAL) {
      const png = loadSheet('dante-sinal', file);
      expect(png.height).toBe(FRAME);
      expect(png.width).toBe(FRAME * 4);
      expect(baselineOk(png), file).toBe(true);
      expect(FRAME - 1 - FOOTLINE).toBe(PADDING);
    }
  });
});
