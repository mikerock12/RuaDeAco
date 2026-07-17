import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { audioManager } from '../audio/AudioManager';
import { MUSIC_TRACK_BY_SCENE } from '../audio/musicCatalog';
import { CAIS_DA_CIDADE } from '../config/gameConfig';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, PALETTE } from '../config/pixelArtConfig';
import { gameSession } from '../config/session';
import { FIGHTERS } from '../fighters';
import { inputManager } from '../input/InputManager';
import type { FighterDefinition, InputFrame } from '../types/combat';
import { createConceptPortrait } from '../ui/PortraitView';
import { pixelText } from '../utils/text';

type SelectionPhase = 'playerOne' | 'opponent' | 'arena';

interface FighterCard {
  readonly container: Phaser.GameObjects.Container;
  readonly frame: Phaser.GameObjects.Rectangle;
  readonly fighter: FighterDefinition;
  readonly restingX: number;
}

const CARD_COLUMNS = 3;
const CARD_ROWS = 2;

function wrapCopy(value: string, maxCharacters: number): string {
  const words = value.toUpperCase().split(/\s+/u);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length <= maxCharacters) {
      current = candidate;
    } else {
      if (current.length > 0) lines.push(current);
      current = word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.slice(0, 4).join('\n');
}

export class CharacterSelectScene extends Phaser.Scene {
  private selectionLayer!: Phaser.GameObjects.Container;
  private arenaLayer!: Phaser.GameObjects.Container;
  private phaseTitle!: Phaser.GameObjects.BitmapText;
  private footerText!: Phaser.GameObjects.BitmapText;
  private cards: FighterCard[] = [];
  private detailContainer: Phaser.GameObjects.Container | null = null;
  private arenaCard: Phaser.GameObjects.Container | null = null;
  private phase: SelectionPhase = 'playerOne';
  private cursorIndex = 0;
  private chosenPlayerOne: FighterDefinition | null = null;
  private chosenOpponent: FighterDefinition | null = null;
  private confirming = false;

  constructor() {
    super('CharacterSelectScene');
  }

  create(): void {
    void audioManager.playMusic(MUSIC_TRACK_BY_SCENE.CharacterSelectScene);
    inputManager.attach();
    this.phase = 'playerOne';
    this.confirming = false;
    this.chosenPlayerOne = null;
    this.chosenOpponent = null;
    this.cards = [];
    this.detailContainer = null;
    this.arenaCard = null;
    this.cursorIndex = Math.max(0, FIGHTERS.findIndex((fighter) => fighter.id === gameSession.selection.playerOne));

    this.cameras.main.setBackgroundColor(PALETTE.ink);
    this.drawBackdrop();

    pixelText(this, INTERNAL_WIDTH / 2, 16, 'SELECAO DE LUTADORES', {
      size: 16,
      color: '#ffd55c',
      align: 'center',
    });
    this.phaseTitle = pixelText(this, INTERNAL_WIDTH / 2, 38, '', {
      size: 16,
      color: '#9af7ff',
      align: 'center',
    });

    this.selectionLayer = this.add.container(0, 0);
    this.arenaLayer = this.add.container(0, 0).setVisible(false);
    this.footerText = pixelText(this, INTERNAL_WIDTH / 2, INTERNAL_HEIGHT - 10, '', {
      size: 16,
      color: '#aebbd0',
      align: 'center',
    });
    this.createBackButton();

    this.createFighterCards();
    this.updatePhaseCopy();
    this.refreshSelection();
  }

  update(): void {
    const playerOneInput = inputManager.sample(0);
    const playerTwoInput = inputManager.sample(1);
    if (this.confirming) return;

    if (this.phase === 'arena') {
      if (playerOneInput.pressed.has('cancel')) {
        this.returnToOpponentSelection();
      } else if (this.isConfirmPressed(playerOneInput)) {
        this.confirmArena();
      }
      return;
    }

    if (playerOneInput.pressed.has('cancel')) {
      this.goBack();
      return;
    }

    const activeInput = this.phase === 'opponent' && gameSession.selection.mode === 'versus'
      ? playerTwoInput
      : playerOneInput;
    const horizontal = Number(activeInput.pressed.has('right')) - Number(activeInput.pressed.has('left'));
    const vertical = Number(activeInput.pressed.has('down')) - Number(activeInput.pressed.has('up'));

    if (horizontal !== 0 || vertical !== 0) this.moveCursor(horizontal, vertical);
    if (this.isConfirmPressed(activeInput)) this.confirmFighter();
  }

  private createBackButton(): void {
    const background = this.add.rectangle(52, 16, 88, 24, PALETTE.panel, 1)
      .setStrokeStyle(2, PALETTE.cyan)
      .setInteractive({ useHandCursor: true })
      .setDepth(100);
    pixelText(this, 52, 16, '< VOLTAR', {
      size: 16,
      color: '#9af7ff',
      align: 'center',
    }).setDepth(101);

    background.on('pointerdown', () => {
      if (this.confirming) return;
      background.setFillStyle(PALETTE.panelLight, 1);
      if (this.phase === 'arena') {
        audioManager.unlock();
        audioManager.play('confirm');
        this.returnToOpponentSelection();
      } else {
        this.goBack();
      }
    });
    const release = (): void => {
      background.setFillStyle(PALETTE.panel, 1);
    };
    background.on('pointerup', release);
    background.on('pointerout', release);
  }

  private drawBackdrop(): void {
    const { stage } = ASSET_MANIFEST;
    this.add.image(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.far.key).setScale(2);
    this.add.image(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.mid.key).setScale(2);
    this.add.sprite(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.water.key, 2).setScale(2);
    this.add.image(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, stage.foreground.key).setScale(2);
    this.add.rectangle(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, INTERNAL_WIDTH, INTERNAL_HEIGHT, PALETTE.ink, 0.78);
    this.add.rectangle(180, 188, 356, 272, PALETTE.panel, 0.94).setStrokeStyle(2, PALETTE.steelDark);
    this.add.rectangle(500, 188, 276, 272, PALETTE.ink, 0.94).setStrokeStyle(2, PALETTE.steelDark);
    this.add.rectangle(358, 188, 2, 268, PALETTE.gold, 0.5);
    this.add.rectangle(INTERNAL_WIDTH / 2, 50, INTERNAL_WIDTH, 2, PALETTE.cyan, 0.8);
    this.add.rectangle(INTERNAL_WIDTH / 2, 324, INTERNAL_WIDTH, 2, PALETTE.pink, 0.65);
  }

  private createFighterCards(): void {
    const xPositions = [62, 178, 294] as const;
    const yPositions = [116, 238] as const;

    FIGHTERS.forEach((fighter, index) => {
      const column = index % CARD_COLUMNS;
      const row = Math.floor(index / CARD_COLUMNS);
      const x = xPositions[column];
      const y = yPositions[row];
      if (x === undefined || y === undefined) return;

      const frame = this.add.rectangle(0, 0, 104, 108, PALETTE.panel, 1)
        .setStrokeStyle(2, fighter.available ? PALETTE.metalLight : PALETTE.metalDark)
        .setInteractive({ useHandCursor: true });
      const concept = ASSET_MANIFEST.concepts[fighter.id];
      let portrait: Phaser.GameObjects.GameObject;
      if (this.textures.exists(concept.key)) {
        portrait = createConceptPortrait(this, 0, -16, fighter.id, 92, 64, {
          crop: 'framed',
          locked: !fighter.available,
          frameColor: fighter.available ? fighter.visual.accent : PALETTE.muted,
        });
      } else {
        const missing = this.add.container(0, -16);
        missing.add(this.add.rectangle(0, 0, 92, 64, PALETTE.ink, 1).setStrokeStyle(2, PALETTE.pink));
        missing.add(pixelText(this, 0, 0, 'IMAGEM\nAUSENTE', {
          size: 16,
          color: '#f64070',
          align: 'center',
        }));
        portrait = missing;
      }

      const name = pixelText(this, 0, 26, fighter.name.split(' ')[0] ?? fighter.name, {
        size: 16,
        color: fighter.available ? '#f7f2d0' : '#80889a',
        align: 'center',
      });
      const status = pixelText(this, 0, 44, fighter.available ? 'OK' : 'DEV', {
        size: 16,
        color: fighter.available ? '#29d9ff' : '#e08499',
        align: 'center',
      });
      const container = this.add.container(x, y, [frame, portrait, name, status]);

      frame.on('pointerover', () => this.selectCard(index));
      frame.on('pointerdown', () => {
        audioManager.unlock();
        if (this.cursorIndex === index) {
          this.confirmFighter();
        } else {
          this.selectCard(index);
        }
      });
      this.selectionLayer.add(container);
      this.cards.push({ container, frame, fighter, restingX: x });
    });
  }

  private selectCard(index: number): void {
    if (this.confirming || this.phase === 'arena' || index === this.cursorIndex) return;
    this.cursorIndex = index;
    this.refreshSelection();
  }

  private moveCursor(horizontal: number, vertical: number): void {
    let column = this.cursorIndex % CARD_COLUMNS;
    let row = Math.floor(this.cursorIndex / CARD_COLUMNS);
    column = (column + Math.sign(horizontal) + CARD_COLUMNS) % CARD_COLUMNS;
    row = (row + Math.sign(vertical) + CARD_ROWS) % CARD_ROWS;
    const nextIndex = row * CARD_COLUMNS + column;
    if (nextIndex === this.cursorIndex || !FIGHTERS[nextIndex]) return;
    this.cursorIndex = nextIndex;
    this.refreshSelection();
  }

  private refreshSelection(): void {
    this.cards.forEach((card, index) => {
      const selected = index === this.cursorIndex;
      const accent = card.fighter.available ? card.fighter.visual.accent : PALETTE.muted;
      card.frame.setStrokeStyle(selected ? 4 : 2, selected ? accent : PALETTE.metalLight, 1);
      card.frame.setFillStyle(selected ? PALETTE.panelLight : PALETTE.panel, 1);
      card.container.setAlpha(card.fighter.available ? 1 : selected ? 0.82 : 0.58);
      card.container.setX(card.restingX);
    });
    this.renderFighterDetails(this.fighterAt(this.cursorIndex));
  }

  private renderFighterDetails(fighter: FighterDefinition): void {
    this.detailContainer?.destroy();

    const panel = this.add.rectangle(500, 192, 268, 268, PALETTE.panel, 1)
      .setStrokeStyle(4, fighter.available ? fighter.visual.accent : PALETTE.muted, 1);
    const metalTop = this.add.rectangle(500, 62, 260, 6, PALETTE.metalLight, 1);
    const label = pixelText(this, 374, 72, 'FICHA DO LUTADOR', {
      size: 16,
      color: '#ffd55c',
    });
    const portrait = createConceptPortrait(this, 410, 132, fighter.id, 72, 96, {
      crop: 'hud',
      locked: !fighter.available,
      frameColor: fighter.available ? fighter.visual.accent : PALETTE.muted,
    });
    const name = pixelText(this, 460, 90, fighter.name.toUpperCase(), {
      size: 16,
      color: fighter.available ? '#f7f2d0' : '#9aa2b2',
    });
    const archetype = pixelText(this, 460, 112, wrapCopy(fighter.archetype, 14), {
      size: 16,
      color: fighter.available ? '#29d9ff' : '#80889a',
    }).setOrigin(0, 0);
    const abilitiesLabel = pixelText(this, 374, 188, 'HABILIDADES', {
      size: 16,
      color: '#ffd55c',
    });
    const abilityTexts = fighter.abilities.map((ability, index) => pixelText(
      this,
      374,
      210 + index * 22,
      `> ${ability.toUpperCase()}`,
      {
        size: 16,
        color: fighter.available ? '#f7f2d0' : '#747d90',
      },
    ));
    const children: Phaser.GameObjects.GameObject[] = [
      panel,
      metalTop,
      label,
      portrait,
      name,
      archetype,
      abilitiesLabel,
      ...abilityTexts,
    ];

    if (fighter.available) {
      const button = this.add.rectangle(502, 302, 224, 28, 0x12364c, 1)
        .setStrokeStyle(2, PALETTE.cyan)
        .setInteractive({ useHandCursor: true });
      const buttonLabel = pixelText(this, 502, 302, 'CONFIRMAR', {
        size: 16,
        color: '#9af7ff',
        align: 'center',
      });
      button.on('pointerover', () => button.setFillStyle(PALETTE.panelLight, 1));
      button.on('pointerout', () => button.setFillStyle(0x12364c, 1));
      button.on('pointerdown', () => {
        button.setFillStyle(0x205e78, 1);
        this.confirmFighter();
      });
      children.push(button, buttonLabel);
    } else {
      children.push(pixelText(this, 502, 302, 'EM DESENVOLVIMENTO', {
        size: 16,
        color: '#e08499',
        align: 'center',
      }));
    }

    this.detailContainer = this.add.container(0, 0, children);
    this.selectionLayer.add(this.detailContainer);
  }

  private confirmFighter(): void {
    if (this.confirming || this.phase === 'arena') return;
    const fighter = this.fighterAt(this.cursorIndex);
    const card = this.cards[this.cursorIndex];
    if (!card) return;

    audioManager.unlock();
    if (!fighter.available) {
      audioManager.play('block');
      card.frame.setFillStyle(PALETTE.pink, 1);
      card.container.setX(card.restingX + 4);
      this.time.delayedCall(45, () => card.container.setX(card.restingX - 4));
      this.time.delayedCall(90, () => this.refreshSelection());
      return;
    }

    this.confirming = true;
    audioManager.play('confirm');
    card.frame.setFillStyle(PALETTE.gold, 1);
    card.container.setX(card.restingX + 4);
    this.time.delayedCall(45, () => {
      card.container.setX(card.restingX - 4);
      card.container.setVisible(false);
    });
    this.time.delayedCall(90, () => {
      card.container.setX(card.restingX);
      card.container.setVisible(true);
    });
    this.time.delayedCall(135, () => {
      this.confirming = false;
      this.acceptFighter(fighter);
    });
  }

  private acceptFighter(fighter: FighterDefinition): void {
    if (this.phase === 'playerOne') {
      this.chosenPlayerOne = fighter;
      gameSession.setSelection({ playerOne: fighter.id });
      this.phase = 'opponent';
      const alternative = FIGHTERS.findIndex((candidate) => candidate.available && candidate.id !== fighter.id);
      this.cursorIndex = alternative >= 0 ? alternative : this.cursorIndex;
      this.updatePhaseCopy();
      this.refreshSelection();
      return;
    }

    this.chosenOpponent = fighter;
    gameSession.setSelection({ playerTwo: fighter.id });
    this.phase = 'arena';
    this.showArenaSelection();
  }

  private showArenaSelection(): void {
    const playerOne = this.chosenPlayerOne;
    const opponent = this.chosenOpponent;
    if (!playerOne || !opponent) return;

    this.selectionLayer.setVisible(false);
    this.arenaLayer.removeAll(true);
    this.arenaLayer.setVisible(true);
    this.phaseTitle.setText('ARENA E CONFRONTO');
    this.footerText.setText('ENTER / F OU TOQUE PARA LUTAR  |  ESC VOLTA');

    const panel = this.add.rectangle(0, 0, 616, 272, PALETTE.panel, 1)
      .setStrokeStyle(4, PALETTE.cyan, 1);
    const topRail = this.add.rectangle(0, -132, 608, 8, PALETTE.metalLight, 1);
    const arenaName = pixelText(this, 0, -112, CAIS_DA_CIDADE.name, {
      size: 16,
      color: '#ffd55c',
      align: 'center',
    });
    const arenaSubtitle = pixelText(
      this,
      0,
      -90,
      'NOITE | ZONA PORTUARIA',
      {
        size: 16,
      color: '#9af7ff',
      align: 'center',
      },
    );

    const portraitOne = createConceptPortrait(this, -188, 10, playerOne.id, 168, 176, {
      crop: 'framed',
      frameColor: playerOne.visual.accent,
    });
    const portraitTwo = createConceptPortrait(this, 188, 10, opponent.id, 168, 176, {
      crop: 'framed',
      frameColor: opponent.visual.accent,
    });
    const nameOne = pixelText(this, -188, 110, playerOne.name.toUpperCase(), {
      size: 16,
      color: '#f7f2d0',
      align: 'center',
    });
    const nameTwo = pixelText(this, 188, 110, opponent.name.toUpperCase(), {
      size: 16,
      color: '#f7f2d0',
      align: 'center',
    });

    const stagePreview = this.createCaisPreview();
    const versus = pixelText(this, 0, -8, 'VS', {
      size: 32,
      color: '#f64070',
      align: 'center',
    });
    const button = this.add.rectangle(0, 118, 184, 28, 0x12364c, 1)
      .setStrokeStyle(2, PALETTE.cyan)
      .setInteractive({ useHandCursor: true });
    const buttonLabel = pixelText(this, 0, 118, 'LUTAR NO CAIS', {
      size: 16,
      color: '#9af7ff',
      align: 'center',
    });
    button.on('pointerover', () => button.setFillStyle(PALETTE.panelLight, 1));
    button.on('pointerout', () => button.setFillStyle(0x12364c, 1));
    button.on('pointerdown', () => {
      button.setFillStyle(0x205e78, 1);
      this.confirmArena();
    });

    this.arenaCard = this.add.container(INTERNAL_WIDTH / 2, 188, [
      panel,
      topRail,
      arenaName,
      arenaSubtitle,
      portraitOne,
      portraitTwo,
      stagePreview,
      versus,
      nameOne,
      nameTwo,
      button,
      buttonLabel,
    ]);
    this.arenaLayer.add(this.arenaCard);
  }

  private createCaisPreview(): Phaser.GameObjects.Container {
    const { stage } = ASSET_MANIFEST;
    const far = this.add.image(0, 58, stage.far.key).setDisplaySize(152, 86);
    const mid = this.add.image(0, 58, stage.mid.key).setDisplaySize(152, 86);
    const water = this.add.sprite(0, 58, stage.water.key, 3).setDisplaySize(152, 86);
    const foreground = this.add.image(0, 58, stage.foreground.key).setDisplaySize(152, 86);
    const shade = this.add.rectangle(0, 58, 152, 86, PALETTE.ink, 0.18);
    const frame = this.add.rectangle(0, 58, 156, 90, 0x000000, 0).setStrokeStyle(2, PALETTE.pink);
    return this.add.container(0, 0, [far, mid, water, foreground, shade, frame]);
  }

  private confirmArena(): void {
    if (this.confirming || !this.arenaCard) return;
    this.confirming = true;
    gameSession.setSelection({ arena: CAIS_DA_CIDADE.id });
    audioManager.unlock();
    audioManager.play('confirm');

    this.arenaCard.setX(INTERNAL_WIDTH / 2 + 4);
    this.time.delayedCall(50, () => this.arenaCard?.setX(INTERNAL_WIDTH / 2 - 4));
    this.time.delayedCall(100, () => this.arenaCard?.setX(INTERNAL_WIDTH / 2));
    this.time.delayedCall(140, () => {
      const shutter = this.add.rectangle(-INTERNAL_WIDTH / 2, INTERNAL_HEIGHT / 2, INTERNAL_WIDTH, INTERNAL_HEIGHT, PALETTE.ink, 1)
        .setDepth(500);
      this.tweens.add({
        targets: shutter,
        x: INTERNAL_WIDTH / 2,
        duration: 110,
        ease: 'Stepped',
        easeParams: [8],
        onComplete: () => this.scene.start('FightScene'),
      });
    });
  }

  private returnToOpponentSelection(): void {
    this.phase = 'opponent';
    this.arenaLayer.setVisible(false);
    this.selectionLayer.setVisible(true);
    const selectedIndex = this.chosenOpponent
      ? FIGHTERS.findIndex((fighter) => fighter.id === this.chosenOpponent?.id)
      : -1;
    if (selectedIndex >= 0) this.cursorIndex = selectedIndex;
    this.updatePhaseCopy();
    this.refreshSelection();
  }

  private goBack(): void {
    audioManager.unlock();
    audioManager.play('confirm');
    if (this.phase === 'opponent') {
      this.phase = 'playerOne';
      const selectedIndex = this.chosenPlayerOne
        ? FIGHTERS.findIndex((fighter) => fighter.id === this.chosenPlayerOne?.id)
        : -1;
      if (selectedIndex >= 0) this.cursorIndex = selectedIndex;
      this.updatePhaseCopy();
      this.refreshSelection();
      return;
    }
    this.scene.start('MainMenuScene');
  }

  private updatePhaseCopy(): void {
    if (this.phase === 'playerOne') {
      this.phaseTitle.setText('JOGADOR 1  |  ESCOLHA SEU LUTADOR');
      this.footerText.setText('WASD  |  ENTER / F CONFIRMA  |  ESC VOLTA');
      return;
    }

    if (gameSession.selection.mode === 'versus') {
      this.phaseTitle.setText('JOGADOR 2  |  ESCOLHA SEU LUTADOR');
      this.footerText.setText('SETAS  |  J CONFIRMA  |  ESC VOLTA');
    } else if (gameSession.selection.mode === 'training') {
      this.phaseTitle.setText('TREINO  |  ESCOLHA O ADVERSARIO');
      this.footerText.setText('WASD  |  ENTER / F CONFIRMA  |  ESC VOLTA');
    } else {
      this.phaseTitle.setText('CPU  |  ESCOLHA O ADVERSARIO');
      this.footerText.setText('WASD  |  ENTER / F CONFIRMA  |  ESC VOLTA');
    }
  }

  private isConfirmPressed(frame: InputFrame): boolean {
    return frame.pressed.has('confirm') || frame.pressed.has('light');
  }

  private fighterAt(index: number): FighterDefinition {
    const fighter = FIGHTERS[index];
    if (!fighter) throw new Error(`Indice de lutador invalido: ${index}`);
    return fighter;
  }
}
