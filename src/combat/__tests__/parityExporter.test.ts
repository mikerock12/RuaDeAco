import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCppParityFixtures } from '../parityExporter';

describe('buildCppParityFixtures', () => {
  it('exporta os 6 lutadores, 3 arenas, constantes de 60 Hz e replays determinísticos para o runtime C++', () => {
    const bundleFirst = buildCppParityFixtures();
    const bundleSecond = buildCppParityFixtures();

    expect(bundleFirst).toEqual(bundleSecond);
    expect(bundleFirst.schemaVersion).toBe(1);
    expect(bundleFirst.engineContract.fixedHz).toBe(60);
    expect(bundleFirst.arenas.map((a) => a.id)).toEqual([
      'cais-da-cidade',
      'cozinha-macabra',
      'sitio',
    ]);
    expect(bundleFirst.fighters.map((f) => f.id)).toEqual([
      'rafa-mare',
      'noir-reflexo',
      'astro-riso',
      'dante-sinal',
      'leo-violeta',
      'guto-barba',
    ]);

    for (const fighter of bundleFirst.fighters) {
      expect(fighter.available).toBe(true);
      expect(fighter.moves.universalGrab).toBeDefined();
      expect(Object.keys(fighter.moves).length).toBeGreaterThanOrEqual(8);
    }

    expect(bundleFirst.goldenScenarios.length).toBe(3);
    for (const scenario of bundleFirst.goldenScenarios) {
      expect(scenario.initialStateHash).toMatch(/^[0-9a-f]{16}$/);
      expect(scenario.finalStateHash).toMatch(/^[0-9a-f]{16}$/);
      expect(scenario.finalStateHash).not.toBe(scenario.initialStateHash);
      expect(scenario.checkpoints.length).toBeGreaterThan(5);
    }

    const grabScenario = bundleFirst.goldenScenarios.find(
      (s) => s.id === 'dante-vs-leo-universal-grab',
    );
    expect(grabScenario).toBeDefined();
    expect(
      grabScenario!.checkpoints.some((cp) => cp.activeGrabMoveId === 'universalGrab'),
    ).toBe(true);

    // Persiste o artefato canônico em docs/parity/golden_fixtures.json
    const outDir = resolve(process.cwd(), 'docs', 'parity');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      resolve(outDir, 'golden_fixtures.json'),
      JSON.stringify(bundleFirst, null, 2) + '\n',
      'utf8',
    );
  });
});
