import { settingsStore } from '../config/settings';
import {
  MUSIC_CATALOG,
  musicAssetUrl,
  type MusicTrack,
} from './musicCatalog';

export type SoundEffect = 'confirm' | 'hit' | 'block' | 'special' | 'ko' | 'round';

interface Tone {
  readonly frequency: number;
  readonly endFrequency: number;
  readonly duration: number;
  readonly wave: OscillatorType;
  readonly gain: number;
}

interface MusicVoice {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

export interface AudioManagerDependencies {
  readonly createContext: () => AudioContext | null;
  readonly fetch: typeof globalThis.fetch;
  readonly baseUrl: string;
}

export interface AudioDebugState {
  readonly contextState: AudioContextState | 'uninitialized';
  readonly requestedTrack: MusicTrack | null;
  readonly pendingTrack: MusicTrack | null;
  readonly currentTrack: MusicTrack | null;
  readonly loadingTracks: readonly MusicTrack[];
  readonly activeVoices: number;
  readonly unlockListenersAttached: boolean;
  readonly autoplayBlocked: boolean;
}

const TONES: Readonly<Record<SoundEffect, Tone>> = {
  confirm: { frequency: 520, endFrequency: 760, duration: 0.09, wave: 'square', gain: 0.16 },
  hit: { frequency: 120, endFrequency: 55, duration: 0.11, wave: 'sawtooth', gain: 0.28 },
  block: { frequency: 740, endFrequency: 310, duration: 0.08, wave: 'square', gain: 0.15 },
  special: { frequency: 180, endFrequency: 680, duration: 0.28, wave: 'sawtooth', gain: 0.22 },
  ko: { frequency: 180, endFrequency: 42, duration: 0.7, wave: 'square', gain: 0.3 },
  round: { frequency: 330, endFrequency: 660, duration: 0.26, wave: 'square', gain: 0.18 },
};

const MUSIC_FADE_SECONDS = 0.3;

function browserDependencies(): AudioManagerDependencies {
  return {
    createContext: () => {
      const AudioContextClass = globalThis.AudioContext;
      return AudioContextClass ? new AudioContextClass() : null;
    },
    fetch: (...args) => globalThis.fetch(...args),
    baseUrl: import.meta.env.BASE_URL,
  };
}

export class AudioManager {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private readonly buffers = new Map<MusicTrack, AudioBuffer>();
  private readonly loading = new Map<MusicTrack, Promise<AudioBuffer | null>>();
  private readonly failed = new Set<MusicTrack>();
  private readonly loadingControllers = new Map<MusicTrack, AbortController>();
  private readonly voices = new Set<MusicVoice>();
  private requestedTrack: MusicTrack | null = null;
  private currentTrack: MusicTrack | null = null;
  private currentVoice: MusicVoice | null = null;
  private requestVersion = 0;
  private attached = false;
  private lifecycleAttached = false;
  private autoplayBlocked = false;
  private autoplayWarningLogged = false;
  private destroyed = false;

  constructor(private readonly dependencies: AudioManagerDependencies = browserDependencies()) {}

  attachLifecycle(): void {
    if (this.destroyed) return;
    if (this.lifecycleAttached) return;
    this.lifecycleAttached = true;
    globalThis.document?.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private attachUnlockListeners(): void {
    if (this.attached || this.destroyed) return;
    this.attached = true;
    globalThis.window?.addEventListener('pointerdown', this.handleFirstInteraction, { passive: true });
    globalThis.window?.addEventListener('touchstart', this.handleFirstInteraction, { passive: true });
    globalThis.window?.addEventListener('keydown', this.handleFirstInteraction);
  }

  unlock = async (): Promise<boolean> => {
    if (this.destroyed) return false;
    this.detachUnlockListeners();
    if (!this.context) this.createGraph();
    const context = this.context;
    if (!context) return false;

    try {
      if (context.state !== 'running') await context.resume();
    } catch (error) {
      this.markAutoplayBlocked(error);
      return false;
    }

    if (context.state !== 'running') {
      this.markAutoplayBlocked();
      return false;
    }

    this.handleContextRunning();
    if (this.requestedTrack) await this.syncRequestedTrack(this.requestedTrack, this.requestVersion);
    return true;
  };

  async preloadMusic(track: MusicTrack): Promise<boolean> {
    if (this.destroyed) return false;
    if (!this.context) this.createGraph();
    if (!this.context) return false;
    this.applySettings();
    return Boolean(await this.loadTrack(track));
  }

  async playMusic(track: MusicTrack): Promise<void> {
    if (this.destroyed) return;
    if (this.requestedTrack === track && (this.currentVoice || this.loading.has(track))) return;

    this.requestedTrack = track;
    const version = ++this.requestVersion;
    if (!this.context) this.createGraph();
    const context = this.context;
    if (!context) return;

    this.applySettings();
    void this.loadTrack(track);
    if (context.state === 'running') {
      this.handleContextRunning();
      await this.syncRequestedTrack(track, version);
      return;
    }

    this.attachUnlockListeners();
  }

  getRequestedMusic(): MusicTrack | null {
    return this.requestedTrack;
  }

  getCurrentMusic(): MusicTrack | null {
    return this.currentTrack;
  }

  getDebugState(): AudioDebugState {
    return {
      contextState: this.context?.state ?? 'uninitialized',
      requestedTrack: this.requestedTrack,
      pendingTrack: this.requestedTrack !== this.currentTrack ? this.requestedTrack : null,
      currentTrack: this.currentTrack,
      loadingTracks: [...this.loading.keys()],
      activeVoices: this.voices.size,
      unlockListenersAttached: this.attached,
      autoplayBlocked: this.autoplayBlocked,
    };
  }

  stopMusic(): void {
    if (this.destroyed) return;
    this.requestedTrack = null;
    this.currentTrack = null;
    this.currentVoice = null;
    this.requestVersion += 1;

    const context = this.context;
    if (!context) {
      this.stopVoicesImmediately();
      return;
    }

    const now = context.currentTime;
    for (const voice of this.voices) {
      this.fadeAndStop(voice, now, now + MUSIC_FADE_SECONDS);
    }
  }

  applySettings(): void {
    const settings = settingsStore.get();
    if (!this.context || !this.masterGain || !this.effectsGain || !this.musicGain) return;
    const now = this.context.currentTime;
    this.masterGain.gain.setTargetAtTime(settings.muted ? 0 : settings.masterVolume, now, 0.015);
    this.effectsGain.gain.setTargetAtTime(settings.effectsVolume, now, 0.015);
    this.musicGain.gain.setTargetAtTime(settings.musicVolume, now, 0.03);
  }

  play(effect: SoundEffect): void {
    if (!this.context || !this.effectsGain) return;
    this.scheduleTone(TONES[effect], this.effectsGain);
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.detachUnlockListeners();
    this.detachLifecycleListeners();
    this.requestedTrack = null;
    this.currentTrack = null;
    this.autoplayBlocked = false;
    this.requestVersion += 1;
    for (const controller of this.loadingControllers.values()) controller.abort();
    this.loadingControllers.clear();
    this.stopVoicesImmediately();
    const context = this.context;
    this.context = null;
    this.masterGain = null;
    this.effectsGain = null;
    this.musicGain = null;
    if (context && context.state !== 'closed') await context.close();
  }

  private readonly handleFirstInteraction = (): void => {
    void this.unlock();
  };

  private readonly handleVisibilityChange = (): void => {
    if (globalThis.document?.hidden || !this.requestedTrack) return;
    void this.unlock();
  };

  private detachUnlockListeners(): void {
    if (!this.attached) return;
    this.attached = false;
    globalThis.window?.removeEventListener('pointerdown', this.handleFirstInteraction);
    globalThis.window?.removeEventListener('touchstart', this.handleFirstInteraction);
    globalThis.window?.removeEventListener('keydown', this.handleFirstInteraction);
  }

  private detachLifecycleListeners(): void {
    if (!this.lifecycleAttached) return;
    this.lifecycleAttached = false;
    globalThis.document?.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private createGraph(): void {
    const context = this.dependencies.createContext();
    if (!context) return;
    this.context = context;
    this.masterGain = context.createGain();
    this.effectsGain = context.createGain();
    this.musicGain = context.createGain();
    this.effectsGain.connect(this.masterGain);
    this.musicGain.connect(this.masterGain);
    this.masterGain.connect(context.destination);
  }

  private handleContextRunning(): void {
    this.autoplayBlocked = false;
    this.autoplayWarningLogged = false;
    this.detachUnlockListeners();
    this.applySettings();
  }

  private markAutoplayBlocked(error?: unknown): void {
    this.autoplayBlocked = true;
    this.attachUnlockListeners();
    if (this.autoplayWarningLogged) return;
    this.autoplayWarningLogged = true;
    console.info('[Audio] AudioContext ainda bloqueado; nova tentativa ocorrerá na próxima interação.', error ?? 'policy');
  }

  private scheduleTone(tone: Tone, destination: AudioNode): void {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = tone.wave;
    oscillator.frequency.setValueAtTime(tone.frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, tone.endFrequency), now + tone.duration);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(tone.gain, now + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + tone.duration);
    oscillator.connect(envelope);
    envelope.connect(destination);
    oscillator.start(now);
    oscillator.stop(now + tone.duration + 0.02);
  }

  private async syncRequestedTrack(track: MusicTrack, version: number): Promise<void> {
    if (this.currentTrack === track && this.currentVoice) return;
    const buffer = await this.loadTrack(track);
    if (!buffer || this.destroyed || version !== this.requestVersion || this.requestedTrack !== track) return;
    this.transitionTo(track, buffer);
  }

  private async loadTrack(track: MusicTrack): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(track);
    if (cached) return cached;
    if (this.failed.has(track) || !this.context) return null;

    const existing = this.loading.get(track);
    if (existing) return existing;

    const controller = new AbortController();
    this.loadingControllers.set(track, controller);
    const promise = this.fetchAndDecode(track, controller.signal)
      .then((buffer) => {
        if (buffer) this.buffers.set(track, buffer);
        else this.failed.add(track);
        return buffer;
      })
      .finally(() => {
        this.loading.delete(track);
        this.loadingControllers.delete(track);
      });
    this.loading.set(track, promise);
    return promise;
  }

  private async fetchAndDecode(track: MusicTrack, signal: AbortSignal): Promise<AudioBuffer | null> {
    const definition = MUSIC_CATALOG[track];
    for (const source of definition.sources) {
      const url = musicAssetUrl(source.path, this.dependencies.baseUrl);
      try {
        const response = await this.dependencies.fetch(url, { signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        if (!this.context) return null;
        return await this.context.decodeAudioData(bytes.slice(0));
      } catch (error) {
        if (signal.aborted) return null;
        console.warn(`[Audio] Falha ao carregar ${track} de ${url}.`, error);
      }
    }
    console.error(`[Audio] Nenhuma fonte pôde ser carregada para a faixa ${track}.`);
    return null;
  }

  private transitionTo(track: MusicTrack, buffer: AudioBuffer): void {
    const context = this.context;
    const musicGain = this.musicGain;
    if (!context || !musicGain) return;
    if (this.currentTrack === track && this.currentVoice) return;

    const now = context.currentTime;
    const stopAt = now + MUSIC_FADE_SECONDS;
    for (const voice of this.voices) this.fadeAndStop(voice, now, stopAt);

    const source = context.createBufferSource();
    const gain = context.createGain();
    const voice: MusicVoice = { source, gain };
    source.buffer = buffer;
    source.loop = MUSIC_CATALOG[track].loop;
    source.connect(gain);
    gain.connect(musicGain);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + MUSIC_FADE_SECONDS);
    source.addEventListener('ended', () => this.releaseVoice(voice), { once: true });
    source.start(now);
    this.voices.add(voice);
    this.currentVoice = voice;
    this.currentTrack = track;
  }

  private fadeAndStop(voice: MusicVoice, now: number, stopAt: number): void {
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, stopAt);
    try {
      voice.source.stop(stopAt);
    } catch {
      this.releaseVoice(voice);
    }
  }

  private releaseVoice(voice: MusicVoice): void {
    voice.source.disconnect();
    voice.gain.disconnect();
    this.voices.delete(voice);
    if (this.currentVoice === voice) {
      this.currentVoice = null;
      this.currentTrack = null;
    }
  }

  private stopVoicesImmediately(): void {
    for (const voice of this.voices) {
      try {
        voice.source.stop();
      } catch {
        // A fonte já pode ter encerrado durante a destruição do jogo.
      }
      voice.source.disconnect();
      voice.gain.disconnect();
    }
    this.voices.clear();
    this.currentVoice = null;
  }
}

export const audioManager = new AudioManager();
