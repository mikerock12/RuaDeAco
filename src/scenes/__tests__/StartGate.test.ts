import { describe, expect, it, vi } from 'vitest';
import { StartGate } from '../startGate';

function keyEvent(code: string, key: string, repeat = false): Event {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperties(event, {
    code: { value: code },
    key: { value: key },
    repeat: { value: repeat },
  });
  return event;
}

describe('StartGate', () => {
  it('inicia com Enter global e ignora interações duplicadas', () => {
    const target = new EventTarget();
    const onStart = vi.fn();
    const gate = new StartGate(target, onStart);
    gate.attach();

    const enter = keyEvent('Enter', 'Enter');
    target.dispatchEvent(enter);
    target.dispatchEvent(new Event('pointerdown'));
    target.dispatchEvent(new Event('touchstart'));
    target.dispatchEvent(keyEvent('Enter', 'Enter'));

    expect(enter.defaultPrevented).toBe(true);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('inicia com o primeiro toque e processa pointerdown/touchstart apenas uma vez', () => {
    const target = new EventTarget();
    const onStart = vi.fn();
    const gate = new StartGate(target, onStart);
    gate.attach();

    target.dispatchEvent(new Event('touchstart'));
    target.dispatchEvent(new Event('pointerdown'));

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('recebe o toque diretamente no canvas mesmo sem propagação até o window', () => {
    const windowTarget = new EventTarget();
    const canvasTarget = new EventTarget();
    const onStart = vi.fn();
    const gate = new StartGate(windowTarget, onStart, [windowTarget, canvasTarget]);
    gate.attach();

    canvasTarget.dispatchEvent(new Event('pointerdown'));

    expect(onStart).toHaveBeenCalledOnce();
  });

  it('aceita o disparo do input do Phaser e deduplica com os eventos DOM', () => {
    const target = new EventTarget();
    const onStart = vi.fn();
    const gate = new StartGate(target, onStart);
    gate.attach();

    gate.trigger();
    target.dispatchEvent(new Event('pointerdown'));
    gate.trigger();

    expect(onStart).toHaveBeenCalledOnce();
  });

  it('aceita Espaço, ignora repetição e outras teclas', () => {
    const target = new EventTarget();
    const onStart = vi.fn();
    const gate = new StartGate(target, onStart);
    gate.attach();

    target.dispatchEvent(keyEvent('KeyA', 'a'));
    target.dispatchEvent(keyEvent('Space', ' ', true));
    expect(onStart).not.toHaveBeenCalled();

    target.dispatchEvent(keyEvent('Space', ' '));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('remove os listeners durante dispose', () => {
    const target = new EventTarget();
    const onStart = vi.fn();
    const gate = new StartGate(target, onStart);
    gate.attach();
    gate.dispose();

    target.dispatchEvent(keyEvent('Enter', 'Enter'));
    target.dispatchEvent(new Event('pointerdown'));

    expect(onStart).not.toHaveBeenCalled();
  });
});
