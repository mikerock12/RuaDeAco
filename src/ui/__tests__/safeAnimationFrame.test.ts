import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  logMissingAnimationFrameOnce,
  resetMissingAnimationFrameLogForTests,
  resolveSafeFrameIndex,
} from '../safeAnimationFrame';

describe('resolveSafeFrameIndex', () => {
  afterEach(() => {
    resetMissingAnimationFrameLogForTests();
  });

  it('repassa índices válidos sem clamp', () => {
    expect(resolveSafeFrameIndex(0, 4)).toEqual({
      index: 0, clamped: false, available: 4, requested: 0,
    });
    expect(resolveSafeFrameIndex(3, 4)).toEqual({
      index: 3, clamped: false, available: 4, requested: 3,
    });
  });

  it('limita frame inexistente ao último disponível (contrato artificial inválido)', () => {
    // Simula Dante antigo com 4 frames recebendo poseFrame 4–7 do Guto.
    expect(resolveSafeFrameIndex(4, 4)).toEqual({
      index: 3, clamped: true, available: 4, requested: 4,
    });
    expect(resolveSafeFrameIndex(7, 4)).toEqual({
      index: 3, clamped: true, available: 4, requested: 7,
    });
    expect(resolveSafeFrameIndex(-1, 8)).toEqual({
      index: 0, clamped: true, available: 8, requested: -1,
    });
  });

  it('registra o erro uma única vez por textura/índice', () => {
    const log = vi.fn();
    logMissingAnimationFrameOnce('dante-sinal-grabbedFront', 4, 4, 3, log);
    logMissingAnimationFrameOnce('dante-sinal-grabbedFront', 4, 4, 3, log);
    logMissingAnimationFrameOnce('dante-sinal-grabbedFront', 5, 4, 3, log);
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0]?.[0]).toContain('Frame 4 ausente em dante-sinal-grabbedFront');
    expect(log.mock.calls[0]?.[0]).toContain('disponíveis 0-3');
    expect(log.mock.calls[0]?.[0]).toContain('usando 3');
  });

  it('não lança quando o contrato visual é inválido', () => {
    expect(() => {
      const safe = resolveSafeFrameIndex(4, 4);
      logMissingAnimationFrameOnce('fake-key', safe.requested, safe.available, safe.index);
    }).not.toThrow();
  });
});
