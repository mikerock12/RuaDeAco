import { gamepadManager, type GamepadInfo } from '../input/GamepadManager';

const TOAST_DURATION_MS = 2600;

const FAMILY_NAMES: Readonly<Record<GamepadInfo['family'], string>> = {
  xbox: 'XBOX',
  playstation: 'PLAYSTATION',
  nintendo: 'NINTENDO',
  generic: 'CONTROLE',
};

/**
 * Aviso curto e não intrusivo de conexão/desconexão de controle, exibido
 * como overlay DOM acima do canvas sem interferir na cena atual.
 */
export class GamepadToast {
  private element: HTMLDivElement | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly unsubscribers: (() => void)[] = [];

  attach(): void {
    if (this.unsubscribers.length > 0) return;
    this.unsubscribers.push(
      gamepadManager.on('connected', (info) => {
        this.show(`${FAMILY_NAMES[info.family]} CONECTADO`);
      }),
      gamepadManager.on('disconnected', (info) => {
        this.show(`${FAMILY_NAMES[info.family]} DESCONECTADO`);
      }),
    );
  }

  detach(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers.length = 0;
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    this.element?.remove();
    this.element = null;
  }

  private show(message: string): void {
    const shell = globalThis.document?.getElementById('game-shell');
    if (!shell) return;
    if (!this.element) {
      this.element = document.createElement('div');
      this.element.id = 'gamepad-toast';
      this.element.setAttribute('role', 'status');
      this.element.setAttribute('aria-live', 'polite');
      shell.append(this.element);
    }
    this.element.textContent = message;
    this.element.classList.add('visible');
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this.element?.classList.remove('visible');
      this.hideTimer = null;
    }, TOAST_DURATION_MS);
  }
}

export const gamepadToast = new GamepadToast();
