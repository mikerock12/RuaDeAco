import { describe, expect, it, vi } from 'vitest';
import { StartTransition } from '../startTransition';

describe('transição da tela inicial', () => {
  it('abre o menu imediatamente mesmo quando o desbloqueio fica pendente', () => {
    const pending = new Promise<boolean>(() => undefined);
    const unlockAudio = vi.fn(() => pending);
    const openMainMenu = vi.fn();
    const transition = new StartTransition({
      unlockAudio,
      openMainMenu,
      reportUnlockFailure: vi.fn(),
    });

    expect(transition.start()).toBe(true);
    expect(unlockAudio).toHaveBeenCalledOnce();
    expect(openMainMenu).toHaveBeenCalledOnce();
  });

  it('continua para o menu quando o desbloqueio rejeita', async () => {
    const reportUnlockFailure = vi.fn();
    const openMainMenu = vi.fn();
    const transition = new StartTransition({
      unlockAudio: () => Promise.reject(new Error('resume bloqueado')),
      openMainMenu,
      reportUnlockFailure,
    });

    transition.start();
    expect(openMainMenu).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(reportUnlockFailure).toHaveBeenCalledOnce());
  });

  it('processa somente a primeira interação', () => {
    const unlockAudio = vi.fn(() => Promise.resolve(true));
    const openMainMenu = vi.fn();
    const transition = new StartTransition({
      unlockAudio,
      openMainMenu,
      reportUnlockFailure: vi.fn(),
    });

    expect(transition.start()).toBe(true);
    expect(transition.start()).toBe(false);
    expect(transition.start()).toBe(false);
    expect(unlockAudio).toHaveBeenCalledOnce();
    expect(openMainMenu).toHaveBeenCalledOnce();
  });
});
