import WebSocket from "ws";

const BASE_URL =
  process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:8787";
const SOCKET_BASE_URL = BASE_URL.replace(/^http/u, "ws");
const ORIGIN = "http://127.0.0.1:5173";

const request = (pathname, init = {}) =>
  fetch(`${BASE_URL}${pathname}`, init);

const expectStatus = async (label, responsePromise, expected) => {
  const response = await responsePromise;
  if (response.status !== expected) {
    let code = "unavailable";
    try {
      const body = await response.json();
      code = body?.error?.code ?? "unknown";
    } catch {
      // A asserção de status continua suficiente.
    }
    throw new Error(
      `${label}: esperado HTTP ${expected}, recebido ${response.status} (${code}).`
    );
  }
  return response;
};

const api = async (pathname, { token, method = "GET", body } = {}) => {
  const headers = new Headers({ Origin: ORIGIN });
  if (token !== undefined) headers.set("Authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const response = await request(pathname, { method, headers, body });
  const envelope = await response.json();
  if (!response.ok || envelope.ok !== true) {
    throw new Error(
      `${method} ${pathname}: HTTP ${response.status} (${envelope?.error?.code ?? "unknown"}).`
    );
  }
  return envelope.data;
};

const connect = async (admission) => {
  const socket = new WebSocket(
    `${SOCKET_BASE_URL}/v1/rooms/${admission.roomCode}/ws`,
    admission.websocketProtocols,
    { origin: ORIGIN }
  );
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return socket;
};

const waitForSocketError = (socket, expectedCode) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timeout esperando erro ${expectedCode}.`)),
      3_000
    );
    socket.on("message", (data, binary) => {
      if (binary) return;
      const value = JSON.parse(data.toString());
      if (value?.type === "error" && value?.error?.code === expectedCode) {
        clearTimeout(timeout);
        resolve(value);
      }
    });
  });

const expectWebSocketStatus = (label, roomCode, protocols, expected) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `${SOCKET_BASE_URL}/v1/rooms/${roomCode}/ws`,
      protocols,
      { origin: ORIGIN }
    );
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error(`${label}: timeout esperando HTTP ${expected}.`));
    }, 3_000);
    socket.once("unexpected-response", (_request, response) => {
      clearTimeout(timeout);
      if (response.statusCode !== expected) {
        reject(
          new Error(
            `${label}: esperado HTTP ${expected}, recebido ${response.statusCode}.`
          )
        );
        return;
      }
      response.resume();
      resolve(response.statusCode);
    });
    socket.once("open", () => {
      clearTimeout(timeout);
      socket.close();
      reject(new Error(`${label}: upgrade foi aceito indevidamente.`));
    });
    socket.on("error", () => {
      // O status HTTP é validado por unexpected-response.
    });
  });

const run = async () => {
  await expectStatus("health", request("/health"), 200);
  await expectStatus(
    "método inválido",
    request("/health", { method: "POST", headers: { Origin: ORIGIN } }),
    405
  );
  const deniedOrigin = await expectStatus(
    "origin proibido",
    request("/v1/ping", {
      headers: { Origin: "https://mikerock12.github.io/RuaDeAco/" }
    }),
    403
  );
  if (deniedOrigin.headers.has("Access-Control-Allow-Origin")) {
    throw new Error("Origin proibido recebeu CORS permissivo.");
  }
  const preflight = await expectStatus(
    "preflight permitido",
    request("/v1/rooms", {
      method: "OPTIONS",
      headers: {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, content-type"
      }
    }),
    204
  );
  if (
    preflight.headers.get("Access-Control-Allow-Origin") !== ORIGIN ||
    !preflight.headers.get("Vary")?.includes("Origin")
  ) {
    throw new Error("Preflight permitido retornou headers CORS inválidos.");
  }
  await expectStatus(
    "sessão sem Origin",
    request("/v1/sessions", { method: "POST" }),
    403
  );
  await expectStatus(
    "body inválido",
    request("/v1/sessions", {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/json" },
      body: "{"
    }),
    400
  );
  await expectStatus(
    "body HTTP excessivo",
    request("/v1/sessions", {
      method: "POST",
      headers: { Origin: ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(17 * 1024) })
    }),
    413
  );

  const hostSession = await api("/v1/sessions", { method: "POST" });
  const guestSession = await api("/v1/sessions", { method: "POST" });
  const thirdSession = await api("/v1/sessions", { method: "POST" });
  const room = await api("/v1/rooms", {
    method: "POST",
    token: hostSession.sessionToken
  });
  await api(`/v1/rooms/${room.roomCode}/join`, {
    method: "POST",
    token: guestSession.sessionToken
  });
  await expectStatus(
    "terceiro jogador",
    request(`/v1/rooms/${room.roomCode}/join`, {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        Authorization: `Bearer ${thirdSession.sessionToken}`
      }
    }),
    409
  );
  await expectStatus(
    "sala inexistente",
    request("/v1/rooms/ABCDEFGHJK/join", {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        Authorization: `Bearer ${thirdSession.sessionToken}`
      }
    }),
    404
  );
  await expectStatus(
    "WebSocket sem Upgrade",
    request(`/v1/rooms/${room.roomCode}/ws`, {
      headers: { Origin: ORIGIN }
    }),
    426
  );
  await expectWebSocketStatus(
    "ticket ausente",
    room.roomCode,
    ["rua-de-aco.v1"],
    401
  );
  await expectWebSocketStatus(
    "protocolo incompatível",
    room.roomCode,
    [room.websocketProtocols[1]],
    400
  );

  const freshRoom = await api("/v1/rooms", {
    method: "POST",
    token: thirdSession.sessionToken
  });
  const socket = await connect(freshRoom);
  const oversizedError = waitForSocketError(socket, "message_too_large");
  socket.send(
    JSON.stringify({
      protocolVersion: 1,
      type: "latency_ping",
      clientTime: 1,
      padding: "x".repeat(17 * 1024)
    })
  );
  await oversizedError;
  socket.close(1000, "Teste negativo concluído.");

  console.log(
    "Smoke negativo aprovado: HTTP/CORS, autenticação WebSocket, sala, terceiro jogador, protocolo e limites."
  );
};

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
