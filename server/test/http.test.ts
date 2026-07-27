import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  apiFetch,
  createRoom,
  createSession,
  joinRoom,
  ORIGIN,
  readEnvelope,
  type AdmissionData
} from "./helpers";

describe("Worker HTTP", () => {
  it("expõe health e ping com contrato estável", async () => {
    const health = await SELF.fetch("https://server.test/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      ok: true,
      data: { service: "rua-de-aco-server", status: "ok", protocolVersion: 1 }
    });

    const ping = await apiFetch("/v1/ping");
    expect(ping.status).toBe(200);
    expect(ping.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(await ping.json()).toMatchObject({
      ok: true,
      data: { pong: true, protocolVersion: 1 }
    });
  });

  it("rejeita origin ausente ou fora da allowlist", async () => {
    const missing = await SELF.fetch("https://server.test/v1/ping");
    expect(missing.status).toBe(403);
    expect(await missing.json()).toMatchObject({
      error: { code: "origin_required" }
    });

    const denied = await apiFetch("/v1/ping", {
      headers: { Origin: "https://example.invalid" }
    });
    expect(denied.status).toBe(403);
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("responde preflight apenas para origin permitido", async () => {
    const response = await apiFetch("/v1/rooms", { method: "OPTIONS" });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "POST"
    );
  });

  it("emite sessão HMAC e recusa token adulterado", async () => {
    const session = await createSession();
    expect(session.protocolVersion).toBe(1);
    expect(session.sessionToken.split(".")).toHaveLength(2);

    const tampered =
      session.sessionToken.slice(0, -1) +
      (session.sessionToken.endsWith("a") ? "b" : "a");
    const response = await apiFetch("/v1/rooms", {
      method: "POST",
      headers: { Authorization: `Bearer ${tampered}` }
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "invalid_token" }
    });
  });

  it("cria sala, normaliza o código e limita a duas sessões", async () => {
    const host = await createSession();
    const guest = await createSession();
    const third = await createSession();
    const room = await createRoom(host.sessionToken);
    expect(room.roomCode).toMatch(/^[A-HJ-NP-Z2-9]{10}$/u);
    expect(room.slot).toBe("p1");
    expect(room.websocketProtocols[0]).toBe("rua-de-aco.v1");

    const joined = await joinRoom(
      room.roomCode.toLowerCase(),
      guest.sessionToken
    );
    expect(joined.slot).toBe("p2");
    expect(joined.roomCode).toBe(room.roomCode);

    const resumed = await joinRoom(room.roomCode, guest.sessionToken);
    expect(resumed.slot).toBe("p2");
    expect(resumed.socketTicket).not.toBe(joined.socketTicket);

    const full = await apiFetch(`/v1/rooms/${room.roomCode}/join`, {
      method: "POST",
      headers: { Authorization: `Bearer ${third.sessionToken}` }
    });
    expect(full.status).toBe(409);
    expect(await full.json()).toMatchObject({
      error: { code: "room_full" }
    });
  });

  it("exige Bearer e retorna erros JSON em rotas desconhecidas", async () => {
    const unauthenticated = await apiFetch("/v1/rooms", { method: "POST" });
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.json()).toMatchObject({
      error: { code: "authorization_required" }
    });

    const missing = await apiFetch("/v1/missing");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      ok: false,
      error: { code: "not_found" }
    });
  });

  it("recusa método inválido, Content-Type impróprio e body excessivo", async () => {
    const wrongMethod = await apiFetch("/v1/sessions", { method: "GET" });
    expect(wrongMethod.status).toBe(405);
    expect(await wrongMethod.json()).toMatchObject({
      error: { code: "method_not_allowed" }
    });

    const wrongType = await apiFetch("/v1/sessions", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "{}"
    });
    expect(wrongType.status).toBe(415);

    const oversized = await apiFetch("/v1/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(17 * 1024) })
    });
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toMatchObject({
      error: { code: "payload_too_large" }
    });
  });

  it("devolve admission payload sem expor o nonce isoladamente", async () => {
    const session = await createSession();
    const roomResponse = await apiFetch("/v1/rooms", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.sessionToken}` }
    });
    const body = await readEnvelope<AdmissionData>(roomResponse);
    expect(body.data.socketTicket).toContain(".");
    expect(Object.keys(body.data)).not.toContain("nonce");
  });
});
