import { afterEach, describe, expect, it, vi } from 'vitest';
import { toggleFullscreen } from '../fullscreen';

interface FullscreenDocumentStub {
  fullscreenElement: object | null;
  readonly documentElement: {
    requestFullscreen(options?: FullscreenOptions): Promise<void>;
  };
  exitFullscreen(): Promise<void>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('toggleFullscreen', () => {
  it('entra e sai da tela cheia sem perder o estado real do documento', async () => {
    const root = {};
    const stub: FullscreenDocumentStub = {
      fullscreenElement: null,
      documentElement: {
        requestFullscreen: vi.fn(async () => {
          stub.fullscreenElement = root;
        }),
      },
      exitFullscreen: vi.fn(async () => {
        stub.fullscreenElement = null;
      }),
    };
    vi.stubGlobal('document', stub);

    await expect(toggleFullscreen()).resolves.toBe(true);
    expect(stub.documentElement.requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' });
    await expect(toggleFullscreen()).resolves.toBe(false);
    expect(stub.exitFullscreen).toHaveBeenCalledOnce();
  });

  it('reflete o estado do navegador quando a API rejeita a solicitação', async () => {
    const stub: FullscreenDocumentStub = {
      fullscreenElement: null,
      documentElement: {
        requestFullscreen: vi.fn().mockRejectedValue(new Error('indisponível')),
      },
      exitFullscreen: vi.fn(),
    };
    vi.stubGlobal('document', stub);

    await expect(toggleFullscreen()).resolves.toBe(false);
  });
});
