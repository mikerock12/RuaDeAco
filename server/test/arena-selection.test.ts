import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { connectSocket, createRoom, createSession, joinRoom, selectionMessage } from "./helpers";

async function pair() {
  const owner = await createSession();
  const visitor = await createSession();
  const admission = await createRoom(owner.sessionToken);
  const guestAdmission = await joinRoom(admission.roomCode, visitor.sessionToken);
  const host = await connectSocket(admission);
  const guest = await connectSocket(guestAdmission);
  await host.next("welcome");
  await guest.next("welcome");
  const persisted = () => runInDurableObject(
    env.MATCH_ROOMS.get(env.MATCH_ROOMS.idFromName(`room:${admission.roomCode}`)),
    (_instance, state) => [...state.storage.sql.exec("SELECT slot, arena_id, ready FROM slots ORDER BY slot")]
  );
  return { host, guest, admission, visitor, persisted };
}

describe("arena compartilhada no lobby", () => {
  it.each(["cais-da-cidade", "cozinha-macabra", "sitio"])("P1 escolhe %s e P2 não substitui a arena", async (arenaId) => {
    const p = await pair();
    try {
      p.host.send({ ...selectionMessage("rafa-mare"), arenaId });
      await p.host.next("selection_ack");
      p.host.send({ protocolVersion: 1, type: "ready", ready: true });
      await p.host.next("ready");
      p.guest.send({ ...selectionMessage("dante-sinal"), arenaId: arenaId === "cais-da-cidade" ? "cozinha-macabra" : "cais-da-cidade" });
      expect(await p.guest.next("selection_ack")).toMatchObject({ selection: { arenaId } });
      expect(await p.persisted()).toEqual([
        { slot: "p1", arena_id: arenaId, ready: 1 },
        { slot: "p2", arena_id: arenaId, ready: 0 },
      ]);
      p.guest.send({ protocolVersion: 1, type: "ready", ready: true });
      const hostStart = await p.host.next("start");
      const guestStart = await p.guest.next("start");
      expect(hostStart.players).toEqual([
        { slot: "p1", fighterId: "rafa-mare", arenaId },
        { slot: "p2", fighterId: "dante-sinal", arenaId },
      ]);
      expect(guestStart.players).toEqual(hostStart.players);
      expect(guestStart.seed).toBe(hostStart.seed);
      p.host.send({ ...selectionMessage("rafa-mare"), arenaId });
      expect(await p.host.next("error")).toMatchObject({ error: { code: "selection_locked" } });
    } finally { p.host.close(); p.guest.close(); }
  });

  it("trocar a arena invalida o pronto do rival e persiste no reconnect", async () => {
    const p = await pair();
    let reconnected: Awaited<ReturnType<typeof connectSocket>> | undefined;
    try {
      // P2 pode escolher o lutador antes de P1, mas começa no Cais.
      p.guest.send({ ...selectionMessage("dante-sinal"), arenaId: "cozinha-macabra" });
      expect(await p.guest.next("selection_ack")).toMatchObject({ selection: { arenaId: "cais-da-cidade" } });
      p.host.send(selectionMessage("rafa-mare"));
      await p.host.next("selection_ack");
      p.guest.send({ protocolVersion: 1, type: "ready", ready: true });
      await p.guest.next("ready");
      p.host.send({ ...selectionMessage("rafa-mare"), arenaId: "cozinha-macabra" });
      await p.host.next("selection_ack");
      expect(await p.persisted()).toEqual([
        { slot: "p1", arena_id: "cozinha-macabra", ready: 0 },
        { slot: "p2", arena_id: "cozinha-macabra", ready: 0 },
      ]);
      p.guest.send({ protocolVersion: 1, type: "ready", ready: true, arenaId: "cais-da-cidade" });
      expect(await p.guest.next("error")).toMatchObject({ error: { code: "selection_changed" } });
      expect((await p.persisted()).every(row => row.ready === 0)).toBe(true);
      p.guest.close();
      reconnected = await connectSocket(await joinRoom(p.admission.roomCode, p.visitor.sessionToken));
      await reconnected.next("welcome");
      expect(await reconnected.next("room_state")).toMatchObject({ state: { players: [
        { slot: "p1", arenaId: "cozinha-macabra", ready: false },
        { slot: "p2", arenaId: "cozinha-macabra", ready: false },
      ] } });
    } finally { p.host.close(); p.guest.close(); reconnected?.close(); }
  });

  it("rejeita uma arena desconhecida sem mudar a seleção", async () => {
    const p = await pair();
    try {
      p.host.send({ ...selectionMessage("rafa-mare"), arenaId: "arena-inexistente" });
      expect(await p.host.next("error")).toMatchObject({ error: { code: "invalid_selection" } });
      expect((await p.persisted()).every(row => row.arena_id === null)).toBe(true);
    } finally { p.host.close(); p.guest.close(); }
  });
});
