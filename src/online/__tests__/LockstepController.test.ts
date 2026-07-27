import type { CombatWorld } from '../../combat/CombatWorld';
import type { InputAction, InputFrame } from '../../types/combat';
import { LockstepController } from '../LockstepController';
import { wireInputFrame } from '../inputCodec';
import type { OnlineSession } from '../OnlineSession';
import type { ServerMessage } from '../protocol';

const input = (held: readonly InputAction[] = []): InputFrame => ({
  held: new Set(held),
  pressed: new Set(),
  released: new Set(),
});

class FakeSession {
  readonly batches: unknown[] = [];
  readonly hashes: unknown[] = [];
  private listener: ((message: ServerMessage) => void) | null = null;

  subscribeGame(listener: (message: ServerMessage) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  sendInput(message: unknown): void {
    this.batches.push(message);
  }

  sendStateHash(frame: number, hash: string): void {
    this.hashes.push({ frame, hash });
  }

  receive(message: ServerMessage): void {
    this.listener?.(message);
  }
}

function remoteBatch(
  sequence: number,
  inputs: readonly InputFrame[],
  fromSlot: 'p1' | 'p2' = 'p1',
): ServerMessage {
  let previousHeldMask = 0;
  const frames = inputs.map((current, frame) => {
    const wire = wireInputFrame(frame, current, previousHeldMask);
    previousHeldMask = wire.heldMask;
    return wire;
  });
  return {
    protocolVersion: 1,
    type: 'input_batch',
    fromSlot,
    sequence,
    ackSequence: -1,
    startFrame: frames[0]?.frame ?? 0,
    frames,
  };
}

function fakeWorld(): {
  readonly world: CombatWorld;
  readonly steps: ReturnType<typeof vi.fn>;
} {
  const steps = vi.fn();
  const world = {
    step: steps,
    exportDeterministicState: () => ({ tick: steps.mock.calls.length }),
  } as unknown as CombatWorld;
  return { world, steps };
}

describe('LockstepController', () => {
  it('agrupa no máximo três frames e só simula quando ambos chegaram', () => {
    const session = new FakeSession();
    const controller = new LockstepController('p2', 2, session as unknown as OnlineSession);
    controller.capture(input(['right']));
    controller.capture(input(['right']));
    controller.capture(input());

    expect(session.batches).toHaveLength(1);
    expect(session.batches[0]).toMatchObject({ sequence: 0, startFrame: 0 });
    expect((session.batches[0] as { frames: unknown[] }).frames).toHaveLength(3);

    const { world, steps } = fakeWorld();
    expect(controller.advance(world)).toBe(0);
    expect(controller.status.waitingForPeer).toBe(true);

    session.receive(remoteBatch(0, [input(['left']), input(['left']), input()], 'p1'));
    expect(controller.advance(world)).toBe(1);
    expect(steps).toHaveBeenCalledTimes(1);
    const [playerOne, playerTwo] = steps.mock.calls[0] as [InputFrame, InputFrame];
    expect(playerOne.held.has('left')).toBe(true);
    expect(playerTwo.held.has('right')).toBe(true);
    expect(session.hashes).toHaveLength(1);
    controller.dispose();
  });

  it('envia lotes finais de um ou dois frames sem ultrapassar o contrato', () => {
    const oneSession = new FakeSession();
    const one = new LockstepController('p1', 8, oneSession as unknown as OnlineSession);
    one.capture(input());
    one.flush();
    expect((oneSession.batches[0] as { frames: unknown[] }).frames).toHaveLength(1);

    const twoSession = new FakeSession();
    const two = new LockstepController('p1', 8, twoSession as unknown as OnlineSession);
    two.capture(input());
    two.capture(input(['block']));
    two.flush();
    expect((twoSession.batches[0] as { frames: unknown[] }).frames).toHaveLength(2);
  });

  it('interrompe em lacuna de sequência ou aviso de dessincronização', () => {
    const gapSession = new FakeSession();
    const withGap = new LockstepController('p1', 8, gapSession as unknown as OnlineSession);
    gapSession.receive(remoteBatch(1, [input()], 'p2'));
    expect(withGap.status.fatalMessage).toMatch(/Sequência remota incompleta/u);

    const desyncSession = new FakeSession();
    const desynced = new LockstepController('p1', 8, desyncSession as unknown as OnlineSession);
    desyncSession.receive({ protocolVersion: 1, type: 'desync', frame: 60 });
    expect(desynced.status.fatalMessage).toContain('frame 60');
  });

  it('não aceita frame remoto duplicado em um lote posterior', () => {
    const session = new FakeSession();
    const controller = new LockstepController('p1', 8, session as unknown as OnlineSession);
    session.receive(remoteBatch(0, [input()], 'p2'));
    session.receive(remoteBatch(1, [input()], 'p2'));
    expect(controller.status.fatalMessage).toMatch(/Fluxo remoto de inputs inválido/u);
  });

  it('limita backlog local quando o rival deixa de enviar frames', () => {
    const session = new FakeSession();
    const controller = new LockstepController('p1', 8, session as unknown as OnlineSession);
    for (let frame = 0; frame <= 720; frame += 1) controller.capture(input());
    expect(controller.status.captureFrame).toBe(720);
    expect(controller.status.fatalMessage).toMatch(/Backlog local excedeu/u);
  });
});
