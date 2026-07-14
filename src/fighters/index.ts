import type { FighterDefinition, FighterId } from '../types/combat';
import { astroRiso } from './astroRiso';
import { danteSinal } from './danteSinal';
import { gutoBarba } from './gutoBarba';
import { leoVioleta } from './leoVioleta';
import { noirReflexo } from './noirReflexo';
import { rafaMare } from './rafaMare';

export { astroRiso, danteSinal, gutoBarba, leoVioleta, noirReflexo, rafaMare };

export const FIGHTERS: readonly FighterDefinition[] = [
  rafaMare,
  noirReflexo,
  astroRiso,
  danteSinal,
  leoVioleta,
  gutoBarba,
];

export const AVAILABLE_FIGHTERS = FIGHTERS.filter((fighter) => fighter.available);

export function getFighterDefinition(id: FighterId): FighterDefinition {
  const fighter = FIGHTERS.find((candidate) => candidate.id === id);
  if (!fighter) throw new Error('Lutador desconhecido: ' + id);
  return fighter;
}
