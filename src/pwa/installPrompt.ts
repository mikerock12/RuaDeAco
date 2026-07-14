type AvailabilityListener = (available: boolean) => void;

class InstallPromptManager {
  private promptEvent: BeforeInstallPromptEvent | null = null;
  private readonly listeners = new Set<AvailabilityListener>();

  attach(): void {
    globalThis.window?.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.promptEvent = event;
      this.notify();
    });
    globalThis.window?.addEventListener('appinstalled', () => {
      this.promptEvent = null;
      this.notify();
    });
  }

  get available(): boolean {
    return this.promptEvent !== null;
  }

  subscribe(listener: AvailabilityListener): () => void {
    this.listeners.add(listener);
    listener(this.available);
    return () => this.listeners.delete(listener);
  }

  async prompt(): Promise<boolean> {
    const event = this.promptEvent;
    if (!event) return false;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      return choice.outcome === 'accepted';
    } catch {
      return false;
    } finally {
      this.promptEvent = null;
      this.notify();
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.available);
  }
}

export const installPromptManager = new InstallPromptManager();
