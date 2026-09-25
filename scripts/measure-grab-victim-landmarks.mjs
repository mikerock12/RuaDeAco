// Mede, nas folhas aprovadas de vítima (grabbed-front e grabbed-lifted), o ponto
// pelo qual o atacante sustenta o corpo: centro de massa horizontal e altura do
// peito (40% do topo da silhueta). Coordenadas relativas à raiz nos pés
// (x positivo = frente do sprite, y negativo = para cima). Escreve
// src/fighters/grabVictimLandmarks.ts. Nenhuma arte é alterada.
import { readFileSync, writeFileSync } from 'node:fs';
import { decodePng } from './fighterRasterAnalysis.mjs';
const ids = ['rafa-mare', 'guto-barba', 'noir-reflexo', 'astro-riso', 'dante-sinal', 'leo-violeta'];
const PADDING = 6; // FIGHTER_OPAQUE_BOTTOM_PADDING: a sola fica 6 px acima da borda do frame
const result = {};
for (const id of ids) {
  result[id] = {};
  for (const sheet of ['grabbed-front', 'grabbed-lifted']) {
    const image = decodePng(readFileSync(`public/assets/fighters/${id}/${sheet}.png`));
    const size = image.height, frames = Math.round(image.width / size);
    const points = [];
    for (let frame = 0; frame < frames; frame++) {
      let sumX = 0, sumY = 0, count = 0, top = size, bottom = -1, left = size, right = -1;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (image.pixels[((y * image.width) + frame * size + x) * 4 + 3] < 64) continue;
        sumX += x; sumY += y; count++;
        top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x);
      }
      if (!count) throw new Error(`${id}/${sheet} frame ${frame} vazio`);
      const rootY = size - PADDING, rootX = size / 2;
      const holdX = Math.round(sumX / count - rootX);
      const holdY = Math.round(top + (bottom - top) * 0.4 - rootY);
      points.push([holdX, holdY, Math.round(left - rootX), Math.round(right - rootX), Math.round(top - rootY)]);
    }
    result[id][sheet === 'grabbed-front' ? 'front' : 'lifted'] = points;
  }
}
const body = JSON.stringify(result, null, 2).replace(/\[\n\s+(-?\d+),\n\s+(-?\d+),\n\s+(-?\d+),\n\s+(-?\d+),\n\s+(-?\d+)\n\s+\]/g, '[$1, $2, $3, $4, $5]');
writeFileSync('src/fighters/grabVictimLandmarks.ts', `import type { FighterId } from '../types/combat';

/**
 * Gerado por scripts/measure-grab-victim-landmarks.mjs a partir das folhas
 * grabbed-front.png e grabbed-lifted.png de cada lutador. Por quadro:
 * [holdX, holdY, left, right, top] em pixels relativos à raiz nos pés
 * (x positivo = frente do sprite, y negativo = acima do chão).
 * holdX/holdY é o ponto pelo qual o atacante sustenta o corpo.
 */
export type VictimLandmark = readonly [number, number, number, number, number];
export const GRAB_VICTIM_LANDMARKS: Readonly<Record<FighterId, { readonly front: readonly VictimLandmark[]; readonly lifted: readonly VictimLandmark[] }>> = ${body};
`);
console.log(JSON.stringify(result));
