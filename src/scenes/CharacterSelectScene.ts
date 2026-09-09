import Phaser from 'phaser';
import { ASSET_MANIFEST } from '../assets/assetManifest';
import { audioManager } from '../audio/AudioManager';
import { MUSIC_TRACK_BY_SCENE } from '../audio/musicCatalog';
import { ARENAS } from '../config/gameConfig';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, PALETTE } from '../config/pixelArtConfig';
import { gameSession } from '../config/session';
import { FIGHTERS } from '../fighters';
import { keyLabel, movementKeysSummary } from '../input/controlLabels';
import { controlsStore } from '../input/controlsStore';
import { InputManager, inputManager } from '../input/InputManager';
import type { FighterDefinition, InputFrame } from '../types/combat';
import { drawRemasterBackdrop, focusPanel, panelCorners, uiPanel, uiIcon, UI_THEME } from '../ui/remasterTheme';
import { createConceptPortrait } from '../ui/PortraitView';
import { pixelText, tagLayoutPanel } from '../utils/text';
import { settingsStore } from '../config/settings';

type SelectionPhase = 'playerOne' | 'opponent' | 'arena';

interface FighterCard {
  readonly container: Phaser.GameObjects.Container;
  readonly frame: Phaser.GameObjects.Rectangle;
  readonly fighter: FighterDefinition;
  readonly restingX: number;
}

const CARD_COLUMNS = 3;
const CARD_ROWS = 2;

export class CharacterSelectScene extends Phaser.Scene {
  private selectionLayer!: Phaser.GameObjects.Container;
  private arenaLayer!: Phaser.GameObjects.Container;
  private screenTitle!: Phaser.GameObjects.BitmapText;
  private menuLogo!: Phaser.GameObjects.Image;
  private focusTween: Phaser.Tweens.Tween | null = null;
  private phaseTitle!: Phaser.GameObjects.BitmapText;
  private footerText!: Phaser.GameObjects.BitmapText;
  private cards: FighterCard[] = [];
  private detailContainer: Phaser.GameObjects.Container | null = null;
  private arenaCard: Phaser.GameObjects.Container | null = null;
  private phase: SelectionPhase = 'playerOne';
  private cursorIndex = 0;
  private arenaIndex = 0;
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
    this.arenaIndex = Math.max(0, ARENAS.findIndex(arena => arena.id === gameSession.selection.arena));
    this.cursorIndex = Math.max(0, FIGHTERS.findIndex((fighter) => fighter.id === gameSession.selection.playerOne));

    this.cameras.main.setBackgroundColor(PALETTE.ink);
    this.drawBackdrop();

    this.menuLogo = this.add.image(320, 28, ASSET_MANIFEST.logo.key).setDisplaySize(76, 57).setBlendMode(Phaser.BlendModes.SCREEN);
    this.screenTitle = pixelText(this, INTERNAL_WIDTH / 2, 66, 'SELECAO DE LUTADORES', {
      size: 16,
      maxWidth: 420,
      maxHeight: 22,
      color: '#ffd55c',
      align: 'center',
      layoutName: 'character-select-title',
    });
    this.phaseTitle = pixelText(this, INTERNAL_WIDTH / 2, 84, '', {
      size: 16,
      minSize: 8,
      maxWidth: 500,
      maxHeight: 22,
      color: '#9af7ff',
      align: 'center',
      layoutName: 'character-select-phase',
    });

    this.selectionLayer = this.add.container(0, 0);
    this.selectionLayer.add([uiPanel(this, 206, 207, 296, 220), panelCorners(this, 206, 207, 298, 222)]);
    this.arenaLayer = this.add.container(0, 0).setVisible(false);
    this.footerText = pixelText(this, INTERNAL_WIDTH / 2, INTERNAL_HEIGHT - 16, '', {
      size: 8,
      minSize: 8,
      maxWidth: 608,
      maxHeight: 14,
      color: '#aebbd0',
      align: 'center',
      layoutName: 'character-select-footer',
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
      } else if (playerOneInput.pressed.has('left')) {
        this.moveArena(-1);
      } else if (playerOneInput.pressed.has('right')) {
        this.moveArena(1);
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

  private drawBackdrop(): void { drawRemasterBackdrop(this, 0.12); }

  private createFighterCards(): void {
    const xPositions = [112, 206, 300] as const;
    const yPositions = [150, 252] as const;

    FIGHTERS.forEach((fighter, index) => {
      const column = index % CARD_COLUMNS;
      const row = Math.floor(index / CARD_COLUMNS);
      const x = xPositions[column];
      const y = yPositions[row];
      if (x === undefined || y === undefined) return;

      const frame = this.add.rectangle(0, 0, 82, 88, UI_THEME.panel, 0.86)
        .setStrokeStyle(1, UI_THEME.border)
        .setInteractive({ useHandCursor: true });
      const concept = ASSET_MANIFEST.concepts[fighter.id];
      let portrait: Phaser.GameObjects.GameObject;
      if (this.textures.exists(concept.key)) {
        portrait = createConceptPortrait(this, 0, -12, fighter.id, 70, 54, {
          crop: 'card',
          locked: !fighter.available,
          frameColor: fighter.available ? UI_THEME.cyan : PALETTE.muted,
        });
      } else {
        const missing = this.add.container(0, -16);
        missing.add(this.add.rectangle(0, 0, 92, 64, PALETTE.ink, 1).setStrokeStyle(2, PALETTE.pink));
        missing.add(pixelText(this, 0, 0, 'IMAGEM\nAUSENTE', {
          size: 16,
          minSize: 8,
          maxWidth: 84,
          maxHeight: 56,
          color: '#f64070',
          align: 'center',
        }));
        portrait = missing;
      }

      const name = pixelText(this, 0, 24, fighter.name.split(' ')[0] ?? fighter.name, {
        size: 16,
        minSize: 8,
        maxWidth: 76,
        maxHeight: 18,
        color: fighter.available ? '#f7f2d0' : '#80889a',
        align: 'center',
      });
      const status = pixelText(this, 0, 38, fighter.available ? 'OK' : 'DEV', {
        size: 8,
        maxWidth: 76,
        maxHeight: 18,
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
    this.focusTween?.stop();
    this.cards.forEach((card, index) => {
      const selected = index === this.cursorIndex;
      focusPanel(card.frame, selected);
      card.frame.setStrokeStyle(selected ? 2 : 1, selected ? UI_THEME.cyan : UI_THEME.border, 1);
      if (selected && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) this.focusTween = this.tweens.add({ targets: card.frame, strokeAlpha: 0.6, duration: 700, yoyo: true, repeat: -1 });
      card.container.setAlpha(card.fighter.available ? 1 : selected ? 0.82 : 0.58);
      card.container.setX(card.restingX);
    });
    this.renderFighterDetails(this.fighterAt(this.cursorIndex));
  }

  private renderFighterDetails(fighter: FighterDefinition): void {
    this.detailContainer?.destroy();
    const panelName = 'fighter-details-panel';
    const panel = tagLayoutPanel(uiPanel(this, 465, 207, 208, 220, UI_THEME.cyan), panelName, { x: 8, y: 8 });
    const corners = panelCorners(this, 465, 207, 212, 224);
    const label = pixelText(this, 373, 102, 'FICHA DO LUTADOR', { size: 8, maxWidth: 188, maxHeight: 10, color: UI_THEME.gold });
    const portrait = createConceptPortrait(this, 402, 148, fighter.id, 62, 78, { crop: 'profile', locked: !fighter.available, frameColor: UI_THEME.cyan });
    const name = pixelText(this, 444, 120, fighter.name.toUpperCase(), {
      size: 12, minSize: 8, maxWidth: 116, maxHeight: 20, maxLines: 1, color: UI_THEME.text,
      layoutName: 'fighter-details-name', panelName,
    });
    const archetype = pixelText(this, 444, 140, fighter.archetype.toUpperCase(), {
      size: 12, minSize: 8, maxWidth: 116, maxHeight: 48, maxLines: 4, lineSpacing: 1,
      color: UI_THEME.cyan, layoutName: 'fighter-details-archetype', panelName,
    }).setOrigin(0, 0);
    const abilitiesLabel = pixelText(this, 373, 202, 'HABILIDADES', { size: 10, maxWidth: 184, color: UI_THEME.gold });
    const abilities = fighter.abilities.flatMap((ability, index) => [
      uiIcon(this, 380, 222 + index * 20, index === 0 ? 'light' : index === 1 ? 'special' : 'reset', UI_THEME.cyan, 1),
      pixelText(this, 392, 222 + index * 20, ability.toUpperCase(), {
        size: 12, minSize: 8, maxWidth: 166, maxHeight: 18, maxLines: 1, color: UI_THEME.text,
        layoutName: 'fighter-details-ability-' + index, panelName,
      }),
    ]);
    const children: Phaser.GameObjects.GameObject[] = [panel, corners, label, portrait, name, archetype, abilitiesLabel, ...abilities];
    if (fighter.available) {
      const button = tagLayoutPanel(uiPanel(this, 465, 302, 184, 26, UI_THEME.gold).setInteractive({ useHandCursor: true }), 'fighter-details-confirm', { x: 10, y: 2 });
      const buttonLabel = pixelText(this, 465, 302, 'CONFIRMAR  >>', { size: 14, minSize: 12, maxWidth: 164, maxHeight: 22, align: 'center', color: UI_THEME.gold });
      button.on('pointerover', () => focusPanel(button, true, true));
      button.on('pointerout', () => button.setFillStyle(UI_THEME.panel, 0.86));
      button.on('pointerdown', () => this.confirmFighter());
      children.push(button, buttonLabel);
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
    this.focusTween?.stop();
    card.frame.setStrokeStyle(2, UI_THEME.gold);
    this.tweens.add({ targets: card.frame, alpha: 0.6, duration: 65, yoyo: true, onComplete: () => {
      this.confirming = false;
      this.acceptFighter(fighter);
    } });
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

    this.screenTitle.setY(16);
    this.phaseTitle.setY(38);
    this.menuLogo.setVisible(false);
    const arena = ARENAS[this.arenaIndex]!;
    this.selectionLayer.setVisible(false);
    this.arenaLayer.removeAll(true);
    this.arenaLayer.setVisible(true);
    this.phaseTitle.setText('ARENA E CONFRONTO');
    const bindings = controlsStore.get().keyboard[0].bindings;
    const confirmKey = keyLabel(bindings.light);
    const arenaKeys = keyLabel(bindings.left) + '/' + keyLabel(bindings.right);
    this.footerText.setText(InputManager.shouldShowTouch(settingsStore.get())
      ? 'USE AS SETAS PARA TROCAR A ARENA. TOQUE EM LUTAR.'
      : `${arenaKeys}: ARENA | ENTER / ${confirmKey}: LUTAR | ESC: VOLTAR`);

    const panel = this.add.rectangle(0, 0, 560, 256, UI_THEME.panel, 0.88)
      .setStrokeStyle(1, UI_THEME.cyan, 1);
    const topRail = this.add.rectangle(0, -126, 552, 1, UI_THEME.cyan, 0.8);
    const arenaName = pixelText(this, 0, -112, arena.name, {
      size: 16,
      minSize: 8,
      maxWidth: 440,
      maxHeight: 22,
      layoutName: 'arena-name',
      color: '#ffd55c',
      align: 'center',
    });
    const arenaSubtitle = pixelText(
      this,
      0,
      -90,
      arena.subtitle,
      {
        size: 16,
        minSize: 8,
        maxWidth: 440,
        maxHeight: 22,
        color: '#9af7ff',
        align: 'center',
        layoutName: 'arena-subtitle',
        padding: { x: 10, y: 2 },
      },
    );

    const portraitOne = createConceptPortrait(this, -166, 8, playerOne.id, 144, 152, {
      crop: 'hero',
      frameColor: playerOne.visual.accent,
    });
    const portraitTwo = createConceptPortrait(this, 166, 8, opponent.id, 144, 152, {
      crop: 'hero',
      frameColor: opponent.visual.accent,
    });
    const nameOne = pixelText(this, -166, 98, playerOne.name.toUpperCase(), {
      size: 16,
      minSize: 8,
      maxWidth: 156,
      maxHeight: 22,
      maxLines: 1,
      color: '#f7f2d0',
      align: 'center',
    });
    const nameTwo = pixelText(this, 166, 98, opponent.name.toUpperCase(), {
      size: 16,
      minSize: 8,
      maxWidth: 156,
      maxHeight: 22,
      maxLines: 1,
      color: '#f7f2d0',
      align: 'center',
    });

    const stagePreview = arena.id !== 'cais-da-cidade'
      ? this.add.container(0, 0, [
          this.add.image(0, 58, arena.id === 'sitio' ? ASSET_MANIFEST.sitio.background.key : ASSET_MANIFEST.kitchen.background.key).setDisplaySize(152, 86),
          this.add.rectangle(0, 58, 156, 90, 0x000000, 0).setStrokeStyle(2, PALETTE.pink),
        ])
      : this.createCaisPreview();
    const arenaArrows = [-1, 1].flatMap(direction => {
      const x = direction * 254;
      const arrow = this.add.rectangle(x, -102, 48, 48, PALETTE.panelLight)
        .setStrokeStyle(2, PALETTE.cyan).setInteractive({ useHandCursor: true })
        .setName(direction < 0 ? 'arena-previous' : 'arena-next');
      arrow.on('pointerdown', () => this.moveArena(direction));
      const label = pixelText(this, x, -102, direction < 0 ? '<' : '>', {
        size: 24, align: 'center', color: '#9af7ff',
      });
      return [arrow, label];
    });
    const versus = pixelText(this, 0, -24, 'VS', {
      size: 40,
      maxWidth: 80,
      maxHeight: 48,
      color: '#f64070',
      align: 'center',
    });
    const button = this.add.rectangle(0, 118, 184, 30, UI_THEME.panel, 0.98)
      .setStrokeStyle(2, UI_THEME.gold)
      .setInteractive({ useHandCursor: true });
    const buttonLabel = pixelText(this, 0, 118, 'LUTAR  >>', {
      size: 16,
      minSize: 8,
      maxWidth: 164,
      maxHeight: 24,
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
      ...arenaArrows,
    ]);
    this.arenaLayer.add(this.arenaCard);
  }

  private moveArena(direction: number): void {
    if (this.confirming || this.phase !== 'arena') return;
    this.arenaIndex = (this.arenaIndex + direction + ARENAS.length) % ARENAS.length;
    audioManager.unlock();
    audioManager.play('confirm');
    this.showArenaSelection();
  }

  private createCaisPreview(): Phaser.GameObjects.Container {
    const image = this.add.image(0, 58, ASSET_MANIFEST.caisRemaster.background.key).setDisplaySize(152, 86);
    const moon = this.add.image(26, 38, ASSET_MANIFEST.caisRemaster.moon.key).setDisplaySize(23, 23);
    const frame = this.add.rectangle(0, 58, 156, 90, 0x000000, 0).setStrokeStyle(2, PALETTE.pink);
    return this.add.container(0, 0, [image, moon, frame]);
  }

  private confirmArena(): void {
    if (this.confirming || !this.arenaCard) return;
    this.confirming = true;
    gameSession.setSelection({ arena: ARENAS[this.arenaIndex]!.id });
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
    this.screenTitle.setY(66);
    this.phaseTitle.setY(84);
    this.menuLogo.setVisible(true);
    const config = controlsStore.get();
    const touch = InputManager.shouldShowTouch(settingsStore.get());
    const playerOneFooter = touch ? 'TOQUE NO LUTADOR E EM CONFIRMAR' : `${movementKeysSummary(config.keyboard[0])}  |  ENTER / ${keyLabel(config.keyboard[0].bindings.light)} CONFIRMA  |  ESC VOLTA`;
    if (this.phase === 'playerOne') {
      this.phaseTitle.setText('JOGADOR 1  |  ESCOLHA SEU LUTADOR');
      this.footerText.setText(playerOneFooter);
      return;
    }

    if (gameSession.selection.mode === 'versus') {
      this.phaseTitle.setText('JOGADOR 2  |  ESCOLHA SEU LUTADOR');
      this.footerText.setText(
        `${movementKeysSummary(config.keyboard[1])}  |  ${keyLabel(config.keyboard[1].bindings.light)} CONFIRMA  |  ESC VOLTA`,
      );
    } else if (gameSession.selection.mode === 'training') {
      this.phaseTitle.setText('TREINO  |  ESCOLHA O ADVERSARIO');
      this.footerText.setText(playerOneFooter);
    } else {
      this.phaseTitle.setText('CPU  |  ESCOLHA O ADVERSARIO');
      this.footerText.setText(playerOneFooter);
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
