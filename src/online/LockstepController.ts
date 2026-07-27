import type { CombatWorld } from '../combat/CombatWorld';
import type { InputFrame } from '../types/combat';
import { combatStateHash } from './stateHash';
import { inputFrameFromWire, isConsistentTransition, wireInputFrame } from './inputCodec';
import { ONLINE_PROTOCOL_VERSION } from './config';
import { onlineSession, type OnlineSession } from './OnlineSession';
import type { PlayerSlot, ServerMessage, WireInputFrame } from './protocol';

const HASH_INTERVAL_FRAMES = 60;
const BATCH_SIZE = 3;
const MAX_BUFFERED_FRAMES = 720;

export interface LockstepStatus {
  readonly captureFrame: number;
  readonly simulationFrame: number;
  readonly waitingForPeer: boolean;
  readonly bufferedRemoteFrames: number;
  readonly fatalMessage: string | null;
  readonly lastHashFrame: number | null;
  readonly lastHash: string | null;
}

export class LockstepController {
  private readonly localFrames = new Map<number, InputFrame>();
  private readonly remoteFrames = new Map<number, InputFrame>();
  private readonly pendingWireFrames: WireInputFrame[] = [];
  private readonly unsubscribe: () => void;
  private captureFrame = 0;
  private simulationFrame = 0;
  private localHeldMask = 0;
  private remoteHeldMask = 0;
  private localSequence = 0;
  private remoteSequence = -1;
  private remoteExpectedFrame = 0;
  private waitingForPeer = false;
  private fatalMessage: string | null = null;
  private lastHashFrame: number | null = null;
  private lastHash: string | null = null;

  constructor(
    private readonly localSlot: PlayerSlot,
    readonly inputDelay: number,
    private readonly session: OnlineSession = onlineSession,
  ) {
    this.unsubscribe = session.subscribeGame(this.handleMessage);
  }

  capture(input: InputFrame): void {
    if (this.fatalMessage) return;
    if (this.captureFrame - this.simulationFrame >= MAX_BUFFERED_FRAMES) {
      this.fatalMessage = 'Backlog local excedeu o limite seguro; luta interrompida.';
      return;
    }
    const wire = wireInputFrame(this.captureFrame, input, this.localHeldMask);
    this.localHeldMask = wire.heldMask;
    this.localFrames.set(wire.frame, inputFrameFromWire(wire));
    this.pendingWireFrames.push(wire);
    this.captureFrame += 1;
    if (this.pendingWireFrames.length >= BATCH_SIZE) this.flush();
  }

  flush(): void {
    if (this.pendingWireFrames.length === 0 || this.fatalMessage) return;
    const frames = this.pendingWireFrames.splice(0, BATCH_SIZE);
    const first = frames[0];
    if (!first) return;
    this.session.sendInput({
      protocolVersion: ONLINE_PROTOCOL_VERSION,
      type: 'input_batch',
      sequence: this.localSequence,
      ackSequence: this.remoteSequence,
      startFrame: first.frame,
      frames,
    });
    this.localSequence += 1;
  }

  advance(world: CombatWorld, maximumSteps = 5): number {
    if (this.fatalMessage) return 0;
    let steps = 0;
    const eligibleFrame = this.captureFrame - this.inputDelay - 1;
    while (this.simulationFrame <= eligibleFrame && steps < maximumSteps) {
      const local = this.localFrames.get(this.simulationFrame);
      const remote = this.remoteFrames.get(this.simulationFrame);
      if (!local || !remote) break;
      const playerOne = this.localSlot === 'p1' ? local : remote;
      const playerTwo = this.localSlot === 'p2' ? local : remote;
      world.step(playerOne, playerTwo);
      this.localFrames.delete(this.simulationFrame);
      this.remoteFrames.delete(this.simulationFrame);
      if (this.simulationFrame % HASH_INTERVAL_FRAMES === 0) {
        this.lastHashFrame = this.simulationFrame;
        this.lastHash = combatStateHash(world);
        this.session.sendStateHash(this.simulationFrame, this.lastHash);
      }
      this.simulationFrame += 1;
      steps += 1;
    }
    this.waitingForPeer = this.simulationFrame <= eligibleFrame
      && !this.remoteFrames.has(this.simulationFrame);
    return steps;
  }

  get status(): LockstepStatus {
    return {
      captureFrame: this.captureFrame,
      simulationFrame: this.simulationFrame,
      waitingForPeer: this.waitingForPeer,
      bufferedRemoteFrames: this.remoteFrames.size,
      fatalMessage: this.fatalMessage,
      lastHashFrame: this.lastHashFrame,
      lastHash: this.lastHash,
    };
  }

  dispose(): void {
    this.flush();
    this.unsubscribe();
    this.localFrames.clear();
    this.remoteFrames.clear();
    this.pendingWireFrames.length = 0;
  }

  private readonly handleMessage = (message: ServerMessage): void => {
    if (message.type === 'desync') {
      this.fatalMessage = `Dessincronização detectada no frame ${message.frame}.`;
      return;
    }
    if (message.type !== 'input_batch' || message.fromSlot === this.localSlot) return;
    if (message.sequence === this.remoteSequence) return;
    if (message.sequence !== this.remoteSequence + 1) {
      this.fatalMessage = 'Sequência remota incompleta; não é seguro continuar.';
      return;
    }
    for (const frame of message.frames) {
      if (frame.frame !== this.remoteExpectedFrame
        || frame.frame - this.simulationFrame >= MAX_BUFFERED_FRAMES
        || !isConsistentTransition(frame, this.remoteHeldMask)) {
        this.fatalMessage = 'Fluxo remoto de inputs inválido; luta interrompida.';
        return;
      }
      this.remoteFrames.set(frame.frame, inputFrameFromWire(frame));
      this.remoteHeldMask = frame.heldMask;
      this.remoteExpectedFrame += 1;
    }
    this.remoteSequence = message.sequence;
  };
}
