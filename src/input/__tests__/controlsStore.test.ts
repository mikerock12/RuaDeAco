import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ControlsStore,
  defaultControls,
  sanitizeControls,
} from '../controlsStore';

function createStorageMock(initial: Record<string, string> = {}): Storage {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: () => null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, value),
  } as Storage;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('padrões dos controles', () => {
  it('mantém o teclado padrão de P1 e P2', () => {
    const config = defaultControls();
    expect(config.keyboard[0].bindings).toEqual({
      left: 'KeyA',
      right: 'KeyD',
      up: 'KeyW',
      down: 'KeyS',
      light: 'KeyF',
      heavy: 'KeyG',
      special: 'KeyH',
      block: 'KeyR',
    });
    expect(config.keyboard[1].bindings).toEqual({
      left: 'ArrowLeft',
      right: 'ArrowRight',
      up: 'ArrowUp',
      down: 'ArrowDown',
      light: 'KeyJ',
      heavy: 'KeyK',
      special: 'KeyL',
      block: 'KeyU',
    });
  });

  it('mantém o layout standard como padrão de gamepad', () => {
    const config = defaultControls();
    for (const player of [0, 1] as const) {
      expect(config.gamepad[player].bindings).toEqual({
        left: 14,
        right: 15,
        up: 12,
        down: 13,
        light: 0,
        heavy: 1,
        special: 2,
        block: 3,
      });
      expect(config.gamepad[player].pause).toBe(9);
    }
  });

  it('mantém as posições touch padrão com as quatro ações', () => {
    const config = defaultControls();
    expect(config.touch.slots).toEqual({
      nw: 'heavy',
      ne: 'light',
      sw: 'special',
      se: 'block',
    });
  });
});

describe('persistência e recuperação', () => {
  it('persiste alterações e as recarrega em outra instância', () => {
    const storage = createStorageMock();
    vi.stubGlobal('localStorage', storage);

    const store = new ControlsStore();
    store.load();
    const result = store.setKeyboardBinding(0, 'light', 'KeyT');
    expect(result).toEqual({ ok: true, swappedWith: null });

    const reloaded = new ControlsStore();
    const config = reloaded.load();
    expect(config.keyboard[0].bindings.light).toBe('KeyT');
    expect(config.keyboard[1].bindings.light).toBe('KeyJ');
  });

  it('retorna aos padrões com JSON corrompido', () => {
    vi.stubGlobal('localStorage', createStorageMock({
      'rua-de-aco:controls:v1': '{corrompido',
    }));
    const store = new ControlsStore();
    expect(store.load()).toEqual(defaultControls());
  });

  it('faz fallback conservador para versão desconhecida', () => {
    vi.stubGlobal('localStorage', createStorageMock({
      'rua-de-aco:controls:v1': JSON.stringify({ version: 99, keyboard: [] }),
    }));
    const store = new ControlsStore();
    expect(store.load()).toEqual(defaultControls());
  });

  it('não lança exceção quando o armazenamento está indisponível', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    } as unknown as Storage);
    const store = new ControlsStore();
    expect(() => store.load()).not.toThrow();
    expect(() => store.setKeyboardBinding(0, 'light', 'KeyT')).not.toThrow();
    expect(store.get().keyboard[0].bindings.light).toBe('KeyT');
  });

  it('rejeita perfis inválidos gravados e preserva os demais', () => {
    const bad = defaultControls();
    const raw = JSON.stringify({
      ...bad,
      keyboard: [
        { bindings: { ...bad.keyboard[0].bindings, light: 'Enter' } },
        bad.keyboard[1],
      ],
    });
    vi.stubGlobal('localStorage', createStorageMock({ 'rua-de-aco:controls:v1': raw }));
    const store = new ControlsStore();
    const config = store.load();
    expect(config.keyboard[0]).toEqual(defaultControls().keyboard[0]);
    expect(config.keyboard[1]).toEqual(defaultControls().keyboard[1]);
  });
});

describe('conflitos e trocas determinísticas', () => {
  it('troca automaticamente duas ações do mesmo perfil de teclado', () => {
    const store = new ControlsStore();
    const result = store.setKeyboardBinding(0, 'light', 'KeyG');
    expect(result).toEqual({ ok: true, swappedWith: 'heavy' });
    const config = store.get();
    expect(config.keyboard[0].bindings.light).toBe('KeyG');
    expect(config.keyboard[0].bindings.heavy).toBe('KeyF');
  });

  it('rejeita teclas reservadas pela interface', () => {
    const store = new ControlsStore();
    expect(store.setKeyboardBinding(0, 'light', 'Enter')).toEqual({ ok: false, reason: 'reserved' });
    expect(store.setKeyboardBinding(0, 'light', 'Escape')).toEqual({ ok: false, reason: 'reserved' });
    expect(store.get().keyboard[0].bindings.light).toBe('KeyF');
  });

  it('não altera silenciosamente o teclado do outro jogador', () => {
    const store = new ControlsStore();
    const result = store.setKeyboardBinding(0, 'light', 'KeyJ');
    expect(result).toEqual({ ok: false, reason: 'other-player' });
    expect(store.get().keyboard[0].bindings.light).toBe('KeyF');
    expect(store.get().keyboard[1].bindings.light).toBe('KeyJ');
  });

  it('troca botões de gamepad dentro do mesmo perfil, incluindo pausa', () => {
    const store = new ControlsStore();
    expect(store.setGamepadBinding(0, 'special', 1)).toEqual({ ok: true, swappedWith: 'heavy' });
    expect(store.get().gamepad[0].bindings.special).toBe(1);
    expect(store.get().gamepad[0].bindings.heavy).toBe(2);

    expect(store.setGamepadBinding(0, 'block', 9)).toEqual({ ok: true, swappedWith: 'pause' });
    expect(store.get().gamepad[0].bindings.block).toBe(9);
    expect(store.get().gamepad[0].pause).toBe(3);
    // O perfil do outro jogador permanece intacto.
    expect(store.get().gamepad[1]).toEqual(defaultControls().gamepad[1]);
  });

  it('remapeia posições touch preservando a permutação das quatro ações', () => {
    const store = new ControlsStore();
    const result = store.setTouchSlot('ne', 'special');
    expect(result.ok).toBe(true);
    const slots = store.get().touch.slots;
    expect(slots.ne).toBe('special');
    expect(slots.sw).toBe('light');
    expect(new Set(Object.values(slots)).size).toBe(4);
  });
});

describe('restauração de padrões', () => {
  it('restaura um único perfil sem tocar nos demais', () => {
    const store = new ControlsStore();
    store.setKeyboardBinding(0, 'light', 'KeyT');
    store.setKeyboardBinding(1, 'light', 'KeyY');
    store.resetProfile('keyboard', 0);
    expect(store.get().keyboard[0]).toEqual(defaultControls().keyboard[0]);
    expect(store.get().keyboard[1].bindings.light).toBe('KeyY');
  });

  it('restaura todos os controles de uma vez', () => {
    const store = new ControlsStore();
    store.setKeyboardBinding(0, 'light', 'KeyT');
    store.setGamepadBinding(1, 'light', 5);
    store.setTouchSlot('nw', 'light');
    store.resetAll();
    expect(store.get()).toEqual(defaultControls());
  });
});

describe('sanitização direta', () => {
  it('retorna padrões para valores não estruturados', () => {
    expect(sanitizeControls(null)).toEqual(defaultControls());
    expect(sanitizeControls('texto')).toEqual(defaultControls());
    expect(sanitizeControls(42)).toEqual(defaultControls());
  });

  it('rejeita bindings duplicados dentro de um perfil', () => {
    const config = defaultControls();
    const dirty = {
      ...config,
      keyboard: [
        { bindings: { ...config.keyboard[0].bindings, heavy: 'KeyF' } },
        config.keyboard[1],
      ],
    };
    expect(sanitizeControls(dirty).keyboard[0]).toEqual(defaultControls().keyboard[0]);
  });
});
