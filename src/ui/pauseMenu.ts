export const PAUSE_MENU_OPTIONS = [
  { action: 'continue', label: 'CONTINUAR' },
  { action: 'character-select', label: 'SELECAO DE PERSONAGENS' },
  { action: 'main-menu', label: 'MENU PRINCIPAL' },
] as const;

export type PauseMenuAction = typeof PAUSE_MENU_OPTIONS[number]['action'];
export type PauseNavigationTarget = 'CharacterSelectScene' | 'MainMenuScene';

export type PauseMenuCommand =
  | { readonly type: 'continue' }
  | { readonly type: 'navigate'; readonly target: PauseNavigationTarget };

export class PauseMenuModel {
  private selectedIndex = 0;
  private navigationLocked = false;

  get selected(): PauseMenuAction {
    return PAUSE_MENU_OPTIONS[this.selectedIndex]!.action;
  }

  reset(): void {
    this.selectedIndex = 0;
    this.navigationLocked = false;
  }

  move(direction: -1 | 1): PauseMenuAction {
    if (!this.navigationLocked) {
      this.selectedIndex = (
        this.selectedIndex + direction + PAUSE_MENU_OPTIONS.length
      ) % PAUSE_MENU_OPTIONS.length;
    }
    return this.selected;
  }

  select(action: PauseMenuAction): PauseMenuAction {
    if (this.navigationLocked) return this.selected;
    const index = PAUSE_MENU_OPTIONS.findIndex((option) => option.action === action);
    if (index >= 0) this.selectedIndex = index;
    return this.selected;
  }

  activate(action: PauseMenuAction = this.selected): PauseMenuCommand | null {
    if (this.navigationLocked) return null;
    this.select(action);
    if (this.selected === 'continue') return { type: 'continue' };

    this.navigationLocked = true;
    return {
      type: 'navigate',
      target: this.selected === 'character-select' ? 'CharacterSelectScene' : 'MainMenuScene',
    };
  }
}
