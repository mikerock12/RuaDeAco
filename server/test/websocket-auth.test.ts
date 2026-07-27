import { describe, expect, it } from "vitest";

import {
  apiFetch,
  connectSocket,
  createRoom,
  createSession
} from "./helpers";

describe("autenticação WebSocket", () => {
  it("consome o ticket uma única vez e não o ecoa como protocolo", async () => {
    const session = await createSession();
    const admission = await createRoom(session.sessionToken);
    const socket = await connectSocket(admission);
    expect(await socket.next("welcome")).toMatchObject({
      protocolVersion: 1,
      type: "welcome",
      slot: "p1",
      roomCode: admission.roomCode
    });

    const replay = await apiFetch(`/v1/rooms/${admission.roomCode}/ws`, {
      headers: {
        Upgrade: "websocket",
        "Sec-WebSocket-Protocol": admission.websocketProtocols.join(", ")
      }
    });
    expect(replay.status).toBe(401);
    expect(await replay.json()).toMatchObject({
      error: { code: "socket_ticket_consumed" }
    });
    socket.close();
  });

  it("recusa ticket em outra sala e subprotocolo ausente", async () => {
    const first = await createSession();
    const second = await createSession();
    const roomOne = await createRoom(first.sessionToken);
    const roomTwo = await createRoom(second.sessionToken);

    const wrongRoom = await apiFetch(`/v1/rooms/${roomTwo.roomCode}/ws`, {
      headers: {
        Upgrade: "websocket",
        "Sec-WebSocket-Protocol": roomOne.websocketProtocols.join(", ")
      }
    });
    expect(wrongRoom.status).toBe(401);
    expect(await wrongRoom.json()).toMatchObject({
      error: { code: "ticket_room_mismatch" }
    });

    const missingProtocol = await apiFetch(
      `/v1/rooms/${roomOne.roomCode}/ws`,
      {
        headers: {
          Upgrade: "websocket",
          "Sec-WebSocket-Protocol": roomOne.websocketProtocols[1]
        }
      }
    );
    expect(missingProtocol.status).toBe(400);
    expect(await missingProtocol.json()).toMatchObject({
      error: { code: "protocol_required" }
    });
  });

  it("recusa Upgrade ausente e ticket adulterado", async () => {
    const session = await createSession();
    const room = await createRoom(session.sessionToken);
    const noUpgrade = await apiFetch(`/v1/rooms/${room.roomCode}/ws`, {
      headers: {
        "Sec-WebSocket-Protocol": room.websocketProtocols.join(", ")
      }
    });
    expect(noUpgrade.status).toBe(426);

    const ticket = room.socketTicket;
    const tampered =
      ticket.slice(0, -1) + (ticket.endsWith("a") ? "b" : "a");
    const invalid = await apiFetch(`/v1/rooms/${room.roomCode}/ws`, {
      headers: {
        Upgrade: "websocket",
        "Sec-WebSocket-Protocol": `rua-de-aco.v1, ticket.${tampered}`
      }
    });
    expect(invalid.status).toBe(401);
    expect(await invalid.json()).toMatchObject({
      error: { code: "invalid_token" }
    });
  });
});
