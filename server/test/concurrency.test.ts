import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  apiFetch,
  connectSocket,
  createRoom,
  createSession,
  joinRoom,
  reconnectRoom,
  type AdmissionData
} from "./helpers";

const admissionFrom = async (response: Response): Promise<AdmissionData> => {
  const body = (await response.json()) as {
    ok: boolean;
    data: AdmissionData;
  };
  return body.data;
};

describe("concorrência de sala e tickets", () => {
  it("inicializa a mesma sala uma única vez sob creates concorrentes", async () => {
    const roomCode = "ABCDEFGHJK";
    const stub = env.MATCH_ROOMS.get(
      env.MATCH_ROOMS.idFromName(`room:${roomCode}`)
    );
    const body = {
      sessionId: crypto.randomUUID(),
      now: Date.now(),
      ticketTtlMs: 45_000,
      roomTtlMs: 7_200_000,
      emptyRoomTtlMs: 600_000,
      reconnectGraceMs: 30_000
    };
    const responses = await Promise.all(
      [0, 1].map(() =>
        stub.fetch("https://room.internal/internal/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Rua-Internal": env.TICKET_SECRET,
            "X-Room-Code": roomCode
          },
          body: JSON.stringify(body)
        })
      )
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      201,
      409
    ]);
    const rows = await runInDurableObject(stub, (_instance, state) => {
      const room = [
        ...state.storage.sql.exec<
          Record<string, SqlStorageValue> & { count: number }
        >("SELECT COUNT(*) AS count FROM room")
      ][0]?.count;
      const slots = [
        ...state.storage.sql.exec<
          Record<string, SqlStorageValue> & { count: number }
        >("SELECT COUNT(*) AS count FROM slots")
      ][0]?.count;
      return { room, slots };
    });
    expect(rows).toEqual({ room: 1, slots: 1 });
  });

  it("reserva P2 atomicamente entre duas sessões concorrentes", async () => {
    const host = await createSession();
    const candidateA = await createSession();
    const candidateB = await createSession();
    const room = await createRoom(host.sessionToken);

    const responses = await Promise.all(
      [candidateA, candidateB].map((candidate) =>
        apiFetch(`/v1/rooms/${room.roomCode}/join`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${candidate.sessionToken}`
          }
        })
      )
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200,
      409
    ]);

    const stub = env.MATCH_ROOMS.get(
      env.MATCH_ROOMS.idFromName(`room:${room.roomCode}`)
    );
    const slots = await runInDurableObject(stub, (_instance, state) => [
      ...state.storage.sql.exec<
        Record<string, SqlStorageValue> & {
          slot: string;
          session_id: string;
        }
      >("SELECT slot, session_id FROM slots ORDER BY slot")
    ]);
    expect(slots).toHaveLength(2);
    expect(slots.map((slot) => slot.slot)).toEqual(["p1", "p2"]);
    expect(new Set(slots.map((slot) => slot.session_id)).size).toBe(2);
  });

  it("mantém a mesma sessão idempotente sob dois joins concorrentes", async () => {
    const host = await createSession();
    const guest = await createSession();
    const room = await createRoom(host.sessionToken);
    const responses = await Promise.all(
      [0, 1].map(() =>
        apiFetch(`/v1/rooms/${room.roomCode}/join`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${guest.sessionToken}`
          }
        })
      )
    );
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const admissions = await Promise.all(responses.map(admissionFrom));
    expect(admissions.every((admission) => admission.slot === "p2")).toBe(
      true
    );
    expect(admissions[0]?.socketTicket).not.toBe(
      admissions[1]?.socketTicket
    );
  });

  it("consome um mesmo nonce exatamente uma vez sob upgrades concorrentes", async () => {
    const session = await createSession();
    const room = await createRoom(session.sessionToken);
    const responses = await Promise.all(
      [0, 1].map(() =>
        apiFetch(`/v1/rooms/${room.roomCode}/ws`, {
          headers: {
            Upgrade: "websocket",
            "Sec-WebSocket-Protocol": room.websocketProtocols.join(", ")
          }
        })
      )
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      101,
      401
    ]);
    const accepted = responses.find((response) => response.status === 101);
    accepted?.webSocket?.accept();
    accepted?.webSocket?.close(1000, "Fim do teste.");
  });

  it("encerra o socket antigo e mantém somente a conexão nova ativa", async () => {
    const session = await createSession();
    const admission = await createRoom(session.sessionToken);
    const first = await connectSocket(admission);
    await first.next("welcome");
    const closed = new Promise<CloseEvent>((resolve) => {
      first.socket.addEventListener("close", resolve, { once: true });
    });

    const reconnect = await reconnectRoom(
      admission.roomCode,
      session.sessionToken
    );
    const second = await connectSocket(reconnect);
    await second.next("welcome");
    expect((await closed).code).toBe(4001);

    second.send({
      protocolVersion: 1,
      type: "latency_ping",
      clientTime: 77
    });
    expect(await second.next("latency_pong")).toMatchObject({
      clientTime: 77
    });

    const stub = env.MATCH_ROOMS.get(
      env.MATCH_ROOMS.idFromName(`room:${admission.roomCode}`)
    );
    const active = await runInDurableObject(stub, (_instance, state) => {
      const row = [
        ...state.storage.sql.exec<
          Record<string, SqlStorageValue> & { count: number }
        >("SELECT COUNT(*) AS count FROM active_connections")
      ][0];
      return row?.count;
    });
    expect(active).toBe(1);
    second.close();
  });

  it("outra sessão não toma P2 durante reconnect concorrente", async () => {
    const host = await createSession();
    const guest = await createSession();
    const stranger = await createSession();
    const room = await createRoom(host.sessionToken);
    const guestAdmission = await joinRoom(
      room.roomCode,
      guest.sessionToken
    );
    const guestSocket = await connectSocket(guestAdmission);
    await guestSocket.next("welcome");
    guestSocket.close();

    const [reconnect, takeover] = await Promise.all([
      reconnectRoom(room.roomCode, guest.sessionToken),
      apiFetch(`/v1/rooms/${room.roomCode}/join`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stranger.sessionToken}`
        }
      })
    ]);
    expect(reconnect.slot).toBe("p2");
    expect(takeover.status).toBe(409);
  });
});
