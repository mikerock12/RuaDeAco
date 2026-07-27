/// <reference types="vite/client" />

declare const __FIGHTER_ASSET_REVISION__: string;
declare const __CLIENT_BUILD_ID__: string;
declare const __COMBAT_ENGINE_VERSION__: string;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent;
}
