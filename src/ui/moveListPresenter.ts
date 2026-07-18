import {
  gamepadButtonLabel,
  gamepadButtonsLine,
  keyboardButtonsLine,
  keyboardMovementLine,
  keyLabel,
  movementKeysSummary,
  TOUCH_BUTTON_PIXEL_LABELS,
  type GamepadFamily,
} from '../input/controlLabels';
import { controlsStore, type ControlsConfig } from '../input/controlsStore';
import type {
  CombatButton,
  DirectionToken,
  FighterDefinition,
  MoveDefinition,
} from '../types/combat';

export type MoveListLineTone = 'player' | 'section' | 'controls' | 'move' | 'note';
export type MoveListDevice = 'keyboard' | 'touch' | 'gamepad';

export interface MoveListLine {
  readonly text: string;
  readonly tone: MoveListLineTone;
}

export interface PauseMoveListModel {
  readonly lines: readonly MoveListLine[];
}

export interface MoveListPresentationOptions {
  readonly device?: MoveListDevice;
  readonly config?: ControlsConfig;
  readonly gamepadFamily?: GamepadFamily;
}

export const MOVE_LIST_DEVICE_LABELS: Readonly<Record<MoveListDevice, string>> = {
  keyboard: 'TECLADO',
  touch: 'TOUCH',
  gamepad: 'CONTROLE',
};

interface PlayerControlLabels {
  readonly movement: string;
  readonly buttons: string;
  readonly down: string;
  readonly button: Readonly<Record<CombatButton, string>>;
}

/** Deriva os rótulos do dispositivo a partir da configuração vigente, para
 * que todas as telas reflitam os bindings reais. */
function controlLabelsFor(
  device: MoveListDevice,
  player: 0 | 1,
  config: ControlsConfig,
  gamepadFamily: GamepadFamily,
): PlayerControlLabels {
  if (device === 'touch') {
    // A fonte pixel não possui o glifo ▣; usa os rótulos ASCII equivalentes.
    return {
      movement: 'DIRECIONAL (DESLIZAR) MOVER/PULAR/AGACHAR',
      buttons: `${TOUCH_BUTTON_PIXEL_LABELS.light} FRACO | ${TOUCH_BUTTON_PIXEL_LABELS.heavy} FORTE | ${TOUCH_BUTTON_PIXEL_LABELS.special} ESPECIAL | ${TOUCH_BUTTON_PIXEL_LABELS.block} DEFESA`,
      down: 'BAIXO',
      button: { ...TOUCH_BUTTON_PIXEL_LABELS },
    };
  }
  if (device === 'gamepad') {
    const profile = config.gamepad[player];
    const label = (button: CombatButton): string =>
      gamepadButtonLabel(gamepadFamily, profile.bindings[button]);
    return {
      movement: 'D-PAD OU ANALOGICO: MOVER, PULAR E AGACHAR',
      buttons: gamepadButtonsLine(profile, gamepadFamily),
      down: 'BAIXO',
      button: {
        light: label('light'),
        heavy: label('heavy'),
        special: label('special'),
        block: label('block'),
      },
    };
  }
  const profile = config.keyboard[player];
  return {
    movement: keyboardMovementLine(profile),
    buttons: keyboardButtonsLine(profile),
    down: keyLabel(profile.bindings.down),
    button: {
      light: keyLabel(profile.bindings.light),
      heavy: keyLabel(profile.bindings.heavy),
      special: keyLabel(profile.bindings.special),
      block: keyLabel(profile.bindings.block),
    },
  };
}

/** Dica de navegação da pausa derivada dos bindings vigentes. */
export function pauseHintText(
  touchCapable: boolean,
  config: ControlsConfig = controlsStore.get(),
): string {
  if (touchCapable) return 'TOQUE EM UMA OPCAO  OU USE > PARA CONTINUAR';
  const playerOne = config.keyboard[0].bindings;
  const playerTwoSummary = movementKeysSummary(config.keyboard[1]);
  return `${keyLabel(playerOne.left)}/${keyLabel(playerOne.right)} OU ${playerTwoSummary} ESCOLHE  ENTER CONFIRMA  ESC CONTINUA`;
}

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
  deviceOrTouchMode: MoveListDevice | boolean = 'keyboard',
  options: MoveListPresentationOptions = {},
): PauseMoveListModel {
  const device: MoveListDevice = typeof deviceOrTouchMode === 'boolean'
    ? deviceOrTouchMode ? 'touch' : 'keyboard'
    : deviceOrTouchMode;
  const config = options.config ?? controlsStore.get();
  const controls = controlLabelsFor(device, player, config, options.gamepadFamily ?? 'generic');
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
      {
        text: `P${player + 1} - ${pixelSafeText(definition.name).toUpperCase()} (${MOVE_LIST_DEVICE_LABELS[device]})`,
        tone: 'player',
      },
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
