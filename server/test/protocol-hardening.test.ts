import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  connectSocket,
  createRoom,
  createSession,
  joinRoom,
  selectionMessage,
  type SocketHarness
} from "./helpers";

const activePair = async (): Promise<{
  roomCode: string;
  first: SocketHarness;
  second: SocketHarness;
}> => {
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
  return { roomCode: firstAdmission.roomCode, first, second };
};

describe("hardening do protocolo v1", () => {
  it("faz round-trip de cada bit isolado e combinações relevantes", async () => {
    const { first, second } = await activePair();
    const masks = [
      1 << 0,
      1 << 1,
      1 << 2,
      1 << 3,
      1 << 4,
      1 << 5,
      1 << 6,
      1 << 7,
      (1 << 0) | (1 << 4),
      (1 << 3) | (1 << 7),
      (1 << 1) | (1 << 5) | (1 << 6)
    ];
    let sequence = 0;
    let frame = 0;
    for (const mask of masks) {
      const message = {
        protocolVersion: 1,
        type: "input_batch",
        sequence,
        ackSequence: -1,
        startFrame: frame,
        frames: [
          {
            frame,
            heldMask: mask,
            pressedMask: mask,
            releasedMask: 0
          },
          {
            frame: frame + 1,
            heldMask: 0,
            pressedMask: 0,
            releasedMask: mask
          }
        ]
      };
      first.send(message);
      expect(await second.next("input_batch")).toMatchObject({
        fromSlot: "p1",
        sequence,
        startFrame: frame,
        frames: message.frames
      });
      sequence += 1;
      frame += 2;
    }
    first.close();
    second.close();
  });

  it("recusa transições incoerentes entre lotes e campos extras", async () => {
    const { first, second } = await activePair();
    first.send({
      protocolVersion: 1,
      type: "input_batch",
      sequence: 0,
      ackSequence: -1,
      startFrame: 0,
      frames: [
        {
          frame: 0,
          heldMask: 1,
          pressedMask: 0,
          releasedMask: 0
        }
      ]
    });
    expect(await first.next("error")).toMatchObject({
      error: { code: "invalid_input_mask" }
    });

    first.send({
      protocolVersion: 1,
      type: "input_batch",
      sequence: 0,
      ackSequence: -1,
      startFrame: 0,
      frames: [
        {
          frame: 0,
          heldMask: 256,
          pressedMask: 0,
          releasedMask: 0
        }
      ]
    });
    expect(await first.next("error")).toMatchObject({
      error: { code: "invalid_input_batch" }
    });

    first.send({
      protocolVersion: 1,
      type: "input_batch",
      sequence: 0,
      ackSequence: -1,
      startFrame: 0,
      frames: [
        {
          frame: 0,
          heldMask: 0,
          pressedMask: 0,
          releasedMask: 0
        }
      ],
      damage: 999
    });
    expect(await first.next("error")).toMatchObject({
      error: { code: "invalid_input_batch" }
    });
    first.close();
    second.close();
  });

  it("não aceita vida, dano, posição, vitória ou snapshot como autoridade", async () => {
    const { first, second } = await activePair();
    for (const type of [
      "damage",
      "health",
      "position",
      "victory",
      "defeat",
      "snapshot"
    ]) {
      first.send({
        protocolVersion: 1,
        type,
        value: "não confiável"
      });
      expect(await first.next("error")).toMatchObject({
        error: { code: "unknown_message_type" }
      });
    }
    first.close();
    second.close();
  });

  it("ready repetido não altera seed nem duplica início", async () => {
    const { roomCode, first, second } = await activePair();
    const stub = env.MATCH_ROOMS.get(
      env.MATCH_ROOMS.idFromName(`room:${roomCode}`)
    );
    const before = await runInDurableObject(stub, (_instance, state) => {
      const row = [
        ...state.storage.sql.exec<
          Record<string, SqlStorageValue> & {
            phase: string;
            seed: number;
            start_at: number;
          }
        >("SELECT phase, seed, start_at FROM room WHERE id = 1")
      ][0];
      return row;
    });
    first.send({ protocolVersion: 1, type: "ready", ready: true });
    expect(await first.next("error")).toMatchObject({
      error: { code: "match_started" }
    });
    expect(first.count("start")).toBe(1);
    expect(second.count("start")).toBe(1);
    const after = await runInDurableObject(stub, (_instance, state) => {
      const row = [
        ...state.storage.sql.exec<
          Record<string, SqlStorageValue> & {
            phase: string;
            seed: number;
            start_at: number;
          }
        >("SELECT phase, seed, start_at FROM room WHERE id = 1")
      ][0];
      return row;
    });
    expect(after).toEqual(before);
    expect(after).toMatchObject({ phase: "active" });
    first.close();
    second.close();
  });

  it("hash inválido é recusado e divergência fica deduplicada", async () => {
    const { roomCode, first, second } = await activePair();
    first.send({
      protocolVersion: 1,
      type: "state_hash",
      frame: 0,
      hash: "fora-do-formato"
    });
    expect(await first.next("error")).toMatchObject({
      error: { code: "invalid_state_hash" }
    });
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
    await first.next("desync");
    await second.next("desync");
    second.send({
      protocolVersion: 1,
      type: "state_hash",
      frame: 0,
      hash: "bbbbbbbbbbbbbbbb"
    });
    second.send({
      protocolVersion: 1,
      type: "latency_ping",
      clientTime: 5
    });
    await second.next("latency_pong");

    const stub = env.MATCH_ROOMS.get(
      env.MATCH_ROOMS.idFromName(`room:${roomCode}`)
    );
    const count = await runInDurableObject(stub, (_instance, state) => {
      const row = [
        ...state.storage.sql.exec<
          Record<string, SqlStorageValue> & { count: number }
        >("SELECT COUNT(*) AS count FROM desyncs WHERE frame = 0")
      ][0];
      return row?.count;
    });
    expect(count).toBe(1);
    first.close();
    second.close();
  });
});
