import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../settings';

describe('persistência de configurações', () => {
  it('retorna padrões para dados inválidos', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('limita volumes e preserva enumerações válidas', () => {
    const settings = sanitizeSettings({
      masterVolume: 4,
      effectsVolume: -2,
      difficulty: 'hard',
      touchControls: 'on',
      wins: 2.9,
    });
    expect(settings.masterVolume).toBe(1);
    expect(settings.effectsVolume).toBe(0);
    expect(settings.difficulty).toBe('hard');
    expect(settings.touchControls).toBe('on');
    expect(settings.wins).toBe(2);
  });
});
