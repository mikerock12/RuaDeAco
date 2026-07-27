import {
  env,
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
  SELF
} from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  connectSocket,
  createRoom,
  createSession,
  joinRoom,
  reconnectRoom,
  selectionMessage
} from "./helpers";

describe("persistência, hibernação e cleanup", () => {
  it("mantém attachment e sala após evicção do Durable Object", async () => {
    const session = await createSession();
    const admission = await createRoom(session.sessionToken);
    const socket = await connectSocket(admission);
    await socket.next("welcome");
    const stub = env.MATCH_ROOMS.get(
      env.MATCH_ROOMS.idFromName(`room:${admission.roomCode}`)
    );

    await evictDurableObject(stub);
    socket.send({
      protocolVersion: 1,
      type: "latency_ping",
      clientTime: 123
    });
    expect(await socket.next("latency_pong")).toMatchObject({
      clientTime: 123,
      type: "latency_pong"
    });
    const persisted = await runInDurableObject(
      stub,
      (_instance, state) => {
        const row = [
          ...state.storage.sql.exec<
            Record<string, SqlStorageValue> & {
              room_code: string;
              protocol_version: number;
            }
          >(
            "SELECT room_code, protocol_version FROM room WHERE id = 1"
          )
        ][0];
        return row;
      }
    );
    expect(persisted).toMatchObject({
      room_code: admission.roomCode,
      protocol_version: 1
    });
    socket.close();
  });

  it("mantém auto-response e attachment atualizado após hibernação real", async () => {
    const session = await createSession();
    const admission = await createRoom(session.sessionToken);
    const socket = await connectSocket(admission);
    await socket.next("welcome");
    socket.send({
      protocolVersion: 1,
      type: "latency_ping",
      clientTime: 1
    });
    await socket.next("latency_pong");

    const stub = env.MATCH_ROOMS.get(
      env.MATCH_ROOMS.idFromName(`room:${admission.roomCode}`)
    );
    const before = await runInDurableObject(stub, (_instance, state) => {
      const active = state.getWebSockets()[0];
      return active?.deserializeAttachment() as
        | Record<string, unknown>
        | undefined;
    });
    expect(before).toMatchObject({
      protocolVersion: 1,
      slot: "p1",
      rateWindowCount: 1
    });
    expect(before?.connectionId).toEqual(expect.any(String));

    await evictDurableObject(stub, { webSockets: "hibernate" });
    socket.socket.send("ping");
    expect(await socket.next("raw")).toEqual({
      type: "raw",
      data: "pong"
    });
    socket.send({
      protocolVersion: 1,
      type: "latency_ping",
      clientTime: 2
    });
    await socket.next("latency_pong");
    const after = await runInDurableObject(stub, (_instance, state) => {
      const active = state.getWebSockets()[0];
      return active?.deserializeAttachment() as
        | Record<string, unknown>
        | undefined;
    });
    expect(after).toMatchObject({
      connectionId: before?.connectionId,
      slot: "p1",
      rateWindowCount: 2
    });
    socket.close();
  });

  it("substitui conexão anterior por reconnect sem criar terceiro slot", async () => {
    const session = await createSession();
    const admission = await createRoom(session.sessionToken);
    const first = await connectSocket(admission);
    await first.next("welcome");
    const reconnect = await reconnectRoom(
      admission.roomCode,
      session.sessionToken
    );
    const second = await connectSocket(reconnect);
    await second.next("welcome");

    const stub = env.MATCH_ROOMS.get(
      env.MATCH_ROOMS.idFromName(`room:${admission.roomCode}`)
    );
    const count = await runInDurableObject(stub, (_instance, state) => {
      const row = [
        ...state.storage.sql.exec<
          Record<string, SqlStorageValue> & { count: number }
        >(
          "SELECT COUNT(*) AS count FROM slots"
        )
      ][0];
      return row?.count ?? -1;
    });
    expect(count).toBe(1);
    second.close();
  });

  it("alarme encerra sala expirada de forma idempotente", async () => {
    const session = await createSession();
    const admission = await createRoom(session.sessionToken);
    const stub = env.MATCH_ROOMS.get(
      env.MATCH_ROOMS.idFromName(`room:${admission.roomCode}`)
    );
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE room SET expires_at = ?, empty_deadline = NULL WHERE id = 1",
        Date.now() - 1
      );
      return state.storage.setAlarm(Date.now() + 60_000);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const phase = await runInDurableObject(stub, (_instance, state) => {
      const row = [
        ...state.storage.sql.exec<
          Record<string, SqlStorageValue> & { phase: string }
        >(
          "SELECT phase FROM room WHERE id = 1"
        )
      ][0];
      return row?.phase;
    });
    expect(phase).toBe("closed");
    expect(await runDurableObjectAlarm(stub)).toBe(false);
  });

  it("avisa desconexão, preserva o slot e aceita somente a mesma sessão", async () => {
    const hostSession = await createSession();
    const guestSession = await createSession();
    const strangerSession = await createSession();
    const hostAdmission = await createRoom(hostSession.sessionToken);
    const guestAdmission = await joinRoom(
      hostAdmission.roomCode,
      guestSession.sessionToken
    );
    const host = await connectSocket(hostAdmission);
    const guest = await connectSocket(guestAdmission);
    await host.next("welcome");
    await guest.next("welcome");
    guest.close();
    expect(await host.next("peer_disconnected")).toMatchObject({
      slot: "p2"
    });

    const denied = await SELF.fetch(
      `https://server.test/v1/rooms/${hostAdmission.roomCode}/reconnect`,
      {
        method: "POST",
        headers: {
          Origin: "http://127.0.0.1:5173",
          Authorization: `Bearer ${strangerSession.sessionToken}`
        }
      }
    );
    expect(denied.status).toBe(404);

    const resumedAdmission = await reconnectRoom(
      hostAdmission.roomCode,
      guestSession.sessionToken
    );
    expect(resumedAdmission.slot).toBe("p2");
    const resumed = await connectSocket(resumedAdmission);
    expect(await resumed.next("welcome")).toMatchObject({ slot: "p2" });
    host.close();
    resumed.close();
  });

  it("grace period vencido libera P2 em sala ainda não iniciada", async () => {
    const hostSession = await createSession();
    const guestSession = await createSession();
    const hostAdmission = await createRoom(hostSession.sessionToken);
    const guestAdmission = await joinRoom(
      hostAdmission.roomCode,
      guestSession.sessionToken
    );
    const host = await connectSocket(hostAdmission);
    const guest = await connectSocket(guestAdmission);
    await host.next("welcome");
    await guest.next("welcome");
    guest.close();
    await host.next("peer_disconnected");

    const stub = env.MATCH_ROOMS.get(
      env.MATCH_ROOMS.idFromName(`room:${hostAdmission.roomCode}`)
    );
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE slots SET reconnect_deadline = ? WHERE slot = 'p2'",
        Date.now() - 1
      );
      return state.storage.setAlarm(Date.now() + 60_000);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const slots = await runInDurableObject(stub, (_instance, state) => {
      const row = [
        ...state.storage.sql.exec<
          Record<string, SqlStorageValue> & { count: number }
        >("SELECT COUNT(*) AS count FROM slots")
      ][0];
      return row?.count;
    });
    expect(slots).toBe(1);
    host.close();
  });

  it("sala vazia expira e objetos distintos não compartilham dados", async () => {
    const firstSession = await createSession();
    const secondSession = await createSession();
    const firstRoom = await createRoom(firstSession.sessionToken);
    const secondRoom = await createRoom(secondSession.sessionToken);
    const firstStub = env.MATCH_ROOMS.get(
      env.MATCH_ROOMS.idFromName(`room:${firstRoom.roomCode}`)
    );
    const secondStub = env.MATCH_ROOMS.get(
      env.MATCH_ROOMS.idFromName(`room:${secondRoom.roomCode}`)
    );
    const codes = await Promise.all(
      [firstStub, secondStub].map((stub) =>
        runInDurableObject(stub, (_instance, state) => {
          const row = [
            ...state.storage.sql.exec<
              Record<string, SqlStorageValue> & { room_code: string }
            >("SELECT room_code FROM room WHERE id = 1")
          ][0];
          return row?.room_code;
        })
      )
    );
    expect(codes).toEqual([firstRoom.roomCode, secondRoom.roomCode]);

    await runInDurableObject(firstStub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE room SET empty_deadline = ?, expires_at = ? WHERE id = 1",
        Date.now() - 1,
        Date.now() + 60_000
      );
      return state.storage.setAlarm(Date.now() + 60_000);
    });
    expect(await runDurableObjectAlarm(firstStub)).toBe(true);
    const phases = await Promise.all(
      [firstStub, secondStub].map((stub) =>
        runInDurableObject(stub, (_instance, state) => {
          const row = [
            ...state.storage.sql.exec<
              Record<string, SqlStorageValue> & { phase: string }
            >("SELECT phase FROM room WHERE id = 1")
          ][0];
          return row?.phase;
        })
      )
    );
    expect(phases).toEqual(["closed", "waiting"]);
  });

  it("grace period vencido encerra uma partida ativa", async () => {
    const hostSession = await createSession();
    const guestSession = await createSession();
    const hostAdmission = await createRoom(hostSession.sessionToken);
    const guestAdmission = await joinRoom(
      hostAdmission.roomCode,
      guestSession.sessionToken
    );
    const host = await connectSocket(hostAdmission);
    const guest = await connectSocket(guestAdmission);
    await host.next("welcome");
    await guest.next("welcome");
    host.send(selectionMessage("dante-sinal"));
    guest.send(selectionMessage("rafa-mare"));
    await host.next("selection_ack");
    await guest.next("selection_ack");
    host.send({ protocolVersion: 1, type: "ready", ready: true });
    guest.send({ protocolVersion: 1, type: "ready", ready: true });
    await host.next("start");
    await guest.next("start");
    guest.close();
    await host.next("peer_disconnected");

    const stub = env.MATCH_ROOMS.get(
      env.MATCH_ROOMS.idFromName(`room:${hostAdmission.roomCode}`)
    );
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE slots SET reconnect_deadline = ? WHERE slot = 'p2'",
        Date.now() - 1
      );
      return state.storage.setAlarm(Date.now() + 60_000);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await host.next("room_closed")).toMatchObject({
      reason: "reconnect_expired"
    });
    const phase = await runInDurableObject(stub, (_instance, state) => {
      const row = [
        ...state.storage.sql.exec<
          Record<string, SqlStorageValue> & {
            phase: string;
            close_reason: string;
          }
        >("SELECT phase, close_reason FROM room WHERE id = 1")
      ][0];
      return row;
    });
    expect(phase).toMatchObject({
      phase: "closed",
      close_reason: "reconnect_expired"
    });
  });

  it("agenda somente o próximo deadline persistido e reagenda após processá-lo", async () => {
    const hostSession = await createSession();
    const guestSession = await createSession();
    const hostAdmission = await createRoom(hostSession.sessionToken);
    const guestAdmission = await joinRoom(
      hostAdmission.roomCode,
      guestSession.sessionToken
    );
    const guest = await connectSocket(guestAdmission);
    await guest.next("welcome");
    guest.close();

    const stub = env.MATCH_ROOMS.get(
      env.MATCH_ROOMS.idFromName(`room:${hostAdmission.roomCode}`)
    );
    const deadlines = await runInDurableObject(
      stub,
      async (_instance, state) => {
        const now = Date.now();
        const reconnectDeadline = now - 1;
        const roomDeadline = now + 120_000;
        state.storage.sql.exec(
          `UPDATE room
           SET expires_at = ?, empty_deadline = NULL
           WHERE id = 1`,
          roomDeadline
        );
        state.storage.sql.exec(
          `UPDATE slots SET reconnect_deadline = ?, connected = 0
           WHERE slot = 'p2'`,
          reconnectDeadline
        );
        await state.storage.setAlarm(now + 60_000);
        return { reconnectDeadline, roomDeadline };
      }
    );
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const after = await runInDurableObject(
      stub,
      async (_instance, state) => ({
        slots: [
          ...state.storage.sql.exec<
            Record<string, SqlStorageValue> & { count: number }
          >("SELECT COUNT(*) AS count FROM slots")
        ][0]?.count,
        alarm: await state.storage.getAlarm()
      })
    );
    expect(after.slots).toBe(1);
    expect(after.alarm).toBe(deadlines.roomDeadline);
  });
});
