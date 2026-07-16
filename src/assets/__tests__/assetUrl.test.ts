import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIGHTER_SPRITE_ASSETS } from '../../fighters/visual';
import { fighterAssetRevision, fighterAssetUrl } from '../assetUrl';

describe('fighter asset cache contract', () => {
  it('versiona todos os URLs de sprites sem mudar o caminho plano do manifest', () => {
    const revision = fighterAssetRevision();
    expect(revision).toMatch(/^[a-f0-9]{12}$/);

    const sheets = FIGHTER_SPRITE_ASSETS.flatMap((fighter) => [
      ...Object.values(fighter.animations),
      ...fighter.effects,
    ]);
    for (const sheet of sheets) {
      expect(fighterAssetUrl(sheet.path)).toBe(`${sheet.path}?v=${revision}`);
      expect(sheet.path).not.toContain('?');
    }
  });

  it('mantém o novo service worker network-first com fallback da revisão atual', () => {
    const worker = readFileSync(resolve(process.cwd(), 'public/service-worker.js'), 'utf8');
    expect(worker).toContain('const response = await fetch(request);');
    expect(worker).toContain('cache.match(request, { ignoreSearch: true })');
    expect(worker).not.toContain('cached || fetch(request)');
  });
});
