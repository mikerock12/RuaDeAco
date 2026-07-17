import type {
  CombatButton,
  DirectionToken,
  FighterDefinition,
  MoveDefinition,
} from '../types/combat';

export type MoveListLineTone = 'player' | 'section' | 'controls' | 'move' | 'note';

export interface MoveListLine {
  readonly text: string;
  readonly tone: MoveListLineTone;
}

export interface PauseMoveListModel {
  readonly lines: readonly MoveListLine[];
}

interface PlayerControlLabels {
  readonly movement: string;
  readonly buttons: string;
  readonly down: string;
  readonly button: Readonly<Record<CombatButton, string>>;
}

const PLAYER_CONTROLS: readonly [PlayerControlLabels, PlayerControlLabels] = [
  {
    movement: 'A/D MOVER | W PULAR | S AGACHAR',
    buttons: 'F FRACO | G FORTE | H ESP | R DEF',
    down: 'S',
    button: { light: 'F', heavy: 'G', special: 'H', block: 'R' },
  },
  {
    movement: 'ESQ/DIR MOVER | CIMA PULAR | BAIXO AGACHAR',
    buttons: 'J FRACO | K FORTE | L ESP | U DEF',
    down: 'BAIXO',
    button: { light: 'J', heavy: 'K', special: 'L', block: 'U' },
  },
];

function pixelSafeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/gu, '');
}

function finalDirection(move: MoveDefinition): DirectionToken | undefined {
  return move.command.directions?.at(-1);
}

function buttonRank(move: MoveDefinition): number {
  const button = move.command.buttons[0];
  return button === 'light' ? 0 : button === 'heavy' ? 1 : button === 'special' ? 2 : 3;
}

function groundRank(move: MoveDefinition): number {
  const direction = finalDirection(move);
  const directionRank = direction === 'down' ? 1 : direction === 'forward' ? 2 : 0;
  return directionRank * 10 + buttonRank(move);
}

function specialRank(move: MoveDefinition): number {
  const direction = finalDirection(move);
  if (direction === 'downForward') return 1;
  if (direction === 'forward') return 2;
  if (direction === 'back') return 3;
  if (direction === 'downBack') return 3;
  if (direction === 'down') return 4;
  return 0;
}

function directionLabel(token: DirectionToken, controls: PlayerControlLabels): string {
  if (token === 'down') return controls.down;
  if (token === 'forward') return 'FRENTE';
  if (token === 'back') return 'TRAS';
  if (token === 'downForward') return `${controls.down}-FRENTE`;
  if (token === 'downBack') return `${controls.down}-TRAS`;
  if (token === 'up') return 'CIMA';
  return '';
}

function commandLabel(move: MoveDefinition, controls: PlayerControlLabels, airborne = false): string {
  const directions = airborne
    ? []
    : (move.command.directions ?? []).map((token) => directionLabel(token, controls)).filter(Boolean);
  const buttons = move.command.buttons.map((button) => controls.button[button]);
  return [...directions, ...buttons].join('+');
}

function moveLine(move: MoveDefinition, controls: PlayerControlLabels, airborne = false): MoveListLine {
  const cost = move.meterCost > 0 ? ` [${move.meterCost} ENERGIA]` : '';
  return {
    text: `${commandLabel(move, controls, airborne)} ${pixelSafeText(move.label).toUpperCase()}${cost}`,
    tone: 'move',
  };
}

export function buildPauseMoveList(
  definition: FighterDefinition,
  player: 0 | 1,
): PauseMoveListModel {
  const controls = PLAYER_CONTROLS[player];
  const moves = Object.values(definition.moves);
  const ground = moves
    .filter((move) => !move.air && move.state !== 'specialAttack')
    .sort((left, right) => groundRank(left) - groundRank(right));
  const air = moves
    .filter((move) => move.air && move.jumpTrajectory === 'neutral')
    .sort((left, right) => buttonRank(left) - buttonRank(right));
  const specials = moves
    .filter((move) => !move.air && move.state === 'specialAttack')
    .sort((left, right) => specialRank(left) - specialRank(right));

  return {
    lines: [
      { text: `P${player + 1} - ${pixelSafeText(definition.name).toUpperCase()}`, tone: 'player' },
      { text: 'MOVIMENTO E DEFESA', tone: 'section' },
      { text: controls.movement, tone: 'controls' },
      { text: controls.buttons, tone: 'controls' },
      { text: 'ATAQUES NO CHAO', tone: 'section' },
      ...ground.map((move) => moveLine(move, controls)),
      { text: 'ATAQUES NO AR', tone: 'section' },
      ...air.map((move) => moveLine(move, controls, true)),
      { text: 'MUDA COM A DIRECAO DO PULO', tone: 'note' },
      { text: 'ESPECIAIS', tone: 'section' },
      ...specials.map((move) => moveLine(move, controls)),
    ],
  };
}
