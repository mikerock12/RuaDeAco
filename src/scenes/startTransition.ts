export interface StartTransitionDependencies {
  readonly unlockAudio: () => Promise<boolean>;
  readonly openMainMenu: () => void;
  readonly reportUnlockFailure: (error?: unknown) => void;
}

export class StartTransition {
  private started = false;

  constructor(private readonly dependencies: StartTransitionDependencies) {}

  start(): boolean {
    if (this.started) return false;
    this.started = true;

    let unlockAttempt: Promise<boolean>;
    try {
      // Precisa ser chamado antes da troca de cena e dentro do gesto real.
      unlockAttempt = this.dependencies.unlockAudio();
    } catch (error) {
      this.dependencies.reportUnlockFailure(error);
      this.dependencies.openMainMenu();
      return true;
    }

    // A navegação nunca depende de AudioContext.resume() terminar.
    this.dependencies.openMainMenu();
    void unlockAttempt
      .then((unlocked) => {
        if (!unlocked) this.dependencies.reportUnlockFailure();
      })
      .catch((error: unknown) => this.dependencies.reportUnlockFailure(error));
    return true;
  }
}
