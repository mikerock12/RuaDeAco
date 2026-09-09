import { settingsStore } from '../config/settings';
import type { CombatButton, InputAction } from '../types/combat';
import { TOUCH_BUTTON_ARIA, TOUCH_BUTTON_GLYPHS } from './controlLabels';
import { controlsStore, TOUCH_SLOT_IDS, type TouchSlotId } from './controlsStore';
import { InputManager, inputManager } from './InputManager';
import { radialStickPosition, touchDpadActions } from './touchDirection';

const DIRECTION_ACTIONS: readonly InputAction[] = ['left', 'right', 'up', 'down'];
const COMBAT_ACTIONS: readonly InputAction[] = ['light', 'heavy', 'special', 'block'];
const ALL_TOUCH_ACTIONS = [...DIRECTION_ACTIONS, ...COMBAT_ACTIONS];

interface DirectionSpec {
  readonly action: InputAction;
  readonly label: string;
  readonly className: string;
  readonly aria: string;
}

const DIRECTION_BUTTONS: readonly DirectionSpec[] = [
  { action: 'up', label: '▲', className: 'up', aria: 'Cima' },
  { action: 'down', label: '▼', className: 'down', aria: 'Baixo' },
  { action: 'left', label: '◀', className: 'left', aria: 'Esquerda' },
  { action: 'right', label: '▶', className: 'right', aria: 'Direita' },
];

export class TouchControls {
  private readonly root: HTMLElement;
  private readonly pointers = new Map<number, Set<InputAction>>();
  private readonly slotButtons = new Map<TouchSlotId, HTMLButtonElement>();
  private dpad: HTMLElement | null = null;
  private dpadPointer: number | null = null;
  private readonly captures = new Map<number, HTMLElement>();
  private built = false;
  private gameplayActive = false;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    const element = globalThis.document?.getElementById('touch-controls');
    if (!element) throw new Error('Contêiner de controles touch não encontrado.');
    this.root = element;
  }

  build(): void {
    if (this.built) return;
    this.built = true;
    this.root.replaceChildren();
    this.slotButtons.clear();
    const dpad = this.createCluster('dpad');
    this.dpad = dpad;
    dpad.setAttribute('role', 'group');
    dpad.setAttribute('aria-label', 'Analógico de movimento em oito direções');
    const knob = document.createElement('span');
    knob.className = 'stick-knob';
    knob.setAttribute('aria-hidden', 'true');
    dpad.append(knob);
    const buttons = this.createCluster('buttons');

    for (const spec of DIRECTION_BUTTONS) {
      dpad.append(this.createDirectionButton(spec));
    }
    for (const slot of TOUCH_SLOT_IDS) {
      buttons.append(this.createSlotButton(slot));
    }
    this.applyBindings();

    dpad.addEventListener('pointerdown', this.handleDpadDown);
    dpad.addEventListener('pointermove', this.handleDpadMove);
    dpad.addEventListener('pointerup', this.handlePointerEnd);
    dpad.addEventListener('pointercancel', this.handlePointerEnd);
    dpad.addEventListener('lostpointercapture', this.handlePointerEnd);
    globalThis.window?.addEventListener('blur', this.releaseAll);
    globalThis.window?.addEventListener('orientationchange', this.releaseAll);
    globalThis.window?.addEventListener('resize', this.releaseAll, { passive: true });
    globalThis.window?.addEventListener('pagehide', this.releaseAll);
    globalThis.window?.visualViewport?.addEventListener('resize', this.releaseAll, { passive: true });
    globalThis.window?.screen.orientation?.addEventListener('change', this.releaseAll);
    globalThis.document?.addEventListener('fullscreenchange', this.releaseAll);
    globalThis.document?.addEventListener('visibilitychange', this.handleVisibility);
    this.unsubscribe = controlsStore.subscribe(() => this.applyBindings());
    this.refreshVisibility();
  }

  refreshVisibility(): void {
    const visible = this.gameplayActive && InputManager.shouldShowTouch(settingsStore.get());
    this.root.classList.toggle('visible', visible);
    this.root.setAttribute('aria-hidden', String(!visible));
    if (!visible) this.releaseAll();
  }

  setGameplayActive(active: boolean): void {
    this.gameplayActive = active;
    this.refreshVisibility();
  }

  releaseAll = (): void => {
    const captures = [...this.captures];
    this.captures.clear();
    this.dpadPointer = null;
    this.resetStick();
    this.pointers.clear();
    this.syncActions();
    for (const [id, element] of captures) {
      if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
    }
  };

  destroy(): void {
    this.releaseAll();
    this.unsubscribe?.();
    this.unsubscribe = null;
    globalThis.window?.removeEventListener('blur', this.releaseAll);
    globalThis.window?.removeEventListener('orientationchange', this.releaseAll);
    globalThis.window?.removeEventListener('resize', this.releaseAll);
    globalThis.window?.removeEventListener('pagehide', this.releaseAll);
    globalThis.window?.visualViewport?.removeEventListener('resize', this.releaseAll);
    globalThis.window?.screen.orientation?.removeEventListener('change', this.releaseAll);
    globalThis.document?.removeEventListener('fullscreenchange', this.releaseAll);
    globalThis.document?.removeEventListener('visibilitychange', this.handleVisibility);
    this.root.replaceChildren();
    this.root.classList.remove('visible');
    this.slotButtons.clear();
    this.built = false;
  }

  /** Sincroniza rótulo, aria e ação de cada posição com o perfil vigente. */
  private applyBindings(): void {
    const profile = controlsStore.get().touch;
    let changed = false;
    for (const slot of TOUCH_SLOT_IDS) {
      const button = this.slotButtons.get(slot);
      if (!button) continue;
      const action = profile.slots[slot];
      if (button.dataset.action !== action) changed = true;
      button.dataset.action = action;
      button.textContent = TOUCH_BUTTON_GLYPHS[action];
      button.dataset.label = { light: 'FRACO', heavy: 'FORTE', special: 'ESPECIAL', block: 'DEFESA' }[action];
      button.setAttribute('aria-label', TOUCH_BUTTON_ARIA[action]);
    }
    // Toques em andamento apontariam para a ação antiga; solte tudo.
    if (changed) this.releaseAll();
  }

  private createCluster(className: string): HTMLElement {
    const element = document.createElement('div');
    element.className = 'touch-cluster ' + className;
    this.root.append(element);
    return element;
  }

  private createDirectionButton(spec: DirectionSpec): HTMLElement {
    const button = document.createElement('span');
    button.className = 'stick-direction ' + spec.className;
    button.dataset.action = spec.action;
    button.textContent = spec.label;
    button.setAttribute('aria-hidden', 'true');
    return button;
  }

  private createSlotButton(slot: TouchSlotId): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'touch-button pos-' + slot;
    button.tabIndex = -1;
    this.slotButtons.set(slot, button);

    button.addEventListener('pointerdown', (event) => {
      if (!this.gameplayActive) return;
      event.preventDefault();
      event.stopPropagation();
      button.setPointerCapture(event.pointerId);
      this.captures.set(event.pointerId, button);
      this.pointers.set(event.pointerId, new Set([this.slotAction(slot)]));
      this.syncActions();
    });
    button.addEventListener('pointermove', (event) => {
      if (!this.pointers.has(event.pointerId)) return;
      // O polegar pode deslizar entre ataques sem levantar; cada dedo mantém
      // sua própria ação. Fora dos botões, a ação é liberada.
      let target: TouchSlotId | null = null;
      let nearest = Infinity;
      for (const [candidateSlot, candidate] of this.slotButtons) {
        const rect = candidate.getBoundingClientRect();
        const dx = event.clientX - rect.left - rect.width / 2;
        const dy = event.clientY - rect.top - rect.height / 2;
        const distance = dx * dx + dy * dy;
        if (Math.abs(dx) <= rect.width / 2 + 6 && Math.abs(dy) <= rect.height / 2 + 6 && distance < nearest) {
          nearest = distance;
          target = candidateSlot;
        }
      }
      this.pointers.set(event.pointerId, target ? new Set([this.slotAction(target)]) : new Set());
      this.syncActions();
    });
    button.addEventListener('pointerup', this.handlePointerEnd);
    button.addEventListener('pointercancel', this.handlePointerEnd);
    button.addEventListener('lostpointercapture', this.handlePointerEnd);
    return button;
  }

  private slotAction(slot: TouchSlotId): CombatButton {
    return controlsStore.get().touch.slots[slot];
  }

  private handleDpadDown = (event: PointerEvent): void => {
    if (!this.gameplayActive || this.dpadPointer !== null || !this.dpad) return;
    event.preventDefault();
    event.stopPropagation();
    this.dpadPointer = event.pointerId;
    this.dpad.setPointerCapture(event.pointerId);
    this.captures.set(event.pointerId, this.dpad);
    this.updateDpadPointer(event);
  };

  private handleDpadMove = (event: PointerEvent): void => {
    if (this.dpadPointer !== event.pointerId) return;
    event.preventDefault();
    this.updateDpadPointer(event);
  };

  private updateDpadPointer(event: PointerEvent): void {
    if (!this.dpad) return;
    const rect = this.dpad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = (event.clientX - centerX) / (rect.width / 2);
    const dy = (event.clientY - centerY) / (rect.height / 2);
    const knob = radialStickPosition(dx, dy);
    this.dpad.style.setProperty('--knob-x', (knob.x * rect.width * 0.31).toFixed(2) + 'px');
    this.dpad.style.setProperty('--knob-y', (knob.y * rect.height * 0.31).toFixed(2) + 'px');
    this.dpad.classList.add('active');
    this.pointers.set(event.pointerId, new Set(touchDpadActions(dx, dy)));
    this.syncActions();
  }

  private handlePointerEnd = (event: PointerEvent): void => {
    event.preventDefault();
    this.pointers.delete(event.pointerId);
    this.captures.delete(event.pointerId);
    if (this.dpadPointer === event.pointerId) {
      this.dpadPointer = null;
      this.resetStick();
    }
    this.syncActions();
  };

  private resetStick(): void {
    this.dpad?.classList.remove('active');
    this.dpad?.style.setProperty('--knob-x', '0px');
    this.dpad?.style.setProperty('--knob-y', '0px');
  }

  private syncActions(): void {
    const next = new Set<InputAction>();
    for (const actions of this.pointers.values()) {
      for (const action of actions) next.add(action);
    }
    for (const action of ALL_TOUCH_ACTIONS) {
      inputManager.setTouchAction(action, next.has(action));
    }
    for (const element of this.root.querySelectorAll<HTMLElement>('[data-action]')) {
      const action = element.dataset.action as InputAction | undefined;
      element.classList.toggle('pressed', action !== undefined && next.has(action));
    }
  }

  private handleVisibility = (): void => {
    if (document.hidden) this.releaseAll();
  };
}

export const touchControls = new TouchControls();
