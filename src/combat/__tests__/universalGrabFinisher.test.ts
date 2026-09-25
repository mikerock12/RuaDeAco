import { describe, it, expect } from 'vitest';
import { FIGHTERS } from '../../fighters';
import { CpuController } from '../../ai/CpuController';
import { inputFrameFromWire, wireInputFrame } from '../../online/inputCodec';
import { combatStateHash } from '../../online/stateHash';
import { CombatWorld } from '../CombatWorld';
import {
  FINISH_BITE, FINISH_END, FINISH_SPLASH, FINISH_THROW, FINISH_WINDOW, FINISHER_ARENAS,
  KITCHEN_BONES, KITCHEN_DROP, KITCHEN_POT_RIM_Y, KITCHEN_POT_X, KITCHEN_POT_Y, KITCHEN_SUNK,
  SHED, SHED_DOORS_CLOSE_END, SHED_DOORS_OPEN_END, SITIO_IMPALE, SITIO_STEP_BACK_END,
  caisMonsterX, finisherBanner, finisherMonsterPose, finisherVictimPose, kitchenFinishCue, sitioFinisherStage, victimHoldPoint,
} from '../stageFinisher';
import { GRAB_LIFT_ART, GRAB_SLAM_END, grabVictimArtPose, grabHandPoint, rootFromHold } from '../../fighters/grabArtTiming';
import { GRAB_VICTIM_LANDMARKS } from '../../fighters/grabVictimLandmarks';
import type { ArenaDefinition } from '../../types/game';
import type { FighterId, InputAction, InputFrame } from '../../types/combat';
const input = (held: InputAction[] = [], pressed: InputAction[] = held): InputFrame => ({ held: new Set(held), pressed: new Set(pressed), released: new Set() });
const empty = input();
const chord = input(['light', 'heavy']);
const advance = (world: CombatWorld, frames: number) => { for(let i = 0; i < frames; i++) world.step(empty, empty); };
function setup(one = FIGHTERS[0]!, two = FIGHTERS[1]!, arena: ArenaDefinition['id'] = 'cais-da-cidade') {
  const w = new CombatWorld(one, two, 'versus', arena); advance(w, 105);
  w.fighters[0].resetPosition(280, 1); w.fighters[1].resetPosition(350, -1); w.drainEvents(); return w;
}
function ready(w: CombatWorld, winner: 0 | 1 = 0) {
  w.fighters[winner].roundWins = 1; w.fighters[winner === 0 ? 1 : 0].health = 0;
  w.step(empty, empty); expect(w.phase).toBe('finishReady');
}
function startFinish(w: CombatWorld, winner: 0 | 1 = 0) {
  w.step(winner === 0 ? chord : empty, winner === 1 ? chord : empty);
  for (let i = 0; i < 30 && w.phase !== 'stageFinish'; i++) w.step(empty, empty);
  expect(w.phase).toBe('stageFinish');
}
const stepTo = (w: CombatWorld, frame: number) => { while (w.phase === 'stageFinish' && w.phaseFrame < frame) w.step(empty, empty); };

describe('agarrão universal', () => {
  for (const one of FIGHTERS) for (const two of FIGHTERS) {
    it(one.id + ' levanta e crava ' + two.id + ' no chão', () => {
      const w = setup(one, two); const before = w.fighters[1].health;
      w.step(chord, input(['block']));
      expect(w.fighters[0].currentMove?.id).toBe('universalGrab');
      const states = new Set<string>(); let minY = 304; let maxRotation = 0;
      for(let f=0; f<115; f++) {
        w.step(empty, input(['block'], []));
        states.add(w.fighters[1].state); minY = Math.min(minY, w.fighters[1].y);
        maxRotation = Math.max(maxRotation, Math.abs(w.fighters[1].victimRotation));
        // A vítima nunca sai da tela nem fica de cabeça para baixo durante o agarrão.
        expect(w.fighters[1].y).toBeGreaterThan(40);
        if (w.fighters[1].grabbedBy !== null) expect(Math.abs(w.fighters[1].victimRotation)).toBeLessThan(1.7);
      }
      expect(states.has('grabbedFront')).toBe(true); expect(states.has('grabbedLifted')).toBe(true);
      // Cravada: sem a fase 'thrown', a vítima passa das mãos direto ao knockdown deitado.
      expect(states.has('thrown')).toBe(false); expect(states.has('knockdown')).toBe(true);
      expect(minY).toBeLessThan(235); expect(w.fighters[1].y).toBe(304);
      expect(w.fighters[1].health).toBe(before - 125);
      expect(w.drainEvents().filter(e=>e.type === 'hit')).toHaveLength(1);
    });
  }
  it('a vítima é solta encostada no chão e já deitada', () => {
    const w = setup(FIGHTERS[0], FIGHTERS[2]);
    w.step(chord, empty);
    let lastHeldY = 0;
    for (let f = 0; f < GRAB_SLAM_END + 4 && w.fighters[1].state !== 'knockdown'; f++) {
      if (w.fighters[1].state === 'grabbedLifted') lastHeldY = w.fighters[1].y;
      w.step(empty, empty);
    }
    expect(w.fighters[1].state).toBe('knockdown');
    // No último frame nas mãos o corpo já estava encostado no chão.
    expect(lastHeldY).toBeGreaterThan(290);
    expect(w.fighters[1].y).toBe(304);
    expect(w.fighters[1].victimPoseFrame).toBe(3);
    for (let f = 0; f < 45; f++) w.step(empty, empty);
    expect(w.fighters[1].state).toBe('wakeUp');
    expect(w.fighters[1].victimPoseFrame).toBeNull();
  });
  it('o ponto de pega da vítima fica nas mãos do atacante durante o levantamento', () => {
    for (const attacker of FIGHTERS) for (const victim of FIGHTERS) {
      for (const frame of [16, 22, 28, 34, 38]) {
        const pose = grabVictimArtPose(attacker.id, victim.id, frame);
        const hand = grabHandPoint(attacker.id, frame);
        const landmark = GRAB_VICTIM_LANDMARKS[victim.id].lifted[pose.poseFrame]!;
        const root = rootFromHold(hand, landmark, pose.rotation);
        expect(pose.x).toBeCloseTo(root.x, 5);
        if (frame < 40) expect(pose.y).toBeCloseTo(root.y, 5);
        expect(GRAB_LIFT_ART[victim.id].frames).toContain(pose.poseFrame);
      }
      // Nas mãos acima da cabeça o tronco está deitado, nunca de cabeça para baixo.
      const held = grabVictimArtPose(attacker.id, victim.id, 30);
      expect(held.bodyAngle).toBeCloseTo(Math.PI / 2, 5);
      expect(Math.abs(held.rotation)).toBeLessThan(1.6);
    }
  });
  it('aceita diferença curta entre os dedos, mas não transforma ataques separados em agarrão', () => {
    for (const first of ['light','heavy'] as const) {
      const w = setup(); w.step(input([first]), empty); advance(w, 1);
      w.step(input(['light','heavy'], [first === 'light' ? 'heavy' : 'light']), empty);
      expect(w.fighters[0].currentMove?.id).toBe('universalGrab');
    }
    const w = setup(); w.step(input(['light']), empty); advance(w, 2);
    w.step(input(['heavy']), empty); expect(w.fighters[0].currentMove?.id).not.toBe('universalGrab');
  });
  it('erra fora do alcance, não agarra no ar e não repete segurando os botões', () => {
    const w = setup(); w.fighters[1].x = 550; const health = w.fighters[1].health;
    w.step(chord, empty); advance(w, 90); expect(w.fighters[1].health).toBe(health);
    w.fighters[1].resetPosition(350,-1); w.step(chord, input(['up'])); advance(w, 45);
    expect(w.drainEvents().some(e=>e.type==='hit')).toBe(false);
    advance(w, 70); w.fighters[1].resetPosition(350,-1); w.step(chord,empty);
    for(let f=0;f<180;f++) w.step(input(['light','heavy'],[]),empty);
    expect(w.drainEvents().filter(e=>e.type==='hit')).toHaveLength(1);
  });
});

describe('janela de finalização', () => {
  it('só abre na segunda derrota, nas três arenas; treino e empate não abrem', () => {
    const first = setup(); first.fighters[1].health = 0; first.step(empty,empty); expect(first.phase).toBe('roundOver');
    for (const arena of FINISHER_ARENAS) {
      const w = setup(undefined, undefined, arena); w.fighters[0].roundWins = 1; w.fighters[1].health = 0; w.step(empty, empty);
      expect(w.phase).toBe('finishReady');
    }
    const draw=setup(); draw.fighters[0].roundWins=1; draw.fighters[0].health=0; draw.fighters[1].health=0; draw.step(empty,empty); expect(draw.phase).toBe('roundOver');
    const training=new CombatWorld(FIGHTERS[0]!,FIGHTERS[1]!,'training','cais-da-cidade'); advance(training,105); training.fighters[0].roundWins=1; training.fighters[1].health=0; training.step(empty,empty); expect(training.phase).toBe('active');
  });
  it('derrotado fica tonto e não age; relógio congela; pausa e timeout preservam o vencedor', () => {
    const w=setup(); ready(w); const time=w.timeFrames, x=w.fighters[1].x;
    w.step(empty,input(['right','light','heavy'])); expect(w.fighters[1].state).toBe('dizzy'); expect(w.fighters[1].x).toBe(x); expect(w.timeFrames).toBe(time);
    w.setPaused(true); const hash=combatStateHash(w); advance(w,120); expect(combatStateHash(w)).toBe(hash);
    w.setPaused(false); advance(w,FINISH_WINDOW); expect(w.phase).toBe('matchOver'); expect(w.winner).toBe(w.fighters[0]); expect(w.snapshot().finisherCompleted).toBe(false);
  });
  it('finaliza também um round decidido pelo tempo e permite golpe comum', () => {
    const w=setup(); w.fighters[0].roundWins=1; w.fighters[1].health=10; w.timeFrames=1; w.step(empty,empty);
    expect(w.phase).toBe('finishReady'); w.step(input(['light']),empty); advance(w,25); expect(w.phase).toBe('matchOver'); expect(w.snapshot().finisherCompleted).toBe(false);
  });
  it('a faixa final é própria de cada arena', () => {
    expect(finisherBanner('cais-da-cidade', FINISH_END)).toBe('O CAIS COBRA SUA ALMA');
    expect(finisherBanner('cozinha-macabra', FINISH_END)).toBe('O JANTAR ESTA SERVIDO');
    expect(finisherBanner('sitio', FINISH_END)).toBe('A COLHEITA ESTA FEITA');
    for (const arena of FINISHER_ARENAS) expect(finisherBanner(arena, 100)).toBeNull();
  });
});

describe('finalização do Cais', () => {
  it.each([0,1] as const)('P%s executa toda a sequência sem duplicar sons ou vitórias, inclusive espelho', winner => {
    const w=setup(FIGHTERS[0],FIGHTERS[0]); ready(w,winner); w.drainEvents();
    startFinish(w, winner);
    const before=combatStateHash(w); w.setPaused(true); advance(w,20); w.setPaused(false); expect(combatStateHash(w)).toBe(before);
    advance(w,FINISH_END+20); const events=w.drainEvents();
    expect(w.phase).toBe('matchOver'); expect(w.snapshot().finisherCompleted).toBe(true);
    expect(w.fighters[winner].roundWins).toBe(2); expect(events.filter(e=>e.type==='monsterBite')).toHaveLength(3);
    expect(events.filter(e=>e.type==='matchEnd')).toHaveLength(1); expect(events.filter(e=>e.type==='monsterRoar')).toHaveLength(1);
    expect(events.filter(e=>e.type==='finishSplash')).toHaveLength(1);
    expect(events.filter(e=>e.type==='monsterBite').every(e=>e.attackerIndex===winner)).toBe(true);
  });
  it('dois clientes mantêm o mesmo hash durante a finalização inteira', () => {
    const a=setup(), b=setup(); ready(a); ready(b);
    for(let f=0;f<350;f++){ const i=f===0?chord:empty; const packet=wireInputFrame(f,i,f===1?48:0); a.step(inputFrameFromWire(packet),empty); b.step(inputFrameFromWire(JSON.parse(JSON.stringify(packet))),empty); expect(combatStateHash(a)).toBe(combatStateHash(b)); }
    expect(a.snapshot().finisherCompleted).toBe(true);
  });
  it('CPU vencedora se aproxima e finaliza', () => {
    const w=setup(); ready(w,1); w.fighters[1].x=520;
    const cpu=new CpuController(FIGHTERS[1]!,1,'normal');
    for(let f=0;f<480 && w.phase==='finishReady';f++) w.step(empty,cpu.sample(w.snapshot()));
    expect(w.phase).toBe('stageFinish');
  });
  it('o monstro emerge à frente do atacante, virado para ele, sempre dentro da tela', () => {
    for (const [originX, facing] of [[280, 1], [560, 1], [80, -1], [400, -1]] as const) {
      const x = caisMonsterX(originX, facing);
      expect(x).toBeGreaterThanOrEqual(150); expect(x).toBeLessThanOrEqual(490);
      const pose = finisherMonsterPose(150, originX, facing);
      expect(pose.flip).toBe(facing === 1);
      expect(pose.scale).toBeGreaterThan(1);
      expect(pose.reveal).toBeGreaterThan(0.9);
      expect(finisherMonsterPose(100, originX, facing).reveal).toBe(0);
      expect(finisherMonsterPose(FINISH_END, originX, facing).reveal).toBe(0);
    }
  });
  for (const fighter of FIGHTERS) for (const facing of [-1, 1] as const) {
    it(fighter.id + ' voa para a água, some e reaparece nas mandíbulas no lado ' + facing, () => {
      const originX = facing === 1 ? 280 : 360;
      const held = finisherVictimPose('cais-da-cidade', 30, originX, facing, 'rafa-mare', fighter.id);
      expect(held.visible).toBe(true); expect(held.scale).toBe(1); expect(held.state).toBe('grabbedLifted');
      const flight = finisherVictimPose('cais-da-cidade', 90, originX, facing, 'rafa-mare', fighter.id);
      expect(flight.visible).toBe(true); expect(flight.depth).toBe('front');
      expect(flight.scale).toBeLessThan(1); expect(flight.scale).toBeGreaterThan(0.75);
      expect(finisherVictimPose('cais-da-cidade', FINISH_SPLASH + 5, originX, facing, 'rafa-mare', fighter.id).visible).toBe(false);
      for (let frame = 140; frame < FINISH_BITE; frame++) {
        const pose = finisherVictimPose('cais-da-cidade', frame, originX, facing, 'rafa-mare', fighter.id);
        const mouth = finisherMonsterPose(frame, originX, facing);
        expect(pose.visible).toBe(true);
        const hold = victimHoldPoint(pose, fighter.id, facing);
        expect(hold.x).toBeCloseTo(mouth.mouthX, 5);
        expect(hold.y).toBeCloseTo(mouth.mouthY, 5);
      }
      expect(finisherVictimPose('cais-da-cidade', FINISH_BITE, originX, facing, 'rafa-mare', fighter.id).visible).toBe(false);
    });
  }
});

describe('finalização da Cozinha Macabra', () => {
  it('joga o derrotado de cabeça no panelão, a bruxa mexe e sobram ossos sem o monstro do cais', () => {
    const w = setup(undefined, undefined, 'cozinha-macabra');
    ready(w);
    w.drainEvents();
    startFinish(w);
    stepTo(w, KITCHEN_DROP);
    expect(w.phaseFrame).toBe(KITCHEN_DROP);
    const inPot = finisherVictimPose('cozinha-macabra', KITCHEN_DROP, w.fighters[0].x, w.fighters[0].facing, w.fighters[0].id, w.fighters[1].id);
    // O peito entra pela boca do panelão; de cabeça para baixo, os pés ficam
    // acima da borda e o corte na borda esconde o resto.
    const hold = victimHoldPoint(inPot, w.fighters[1].id, w.fighters[0].facing);
    expect(hold.x).toBeCloseTo(KITCHEN_POT_X, 5);
    expect(hold.y).toBeCloseTo(KITCHEN_POT_Y - 4, 5);
    expect(inPot.y).toBeLessThan(KITCHEN_POT_Y);
    expect(inPot.visible).toBe(true);
    expect(inPot.cutBelowY).toBe(KITCHEN_POT_RIM_Y);
    expect(inPot.scale).toBeGreaterThan(0.5);
    expect(inPot.scale).toBeLessThan(0.6);
    stepTo(w, KITCHEN_SUNK);
    expect(finisherVictimPose('cozinha-macabra', w.phaseFrame, 0, 1).visible).toBe(false);
    expect(kitchenFinishCue(KITCHEN_DROP)).toBe('potDrop');
    expect(kitchenFinishCue(KITCHEN_BONES)).toBe('bonesLeft');
    while (w.phase === 'stageFinish') w.step(empty, empty);
    const events = w.drainEvents();
    expect(w.phase).toBe('matchOver');
    expect(w.snapshot().finisherCompleted).toBe(true);
    expect(w.fighters[0].roundWins).toBe(2);
    expect(events.filter(e => e.type === 'potDrop')).toHaveLength(1);
    expect(events.filter(e => e.type === 'witchStir')).toHaveLength(3);
    expect(events.filter(e => e.type === 'bonesLeft')).toHaveLength(1);
    expect(events.filter(e => e.type === 'monsterBite' || e.type === 'monsterRoar' || e.type === 'finishSplash')).toHaveLength(0);
    expect(events.filter(e => e.type === 'matchEnd')).toHaveLength(1);
  });

  it('dois clientes mantêm o mesmo hash e a CPU finaliza na panela', () => {
    const a = setup(undefined, undefined, 'cozinha-macabra');
    const b = setup(undefined, undefined, 'cozinha-macabra');
    ready(a); ready(b);
    for (let f = 0; f < 340; f++) {
      const i = f === 0 ? chord : empty;
      const packet = wireInputFrame(f, i, f === 1 ? 48 : 0);
      a.step(inputFrameFromWire(packet), empty);
      b.step(inputFrameFromWire(JSON.parse(JSON.stringify(packet))), empty);
      expect(combatStateHash(a)).toBe(combatStateHash(b));
    }
    expect(a.snapshot().finisherCompleted).toBe(true);
    const cpuWorld = setup(undefined, undefined, 'cozinha-macabra');
    ready(cpuWorld, 1);
    cpuWorld.fighters[1].x = 520;
    const cpu = new CpuController(FIGHTERS[1]!, 1, 'normal');
    for (let f = 0; f < 480 && cpuWorld.phase === 'finishReady'; f++) cpuWorld.step(empty, cpu.sample(cpuWorld.snapshot()));
    expect(cpuWorld.phase).toBe('stageFinish');
  });
});

describe('finalização do Sítio', () => {
  it('as portas abrem, o mascarado aparece, o corpo cai sobre o tridente e as portas fecham', () => {
    const w = setup(undefined, undefined, 'sitio');
    ready(w);
    w.drainEvents();
    startFinish(w);
    const closed = sitioFinisherStage(0, 280);
    expect(closed.doors).toBe(0); expect(closed.farmerVisible).toBe(false);
    const open = sitioFinisherStage(SHED_DOORS_OPEN_END, 280);
    expect(open.doors).toBe(1); expect(open.farmerVisible).toBe(true);
    expect(open.farmerFacing).toBe(-1);
    expect(sitioFinisherStage(90, 500).farmerFacing).toBe(1);
    expect(open.tridentTipY).toBeGreaterThan(SHED.top); expect(open.tridentTipY).toBeLessThan(SHED.bottom);
    stepTo(w, SITIO_IMPALE);
    const stage = sitioFinisherStage(SITIO_IMPALE, w.fighters[0].x);
    const impaled = finisherVictimPose('sitio', SITIO_IMPALE, w.fighters[0].x, w.fighters[0].facing, w.fighters[0].id, w.fighters[1].id);
    expect(impaled.visible).toBe(true);
    expect(impaled.scale).toBeCloseTo(0.42, 5);
    const hold = victimHoldPoint(impaled, w.fighters[1].id, w.fighters[0].facing);
    expect(hold.x).toBeCloseTo(stage.tridentTipX, 5);
    // Espasmo de meio pixel no impacto.
    expect(Math.abs(hold.y - (stage.tridentTipY + 4))).toBeLessThan(1);
    // Deitado sobre as pontas, nunca de cabeça para baixo.
    expect(Math.abs(impaled.rotation)).toBeLessThan(1.7);
    expect(Math.abs(w.fighters[1].x - impaled.x)).toBeLessThan(0.001);
    stepTo(w, SHED_DOORS_CLOSE_END);
    expect(finisherVictimPose('sitio', SHED_DOORS_CLOSE_END, 280, 1).visible).toBe(false);
    expect(sitioFinisherStage(SHED_DOORS_CLOSE_END, 280).doors).toBe(0);
    while (w.phase === 'stageFinish') w.step(empty, empty);
    const events = w.drainEvents();
    expect(w.phase).toBe('matchOver');
    expect(w.snapshot().finisherCompleted).toBe(true);
    expect(w.fighters[0].roundWins).toBe(2);
    expect(events.filter(e => e.type === 'shedDoors')).toHaveLength(1);
    expect(events.filter(e => e.type === 'tridentStab')).toHaveLength(1);
    expect(events.filter(e => e.type === 'shedSlam')).toHaveLength(1);
    expect(events.filter(e => e.type === 'monsterBite' || e.type === 'potDrop' || e.type === 'finishSplash')).toHaveLength(0);
    expect(events.filter(e => e.type === 'matchEnd')).toHaveLength(1);
  });

  it('o vencedor recua do galpão depois do arremesso, sem sair do palco', () => {
    const w = setup(undefined, undefined, 'sitio');
    ready(w); startFinish(w);
    const before = w.fighters[0].x;
    stepTo(w, SITIO_STEP_BACK_END);
    expect(w.fighters[0].x).toBeLessThan(before - 40);
    expect(w.fighters[0].x).toBeGreaterThanOrEqual(36);
    const far = setup(undefined, undefined, 'sitio');
    far.fighters[0].resetPosition(90, 1); far.fighters[1].resetPosition(160, -1);
    ready(far); startFinish(far);
    const farBefore = far.fighters[0].x;
    stepTo(far, SITIO_STEP_BACK_END);
    expect(far.fighters[0].x).toBe(farBefore);
  });

  it.each([0, 1] as const)('P%s finaliza no Sítio também em espelho, com hash igual nos dois clientes', winner => {
    const a = setup(FIGHTERS[3], FIGHTERS[5], 'sitio');
    const b = setup(FIGHTERS[3], FIGHTERS[5], 'sitio');
    ready(a, winner); ready(b, winner);
    for (let f = 0; f < 340; f++) {
      const i = f === 0 ? chord : empty;
      const packet = wireInputFrame(f, i, f === 1 ? 48 : 0);
      const one = inputFrameFromWire(packet), two = inputFrameFromWire(JSON.parse(JSON.stringify(packet)));
      a.step(winner === 0 ? one : empty, winner === 1 ? one : empty);
      b.step(winner === 0 ? two : empty, winner === 1 ? two : empty);
      expect(combatStateHash(a)).toBe(combatStateHash(b));
    }
    expect(a.snapshot().finisherCompleted).toBe(true);
    expect(a.fighters[winner].roundWins).toBe(2);
  });

  it('CPU vencedora se aproxima e finaliza no Sítio', () => {
    const w = setup(undefined, undefined, 'sitio');
    ready(w, 1);
    w.fighters[1].x = 520;
    const cpu = new CpuController(FIGHTERS[1]!, 1, 'normal');
    for (let f = 0; f < 480 && w.phase === 'finishReady'; f++) w.step(empty, cpu.sample(w.snapshot()));
    expect(w.phase).toBe('stageFinish');
  });
});

describe('vítima nas mãos em todas as arenas', () => {
  for (const arena of FINISHER_ARENAS) for (const victim of FIGHTERS.map(f => f.id) as FighterId[]) {
    it(`${arena}: ${victim} segue as mãos até o arremesso e nunca fica de cabeça para baixo antes dele`, () => {
      for (let frame = 0; frame < FINISH_THROW; frame++) {
        const pose = finisherVictimPose(arena, frame, 280, 1, 'guto-barba', victim);
        expect(pose.scale).toBe(1);
        expect(pose.visible).toBe(true);
        expect(pose.y).toBeLessThanOrEqual(304);
        expect(pose.y).toBeGreaterThan(30);
        expect(Math.abs(pose.rotation)).toBeLessThan(1.7);
      }
    });
  }
});
