export const ONLINE_PROTOCOL_VERSION = 1 as const;
export const ONLINE_SOCKET_PROTOCOL = 'rua-de-aco.v1' as const;
export const CLIENT_BUILD_ID = __CLIENT_BUILD_ID__;
export const COMBAT_ENGINE_VERSION = __COMBAT_ENGINE_VERSION__;
export const FIGHTER_ASSET_REVISION = __FIGHTER_ASSET_REVISION__;
export const ONLINE_ARENA_ID = 'cais-da-cidade' as const;

const configuredUrl = import.meta.env.VITE_MULTIPLAYER_URL?.trim();

export const MULTIPLAYER_BASE_URL = configuredUrl
  ? configuredUrl.replace(/\/+$/u, '')
  : import.meta.env.DEV
    ? 'http://127.0.0.1:8787'
    : null;

export const ONLINE_AVAILABLE = MULTIPLAYER_BASE_URL !== null;
