import type { GameSettings } from '../types/game';

const STORAGE_KEY = 'rua-de-aco:settings:v1';

export const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 0.8,
  musicVolume: 0.35,
  effectsVolume: 0.8,
  muted: false,
  difficulty: 'normal',
  touchControls: 'auto',
  touchOpacity: 0.58,
  preferFullscreen: false,
  wins: 0,
  losses: 0,
};

const clamp = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;

export function sanitizeSettings(value: unknown): GameSettings {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_SETTINGS };
  const candidate = value as Partial<GameSettings>;
  const difficulty = ['easy', 'normal', 'hard'].includes(candidate.difficulty ?? '')
    ? candidate.difficulty as GameSettings['difficulty']
    : DEFAULT_SETTINGS.difficulty;
  const touchControls = ['auto', 'on', 'off'].includes(candidate.touchControls ?? '')
    ? candidate.touchControls as GameSettings['touchControls']
    : DEFAULT_SETTINGS.touchControls;

  return {
    masterVolume: clamp(candidate.masterVolume, DEFAULT_SETTINGS.masterVolume),
    musicVolume: clamp(candidate.musicVolume, DEFAULT_SETTINGS.musicVolume),
    effectsVolume: clamp(candidate.effectsVolume, DEFAULT_SETTINGS.effectsVolume),
    muted: typeof candidate.muted === 'boolean' ? candidate.muted : DEFAULT_SETTINGS.muted,
    difficulty,
    touchControls,
    touchOpacity: clamp(candidate.touchOpacity, DEFAULT_SETTINGS.touchOpacity),
    preferFullscreen: typeof candidate.preferFullscreen === 'boolean' ? candidate.preferFullscreen : DEFAULT_SETTINGS.preferFullscreen,
    wins: typeof candidate.wins === 'number' ? Math.max(0, Math.floor(candidate.wins)) : 0,
    losses: typeof candidate.losses === 'number' ? Math.max(0, Math.floor(candidate.losses)) : 0,
  };
}

export class SettingsStore {
  private value: GameSettings = { ...DEFAULT_SETTINGS };

  load(): GameSettings {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      this.value = raw ? sanitizeSettings(JSON.parse(raw) as unknown) : { ...DEFAULT_SETTINGS };
    } catch {
      this.value = { ...DEFAULT_SETTINGS };
    }
    this.applyCss();
    return this.get();
  }

  get(): GameSettings {
    return { ...this.value };
  }

  update(patch: Partial<GameSettings>): GameSettings {
    this.value = sanitizeSettings({ ...this.value, ...patch });
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.value));
    } catch {
      // Preferências continuam válidas durante a sessão quando o armazenamento não está disponível.
    }
    this.applyCss();
    return this.get();
  }

  private applyCss(): void {
    globalThis.document?.documentElement.style.setProperty('--touch-opacity', String(this.value.touchOpacity));
  }
}

export const settingsStore = new SettingsStore();
