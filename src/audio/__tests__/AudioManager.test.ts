import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsStore } from '../../config/settings';
import { AudioManager, type AudioManagerDependencies } from '../AudioManager';

class FakeAudioParam {
  value = 1;
  readonly targets: number[] = [];
  readonly values: Array<{ value: number; time: number }> = [];
  readonly linearRamps: Array<{ value: number; time: number }> = [];

  setTargetAtTime(value: number): void {
    this.value = value;
    this.targets.push(value);
  }

  setValueAtTime(value: number, time: number): void {
    this.value = value;
    this.values.push({ value, time });
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.value = value;
    this.linearRamps.push({ value, time });
  }

  exponentialRampToValueAtTime(value: number): void {
    this.value = value;
  }

  cancelScheduledValues(): void {}
}

class FakeGainNode {
  readonly gain = new FakeAudioParam();
  readonly connections: unknown[] = [];
  disconnected = false;

  connect(destination: unknown): unknown {
    this.connections.push(destination);
    return destination;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeBufferSourceNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  readonly starts: number[] = [];
  readonly stops: Array<number | undefined> = [];
  readonly connections: unknown[] = [];
  disconnected = false;

  connect(destination: unknown): unknown {
    this.connections.push(destination);
    return destination;
  }

  disconnect(): void {
    this.disconnected = true;
  }

  start(time = 0): void {
    this.starts.push(time);
  }

  stop(time?: number): void {
    this.stops.push(time);
  }

  addEventListener(): void {}
}

class FakeOscillatorNode {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeAudioParam();
  started = false;
  stopped = false;

  connect(destination: unknown): unknown {
    return destination;
  }

  start(): void {
    this.started = true;
  }

  stop(): void {
    this.stopped = true;
  }
}

class FakeAudioContext {
  state: AudioContextState = 'suspended';
  currentTime = 10;
  readonly destination = {} as AudioDestinationNode;
  readonly gains: FakeGainNode[] = [];
  readonly sources: FakeBufferSourceNode[] = [];
  readonly oscillators: FakeOscillatorNode[] = [];
  decodeShouldFail = false;
  resumeBehavior: 'run' | 'reject' | 'stay-suspended' = 'run';
  resumeCalls = 0;

  createGain(): GainNode {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeBufferSourceNode();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  createOscillator(): OscillatorNode {
    const oscillator = new FakeOscillatorNode();
    this.oscillators.push(oscillator);
    return oscillator as unknown as OscillatorNode;
  }

  async decodeAudioData(): Promise<AudioBuffer> {
    if (this.decodeShouldFail) throw new Error('formato inválido');
    return { duration: 60 } as AudioBuffer;
  }

  async resume(): Promise<void> {
    this.resumeCalls += 1;
    if (this.resumeBehavior === 'reject') throw new DOMException('Autoplay bloqueado', 'NotAllowedError');
    if (this.resumeBehavior === 'run') this.state = 'running';
  }

  async close(): Promise<void> {
    this.state = 'closed';
  }
}

function okResponse(): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => new ArrayBuffer(16),
  } as Response;
}

function setup(
  fetchImplementation: typeof globalThis.fetch = vi.fn(async () => okResponse()),
  options: { state?: AudioContextState; resumeBehavior?: FakeAudioContext['resumeBehavior'] } = {},
): {
  manager: AudioManager;
  context: FakeAudioContext;
  fetchMock: typeof globalThis.fetch;
} {
  const context = new FakeAudioContext();
  context.state = options.state ?? 'suspended';
  context.resumeBehavior = options.resumeBehavior ?? 'run';
  const dependencies: AudioManagerDependencies = {
    createContext: () => context as unknown as AudioContext,
    fetch: fetchImplementation,
    baseUrl: '/RuaDeAco/',
  };
  return {
    manager: new AudioManager(dependencies),
    context,
    fetchMock: fetchImplementation,
  };
}

function installBrowserEventMocks(): {
  dispatchWindow: (type: string) => void;
  dispatchDocument: (type: string) => void;
  windowAdd: ReturnType<typeof vi.fn>;
  windowRemove: ReturnType<typeof vi.fn>;
} {
  const windowListeners = new Map<string, Set<EventListener>>();
  const documentListeners = new Map<string, Set<EventListener>>();
  const add = (target: Map<string, Set<EventListener>>, type: string, listener: EventListener): void => {
    const listeners = target.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    target.set(type, listeners);
  };
  const remove = (target: Map<string, Set<EventListener>>, type: string, listener: EventListener): void => {
    target.get(type)?.delete(listener);
  };
  const dispatch = (target: Map<string, Set<EventListener>>, type: string): void => {
    for (const listener of [...(target.get(type) ?? [])]) listener(new Event(type));
  };
  const windowAdd = vi.fn((type: string, listener: EventListener) => add(windowListeners, type, listener));
  const windowRemove = vi.fn((type: string, listener: EventListener) => remove(windowListeners, type, listener));

  vi.stubGlobal('window', {
    addEventListener: windowAdd,
    removeEventListener: windowRemove,
  });
  vi.stubGlobal('document', {
    hidden: false,
    documentElement: { style: { setProperty: vi.fn() } },
    addEventListener: vi.fn((type: string, listener: EventListener) => add(documentListeners, type, listener)),
    removeEventListener: vi.fn((type: string, listener: EventListener) => remove(documentListeners, type, listener)),
  });

  return {
    dispatchWindow: (type) => dispatch(windowListeners, type),
    dispatchDocument: (type) => dispatch(documentListeners, type),
    windowAdd,
    windowRemove,
  };
}

beforeEach(() => {
  settingsStore.update({
    masterVolume: 0.8,
    musicVolume: 0.35,
    effectsVolume: 0.8,
    muted: false,
  });
});

describe('AudioManager com músicas reais', () => {
  it('inicia automaticamente quando o contexto já está liberado', async () => {
    installBrowserEventMocks();
    const { manager, context, fetchMock } = setup(vi.fn(async () => okResponse()), { state: 'running' });
    manager.attachLifecycle();

    await manager.playMusic('main-menu');
    expect(manager.getRequestedMusic()).toBe('main-menu');
    expect(manager.getCurrentMusic()).toBe('main-menu');
    expect(fetchMock).toHaveBeenCalledWith(
      '/RuaDeAco/assets/audio/music/menu-principal.ogg',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(manager.getCurrentMusic()).toBe('main-menu');
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0]?.loop).toBe(true);
    expect(context.resumeCalls).toBe(0);
    expect(manager.getDebugState().pendingTrack).toBeNull();
  });

  it('pré-carrega sem solicitar, reproduzir ou liberar o contexto', async () => {
    installBrowserEventMocks();
    const { manager, context, fetchMock } = setup();
    manager.attachLifecycle();

    await manager.preloadMusic('main-menu');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(context.resumeCalls).toBe(0);
    expect(context.sources).toHaveLength(0);
    expect(manager.getDebugState()).toMatchObject({
      contextState: 'suspended',
      requestedTrack: null,
      pendingTrack: null,
      currentTrack: null,
      activeVoices: 0,
      autoplayBlocked: false,
      unlockListenersAttached: false,
    });
  });

  it('mantém a faixa pendente até o desbloqueio explícito', async () => {
    const browser = installBrowserEventMocks();
    const { manager, context } = setup();
    manager.attachLifecycle();

    await manager.playMusic('main-menu');
    expect(context.resumeCalls).toBe(0);
    expect(context.sources).toHaveLength(0);
    expect(manager.getDebugState()).toMatchObject({
      contextState: 'suspended',
      requestedTrack: 'main-menu',
      pendingTrack: 'main-menu',
      unlockListenersAttached: true,
    });
    expect(browser.windowAdd).toHaveBeenCalledWith('keydown', expect.any(Function));

    await manager.unlock();

    expect(context.resumeCalls).toBe(1);
    expect(context.sources).toHaveLength(1);
    expect(manager.getCurrentMusic()).toBe('main-menu');
  });

  it('pré-carrega, mantém pendente e inicia no primeiro gesto quando autoplay é bloqueado', async () => {
    const browser = installBrowserEventMocks();
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { manager, context, fetchMock } = setup(vi.fn(async () => okResponse()), {
      resumeBehavior: 'reject',
    });
    manager.attachLifecycle();

    await manager.playMusic('main-menu');
    await manager.unlock();
    await vi.waitFor(() => expect(manager.getDebugState().autoplayBlocked).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(context.sources).toHaveLength(0);
    expect(manager.getDebugState()).toMatchObject({
      contextState: 'suspended',
      requestedTrack: 'main-menu',
      pendingTrack: 'main-menu',
      unlockListenersAttached: true,
    });
    expect(browser.windowAdd).toHaveBeenCalledWith('touchstart', expect.any(Function), { passive: true });

    context.resumeBehavior = 'run';
    browser.dispatchWindow('pointerdown');
    await vi.waitFor(() => expect(manager.getCurrentMusic()).toBe('main-menu'));
    browser.dispatchWindow('touchstart');
    browser.dispatchWindow('keydown');

    expect(context.sources).toHaveLength(1);
    expect(manager.getDebugState().unlockListenersAttached).toBe(false);
    expect(browser.windowRemove).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(browser.windowRemove).toHaveBeenCalledWith('touchstart', expect.any(Function));
    expect(browser.windowRemove).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(info).toHaveBeenCalledTimes(1);
  });

  it('substitui a faixa pendente antes do desbloqueio sem criar vozes duplicadas', async () => {
    const browser = installBrowserEventMocks();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { manager, context } = setup(vi.fn(async () => okResponse()), { resumeBehavior: 'reject' });
    manager.attachLifecycle();

    await manager.playMusic('main-menu');
    await manager.playMusic('character-select');
    await manager.unlock();
    await vi.waitFor(() => expect(manager.getDebugState().autoplayBlocked).toBe(true));
    expect(manager.getRequestedMusic()).toBe('character-select');

    context.resumeBehavior = 'run';
    browser.dispatchWindow('keydown');
    await vi.waitFor(() => expect(manager.getCurrentMusic()).toBe('character-select'));

    expect(context.sources).toHaveLength(1);
    expect(manager.getDebugState().activeVoices).toBe(1);
  });

  it('não baixa nem reinicia a faixa que já está tocando', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    const { manager, context } = setup(fetchMock);
    await manager.playMusic('main-menu');
    await manager.unlock();
    await manager.playMusic('main-menu');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(context.sources).toHaveLength(1);
  });

  it('faz crossfade de 300 ms e encerra a fonte anterior', async () => {
    const { manager, context } = setup();
    await manager.playMusic('main-menu');
    await manager.unlock();
    await manager.playMusic('character-select');

    expect(context.sources).toHaveLength(2);
    expect(context.sources[0]?.stops).toEqual([10.3]);
    expect(context.sources[1]?.starts).toEqual([10]);
    expect(context.sources[1]?.loop).toBe(true);
    expect(manager.getCurrentMusic()).toBe('character-select');
  });

  it('para a música com fade e limpa a faixa solicitada', async () => {
    const { manager, context } = setup();
    await manager.playMusic('main-menu');
    await manager.unlock();

    manager.stopMusic();

    expect(manager.getRequestedMusic()).toBeNull();
    expect(manager.getCurrentMusic()).toBeNull();
    expect(context.sources[0]?.stops).toEqual([10.3]);
  });

  it('usa MP3 como fallback quando a fonte OGG falha', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('.ogg')) {
        return {
          ok: false,
          status: 415,
          arrayBuffer: async () => new ArrayBuffer(0),
        } as Response;
      }
      return okResponse();
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { manager, context } = setup(fetchMock as typeof globalThis.fetch);

    await manager.playMusic('main-menu');
    await manager.unlock();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/RuaDeAco/assets/audio/music/menu-principal.ogg',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/RuaDeAco/assets/audio/music/menu-principal.mp3',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(context.sources).toHaveLength(1);
    expect(manager.getCurrentMusic()).toBe('main-menu');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('aplica master, música, efeitos e mute nos barramentos corretos', async () => {
    const { manager, context } = setup();
    await manager.unlock();
    const master = context.gains[0];
    const effects = context.gains[1];
    const music = context.gains[2];

    expect(master?.gain.targets.at(-1)).toBe(0.8);
    expect(effects?.gain.targets.at(-1)).toBe(0.8);
    expect(music?.gain.targets.at(-1)).toBe(0.35);

    settingsStore.update({ masterVolume: 0.6, musicVolume: 0.2, effectsVolume: 0.9, muted: true });
    manager.applySettings();
    expect(master?.gain.targets.at(-1)).toBe(0);
    expect(effects?.gain.targets.at(-1)).toBe(0.9);
    expect(music?.gain.targets.at(-1)).toBe(0.2);

    settingsStore.update({ muted: false });
    manager.applySettings();
    expect(master?.gain.targets.at(-1)).toBe(0.6);
    expect(effects?.gain.targets.at(-1)).toBe(0.9);
    expect(music?.gain.targets.at(-1)).toBe(0.2);
  });

  it('preserva mute durante pré-carga, desbloqueio e início do menu', async () => {
    settingsStore.update({ muted: true });
    const { manager, context } = setup();

    await manager.preloadMusic('main-menu');
    await manager.unlock();
    await manager.playMusic('main-menu');

    expect(context.gains[0]?.gain.targets.at(-1)).toBe(0);
    expect(context.sources).toHaveLength(1);
    expect(manager.getCurrentMusic()).toBe('main-menu');
  });

  it('registra a falha uma vez, não derruba o jogo e preserva efeitos', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 404,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { manager, context } = setup(fetchMock);

    await manager.playMusic('cais-da-cidade');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await manager.playMusic('cais-da-cidade');
    manager.play('confirm');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(manager.getCurrentMusic()).toBeNull();
    expect(context.oscillators).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it('retoma o contexto quando a página volta a ficar visível', async () => {
    const browser = installBrowserEventMocks();
    const { manager, context, fetchMock } = setup();
    manager.attachLifecycle();
    await manager.playMusic('main-menu');
    await manager.unlock();
    await vi.waitFor(() => expect(manager.getCurrentMusic()).toBe('main-menu'));
    context.state = 'suspended';

    browser.dispatchDocument('visibilitychange');
    await vi.waitFor(() => expect(context.state).toBe('running'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(context.sources).toHaveLength(1);
  });

  it('não contém mais o temporizador da música procedural antiga', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/audio/AudioManager.ts'), 'utf8');
    expect(source).not.toContain('setInterval');
    expect(source).not.toContain('musicTimer');
    expect(source).not.toContain('musicStep');
    expect(source).not.toContain('startMusic');
  });
});
