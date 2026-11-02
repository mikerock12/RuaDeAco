import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCppParityFixtures, serializeCppParityFixtures } from '../parityExporter';
import { isConsistentTransition } from '../../online/inputCodec';

describe('buildCppParityFixtures', () => {
  it('exporta os 6 lutadores, 3 arenas, constantes de 60 Hz e replays determinísticos para o runtime C++', () => {
    const bundleFirst = buildCppParityFixtures();
    const bundleSecond = buildCppParityFixtures();

    expect(bundleFirst).toEqual(bundleSecond);
    expect(bundleFirst.schemaVersion).toBe(2);
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

    expect(bundleFirst.goldenScenarios.length).toBeGreaterThanOrEqual(27);
    for(const fighter of bundleFirst.fighters) {
      for(const move of Object.values(fighter.moves).filter(candidate => candidate.state==='specialAttack')) {
        const scenario=bundleFirst.goldenScenarios.find(candidate=>candidate.id===`${fighter.id}-${move.id}-canonical-command`)!;
        expect(scenario.checkpoints.some(cp=>cp.fighters[0].moveId===move.id),move.id).toBe(true);
      }
    }
    for (const scenario of bundleFirst.goldenScenarios) {
      expect(scenario.initialStateHash).toMatch(/^[0-9a-f]{16}$/);
      expect(scenario.finalStateHash).toMatch(/^[0-9a-f]{16}$/);
      expect(scenario.finalStateHash).not.toBe(scenario.initialStateHash);
      expect(scenario.checkpoints).toHaveLength(scenario.inputs.length + 1);
      expect(scenario.checkpoints[0]!.step).toBe(0);
      if(scenario.id.startsWith('finisher-')) {
        expect(scenario.checkpoints.some(cp=>cp.phase==='stageFinish')).toBe(true);
        expect(scenario.checkpoints.at(-1)!.phase).toBe('matchOver');
      }
      let previousP1 = 0;
      let previousP2 = 0;
      for (let index = 0; index < scenario.inputs.length; index++) {
        const input = scenario.inputs[index]!;
        expect(input.step).toBe(index + 1);
        expect(input.p1.frame).toBe(input.step);
        expect(input.p2.frame).toBe(input.step);
        expect(isConsistentTransition(input.p1, previousP1)).toBe(true);
        expect(isConsistentTransition(input.p2, previousP2)).toBe(true);
        previousP1 = input.p1.heldMask;
        previousP2 = input.p2.heldMask;
        expect(scenario.checkpoints[index + 1]!.step).toBe(index + 1);
      }
    }

    const grabScenario = bundleFirst.goldenScenarios.find(
      (s) => s.id === 'dante-vs-leo-universal-grab',
    );
    expect(grabScenario).toBeDefined();
    expect(
      grabScenario!.checkpoints.some((cp) => cp.activeGrabMoveId === 'universalGrab'),
    ).toBe(true);

    const outDir = resolve(process.cwd(), 'docs', 'parity');
    mkdirSync(outDir, { recursive: true });
    const serialized=serializeCppParityFixtures(bundleFirst);
    // JSON normaliza -0 para 0 e omite propriedades opcionais undefined.
    expect(JSON.parse(serialized)).toEqual(JSON.parse(JSON.stringify(bundleFirst)));
    writeFileSync(resolve(outDir, 'golden_fixtures.json'), serialized, 'utf8');
  }, 30000);
});
