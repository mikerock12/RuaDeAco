import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

interface AlphaCounts {
  readonly transparent: number;
  readonly opaque: number;
  readonly intermediate: number;
}

interface AlphaBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

interface FrameAudit {
  readonly frame: number;
  readonly alpha: AlphaCounts;
  readonly bbox: AlphaBounds | null;
  readonly baselineY: number | null;
}

interface RasterAuditEntry {
  readonly fighterId: string;
  readonly file: string;
  readonly rasterKind?: 'body' | 'effect';
  readonly frames?: number;
  readonly frameWidth?: number;
  readonly frameHeight?: number;
  readonly expectedFrameWidth?: number | null;
  readonly expectedFrameHeight?: number | null;
  readonly expectedBaselineY?: number | null;
  readonly frameAudits?: readonly FrameAudit[];
  readonly medianOpaquePixels?: number;
  readonly visualMassRatio?: number;
  readonly unexpectedGreenPixels?: number;
  readonly issues: readonly string[];
}

const CONTRACTS = {
  'rafa-mare': { frameWidth: 256, frameHeight: 256, baselineY: 249 },
  'astro-riso': { frameWidth: 256, frameHeight: 256, baselineY: 249 },
  'guto-barba': { frameWidth: 288, frameHeight: 288, baselineY: 281 },
  'dante-sinal': { frameWidth: 256, frameHeight: 256, baselineY: 249 },
} as const;

const execution = spawnSync(
  process.execPath,
  ['scripts/audit-fighter-sprites.mjs', '--json'],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  },
);

const entries = execution.stdout.trim()
  ? JSON.parse(execution.stdout) as readonly RasterAuditEntry[]
  : [];

function issueReport(): string {
  const failures = entries.filter(({ issues }) => issues.length > 0);
  const details = failures
    .slice(0, 20)
    .map(({ fighterId, file, issues }) => `${fighterId}/${file}: ${issues.join('; ')}`)
    .join('\n');
  const remaining = failures.length > 20 ? `... e mais ${failures.length - 20} arquivo(s) com violações` : '';
  return [execution.stderr.trim(), details, remaining].filter(Boolean).join('\n');
}

describe('fighter sprite raster audit', () => {
  it('executa a auditoria automática sem violações', () => {
    expect(execution.error, execution.stderr).toBeUndefined();
    expect(execution.status, issueReport()).toBe(0);
    expect(entries.length).toBeGreaterThan(0);
  });

  it('mantém canvas, alpha e baseline de cada frame corporal no contrato', () => {
    const sheets = entries.filter(
      (entry): entry is RasterAuditEntry & { rasterKind: 'body'; frames: number; frameAudits: readonly FrameAudit[] } =>
        entry.rasterKind === 'body'
        && entry.frames !== undefined
        && entry.frameAudits !== undefined,
    );
    expect(sheets.length).toBeGreaterThan(0);

    for (const sheet of sheets) {
      const contract = CONTRACTS[sheet.fighterId as keyof typeof CONTRACTS];
      expect(contract, `contrato ausente: ${sheet.fighterId}`).toBeDefined();
      if (!contract) continue;

      expect(sheet.frameWidth, sheet.file).toBe(sheet.frameHeight);
      expect([contract.frameWidth, 256], sheet.file).toContain(sheet.frameWidth);
      expect(sheet.expectedFrameWidth, sheet.file).toBe(sheet.frameWidth);
      expect(sheet.expectedFrameHeight, sheet.file).toBe(sheet.frameHeight);
      expect(sheet.expectedBaselineY, sheet.file).toBe(sheet.frameHeight! - 7);
      expect(sheet.frameAudits, sheet.file).toHaveLength(sheet.frames);
      expect(sheet.medianOpaquePixels, sheet.file).toBeGreaterThan(0);
      expect(sheet.visualMassRatio, sheet.file).toBeGreaterThanOrEqual(0.88);
      expect(sheet.visualMassRatio, sheet.file).toBeLessThanOrEqual(1.12);

      for (const frame of sheet.frameAudits) {
        const context = `${sheet.fighterId}/${sheet.file} frame ${frame.frame}`;
        expect(frame.bbox, context).not.toBeNull();
        expect(frame.alpha.intermediate, context).toBe(0);
        expect(frame.baselineY, context).toBe(sheet.frameHeight! - 7);
        expect(
          frame.alpha.transparent + frame.alpha.opaque + frame.alpha.intermediate,
          context,
        ).toBe(sheet.frameWidth! * sheet.frameHeight!);
      }
    }
  });

  it('audita bbox e alpha dos efeitos sem impor baseline corporal', () => {
    const effects = entries.filter(
      (entry): entry is RasterAuditEntry & { rasterKind: 'effect'; frames: number; frameAudits: readonly FrameAudit[] } =>
        entry.rasterKind === 'effect'
        && entry.frames !== undefined
        && entry.frameAudits !== undefined,
    );
    expect(effects.length).toBeGreaterThan(0);

    for (const effect of effects) {
      expect(effect.expectedBaselineY, effect.file).toBeNull();
      expect(effect.frameAudits, effect.file).toHaveLength(effect.frames);
      for (const frame of effect.frameAudits) {
        expect(frame.bbox, `${effect.file} frame ${frame.frame}`).not.toBeNull();
      }
    }
  });

  it('não permite que o chroma verde volte ao Chute Pesado do Guto', () => {
    const kick = entries.find(
      ({ fighterId, file }) => fighterId === 'guto-barba' && file === 'forward-heavy.png',
    );
    expect(kick).toBeDefined();
    expect(kick?.unexpectedGreenPixels).toBe(0);
  });
});
