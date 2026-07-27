import { describe, expect, it } from "vitest";

import {
  issueSessionToken,
  issueSocketTicket,
  verifySessionToken,
  verifySocketTicket
} from "../src/auth";
import { ApiError } from "../src/errors";

const SECRET = `${crypto.randomUUID()}${crypto.randomUUID()}`;
const encoder = new TextEncoder();

const encodeBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
};

const signClaims = async (
  claims: Record<string, unknown>,
  secret = SECRET
): Promise<string> => {
  const payload = encodeBase64Url(encoder.encode(JSON.stringify(claims)));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  );
  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
};

describe("tokens HMAC", () => {
  it("aceita sessão e ticket válidos com claims estritos", async () => {
    const now = 10_000;
    const session = await issueSessionToken(SECRET, now, 60_000);
    await expect(
      verifySessionToken(session.token, SECRET, now + 1)
    ).resolves.toEqual(session.claims);

    const sessionId = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    const ticket = await issueSocketTicket(
      SECRET,
      sessionId,
      "ABCDEFGHJK",
      "p2",
      nonce,
      now,
      now + 45_000
    );
    await expect(
      verifySocketTicket(ticket, SECRET, now + 1)
    ).resolves.toMatchObject({
      t: "socket",
      v: 1,
      sid: sessionId,
      room: "ABCDEFGHJK",
      slot: "p2",
      nonce
    });
  });

  it("recusa sessão expirada", async () => {
    const issued = await issueSessionToken(SECRET, 1_000, 1_000);
    await expect(
      verifySessionToken(issued.token, SECRET, 2_001)
    ).rejects.toMatchObject({
      code: "invalid_session"
    } satisfies Partial<ApiError>);
  });

  it("recusa token de socket quando uma sessão é exigida", async () => {
    const ticket = await issueSocketTicket(
      SECRET,
      crypto.randomUUID(),
      "ABCDEFGHJK",
      "p1",
      crypto.randomUUID(),
      1_000,
      10_000
    );
    await expect(
      verifySessionToken(ticket, SECRET, 2_000)
    ).rejects.toMatchObject({
      code: "invalid_session"
    } satisfies Partial<ApiError>);
  });

  it("recusa ticket expirado e adulterado", async () => {
    const ticket = await issueSocketTicket(
      SECRET,
      crypto.randomUUID(),
      "ABCDEFGHJK",
      "p1",
      crypto.randomUUID(),
      1_000,
      2_000
    );
    await expect(
      verifySocketTicket(ticket, SECRET, 2_001)
    ).rejects.toMatchObject({
      code: "invalid_socket_ticket"
    } satisfies Partial<ApiError>);
    const tampered =
      ticket.slice(0, -1) + (ticket.endsWith("a") ? "b" : "a");
    await expect(
      verifySocketTicket(tampered, SECRET, 1_500)
    ).rejects.toMatchObject({
      code: "invalid_token"
    } satisfies Partial<ApiError>);
  });

  it("recusa payload alterado mesmo mantendo a assinatura original", async () => {
    const issued = await issueSessionToken(SECRET, 10_000, 60_000);
    const [payload, signature] = issued.token.split(".");
    expect(payload).toBeDefined();
    expect(signature).toBeDefined();
    const parsed = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(
            (payload ?? "")
              .replaceAll("-", "+")
              .replaceAll("_", "/") +
              "=".repeat((4 - ((payload ?? "").length % 4)) % 4)
          ),
          (character) => character.charCodeAt(0)
        )
      )
    ) as Record<string, unknown>;
    const changedPayload = encodeBase64Url(
      encoder.encode(JSON.stringify({ ...parsed, sid: crypto.randomUUID() }))
    );
    await expect(
      verifySessionToken(
        `${changedPayload}.${signature ?? ""}`,
        SECRET,
        10_001
      )
    ).rejects.toMatchObject({ code: "invalid_token" });
  });

  it.each([
    ["tipo errado", { t: "socket" }],
    ["versão errada", { v: 2 }],
    ["campo nbf extra", { nbf: 20_000 }]
  ])("recusa sessão assinada com %s", async (_label, override) => {
    const token = await signClaims({
      t: "session",
      v: 1,
      sid: crypto.randomUUID(),
      iat: 10_000,
      exp: 70_000,
      ...override
    });
    await expect(
      verifySessionToken(token, SECRET, 10_001)
    ).rejects.toMatchObject({ code: "invalid_session" });
  });

  it.each([
    ["sala malformada", { room: "INVALID" }],
    ["slot inválido", { slot: "p3" }],
    ["versão errada", { v: 2 }],
    ["tipo errado", { t: "session" }]
  ])("recusa ticket assinado com %s", async (_label, override) => {
    const token = await signClaims({
      t: "socket",
      v: 1,
      sid: crypto.randomUUID(),
      room: "ABCDEFGHJK",
      slot: "p1",
      nonce: crypto.randomUUID(),
      iat: 10_000,
      exp: 55_000,
      ...override
    });
    await expect(
      verifySocketTicket(token, SECRET, 10_001)
    ).rejects.toMatchObject({ code: "invalid_socket_ticket" });
  });

  it("recusa emissão com secret ausente ou fraco sem expor o valor", async () => {
    await expect(
      issueSessionToken("", 10_000, 60_000)
    ).rejects.toThrow("pelo menos 32 bytes");
    await expect(
      issueSessionToken("fraco", 10_000, 60_000)
    ).rejects.toThrow("pelo menos 32 bytes");
  });
});
