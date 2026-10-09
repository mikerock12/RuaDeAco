import type { OnlineSnapshot } from './OnlineSession';

/** Ping e confirmações idênticas não podem destruir controles sob o ponteiro. */
export function lobbyPresentationKey(snapshot: OnlineSnapshot): string {
  return JSON.stringify([
    snapshot.available, snapshot.status, snapshot.message, snapshot.roomCode,
    snapshot.slot, snapshot.reconnectCount, snapshot.room?.phase,
    snapshot.room?.players.map(player => [player.slot, player.connected, player.selected,
      player.ready, player.fighterId, player.arenaId]),
  ]);
}
