import { describe, expect, it } from 'vitest';
import { astroRiso } from '../../fighters/astroRiso';
import { gutoBarba } from '../../fighters/gutoBarba';
import { leoVioleta } from '../../fighters/leoVioleta';
import { noirReflexo } from '../../fighters/noirReflexo';
import { rafaMare } from '../../fighters/rafaMare';
import { touchDpadActions } from '../../input/touchDirection';
import type { InputAction, InputCommand, InputFrame } from '../../types/combat';
import {
  CommandBuffer,
  directionFromInput,
  matchCommand,
  type ButtonSample,
  type DirectionSample,
} from '../CommandBuffer';

const frame = (held: readonly InputAction[], pressed: readonly InputAction[] = []): InputFrame => ({
  held: new Set(held),
  pressed: new Set(pressed),
  released: new Set(),
});

const quarterCircle: InputCommand = {
  directions: ['down', 'downForward', 'forward'],
  buttons: ['special'],
  maxGapFrames: 5,
  bufferFrames: 7,
  priority: 30,
};

const validSamples: readonly DirectionSample[] = [
  { token: 'neutral', frame: 0 },
  { token: 'down', frame: 2 },
  { token: 'downForward', frame: 5 },
  { token: 'forward', frame: 8 },
];

describe('leitura de comandos', () => {
  it('reconhece quarto de lua e botão no prazo', () => {
    expect(matchCommand(quarterCircle, validSamples, frame(['special'], ['special']), 10)).toBe(true);
  });

  it('rejeita sequência expirada ou fora de ordem', () => {
    expect(matchCommand(quarterCircle, validSamples, frame(['special'], ['special']), 20)).toBe(false);
    const wrong: readonly DirectionSample[] = [
      { token: 'forward', frame: 2 },
      { token: 'downForward', frame: 5 },
      { token: 'down', frame: 8 },
    ];
    expect(matchCommand(quarterCircle, wrong, frame(['special'], ['special']), 10)).toBe(false);
  });

  it('rejeita botão pressionado antes de iniciar o movimento direcional', () => {
    const lateMotion: readonly DirectionSample[] = [
      { token: 'down', frame: 6 },
      { token: 'downForward', frame: 8 },
      { token: 'forward', frame: 10 },
    ];
    const earlyButton: readonly ButtonSample[] = [{ button: 'special', frame: 5 }];
    expect(matchCommand(quarterCircle, lateMotion, frame([]), 10, earlyButton)).toBe(false);
  });

  it('não dispara novamente quando o botão está apenas segurado', () => {
    expect(matchCommand(quarterCircle, validSamples, frame(['special']), 10)).toBe(false);
  });

  it('consome um botão pressionado durante a janela de buffer', () => {
    const buffer = new CommandBuffer();
    buffer.push(1, frame(['light'], ['light']), 1);
    buffer.push(2, frame([]), 1);
    const move = buffer.findMove({ lightPunch: rafaMare.moves.lightPunch! }, frame([]), 2, 0);
    expect(move?.id).toBe('lightPunch');
  });

  it('normaliza frente e diagonal para lutadores virados à esquerda', () => {
    expect(directionFromInput(frame(['left']), -1)).toBe('forward');
    expect(directionFromInput(frame(['down', 'left']), -1)).toBe('downForward');
    expect(directionFromInput(frame(['right']), -1)).toBe('back');
    expect(directionFromInput(frame(['down', 'right']), -1)).toBe('downBack');
    expect(directionFromInput(frame(['down', 'left']), 1)).toBe('downBack');
  });

  it('golpe de direção única "baixo" aceita a diagonal baixo-frente', () => {
    const lowCommand: InputCommand = {
      directions: ['down'],
      buttons: ['light'],
      maxGapFrames: 2,
      bufferFrames: 5,
      priority: 14,
    };
    const diagonalSamples: readonly DirectionSample[] = [{ token: 'downForward', frame: 3 }];
    expect(matchCommand(lowCommand, diagonalSamples, frame(['light'], ['light']), 3)).toBe(true);
    // Sequências continuam estritas: quarto de círculo não aceita atalhos.
    const sloppy: readonly DirectionSample[] = [
      { token: 'downForward', frame: 2 },
      { token: 'downForward', frame: 5 },
      { token: 'forward', frame: 8 },
    ];
    expect(matchCommand(quarterCircle, sloppy, frame(['special'], ['special']), 10)).toBe(false);
  });

  it('separa golpes aéreos dos terrestres no findMove', () => {
    const buffer = new CommandBuffer();
    buffer.push(1, frame(['light'], ['light']), 1);
    const moves = { lightPunch: rafaMare.moves.lightPunch!, jumpLightNeutral: rafaMare.moves.jumpLightNeutral! };
    expect(buffer.findMove(moves, frame(['light'], ['light']), 1, 0)?.id).toBe('lightPunch');
    expect(buffer.findMove(moves, frame(['light'], ['light']), 1, 0, true)?.id).toBe('jumpLightNeutral');
  });

  it('prioriza especiais simples neutro, frente e baixo', () => {
    const neutral = new CommandBuffer();
    neutral.push(1, frame(['special'], ['special']), 1);
    expect(neutral.findMove(rafaMare.moves, frame(['special'], ['special']), 1, 100)?.id)
      .toBe('maoDaMare');

    const forward = new CommandBuffer();
    forward.push(1, frame(['right', 'special'], ['special']), 1);
    expect(forward.findMove(rafaMare.moves, frame(['right', 'special'], ['special']), 1, 100)?.id)
      .toBe('chuteRessaca');

    const down = new CommandBuffer();
    down.push(1, frame(['down', 'special'], ['special']), 1);
    expect(down.findMove(rafaMare.moves, frame(['down', 'special'], ['special']), 1, 50)?.id)
      .toBe('ecoTatuado');
  });

  it('não cai no especial neutro quando falta energia para o direcional pretendido', () => {
    const rafa = new CommandBuffer();
    rafa.push(1, frame(['down', 'special'], ['special']), 1);
    expect(rafa.findMove(rafaMare.moves, frame(['down', 'special'], ['special']), 1, 0)).toBeNull();

    const guto = new CommandBuffer();
    guto.push(1, frame(['down', 'special'], ['special']), 1);
    expect(guto.findMove(gutoBarba.moves, frame(['down', 'special'], ['special']), 1, 0)).toBeNull();
  });

  it.each([
    {
      moveId: 'sorrisoRelampago',
      right: [['right'], ['down'], ['down', 'right']],
      left: [['left'], ['down'], ['down', 'left']],
      meter: 0,
    },
    {
      moveId: 'rajadaNeon',
      right: [['down'], ['down', 'right'], ['right']],
      left: [['down'], ['down', 'left'], ['left']],
      meter: 0,
    },
    {
      moveId: 'astroGiro',
      right: [['down'], ['down', 'left'], ['left']],
      left: [['down'], ['down', 'right'], ['right']],
      meter: 100,
    },
  ] as const)('reconhece $moveId nos dois lados', ({ moveId, right, left, meter }) => {
    for (const [facing, sequence] of [[1, right], [-1, left]] as const) {
      const buffer = new CommandBuffer();
      sequence.forEach((held, index) => {
        const final = index === sequence.length - 1;
        const actions = [...held, ...(final ? ['special'] as const : [])];
        buffer.push(index * 3 + 1, frame(actions, final ? ['special'] : []), facing);
      });
      const currentFrame = (sequence.length - 1) * 3 + 1;
      const current = frame(
        [...sequence.at(-1)!, 'special'],
        ['special'],
      );
      expect(buffer.findMove(astroRiso.moves, current, currentFrame, meter)?.id).toBe(moveId);
    }
  });

  it('não aceita especiais incompletos e não deixa normais roubarem a prioridade', () => {
    const incomplete = new CommandBuffer();
    incomplete.push(1, frame(['down']), 1);
    incomplete.push(4, frame(['right', 'special'], ['special']), 1);
    expect(incomplete.findMove(astroRiso.moves, frame(['right', 'special'], ['special']), 4, 100))
      .toBeNull();

    const complete = new CommandBuffer();
    complete.push(1, frame(['down']), 1);
    complete.push(4, frame(['down', 'right']), 1);
    complete.push(7, frame(['right', 'special'], ['special']), 1);
    expect(complete.findMove(astroRiso.moves, frame(['right', 'special'], ['special']), 7, 100)?.id)
      .toBe('rajadaNeon');
  });

  it('impede o Astro Giro sem energia suficiente', () => {
    const buffer = new CommandBuffer();
    buffer.push(1, frame(['down']), 1);
    buffer.push(4, frame(['down', 'left']), 1);
    buffer.push(7, frame(['left', 'special'], ['special']), 1);
    const current = frame(['left', 'special'], ['special']);
    expect(buffer.findMove(astroRiso.moves, current, 7, 99)).toBeNull();
    expect(buffer.findMove(astroRiso.moves, current, 7, 100)?.id).toBe('astroGiro');
  });

  it.each([
    {
      fighter: leoVioleta,
      moveId: 'olharFrio',
      right: [['down'], ['down', 'right'], ['right']],
      left: [['down'], ['down', 'left'], ['left']],
      meter: 0,
    },
    {
      fighter: leoVioleta,
      moveId: 'impactoSombrio',
      right: [['right'], ['down'], ['down', 'right']],
      left: [['left'], ['down'], ['down', 'left']],
      meter: 0,
    },
    {
      fighter: leoVioleta,
      moveId: 'pressaoVioleta',
      right: [['down'], ['down', 'left'], ['left']],
      left: [['down'], ['down', 'right'], ['right']],
      meter: 100,
    },
    {
      fighter: noirReflexo,
      moveId: 'reflexoNegro',
      right: [['right'], ['down'], ['down', 'right']],
      left: [['left'], ['down'], ['down', 'left']],
      meter: 0,
    },
    {
      fighter: noirReflexo,
      moveId: 'quebraLuz',
      right: [['down'], ['down', 'right'], ['right']],
      left: [['down'], ['down', 'left'], ['left']],
      meter: 0,
    },
    {
      fighter: noirReflexo,
      moveId: 'impactoSolar',
      right: [['down'], ['down', 'left'], ['left']],
      left: [['down'], ['down', 'right'], ['right']],
      meter: 100,
    },
  ] as const)('reconhece $fighter.id.$moveId nos dois lados', ({
    fighter,
    moveId,
    right,
    left,
    meter,
  }) => {
    for (const [facing, sequence] of [[1, right], [-1, left]] as const) {
      const buffer = new CommandBuffer();
      sequence.forEach((held, index) => {
        const final = index === sequence.length - 1;
        const actions = [...held, ...(final ? ['special'] as const : [])];
        buffer.push(index * 3 + 1, frame(actions, final ? ['special'] : []), facing);
      });
      const currentFrame = (sequence.length - 1) * 3 + 1;
      const current = frame([...sequence.at(-1)!, 'special'], ['special']);
      expect(
        buffer.findMove(fighter.moves, current, currentFrame, meter)?.id,
        `${fighter.id} facing=${facing}`,
      ).toBe(moveId);
    }
  });

  it.each([
    [leoVioleta, 'pressaoVioleta'],
    [noirReflexo, 'impactoSolar'],
  ] as const)('impede %s.%s com 99 de energia', (fighter, moveId) => {
    const buffer = new CommandBuffer();
    buffer.push(1, frame(['down']), 1);
    buffer.push(4, frame(['down', 'left']), 1);
    buffer.push(7, frame(['left', 'special'], ['special']), 1);
    const current = frame(['left', 'special'], ['special']);
    expect(buffer.findMove(fighter.moves, current, 7, 99)).toBeNull();
    expect(buffer.findMove(fighter.moves, current, 7, 100)?.id).toBe(moveId);
  });

  it.each([leoVioleta, noirReflexo])(
    'não aceita motion incompleto nem deixa normal roubar a prioridade de %s',
    (fighter) => {
      const incomplete = new CommandBuffer();
      incomplete.push(1, frame(['down']), 1);
      incomplete.push(4, frame(['right', 'special'], ['special']), 1);
      expect(
        incomplete.findMove(
          fighter.moves,
          frame(['right', 'special'], ['special']),
          4,
          100,
        ),
      ).toBeNull();

      const complete = new CommandBuffer();
      complete.push(1, frame(['down']), 1);
      complete.push(4, frame(['down', 'right']), 1);
      complete.push(7, frame(['right', 'light', 'special'], ['light', 'special']), 1);
      expect(
        complete.findMove(
          fighter.moves,
          frame(['right', 'light', 'special'], ['light', 'special']),
          7,
          100,
        )?.id,
      ).toBe(fighter === leoVioleta ? 'olharFrio' : 'quebraLuz');
    },
  );

  it.each([
    ['sorrisoRelampago', [[0.75, 0], [0, 0.75], [0.7, 0.7]], 0],
    ['rajadaNeon', [[0, 0.75], [0.7, 0.7], [0.75, 0]], 0],
    ['astroGiro', [[0, 0.75], [-0.7, 0.7], [-0.75, 0]], 100],
  ] as const)('executa %s com o rolamento do direcional touch', (moveId, points, meter) => {
    const buffer = new CommandBuffer();
    points.forEach(([x, y], index) => {
      const final = index === points.length - 1;
      const actions = [...touchDpadActions(x, y), ...(final ? ['special'] as const : [])];
      buffer.push(index * 3 + 1, frame(actions, final ? ['special'] : []), 1);
    });
    const [x, y] = points.at(-1)!;
    const current = frame([...touchDpadActions(x, y), 'special'], ['special']);
    expect(buffer.findMove(astroRiso.moves, current, 7, meter)?.id).toBe(moveId);
  });
});
