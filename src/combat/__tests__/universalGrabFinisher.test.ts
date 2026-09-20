import { describe, it, expect } from 'vitest';
import { FIGHTERS } from '../../fighters';
import { CpuController } from '../../ai/CpuController';
import { inputFrameFromWire, wireInputFrame } from '../../online/inputCodec';
import { combatStateHash } from '../../online/stateHash';
import { CombatWorld } from '../CombatWorld';
import { finisherVictimPose, finisherMonsterPose, FINISH_END, FINISH_WINDOW } from '../stageFinisher';
import type { InputAction, InputFrame } from '../../types/combat';
const input = (held: InputAction[] = [], pressed: InputAction[] = held): InputFrame => ({ held: new Set(held), pressed: new Set(pressed), released: new Set() });
const empty = input();
const chord = input(['light', 'heavy']);
const advance = (world: CombatWorld, frames: number) => { for(let i = 0; i < frames; i++) world.step(empty, empty); };
function setup(one = FIGHTERS[0]!, two = FIGHTERS[1]!, arena: 'cais-da-cidade' | 'sitio' | 'cozinha-macabra' = 'cais-da-cidade') {
  const w = new CombatWorld(one, two, 'versus', arena); advance(w, 105);
  w.fighters[0].resetPosition(280, 1); w.fighters[1].resetPosition(350, -1); w.drainEvents(); return w;
}
function ready(w: CombatWorld, winner: 0 | 1 = 0) {
  w.fighters[winner].roundWins = 1; w.fighters[winner === 0 ? 1 : 0].health = 0;
  w.step(empty, empty); expect(w.phase).toBe('finishReady');
}
describe('agarrão universal', () => {
  for (const one of FIGHTERS) for (const two of FIGHTERS) {
    it(one.id + ' levanta e derruba ' + two.id, () => {
      const w = setup(one, two); const before = w.fighters[1].health;
      w.step(chord, input(['block']));
      expect(w.fighters[0].currentMove?.id).toBe('universalGrab');
      const states = new Set<string>(); let minY = 304;
      for(let f=0; f<115; f++) { w.step(empty, input(['block'], [])); states.add(w.fighters[1].state); minY = Math.min(minY, w.fighters[1].y); }
      expect(states.has('grabbedFront')).toBe(true); expect(states.has('grabbedLifted')).toBe(true);
      expect(states.has('thrown')).toBe(true); expect(states.has('knockdown')).toBe(true);
      expect(minY).toBeLessThan(235); expect(w.fighters[1].y).toBe(304);
      expect(w.fighters[1].health).toBe(before - 125);
      expect(w.drainEvents().filter(e=>e.type === 'hit')).toHaveLength(1);
    });
  }
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
describe('finalização do Cais', () => {
  it('só abre na segunda derrota e somente no Cais; treino e empate não abrem', () => {
    const first = setup(); first.fighters[1].health = 0; first.step(empty,empty); expect(first.phase).toBe('roundOver');
    for(const arena of ['sitio','cozinha-macabra'] as const) { const w=setup(undefined,undefined,arena); w.fighters[0].roundWins=1; w.fighters[1].health=0; w.step(empty,empty); expect(w.phase).toBe('roundOver'); }
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
  it.each([0,1] as const)('P%s executa toda a sequência sem duplicar sons ou vitórias, inclusive espelho', winner => {
    const w=setup(FIGHTERS[0],FIGHTERS[0]); ready(w,winner); w.drainEvents();
    w.step(winner===0?chord:empty,winner===1?chord:empty); advance(w,12); expect(w.phase).toBe('stageFinish');
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
});

describe('contato visual da finalização', () => {
  for (const fighter of FIGHTERS) for (const facing of [-1, 1]) {
    it(fighter.id + ' permanece nas mandíbulas no lado ' + facing, () => {
      for (let frame = 156; frame < 170; frame++) {
        const pose = finisherVictimPose(frame, 280, facing, 'rafa-mare', fighter.id);
        const mouth = finisherMonsterPose(frame);
        const torso = (fighter.id === 'guto-barba' ? 112 : 94) * pose.scale;
        expect(pose.x + Math.sin(pose.rotation) * torso).toBeCloseTo(mouth.mouthX, 5);
        expect(pose.y - Math.cos(pose.rotation) * torso).toBeCloseTo(mouth.mouthY, 5);
      }
    });
  }
});
