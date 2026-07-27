import {
  env,
  listDurableObjectIds,
  SELF
} from "cloudflare:test";
import { describe, expect, it } from "vitest";

import worker from "../src/index";
import type { Env } from "../src/config";
import { apiFetch } from "./helpers";

const ALLOWED_ORIGINS = [
  "https://mikerock12.github.io",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "https://localhost",
  "capacitor://localhost"
];

describe("segurança HTTP e CORS", () => {
  it("health e ping não instanciam Durable Objects", async () => {
    expect(await listDurableObjectIds(env.MATCH_ROOMS)).toHaveLength(0);
    expect((await SELF.fetch("https://server.test/health")).status).toBe(200);
    expect((await apiFetch("/v1/ping")).status).toBe(200);
    expect(await listDurableObjectIds(env.MATCH_ROOMS)).toHaveLength(0);
  });

  it.each(ALLOWED_ORIGINS)(
    "aceita exatamente o origin permitido %s",
    async (origin) => {
      const response = await apiFetch("/v1/ping", {
        headers: { Origin: origin }
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        origin
      );
      expect(response.headers.get("Vary")).toContain("Origin");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("Content-Type")).toContain(
        "application/json"
      );
    }
  );

  it("não confunde path do GitHub Pages com Origin", async () => {
    const response = await apiFetch("/v1/ping", {
      headers: {
        Origin: "https://mikerock12.github.io/RuaDeAco/"
      }
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Vary")).toContain("Origin");
  });

  it("não retorna wildcard nem stack trace em erros autenticados", async () => {
    const response = await apiFetch("/v1/rooms", { method: "POST" });
    const text = await response.text();
    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).not.toBe("*");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(text).not.toContain("stack");
    expect(text).not.toContain("at ");
  });

  it("falha de forma fechada quando o secret está ausente ou fraco", async () => {
    const request = new Request("https://server.test/v1/sessions", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:5173" }
    });
    const response = await worker.fetch(request, {
      ...env,
      TICKET_SECRET: ""
    } as Env);
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(text).toContain("internal_error");
    expect(text).not.toContain("TICKET_SECRET");
  });
});
