import { describe, expect, it, vi } from 'vitest';
import type { InputAction } from '../../types/combat';
import { GamepadManager } from '../GamepadManager';
import { InputManager } from '../InputManager';

interface MutablePad {
  index: number;
  id: string;
  connected: boolean;
  mapping: string;
  buttons: { pressed: boolean; touched: boolean; value: number }[];
  axes: number[];
  timestamp: number;
  vibrationActuator: null;
}

function createPad(index: number, id = 'Mock Gamepad (STANDARD GAMEPAD)'): MutablePad {
  return {
    index,
    id,
    connected: true,
    mapping: 'standard',
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    axes: [0, 0, 0, 0],
    timestamp: 0,
    vibrationActuator: null,
  };
}

interface Harness {
  readonly manager: GamepadManager;
  readonly input: InputManager;
  readonly pads: (MutablePad | null)[];
}

function createHarness(): Harness {
  const pads: (MutablePad | null)[] = [];
  const input = new InputManager();
  const manager = new GamepadManager({
    input,
    readPads: () => pads as unknown as readonly (Gamepad | null)[],
    target: null,
  });
  manager.attach();
  return { manager, input, pads };
}

function pressButton(pad: MutablePad, index: number, pressed = true): void {
  const button = pad.buttons[index];
  if (!button) throw new Error(`Botão inexistente: ${index}`);
  button.pressed = pressed;
  button.value = pressed ? 1 : 0;
}

describe('conexão e atribuição', () => {
  it('detecta conexão e desconexão pelas leituras de polling', () => {
    const { manager, pads } = createHarness();
    const connected = vi.fn();
    const disconnected = vi.fn();
    manager.on('connected', connected);
    manager.on('disconnected', disconnected);

    const pad = createPad(0);
    pads.push(pad);
    manager.poll();
    expect(connected).toHaveBeenCalledTimes(1);
    expect(manager.connectedPads()).toHaveLength(1);

    pads.length = 0;
    manager.poll();
    expect(disconnected).toHaveBeenCalledTimes(1);
    expect(manager.connectedPads()).toHaveLength(0);
  });

  it('atribui o primeiro controle ativo ao P1 e o segundo ao P2', () => {
    const { manager, pads } = createHarness();
    const padOne = createPad(0);
    const padTwo = createPad(1);
    pads.push(padOne, padTwo);
    manager.poll();
    expect(manager.assignedPad(0)).toBeNull();
    expect(manager.assignedPad(1)).toBeNull();

    pressButton(padTwo, 0);
    manager.poll();
    expect(manager.assignedPad(0)?.index).toBe(1);

    pressButton(padOne, 0);
    manager.poll();
    expect(manager.assignedPad(1)?.index).toBe(0);
  });

  it('não lança exceção sem Gamepad API nem com slots nulos', () => {
    const input = new InputManager();
    const manager = new GamepadManager({
      input,
      readPads: () => [null, null],
      target: null,
    });
    manager.attach();
    expect(() => manager.poll()).not.toThrow();
    expect(manager.connectedPads()).toHaveLength(0);
  });
});

describe('leitura do perfil padrão', () => {
  function activePad(): Harness & { pad: MutablePad } {
    const harness = createHarness();
    const pad = createPad(0);
    harness.pads.push(pad);
    pressButton(pad, 0);
    harness.manager.poll();
    pressButton(pad, 0, false);
    harness.manager.poll();
    harness.input.sample(0);
    return { ...harness, pad };
  }

  it('converte botões do layout standard em ações lógicas', () => {
    const { manager, input, pad } = activePad();
    const expectations: readonly (readonly [number, InputAction])[] = [
      [0, 'light'],
      [1, 'heavy'],
      [2, 'special'],
      [3, 'block'],
      [12, 'up'],
      [13, 'down'],
      [14, 'left'],
      [15, 'right'],
    ];
    for (const [buttonIndex, action] of expectations) {
      pressButton(pad, buttonIndex);
      manager.poll();
      const frame = input.sample(0);
      expect(frame.held.has(action), `${action} via botão ${buttonIndex}`).toBe(true);
      pressButton(pad, buttonIndex, false);
      manager.poll();
      input.sample(0);
    }
  });

  it('alimenta pausa e confirmação como ações de interface', () => {
    const { manager, input, pad } = activePad();
    pressButton(pad, 9);
    manager.poll();
    expect(input.sample(0).pressed.has('pause')).toBe(true);
    pressButton(pad, 9, false);
    pressButton(pad, 0);
    manager.poll();
    const frame = input.sample(0);
    expect(frame.pressed.has('confirm')).toBe(true);
    expect(frame.pressed.has('light')).toBe(true);
  });

  it('aplica deadzone com histerese no analógico e ignora drift', () => {
    const { manager, input, pad } = activePad();

    // Drift abaixo do limiar nunca ativa.
    pad.axes[0] = 0.4;
    manager.poll();
    expect(input.sample(0).held.has('right')).toBe(false);

    // Acima do limiar ativa.
    pad.axes[0] = 0.6;
    manager.poll();
    expect(input.sample(0).held.has('right')).toBe(true);

    // Histerese: valor intermediário mantém ativo.
    pad.axes[0] = 0.4;
    manager.poll();
    expect(input.sample(0).held.has('right')).toBe(true);

    // Abaixo do limiar de soltura desativa.
    pad.axes[0] = 0.2;
    manager.poll();
    const frame = input.sample(0);
    expect(frame.held.has('right')).toBe(false);
    expect(frame.released.has('right')).toBe(true);
  });

  it('combina D-pad e analógico sem soltar enquanto um deles segura', () => {
    const { manager, input, pad } = activePad();
    pressButton(pad, 15);
    pad.axes[0] = 0.9;
    manager.poll();
    expect(input.sample(0).held.has('right')).toBe(true);

    pad.axes[0] = 0;
    manager.poll();
    expect(input.sample(0).held.has('right')).toBe(true);

    pressButton(pad, 15, false);
    manager.poll();
    expect(input.sample(0).held.has('right')).toBe(false);
  });

  it('gera diagonais confiáveis com dois eixos', () => {
    const { manager, input, pad } = activePad();
    pad.axes[0] = 0.8;
    pad.axes[1] = 0.8;
    manager.poll();
    const frame = input.sample(0);
    expect(frame.held.has('right')).toBe(true);
    expect(frame.held.has('down')).toBe(true);
  });
});

describe('bordas após limpeza de estado', () => {
  it('não regenera pressed enquanto o botão continua fisicamente segurado', () => {
    const { manager, input, pads } = createHarness();
    const pad = createPad(0);
    pads.push(pad);
    pressButton(pad, 9);
    manager.poll();
    expect(input.sample(0).pressed.has('pause')).toBe(true);

    // A pausa limpa o estado lógico; o botão segue pressionado no aparelho.
    input.clear();
    input.sample(0);
    manager.poll();
    const frame = input.sample(0);
    expect(frame.held.has('pause')).toBe(true);
    expect(frame.pressed.has('pause')).toBe(false);

    // Uma nova borda só existe depois de soltar e pressionar de novo.
    pressButton(pad, 9, false);
    manager.poll();
    input.sample(0);
    pressButton(pad, 9);
    manager.poll();
    expect(input.sample(0).pressed.has('pause')).toBe(true);
  });
});

describe('desconexão durante o uso', () => {
  it('solta as ações do gamepad sem afetar outras fontes', () => {
    const { manager, input, pads } = createHarness();
    const pad = createPad(0);
    pads.push(pad);
    pressButton(pad, 14);
    manager.poll();
    input.sample(0);

    // Teclado também segura esquerda.
    input.setSourceAction('keyboard', 0, 'left', true);
    input.sample(0);

    pads.length = 0;
    manager.poll();
    const frame = input.sample(0);
    expect(frame.held.has('left')).toBe(true);
    expect(frame.released.has('left')).toBe(false);

    input.setSourceAction('keyboard', 0, 'left', false);
    expect(input.sample(0).released.has('left')).toBe(true);
  });
});

describe('captura de botão', () => {
  it('exige estado neutro antes de aceitar o próximo botão', () => {
    const { manager, pads } = createHarness();
    const pad = createPad(0);
    pads.push(pad);
    pressButton(pad, 0);
    manager.poll();

    const callback = vi.fn();
    manager.startCapture(0, callback);

    // O botão que abriu a captura continua pressionado: nada é capturado.
    manager.poll();
    expect(callback).not.toHaveBeenCalled();

    // Neutro completo e novo botão.
    pressButton(pad, 0, false);
    manager.poll();
    pressButton(pad, 3);
    manager.poll();
    expect(callback).toHaveBeenCalledWith({ buttonIndex: 3 });
    expect(manager.capturing).toBe(false);
  });

  it('captura direções do analógico como D-pad e ignora drift', () => {
    const { manager, pads } = createHarness();
    const pad = createPad(0);
    pads.push(pad);
    pressButton(pad, 0);
    manager.poll();
    pressButton(pad, 0, false);

    const callback = vi.fn();
    manager.startCapture(0, callback);
    manager.poll();

    // Drift moderado não captura.
    pad.axes[0] = 0.4;
    manager.poll();
    expect(callback).not.toHaveBeenCalled();

    pad.axes[0] = 0;
    manager.poll();
    pad.axes[1] = -0.9;
    manager.poll();
    expect(callback).toHaveBeenCalledWith({ buttonIndex: 12 });
  });

  it('pode ser cancelada com segurança', () => {
    const { manager, pads } = createHarness();
    pads.push(createPad(0));
    const callback = vi.fn();
    manager.startCapture(0, callback);
    manager.cancelCapture();
    manager.poll();
    expect(callback).not.toHaveBeenCalled();
    expect(manager.capturing).toBe(false);
  });
});

describe('desligamento', () => {
  it('remove atribuições e libera ações no detach', () => {
    const { manager, input, pads } = createHarness();
    const pad = createPad(0);
    pads.push(pad);
    pressButton(pad, 14);
    manager.poll();
    input.sample(0);

    manager.detach();
    const frame = input.sample(0);
    expect(frame.held.has('left')).toBe(false);
    expect(frame.released.has('left')).toBe(true);
    expect(manager.assignedPad(0)).toBeNull();
  });
});
