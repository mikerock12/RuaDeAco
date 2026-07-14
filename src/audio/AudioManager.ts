import { settingsStore } from '../config/settings';

export type SoundEffect = 'confirm' | 'hit' | 'block' | 'special' | 'ko' | 'round';

interface Tone {
  readonly frequency: number;
  readonly endFrequency: number;
  readonly duration: number;
  readonly wave: OscillatorType;
  readonly gain: number;
}

const TONES: Readonly<Record<SoundEffect, Tone>> = {
  confirm: { frequency: 520, endFrequency: 760, duration: 0.09, wave: 'square', gain: 0.16 },
  hit: { frequency: 120, endFrequency: 55, duration: 0.11, wave: 'sawtooth', gain: 0.28 },
  block: { frequency: 740, endFrequency: 310, duration: 0.08, wave: 'square', gain: 0.15 },
  special: { frequency: 180, endFrequency: 680, duration: 0.28, wave: 'sawtooth', gain: 0.22 },
  ko: { frequency: 180, endFrequency: 42, duration: 0.7, wave: 'square', gain: 0.3 },
  round: { frequency: 330, endFrequency: 660, duration: 0.26, wave: 'square', gain: 0.18 },
};

export class AudioManager {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private attached = false;

  attachUnlock(): void {
    if (this.attached) return;
    this.attached = true;
    globalThis.window?.addEventListener('pointerdown', this.unlock, { once: true, passive: true });
    globalThis.window?.addEventListener('keydown', this.unlock, { once: true });
  }

  unlock = (): void => {
    if (!this.context) this.createGraph();
    void this.context?.resume();
    this.applySettings();
    this.startMusic();
  };

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

  private createGraph(): void {
    const AudioContextClass = globalThis.AudioContext;
    if (!AudioContextClass) return;
    this.context = new AudioContextClass();
    this.masterGain = this.context.createGain();
    this.effectsGain = this.context.createGain();
    this.musicGain = this.context.createGain();
    this.effectsGain.connect(this.masterGain);
    this.musicGain.connect(this.masterGain);
    this.masterGain.connect(this.context.destination);
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

  private startMusic(): void {
    if (this.musicTimer !== null || !this.context || !this.musicGain) return;
    const notes = [82.41, 98, 110, 146.83, 110, 98, 73.42, 98];
    const tick = (): void => {
      if (!this.musicGain) return;
      const note = notes[this.musicStep % notes.length] ?? 82.41;
      this.musicStep += 1;
      this.scheduleTone({ frequency: note, endFrequency: note, duration: 0.18, wave: 'square', gain: 0.035 }, this.musicGain);
    };
    tick();
    this.musicTimer = globalThis.window?.setInterval(tick, 430) ?? null;
  }
}

export const audioManager = new AudioManager();
