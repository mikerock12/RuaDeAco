import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import WebSocket from "ws";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = join(HERE, "..");
const ORIGIN = "http://127.0.0.1:5173";
const PORT = Number.parseInt(process.env.SMOKE_PORT ?? "8787", 10);
const BASE_URL =
  process.env.SMOKE_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const SOCKET_BASE_URL = BASE_URL.replace(/^http/u, "ws");
const TEST_SECRET = randomBytes(48).toString("base64url");

let wrangler;
let wranglerOutput = "";

const portIsListening = () =>
  new Promise((resolve) => {
    const socket = createConnection({
      host: "127.0.0.1",
      port: PORT
    });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });

const startWrangler = () => {
  if (process.env.SMOKE_BASE_URL !== undefined) return;
  const wranglerEntry = join(
    SERVER_ROOT,
    "node_modules",
    "wrangler",
    "bin",
    "wrangler.js"
  );
  wrangler = spawn(
    process.execPath,
    [
      wranglerEntry,
      "dev",
      "--port",
      String(PORT),
      "--ip",
      "127.0.0.1",
      "--show-interactive-dev-session",
      "false"
    ],
    {
      cwd: SERVER_ROOT,
      env: { ...process.env, TICKET_SECRET: TEST_SECRET },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }
  );
  const collect = (chunk) => {
    wranglerOutput = (wranglerOutput + chunk.toString()).slice(-8_000);
  };
  wrangler.stdout.on("data", collect);
  wrangler.stderr.on("data", collect);
};

const stopWrangler = async () => {
  if (wrangler === undefined) return;
  if (wrangler.exitCode === null) {
    if (process.platform === "win32" && wrangler.pid !== undefined) {
      spawnSync(
        "taskkill",
        ["/PID", String(wrangler.pid), "/T", "/F"],
        { stdio: "ignore", windowsHide: true }
      );
    } else {
      wrangler.kill();
    }
    await Promise.race([
      new Promise((resolve) => wrangler.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000))
    ]);
  }
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!(await portIsListening())) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`A porta ${PORT} permaneceu ocupada após o smoke.`);
};

const waitForServer = async () => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (wrangler?.exitCode !== null && wrangler?.exitCode !== undefined) {
      throw new Error(`Wrangler encerrou cedo.\n${wranglerOutput}`);
    }
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) return;
    } catch {
      // O processo ainda está iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Servidor local não iniciou.\n${wranglerOutput}`);
};

const api = async (pathname, { token, method = "GET" } = {}) => {
  const headers = new Headers({ Origin: ORIGIN });
  if (token !== undefined) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${BASE_URL}${pathname}`, { method, headers });
  const body = await response.json();
  if (!response.ok || body.ok !== true) {
    throw new Error(
      `${method} ${pathname} falhou (${response.status}): ${JSON.stringify(body)}`
    );
  }
  return body.data;
};

const createInbox = (socket) => {
  const queued = [];
  const waiters = [];
  const counts = new Map();
  socket.on("message", (data, binary) => {
    if (binary) return;
    let value;
    try {
      value = JSON.parse(data.toString());
    } catch {
      value = { type: "raw", data: data.toString() };
    }
    counts.set(value.type, (counts.get(value.type) ?? 0) + 1);
    const index = waiters.findIndex(
      (waiter) => waiter.type === undefined || waiter.type === value.type
    );
    if (index >= 0) {
      waiters.splice(index, 1)[0].resolve(value);
    } else {
      queued.push(value);
    }
  });
  return {
    count(type) {
      return counts.get(type) ?? 0;
    },
    next(type) {
      const index = queued.findIndex(
        (value) => type === undefined || value.type === type
      );
      if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { type, resolve };
        waiters.push(waiter);
        setTimeout(() => {
          const waiterIndex = waiters.indexOf(waiter);
          if (waiterIndex >= 0) {
            waiters.splice(waiterIndex, 1);
            reject(new Error(`Timeout esperando WebSocket ${type ?? "*"}.`));
          }
        }, 3_000);
      });
    }
  };
};

const connect = async (admission) => {
  const socket = new WebSocket(
    `${SOCKET_BASE_URL}/v1/rooms/${admission.roomCode}/ws`,
    admission.websocketProtocols,
    { origin: ORIGIN }
  );
  const inbox = createInbox(socket);
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return { socket, inbox };
};

const select = (fighterId) => ({
  protocolVersion: 1,
  type: "select",
  fighterId,
  arenaId: "cais-da-cidade",
  clientBuildId: "smoke-local",
  engineVersion: "phase-1",
  assetRevision: "smoke-assets"
});

const run = async () => {
  if (
    process.env.SMOKE_BASE_URL === undefined &&
    (await portIsListening())
  ) {
    throw new Error(
      `A porta ${PORT} já está ocupada. Use SMOKE_BASE_URL conscientemente ou libere outra porta.`
    );
  }
  startWrangler();
  await waitForServer();

  const hostSession = await api("/v1/sessions", { method: "POST" });
  const guestSession = await api("/v1/sessions", { method: "POST" });
  if (hostSession.sessionId === guestSession.sessionId) {
    throw new Error("As duas sessões não são independentes.");
  }
  const hostAdmission = await api("/v1/rooms", {
    method: "POST",
    token: hostSession.sessionToken
  });
  const guestAdmission = await api(
    `/v1/rooms/${hostAdmission.roomCode}/join`,
    { method: "POST", token: guestSession.sessionToken }
  );
  if (hostAdmission.slot !== "p1" || guestAdmission.slot !== "p2") {
    throw new Error("A reserva atômica de P1/P2 divergiu.");
  }

  const host = await connect(hostAdmission);
  const guest = await connect(guestAdmission);
  await host.inbox.next("welcome");
  await guest.inbox.next("welcome");
  host.socket.send(JSON.stringify(select("dante-sinal")));
  guest.socket.send(JSON.stringify(select("rafa-mare")));
  await host.inbox.next("selection_ack");
  await guest.inbox.next("selection_ack");
  host.socket.send(
    JSON.stringify({ protocolVersion: 1, type: "ready", ready: true })
  );
  guest.socket.send(
    JSON.stringify({ protocolVersion: 1, type: "ready", ready: true })
  );
  const hostStart = await host.inbox.next("start");
  const guestStart = await guest.inbox.next("start");
  if (
    hostStart.seed !== guestStart.seed ||
    hostStart.startAt !== guestStart.startAt
  ) {
    throw new Error("Start divergiu entre os dois jogadores.");
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  if (
    host.inbox.count("start") !== 1 ||
    guest.inbox.count("start") !== 1
  ) {
    throw new Error("Start não foi emitido exatamente uma vez por socket.");
  }

  const pingStartedAt = Date.now();
  host.socket.send(
    JSON.stringify({
      protocolVersion: 1,
      type: "latency_ping",
      clientTime: pingStartedAt
    })
  );
  const pong = await host.inbox.next("latency_pong");
  const roundTripMs = Date.now() - pingStartedAt;
  if (pong.clientTime !== pingStartedAt || roundTripMs < 0) {
    throw new Error("Medição de RTT inválida.");
  }
  const transportPongPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timeout esperando auto-response pong.")),
      3_000
    );
    const onMessage = (data, binary) => {
      if (!binary && data.toString() === "pong") {
        clearTimeout(timeout);
        host.socket.off("message", onMessage);
        resolve("pong");
      }
    };
    host.socket.on("message", onMessage);
  });
  host.socket.send("ping");
  const transportPong = await transportPongPromise;
  if (transportPong !== "pong") {
    throw new Error("Auto-response ping/pong inválida.");
  }

  host.socket.send(
    JSON.stringify({
      protocolVersion: 1,
      type: "input_batch",
      sequence: 0,
      ackSequence: -1,
      startFrame: 0,
      frames: [
        { frame: 0, heldMask: 1, pressedMask: 1, releasedMask: 0 }
      ]
    })
  );
  const relay = await guest.inbox.next("input_batch");
  if (relay.fromSlot !== "p1" || relay.sequence !== 0) {
    throw new Error("Relay de input divergente.");
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  if (host.inbox.count("input_batch") !== 0) {
    throw new Error("Input foi ecoado indevidamente para P1.");
  }

  guest.socket.terminate();
  await host.inbox.next("peer_disconnected");
  const resumedAdmission = await api(
    `/v1/rooms/${hostAdmission.roomCode}/reconnect`,
    { method: "POST", token: guestSession.sessionToken }
  );
  if (
    resumedAdmission.slot !== "p2" ||
    resumedAdmission.socketTicket === guestAdmission.socketTicket
  ) {
    throw new Error("Reconexão não emitiu ticket novo para P2.");
  }
  const resumedGuest = await connect(resumedAdmission);
  const resumedWelcome = await resumedGuest.inbox.next("welcome");
  if (resumedWelcome.slot !== "p2") {
    throw new Error("Reconexão não preservou o slot P2.");
  }

  host.socket.close(1000, "Smoke concluído.");
  resumedGuest.socket.close(1000, "Smoke concluído.");
  console.log(
    `Smoke local aprovado: duas sessões/P1-P2, RTT ${roundTripMs} ms, ping/pong, start único, relay e reconexão.`
  );
};

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (wranglerOutput.length > 0) console.error(wranglerOutput);
  process.exitCode = 1;
} finally {
  await stopWrangler();
}
