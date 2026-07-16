import { describe, expect, it, vi } from 'vitest';
import {
  calculateFitViewport,
  createViewportRefreshScheduler,
  type ViewportRefreshTiming,
} from '../viewportLayout';

describe('calculateFitViewport', () => {
  it.each([
    [640, 360, 640, 360, 0, 0],
    [740, 360, 640, 360, 50, 0],
    [844, 390, 693.3333333333334, 390, 75.33333333333331, 0],
    [915, 412, 732.4444444444445, 412, 91.27777777777777, 0],
    [1280, 720, 1280, 720, 0, 0],
  ])(
    'encaixa 640x360 em %ix%i',
    (viewportWidth, viewportHeight, width, height, left, top) => {
      const fit = calculateFitViewport(viewportWidth, viewportHeight);
      expect(fit.width).toBeCloseTo(width, 8);
      expect(fit.height).toBeCloseTo(height, 8);
      expect(fit.left).toBeCloseTo(left, 8);
      expect(fit.top).toBeCloseTo(top, 8);
      expect(fit.width).toBeLessThanOrEqual(viewportWidth);
      expect(fit.height).toBeLessThanOrEqual(viewportHeight);
      expect(fit.width / fit.height).toBeCloseTo(16 / 9, 10);
    },
  );

  it('trata dimensões inválidas sem gerar NaN', () => {
    expect(calculateFitViewport(0, 390)).toEqual({
      width: 0,
      height: 0,
      left: 0,
      top: 0,
      scale: 0,
    });
  });
});

describe('createViewportRefreshScheduler', () => {
  it('consolida eventos e atualiza novamente após o viewport estabilizar', () => {
    const refresh = vi.fn();
    const frames = new Map<number, FrameRequestCallback>();
    const delays = new Map<number, () => void>();
    let nextHandle = 1;
    const timing: ViewportRefreshTiming = {
      requestFrame: (callback) => {
        const handle = nextHandle++;
        frames.set(handle, (time) => {
          frames.delete(handle);
          callback(time);
        });
        return handle;
      },
      cancelFrame: (handle) => frames.delete(handle),
      setDelay: (callback) => {
        const handle = nextHandle++;
        delays.set(handle, () => {
          delays.delete(handle);
          callback();
        });
        return handle;
      },
      clearDelay: (handle) => delays.delete(handle),
    };
    const scheduler = createViewportRefreshScheduler(refresh, timing);

    scheduler.schedule();
    scheduler.schedule();
    expect(frames.size).toBe(1);
    expect(delays.size).toBe(1);

    [...frames.values()][0]?.(0);
    [...delays.values()][0]?.();
    expect(refresh).toHaveBeenCalledTimes(2);

    scheduler.schedule();
    scheduler.dispose();
    expect(frames.size).toBe(0);
    expect(delays.size).toBe(0);
  });
});
