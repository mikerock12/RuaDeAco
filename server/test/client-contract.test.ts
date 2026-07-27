import { describe, expect, it } from "vitest";

import {
  ALLOWED_FIGHTERS,
  getRuntimeConfig,
  type Env
} from "../src/config";
import {
  connectSocket,
  createRoom,
  createSession,
  joinRoom,
  selectionMessage
} from "./helpers";

const configFor = (inputDelay?: string): ReturnType<typeof getRuntimeConfig> =>
  getRuntimeConfig({
    INPUT_DELAY_FRAMES: inputDelay
  } as Env);

describe("contrato compartilhado com o cliente online", () => {
  it("mantém exatamente o roster jogável do cliente", () => {
    expect([...ALLOWED_FIGHTERS]).toEqual([
      "rafa-mare",
      "guto-barba",
      "astro-riso",
      "dante-sinal"
    ]);
  });

  it("usa atraso 8 e limita a configuração ao intervalo 2..12", () => {
    expect(configFor().inputDelayFrames).toBe(8);
    expect(configFor("2").inputDelayFrames).toBe(2);
    expect(configFor("12").inputDelayFrames).toBe(12);
    expect(configFor("1").inputDelayFrames).toBe(8);
    expect(configFor("13").inputDelayFrames).toBe(8);
    expect(configFor("invalido").inputDelayFrames).toBe(8);
  });

  it("reconstrói seleção e arena no room_state de um reconnect", async () => {
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
    guest.close();

    const reconnectedAdmission = await joinRoom(
      hostAdmission.roomCode,
      guestSession.sessionToken
    );
    const reconnected = await connectSocket(reconnectedAdmission);
    await reconnected.next("welcome");
    expect(await reconnected.next("room_state")).toMatchObject({
      state: {
        players: [
          {
            slot: "p1",
            fighterId: "dante-sinal",
            arenaId: "cais-da-cidade"
          },
          {
            slot: "p2",
            fighterId: "rafa-mare",
            arenaId: "cais-da-cidade"
          }
        ]
      }
    });
    host.close();
    reconnected.close();
  });
});
