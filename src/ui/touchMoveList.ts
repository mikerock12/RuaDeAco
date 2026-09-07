import type { FighterDefinition, MoveDefinition } from '../types/combat';
import { toPixelFontText } from '../utils/textLayout';
import { TOUCH_BUTTON_PIXEL_LABELS } from '../input/controlLabels';

const DIRECTIONS = {
  neutral: 'NEUTRO', up: 'CIMA', down: 'BAIXO', forward: 'FRENTE',
  back: 'TRAS', downForward: 'BAIXO-FRENTE', downBack: 'BAIXO-TRAS',
} as const;

export function touchMoveCommand(move: MoveDefinition): string {
  const directions = (move.command.directions ?? []).map((direction) => DIRECTIONS[direction]);
  const buttons = move.command.buttons.map((button) => TOUCH_BUTTON_PIXEL_LABELS[button]).join('+');
  return directions.length ? directions.join(' > ') + ' + ' + buttons : buttons;
}

export interface TouchMovePage {
  readonly title: string;
  readonly lines: readonly string[];
}

/** Páginas curtas mantêm comandos e custos legíveis sem diminuir a fonte. */
export function buildTouchMovePages(fighter: FighterDefinition): readonly TouchMovePage[] {
  const moves = Object.values(fighter.moves);
  const label = (move: MoveDefinition): string => toPixelFontText(move.label).toUpperCase();
  const ground = moves.filter((move) => !move.air && move.state !== 'specialAttack');
  const air = moves.filter((move) => move.air && move.jumpTrajectory === 'neutral');
  const specials = moves.filter((move) => !move.air && move.state === 'specialAttack');
  return [
    {
      title: 'COMO JOGAR',
      lines: [
        'DESLIZE O DIRECIONAL PARA MOVER.',
        'CIMA PULA. BAIXO AGACHA.',
        'A = FRACO    B = FORTE    S = ESPECIAL',
        'SEGURE DEFESA PARA BLOQUEAR EM PE.',
        'BAIXO + DEFESA BLOQUEIA GOLPES BAIXOS.',
        'FRENTE E TRAS ACOMPANHAM O RIVAL.',
      ],
    },
    { title: 'NO CHAO', lines: ground.map((move) => touchMoveCommand(move) + '   ' + label(move)) },
    {
      title: 'NO AR',
      lines: [
        ...air.map((move) => touchMoveCommand(move) + '   ' + label(move)),
        'O GOLPE MUDA COM A DIRECAO DO PULO.',
        'USE BAIXO + B PARA TENTAR UMA RASTEIRA.',
      ],
    },
    {
      title: 'ESPECIAIS',
      lines: specials.flatMap((move) => [
        label(move) + (move.meterCost ? ' [' + move.meterCost + ' ENERGIA]' : ' [SEM CUSTO]'),
        touchMoveCommand(move),
      ]),
    },
  ];
}
