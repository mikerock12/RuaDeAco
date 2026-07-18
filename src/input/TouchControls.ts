import { settingsStore } from '../config/settings';
import type { CombatButton, InputAction } from '../types/combat';
import { TOUCH_BUTTON_ARIA, TOUCH_BUTTON_GLYPHS } from './controlLabels';
import { controlsStore, TOUCH_SLOT_IDS, type TouchSlotId } from './controlsStore';
import { InputManager, inputManager } from './InputManager';
import { touchDpadActions } from './touchDirection';

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
    this.pointers.clear();
    this.syncActions();
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

  private createDirectionButton(spec: DirectionSpec): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'touch-button ' + spec.className;
    button.dataset.action = spec.action;
    button.textContent = spec.label;
    button.setAttribute('aria-label', spec.aria);
    button.tabIndex = -1;
    return button;
  }

  private createSlotButton(slot: TouchSlotId): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'touch-button pos-' + slot;
    this.slotButtons.set(slot, button);

    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, new Set([this.slotAction(slot)]));
      this.syncActions();
    });
    button.addEventListener('pointermove', (event) => {
      if (!this.pointers.has(event.pointerId)) return;
      const rect = button.getBoundingClientRect();
      const margin = 40;
      const inside = event.clientX >= rect.left - margin && event.clientX <= rect.right + margin && event.clientY >= rect.top - margin && event.clientY <= rect.bottom + margin;
      this.pointers.set(event.pointerId, inside ? new Set([this.slotAction(slot)]) : new Set());
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
    event.preventDefault();
    this.dpad?.setPointerCapture(event.pointerId);
    this.updateDpadPointer(event);
  };

  private handleDpadMove = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId)) return;
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
    this.pointers.set(event.pointerId, new Set(touchDpadActions(dx, dy)));
    this.syncActions();
  }

  private handlePointerEnd = (event: PointerEvent): void => {
    event.preventDefault();
    this.pointers.delete(event.pointerId);
    this.syncActions();
  };

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
