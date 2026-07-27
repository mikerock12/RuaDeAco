import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  connectSocket,
  createRoom,
  createSession,
  joinRoom,
  selectionMessage
} from "./helpers";

describe("protocolo multiplayer v1", () => {
  it("fecha seleção/ready e inicia exatamente com metadados compatíveis", async () => {
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

    host.send({ protocolVersion: 1, type: "ready", ready: true });
    guest.send({ protocolVersion: 1, type: "ready", ready: true });
    const hostStart = await host.next("start");
    const guestStart = await guest.next("start");
    expect(hostStart).toMatchObject({
      protocolVersion: 1,
      type: "start",
      inputDelay: 8,
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
    });
    expect(guestStart.seed).toBe(hostStart.seed);
    expect(guestStart.startAt).toBe(hostStart.startAt);

    host.send(selectionMessage("guto-barba"));
    expect(await host.next("error")).toMatchObject({
      error: { code: "selection_locked" }
    });
    host.close();
    guest.close();
  });

  it("recusa builds incompatíveis antes de iniciar", async () => {
    const firstSession = await createSession();
    const secondSession = await createSession();
    const firstAdmission = await createRoom(firstSession.sessionToken);
    const secondAdmission = await joinRoom(
      firstAdmission.roomCode,
      secondSession.sessionToken
    );
    const first = await connectSocket(firstAdmission);
    const second = await connectSocket(secondAdmission);
    await first.next("welcome");
    await second.next("welcome");

    first.send(selectionMessage("dante-sinal"));
    second.send({
      ...selectionMessage("rafa-mare"),
      clientBuildId: "other-build"
    });
    await first.next("selection_ack");
    await second.next("selection_ack");
    first.send({ protocolVersion: 1, type: "ready", ready: true });
    second.send({ protocolVersion: 1, type: "ready", ready: true });
    expect(await second.next("error")).toMatchObject({
      error: { code: "client_version_mismatch" }
    });
    first.close();
    second.close();
  });

  it("valida sequência/bitmask e retransmite apenas ao par", async () => {
    const firstSession = await createSession();
    const secondSession = await createSession();
    const firstAdmission = await createRoom(firstSession.sessionToken);
    const secondAdmission = await joinRoom(
      firstAdmission.roomCode,
      secondSession.sessionToken
    );
    const first = await connectSocket(firstAdmission);
    const second = await connectSocket(secondAdmission);
    await first.next("welcome");
    await second.next("welcome");
    first.send(selectionMessage("dante-sinal"));
    second.send(selectionMessage("rafa-mare"));
    await first.next("selection_ack");
    await second.next("selection_ack");
    first.send({ protocolVersion: 1, type: "ready", ready: true });
    second.send({ protocolVersion: 1, type: "ready", ready: true });
    await first.next("start");
    await second.next("start");

    first.send({
      protocolVersion: 1,
      type: "input_batch",
      sequence: 0,
      ackSequence: -1,
      startFrame: 0,
      frames: [
        {
          frame: 0,
          heldMask: 17,
          pressedMask: 17,
          releasedMask: 0
        }
      ]
    });
    expect(await second.next("input_batch")).toMatchObject({
      fromSlot: "p1",
      sequence: 0,
      frames: [
        {
          frame: 0,
          heldMask: 17,
          pressedMask: 17,
          releasedMask: 0
        }
      ]
    });

    first.send({
      protocolVersion: 1,
      type: "input_batch",
      sequence: 2,
      ackSequence: -1,
      startFrame: 1,
      frames: [
        {
          frame: 1,
          heldMask: 0,
          pressedMask: 1,
          releasedMask: 1
        }
      ]
    });
    expect(await first.next("error")).toMatchObject({
      error: { code: "sequence_gap" }
    });
    first.close();
    second.close();
  });

  it("confirma hashes iguais e sinaliza desync uma única vez", async () => {
    const firstSession = await createSession();
    const secondSession = await createSession();
    const firstAdmission = await createRoom(firstSession.sessionToken);
    const secondAdmission = await joinRoom(
      firstAdmission.roomCode,
      secondSession.sessionToken
    );
    const first = await connectSocket(firstAdmission);
    const second = await connectSocket(secondAdmission);
    await first.next("welcome");
    await second.next("welcome");
    first.send(selectionMessage("dante-sinal"));
    second.send(selectionMessage("rafa-mare"));
    await first.next("selection_ack");
    await second.next("selection_ack");
    first.send({ protocolVersion: 1, type: "ready", ready: true });
    second.send({ protocolVersion: 1, type: "ready", ready: true });
    await first.next("start");
    await second.next("start");

    first.send({
      protocolVersion: 1,
      type: "state_hash",
      frame: 0,
      hash: "aaaaaaaaaaaaaaaa"
    });
    second.send({
      protocolVersion: 1,
      type: "state_hash",
      frame: 0,
      hash: "bbbbbbbbbbbbbbbb"
    });
    expect(await first.next("desync")).toMatchObject({ frame: 0 });
    expect(await second.next("desync")).toMatchObject({ frame: 0 });

    first.send({
      protocolVersion: 1,
      type: "state_hash",
      frame: 1,
      hash: "cccccccccccccccc"
    });
    second.send({
      protocolVersion: 1,
      type: "state_hash",
      frame: 1,
      hash: "cccccccccccccccc"
    });
    second.send({
      protocolVersion: 1,
      type: "latency_ping",
      clientTime: 456
    });
    await second.next("latency_pong");
    const stub = env.MATCH_ROOMS.get(
      env.MATCH_ROOMS.idFromName(`room:${firstAdmission.roomCode}`)
    );
    const persisted = await runInDurableObject(
      stub,
      (_instance, state) => {
        const room = [
          ...state.storage.sql.exec<
            Record<string, SqlStorageValue> & {
              last_confirmed_frame: number;
            }
          >("SELECT last_confirmed_frame FROM room WHERE id = 1")
        ][0];
        const desyncs = [
          ...state.storage.sql.exec<
            Record<string, SqlStorageValue> & { count: number }
          >("SELECT COUNT(*) AS count FROM desyncs WHERE frame = 0")
        ][0];
        return {
          frame: room?.last_confirmed_frame,
          desyncs: desyncs?.count
        };
      }
    );
    expect(persisted).toEqual({ frame: 1, desyncs: 1 });
    first.close();
    second.close();
  });

  it("recusa protocolo, seleção e mensagens WebSocket malformadas", async () => {
    const firstSession = await createSession();
    const secondSession = await createSession();
    const firstAdmission = await createRoom(firstSession.sessionToken);
    const secondAdmission = await joinRoom(
      firstAdmission.roomCode,
      secondSession.sessionToken
    );
    const first = await connectSocket(firstAdmission);
    const second = await connectSocket(secondAdmission);
    await first.next("welcome");
    await second.next("welcome");

    first.send({ protocolVersion: 99, type: "ready", ready: true });
    expect(await first.next("error")).toMatchObject({
      error: { code: "protocol_mismatch" }
    });
    first.send(selectionMessage("lutador-inexistente"));
    expect(await first.next("error")).toMatchObject({
      error: { code: "invalid_selection" }
    });
    first.socket.send("{");
    expect(await first.next("error")).toMatchObject({
      error: { code: "invalid_json" }
    });
    first.socket.send(new Uint8Array([1, 2, 3]));
    expect(await first.next("error")).toMatchObject({
      error: { code: "binary_not_supported" }
    });

    first.send(selectionMessage("dante-sinal"));
    second.send(selectionMessage("rafa-mare"));
    await first.next("selection_ack");
    await second.next("selection_ack");
    first.send({ protocolVersion: 1, type: "ready", ready: true });
    second.send({ protocolVersion: 1, type: "ready", ready: true });
    await first.next("start");
    await second.next("start");

    first.send({
      protocolVersion: 1,
      type: "input_batch",
      sequence: 0,
      ackSequence: -1,
      startFrame: 0,
      frames: Array.from({ length: 4 }, (_, frame) => ({
        frame,
        heldMask: 0,
        pressedMask: 0,
        releasedMask: 0
      }))
    });
    expect(await first.next("error")).toMatchObject({
      error: { code: "invalid_input_batch" }
    });
    first.send({
      protocolVersion: 1,
      type: "input_batch",
      sequence: 0,
      ackSequence: -1,
      startFrame: 100_000,
      frames: [
        {
          frame: 100_000,
          heldMask: 0,
          pressedMask: 0,
          releasedMask: 0
        }
      ]
    });
    expect(await first.next("error")).toMatchObject({
      error: { code: "invalid_start_frame" }
    });

    first.socket.send(
      JSON.stringify({
        protocolVersion: 1,
        type: "latency_ping",
        clientTime: 1,
        padding: "x".repeat(17 * 1024)
      })
    );
    expect(await first.next("error")).toMatchObject({
      error: { code: "message_too_large" }
    });
    first.close();
    second.close();
  });

  it("descarta sequência duplicada e recusa regressão", async () => {
    const firstSession = await createSession();
    const secondSession = await createSession();
    const firstAdmission = await createRoom(firstSession.sessionToken);
    const secondAdmission = await joinRoom(
      firstAdmission.roomCode,
      secondSession.sessionToken
    );
    const first = await connectSocket(firstAdmission);
    const second = await connectSocket(secondAdmission);
    await first.next("welcome");
    await second.next("welcome");
    first.send(selectionMessage("dante-sinal"));
    second.send(selectionMessage("rafa-mare"));
    await first.next("selection_ack");
    await second.next("selection_ack");
    first.send({ protocolVersion: 1, type: "ready", ready: true });
    second.send({ protocolVersion: 1, type: "ready", ready: true });
    await first.next("start");
    await second.next("start");

    const sequenceZero = {
      protocolVersion: 1,
      type: "input_batch",
      sequence: 0,
      ackSequence: -1,
      startFrame: 0,
      frames: [
        {
          frame: 0,
          heldMask: 1,
          pressedMask: 1,
          releasedMask: 0
        }
      ]
    };
    first.send(sequenceZero);
    expect(await second.next("input_batch")).toMatchObject({ sequence: 0 });
    first.send(sequenceZero);
    first.send({
      protocolVersion: 1,
      type: "input_batch",
      sequence: 1,
      ackSequence: -1,
      startFrame: 1,
      frames: [
        {
          frame: 1,
          heldMask: 1,
          pressedMask: 0,
          releasedMask: 0
        }
      ]
    });
    expect(await second.next("input_batch")).toMatchObject({ sequence: 1 });
    first.send(sequenceZero);
    expect(await first.next("error")).toMatchObject({
      error: { code: "sequence_gap" }
    });
    first.close();
    second.close();
  });
});
