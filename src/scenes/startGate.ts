export type StartGateCallback = () => void;

export class StartGate {
  private attached = false;
  private started = false;

  constructor(
    private readonly target: EventTarget,
    private readonly onStart: StartGateCallback,
  ) {}

  attach(): void {
    if (this.attached || this.started) return;
    this.attached = true;
    this.target.addEventListener('keydown', this.handleKeyDown);
    this.target.addEventListener('pointerdown', this.handlePointerDown, { passive: true });
    this.target.addEventListener('touchstart', this.handlePointerDown, { passive: true });
  }

  dispose(): void {
    if (!this.attached) return;
    this.attached = false;
    this.target.removeEventListener('keydown', this.handleKeyDown);
    this.target.removeEventListener('pointerdown', this.handlePointerDown);
    this.target.removeEventListener('touchstart', this.handlePointerDown);
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
