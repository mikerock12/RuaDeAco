import { describe, expect, it, vi } from "vitest";

import {
  apiFetch,
  connectSocket,
  createRoom,
  createSession,
  type SocketHarness
} from "./helpers";

const waitForCount = (
  socket: WebSocket,
  type: string,
  expected: number
): Promise<void> =>
  new Promise((resolve, reject) => {
    let count = 0;
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error(`Timeout esperando ${expected} mensagens ${type}.`));
    }, 10_000);
    const onMessage = (event: MessageEvent) => {
      if (typeof event.data !== "string") return;
      const value = JSON.parse(event.data) as { type?: string };
      if (value.type !== type) return;
      count += 1;
      if (count === expected) {
        clearTimeout(timeout);
        socket.removeEventListener("message", onMessage);
        resolve();
      }
    };
    socket.addEventListener("message", onMessage);
  });

describe("rate limit e logs sensíveis", () => {
  it("limita operações HTTP repetidas da mesma sessão dentro da sala", async () => {
    const session = await createSession();
    const admission = await createRoom(session.sessionToken);
    for (let index = 0; index < 59; index += 1) {
      const response = await apiFetch(
        `/v1/rooms/${admission.roomCode}/join`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.sessionToken}`
          }
        }
      );
      expect(response.status).toBe(200);
    }
    const limited = await apiFetch(
      `/v1/rooms/${admission.roomCode}/join`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.sessionToken}`
        }
      }
    );
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({
      error: { code: "rate_limited" }
    });
  });

  it("aceita o burst previsto e fecha somente após violações repetidas", async () => {
    const session = await createSession();
    const admission = await createRoom(session.sessionToken);
    const client = await connectSocket(admission);
    await client.next("welcome");

    const accepted = waitForCount(client.socket, "latency_pong", 300);
    for (let index = 0; index < 300; index += 1) {
      client.send({
        protocolVersion: 1,
        type: "latency_ping",
        clientTime: index
      });
    }
    await accepted;
    expect(client.socket.readyState).toBe(WebSocket.OPEN);

    const errors = waitForCount(client.socket, "error", 3);
    const closed = new Promise<CloseEvent>((resolve) => {
      client.socket.addEventListener("close", resolve, { once: true });
    });
    for (let index = 0; index < 3; index += 1) {
      client.send({
        protocolVersion: 1,
        type: "latency_ping",
        clientTime: 300 + index
      });
    }
    await errors;
    const closeEvent = await closed;
    expect(closeEvent.code).toBe(4008);
    expect(closeEvent.reason.length).toBeLessThanOrEqual(123);
  });

  it("não inclui token, ticket, secret ou payload sensível nos logs", async () => {
    const marker = `sensivel-${crypto.randomUUID()}`;
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let client: SocketHarness | undefined;
    try {
      const session = await createSession();
      const admission = await createRoom(session.sessionToken);
      client = await connectSocket(admission);
      await client.next("welcome");
      client.send({
        protocolVersion: 1,
        type: "mensagem_invalida",
        secret: marker,
        token: session.sessionToken,
        ticket: admission.socketTicket
      });
      expect(await client.next("error")).toMatchObject({
        error: { code: "unknown_message_type" }
      });
      await Promise.resolve();
      const output = [...log.mock.calls, ...error.mock.calls]
        .flat()
        .join("\n");
      expect(output).not.toContain(marker);
      expect(output).not.toContain(session.sessionToken);
      expect(output).not.toContain(admission.socketTicket);
      expect(output).not.toContain("X-Rua-Internal");
    } finally {
      client?.close();
      log.mockRestore();
      error.mockRestore();
    }
  });

  it("aplica proteção best-effort à criação de sessões", async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 31; index += 1) {
      const response = await apiFetch("/v1/sessions", {
        method: "POST",
        headers: { "CF-Connecting-IP": "198.51.100.77" }
      });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 30).every((status) => status === 201)).toBe(
      true
    );
    expect(statuses[30]).toBe(429);
  });
});
