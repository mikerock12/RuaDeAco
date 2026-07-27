import { SELF } from "cloudflare:test";
import { expect } from "vitest";

export const ORIGIN = "http://127.0.0.1:5173";
export const SOCKET_PROTOCOL = "rua-de-aco.v1";

interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  error?: { code: string; message: string };
}

export interface SessionData {
  sessionToken: string;
  sessionId: string;
  expiresAt: number;
  protocolVersion: number;
}

export interface AdmissionData {
  roomCode: string;
  slot: "p1" | "p2";
  socketTicket: string;
  socketTicketExpiresAt: number;
  websocketUrl: string;
  websocketProtocols: [string, string];
}

export const apiFetch = (
  pathname: string,
  init: RequestInit = {}
): Promise<Response> => {
  const headers = new Headers(init.headers);
  if (!headers.has("Origin")) headers.set("Origin", ORIGIN);
  return SELF.fetch(
    new Request(`https://server.test${pathname}`, { ...init, headers })
  );
};

export const readEnvelope = async <T>(
  response: Response
): Promise<ApiEnvelope<T>> =>
  (await response.json()) as ApiEnvelope<T>;

export const createSession = async (): Promise<SessionData> => {
  const response = await apiFetch("/v1/sessions", { method: "POST" });
  expect(response.status).toBe(201);
  return (await readEnvelope<SessionData>(response)).data;
};

export const createRoom = async (
  sessionToken: string
): Promise<AdmissionData> => {
  const response = await apiFetch("/v1/rooms", {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionToken}` }
  });
  expect(response.status).toBe(201);
  return (await readEnvelope<AdmissionData>(response)).data;
};

export const joinRoom = async (
  roomCode: string,
  sessionToken: string
): Promise<AdmissionData> => {
  const response = await apiFetch(`/v1/rooms/${roomCode}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionToken}` }
  });
  expect(response.status).toBe(200);
  return (await readEnvelope<AdmissionData>(response)).data;
};

export const reconnectRoom = async (
  roomCode: string,
  sessionToken: string
): Promise<AdmissionData> => {
  const response = await apiFetch(`/v1/rooms/${roomCode}/reconnect`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionToken}` }
  });
  expect(response.status).toBe(200);
  return (await readEnvelope<AdmissionData>(response)).data;
};

export interface SocketHarness {
  socket: WebSocket;
  count(type: string): number;
  next(type?: string): Promise<Record<string, unknown>>;
  send(message: Record<string, unknown>): void;
  close(): void;
}

export const connectSocket = async (
  admission: AdmissionData
): Promise<SocketHarness> => {
  const response = await apiFetch(
    `/v1/rooms/${admission.roomCode}/ws`,
    {
      headers: {
        Upgrade: "websocket",
        "Sec-WebSocket-Protocol": admission.websocketProtocols.join(", ")
      }
    }
  );
  expect(response.status).toBe(101);
  expect(response.headers.get("Sec-WebSocket-Protocol")).toBe(
    SOCKET_PROTOCOL
  );
  const socket = response.webSocket;
  expect(socket).not.toBeNull();
  if (socket === null) throw new Error("WebSocket ausente.");

  const queued: Record<string, unknown>[] = [];
  const counts = new Map<string, number>();
  const waiters: Array<{
    type: string | undefined;
    resolve(value: Record<string, unknown>): void;
    reject(error: Error): void;
  }> = [];
  socket.accept();
  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(event.data) as Record<string, unknown>;
    } catch {
      value = { type: "raw", data: event.data };
    }
    if (typeof value.type === "string") {
      counts.set(value.type, (counts.get(value.type) ?? 0) + 1);
    }
    const index = waiters.findIndex(
      (waiter) => waiter.type === undefined || waiter.type === value.type
    );
    if (index >= 0) {
      const waiter = waiters.splice(index, 1)[0];
      waiter?.resolve(value);
      return;
    }
    queued.push(value);
  });

  return {
    socket,
    count(type: string): number {
      return counts.get(type) ?? 0;
    },
    next(type?: string): Promise<Record<string, unknown>> {
      const queuedIndex = queued.findIndex(
        (value) => type === undefined || value.type === type
      );
      if (queuedIndex >= 0) {
        const value = queued.splice(queuedIndex, 1)[0];
        if (value !== undefined) return Promise.resolve(value);
      }
      return new Promise((resolve, reject) => {
        const waiter: (typeof waiters)[number] = { type, resolve, reject };
        waiters.push(waiter);
        setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) {
            waiters.splice(index, 1);
            reject(new Error(`Timeout esperando mensagem ${type ?? "*"}.`));
          }
        }, 2_000);
      });
    },
    send(message: Record<string, unknown>): void {
      socket.send(JSON.stringify(message));
    },
    close(): void {
      socket.close(1000, "Fim do teste.");
    }
  };
};

export const selectionMessage = (
  fighterId: string
): Record<string, unknown> => ({
  protocolVersion: 1,
  type: "select",
  fighterId,
  arenaId: "cais-da-cidade",
  clientBuildId: "test-build",
  engineVersion: "phase-1",
  assetRevision: "test-assets"
});
