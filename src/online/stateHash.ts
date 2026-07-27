import type { CombatWorld } from '../combat/CombatWorld';

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

function canonicalize(value: unknown): CanonicalValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Estado determinístico contém número não finito.');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const result: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(value).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) result[key] = canonicalize(child);
    }
    return result;
  }
  throw new Error(`Tipo não serializável no estado determinístico: ${typeof value}.`);
}

export function canonicalStateJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

/** FNV-1a de 64 bits: síncrono, estável e aceito pelo contrato hexadecimal v1. */
export function deterministicHash(value: unknown): string {
  const bytes = new TextEncoder().encode(canonicalStateJson(value));
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

export function combatStateHash(world: CombatWorld): string {
  return deterministicHash(world.exportDeterministicState());
}
