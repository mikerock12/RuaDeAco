import { settingsStore } from '../config/settings';
import type { InputAction } from '../types/combat';
import { InputManager, inputManager } from './InputManager';

const DIRECTION_ACTIONS: readonly InputAction[] = ['left', 'right', 'up', 'down'];
const COMBAT_ACTIONS: readonly InputAction[] = ['light', 'heavy', 'special', 'block'];
const ALL_TOUCH_ACTIONS = [...DIRECTION_ACTIONS, ...COMBAT_ACTIONS];

interface ButtonSpec {
  readonly action: InputAction;
  readonly label: string;
  readonly className: string;
  readonly aria: string;
}

const BUTTONS: readonly ButtonSpec[] = [
  { action: 'up', label: '▲', className: 'up', aria: 'Cima' },
  { action: 'down', label: '▼', className: 'down', aria: 'Baixo' },
  { action: 'left', label: '◀', className: 'left', aria: 'Esquerda' },
  { action: 'right', label: '▶', className: 'right', aria: 'Direita' },
  { action: 'light', label: 'A', className: 'light', aria: 'Ataque fraco' },
  { action: 'heavy', label: 'B', className: 'heavy', aria: 'Ataque forte' },
  { action: 'special', label: 'S', className: 'special', aria: 'Especial' },
  { action: 'block', label: '▣', className: 'block', aria: 'Defesa' },
];

export class TouchControls {
  private readonly root: HTMLElement;
  private readonly pointers = new Map<number, Set<InputAction>>();
  private dpad: HTMLElement | null = null;
  private built = false;
  private gameplayActive = false;

  constructor() {
    const element = globalThis.document?.getElementById('touch-controls');
    if (!element) throw new Error('Contêiner de controles touch não encontrado.');
    this.root = element;
  }

  build(): void {
    if (this.built) return;
    this.built = true;
    this.root.replaceChildren();
    const dpad = this.createCluster('dpad');
    this.dpad = dpad;
    const buttons = this.createCluster('buttons');

    for (const spec of BUTTONS) {
      const target = spec.action === 'left' || spec.action === 'right' || spec.action === 'up' || spec.action === 'down'
        ? dpad
        : buttons;
      target.append(this.createButton(spec));
    }

    dpad.addEventListener('pointerdown', this.handleDpadDown);
    dpad.addEventListener('pointermove', this.handleDpadMove);
    dpad.addEventListener('pointerup', this.handlePointerEnd);
    dpad.addEventListener('pointercancel', this.handlePointerEnd);
    dpad.addEventListener('lostpointercapture', this.handlePointerEnd);
    globalThis.window?.addEventListener('blur', this.releaseAll);
    globalThis.window?.addEventListener('orientationchange', this.releaseAll);
    globalThis.document?.addEventListener('visibilitychange', this.handleVisibility);
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
    globalThis.window?.removeEventListener('blur', this.releaseAll);
    globalThis.window?.removeEventListener('orientationchange', this.releaseAll);
    globalThis.document?.removeEventListener('visibilitychange', this.handleVisibility);
    this.root.replaceChildren();
    this.root.classList.remove('visible');
    this.built = false;
  }

  private createCluster(className: string): HTMLElement {
    const element = document.createElement('div');
    element.className = 'touch-cluster ' + className;
    this.root.append(element);
    return element;
  }

  private createButton(spec: ButtonSpec): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'touch-button ' + spec.className;
    button.dataset.action = spec.action;
    button.textContent = spec.label;
    button.setAttribute('aria-label', spec.aria);
    if (DIRECTION_ACTIONS.includes(spec.action)) {
      button.tabIndex = -1;
      return button;
    }

    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.setPointerCapture(event.pointerId);
      this.pointers.set(event.pointerId, new Set([spec.action]));
      this.syncActions();
    });
    button.addEventListener('pointermove', (event) => {
      if (!this.pointers.has(event.pointerId)) return;
      const rect = button.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      this.pointers.set(event.pointerId, inside ? new Set([spec.action]) : new Set());
      this.syncActions();
    });
    button.addEventListener('pointerup', this.handlePointerEnd);
    button.addEventListener('pointercancel', this.handlePointerEnd);
    button.addEventListener('lostpointercapture', this.handlePointerEnd);
    return button;
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
    const actions = new Set<InputAction>();
    const outside = Math.abs(dx) > 1.18 || Math.abs(dy) > 1.18;
    if (!outside) {
      if (dx < -0.2) actions.add('left');
      if (dx > 0.2) actions.add('right');
      if (dy < -0.2) actions.add('up');
      if (dy > 0.2) actions.add('down');
    }
    this.pointers.set(event.pointerId, actions);
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
