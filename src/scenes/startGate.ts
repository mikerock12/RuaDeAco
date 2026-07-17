export type StartGateCallback = () => void;

export class StartGate {
  private attached = false;
  private started = false;

  constructor(
    private readonly target: EventTarget,
    private readonly onStart: StartGateCallback,
    private readonly pointerTargets: readonly EventTarget[] = [target],
  ) {}

  attach(): void {
    if (this.attached || this.started) return;
    this.attached = true;
    this.target.addEventListener('keydown', this.handleKeyDown, { capture: true, passive: false });
    for (const pointerTarget of this.pointerTargets) {
      pointerTarget.addEventListener('pointerdown', this.handlePointerDown, { capture: true, passive: true });
      pointerTarget.addEventListener('touchstart', this.handlePointerDown, { capture: true, passive: true });
    }
  }

  dispose(): void {
    if (!this.attached) return;
    this.attached = false;
    this.target.removeEventListener('keydown', this.handleKeyDown, { capture: true });
    for (const pointerTarget of this.pointerTargets) {
      pointerTarget.removeEventListener('pointerdown', this.handlePointerDown, { capture: true });
      pointerTarget.removeEventListener('touchstart', this.handlePointerDown, { capture: true });
    }
  }

  trigger(): void {
    this.start();
  }

  private readonly handleKeyDown = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.repeat) return;
    if (!['Enter', 'Space'].includes(keyboardEvent.code)
      && keyboardEvent.key !== 'Enter'
      && keyboardEvent.key !== ' ') return;
    keyboardEvent.preventDefault();
    this.start();
  };

  private readonly handlePointerDown = (): void => {
    this.start();
  };

  private start(): void {
    if (this.started) return;
    this.started = true;
    this.dispose();
    this.onStart();
  }
}
