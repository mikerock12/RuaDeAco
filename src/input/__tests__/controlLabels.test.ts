import { describe, expect, it } from 'vitest';
import {
  detectGamepadFamily,
  gamepadButtonLabel,
  keyLabel,
  movementKeysSummary,
} from '../controlLabels';
import { defaultControls } from '../controlsStore';

describe('rótulos de teclas', () => {
  it('converte codes comuns em rótulos curtos e ASCII', () => {
    expect(keyLabel('KeyA')).toBe('A');
    expect(keyLabel('Digit3')).toBe('3');
    expect(keyLabel('ArrowLeft')).toBe('ESQ');
    expect(keyLabel('ArrowDown')).toBe('BAIXO');
    expect(keyLabel('Space')).toBe('ESPACO');
    expect(keyLabel('Numpad5')).toBe('NUM 5');
    expect(keyLabel('F9')).toBe('F9');
  });

  it('resume os agrupamentos de movimento padrão', () => {
    const config = defaultControls();
    expect(movementKeysSummary(config.keyboard[0])).toBe('WASD');
    expect(movementKeysSummary(config.keyboard[1])).toBe('SETAS');
    expect(movementKeysSummary({
      bindings: { ...config.keyboard[0].bindings, up: 'KeyI' },
    })).toBe('I/A/S/D');
  });
});

describe('famílias de gamepad', () => {
  it('detecta Xbox, PlayStation, Nintendo e genérico pelo id', () => {
    expect(detectGamepadFamily('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)')).toBe('xbox');
    expect(detectGamepadFamily('DualSense Wireless Controller (Vendor: 054c)')).toBe('playstation');
    expect(detectGamepadFamily('Pro Controller (STANDARD GAMEPAD Vendor: 057e)')).toBe('nintendo');
    expect(detectGamepadFamily('USB Generic Joystick')).toBe('generic');
  });

  it('usa rótulos da família nos botões de face', () => {
    expect(gamepadButtonLabel('xbox', 0)).toBe('A');
    expect(gamepadButtonLabel('xbox', 3)).toBe('Y');
    expect(gamepadButtonLabel('playstation', 0)).toBe('CRUZ');
    expect(gamepadButtonLabel('playstation', 3)).toBe('TRIANGULO');
    expect(gamepadButtonLabel('nintendo', 0)).toBe('B');
    expect(gamepadButtonLabel('nintendo', 1)).toBe('A');
  });

  it('usa rótulos seguros B0..Bn quando a família não é reconhecida', () => {
    expect(gamepadButtonLabel('generic', 0)).toBe('B0');
    expect(gamepadButtonLabel('generic', 7)).toBe('B7');
    expect(gamepadButtonLabel('xbox', 16)).toBe('B16');
  });
});
