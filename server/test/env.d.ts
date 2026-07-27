declare module "cloudflare:test" {
  interface ProvidedEnv {
    MATCH_ROOMS: DurableObjectNamespace<
      import("../src/game-room").GameRoom
    >;
    TICKET_SECRET: string;
    SESSION_TTL_SECONDS: string;
    SOCKET_TICKET_TTL_SECONDS: string;
    ROOM_TTL_SECONDS: string;
    EMPTY_ROOM_TTL_SECONDS: string;
    RECONNECT_GRACE_SECONDS: string;
    INPUT_DELAY_FRAMES: string;
  }
}

export {};
