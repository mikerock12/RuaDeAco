import type { FighterId } from '../types/combat';
import { musicAssetUrl } from './musicCatalog';

/**
 * Sonoplastia gerada no Suno (plano Pro, uso comercial) e recortada a partir de
 * arquivos com várias falas ou texturas longas. O caminho sem extensão é o id:
 * cada amostra existe em OGG e MP3, como a música, e o OGG é tentado primeiro.
 *
 * `gain` iguala volumes percebidos depois da normalização de pico em -1 dBFS;
 * as falas ficam acima dos efeitos para não sumirem no meio da troca de golpes.
 */
export const SAMPLES = {
  'combate/golpe-ar': { gain: 0.42 },
  'combate/soco-leve': { gain: 0.55 },
  'combate/soco-forte': { gain: 0.72 },
  'combate/bloqueio': { gain: 0.55 },
  'combate/ko-impacto': { gain: 0.8 },
  'especiais/agua': { gain: 0.6 },
  'especiais/gelo': { gain: 0.6 },
  'especiais/espelho': { gain: 0.55 },
  'especiais/neon': { gain: 0.55 },
  'especiais/fumaca': { gain: 0.55 },
  'especiais/sombra': { gain: 0.52 },
  'especiais/super-chute-da-ressaca': { gain: 0.72 },
  'especiais/super-impacto-solar': { gain: 0.72 },
  'especiais/super-astro-giro': { gain: 0.72 },
  'especiais/super-ponto-final': { gain: 0.72 },
  'especiais/super-pressao-violeta': { gain: 0.7 },
  'especiais/super-abraco-glacial': { gain: 0.7 },
  'finalizacao/monstro-rugido': { gain: 0.85 },
  'locutor/round-1': { gain: 0.95 },
  'locutor/round-2': { gain: 0.95 },
  'locutor/round-3': { gain: 0.95 },
  'locutor/round-4': { gain: 0.95 },
  'locutor/round-5': { gain: 0.95 },
  'locutor/fight': { gain: 0.95 },
  'locutor/ko': { gain: 0.95 },
  'locutor/tempo': { gain: 0.95 },
  'locutor/empate': { gain: 0.95 },
  'locutor/finalize': { gain: 0.95 },
  'locutor/vitoria': { gain: 0.95 },
  'vozes/rafa/mao-da-mare': { gain: 0.85 },
  'vozes/rafa/eco-tatuado': { gain: 0.85 },
  'vozes/rafa/chute-da-ressaca': { gain: 0.9 },
  'vozes/noir/reflexo-negro': { gain: 0.85 },
  'vozes/noir/quebra-luz': { gain: 0.85 },
  'vozes/noir/impacto-solar': { gain: 0.9 },
  'vozes/astro/sorriso-relampago': { gain: 0.8 },
  'vozes/astro/rajada-neon': { gain: 0.8 },
  'vozes/astro/astro-giro': { gain: 0.85 },
  'vozes/dante/bomba-de-fumaca': { gain: 0.85 },
  'vozes/dante/chave-binaria': { gain: 0.85 },
  'vozes/dante/ponto-final': { gain: 0.9 },
  'vozes/leo/olhar-frio': { gain: 0.85 },
  'vozes/leo/impacto-sombrio': { gain: 0.85 },
  'vozes/leo/pressao-violeta': { gain: 0.9 },
  'vozes/guto/muralha-norte': { gain: 0.85 },
  'vozes/guto/gancho-do-urso': { gain: 0.85 },
  'vozes/guto/abraco-glacial': { gain: 0.9 },
} as const satisfies Readonly<Record<string, { readonly gain: number }>>;

export type SampleId = keyof typeof SAMPLES;
export const SAMPLE_IDS = Object.keys(SAMPLES) as SampleId[];

export interface SampleSource {
  readonly format: 'ogg' | 'mp3';
  readonly url: string;
}

export function sampleSources(id: SampleId, baseUrl?: string): readonly SampleSource[] {
  return (['ogg', 'mp3'] as const).map(format => ({
    format,
    url: musicAssetUrl(`assets/audio/sfx/${id}.${format}`, baseUrl),
  }));
}

/**
 * Cada especial grita o próprio nome e soa o elemento do lutador. Os dois
 * especiais comuns de um mesmo personagem dividem a amostra de elemento, então
 * o segundo toca em outro tom (`rate`) para não soar repetido; o super tem a sua.
 */
export interface SpecialSound {
  readonly voice: SampleId;
  readonly effect: SampleId;
  readonly rate?: number;
}

export const SPECIAL_SOUNDS: Readonly<Record<FighterId, Readonly<Record<string, SpecialSound>>>> = {
  'rafa-mare': {
    maoDaMare: { voice: 'vozes/rafa/mao-da-mare', effect: 'especiais/agua' },
    ecoTatuado: { voice: 'vozes/rafa/eco-tatuado', effect: 'especiais/agua', rate: 0.82 },
    chuteRessaca: { voice: 'vozes/rafa/chute-da-ressaca', effect: 'especiais/super-chute-da-ressaca' },
  },
  'noir-reflexo': {
    reflexoNegro: { voice: 'vozes/noir/reflexo-negro', effect: 'especiais/espelho' },
    quebraLuz: { voice: 'vozes/noir/quebra-luz', effect: 'especiais/espelho', rate: 1.18 },
    impactoSolar: { voice: 'vozes/noir/impacto-solar', effect: 'especiais/super-impacto-solar' },
  },
  'astro-riso': {
    sorrisoRelampago: { voice: 'vozes/astro/sorriso-relampago', effect: 'especiais/neon', rate: 1.12 },
    rajadaNeon: { voice: 'vozes/astro/rajada-neon', effect: 'especiais/neon' },
    astroGiro: { voice: 'vozes/astro/astro-giro', effect: 'especiais/super-astro-giro' },
  },
  'dante-sinal': {
    bombaFumaca: { voice: 'vozes/dante/bomba-de-fumaca', effect: 'especiais/fumaca' },
    chaveBinaria: { voice: 'vozes/dante/chave-binaria', effect: 'especiais/fumaca', rate: 1.2 },
    pontoFinal: { voice: 'vozes/dante/ponto-final', effect: 'especiais/super-ponto-final' },
  },
  'leo-violeta': {
    olharFrio: { voice: 'vozes/leo/olhar-frio', effect: 'especiais/sombra', rate: 1.1 },
    impactoSombrio: { voice: 'vozes/leo/impacto-sombrio', effect: 'especiais/sombra', rate: 0.86 },
    pressaoVioleta: { voice: 'vozes/leo/pressao-violeta', effect: 'especiais/super-pressao-violeta' },
  },
  'guto-barba': {
    muralhaNorte: { voice: 'vozes/guto/muralha-norte', effect: 'especiais/gelo' },
    ganchoUrso: { voice: 'vozes/guto/gancho-do-urso', effect: 'especiais/gelo', rate: 0.78 },
    abracoGlacial: { voice: 'vozes/guto/abraco-glacial', effect: 'especiais/super-abraco-glacial' },
  },
};

/** Falas do locutor, na mesma grafia que o jogo mostra na tela. */
export type AnnouncerLine = 'fight' | 'ko' | 'tempo' | 'empate' | 'finalize' | 'vitoria';
export const ANNOUNCER_ROUNDS: readonly SampleId[] = [
  'locutor/round-1', 'locutor/round-2', 'locutor/round-3', 'locutor/round-4', 'locutor/round-5',
];
export const ANNOUNCER_LINES: Readonly<Record<AnnouncerLine, SampleId>> = {
  fight: 'locutor/fight',
  ko: 'locutor/ko',
  tempo: 'locutor/tempo',
  empate: 'locutor/empate',
  finalize: 'locutor/finalize',
  vitoria: 'locutor/vitoria',
};
