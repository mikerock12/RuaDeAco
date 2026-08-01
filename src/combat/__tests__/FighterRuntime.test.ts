import { describe, expect, it } from 'vitest';
import { GROUND_Y, LANDING_FRAMES } from '../../config/gameConfig';
import { gutoBarba } from '../../fighters/gutoBarba';
import { rafaMare } from '../../fighters/rafaMare';
import { getFighterCollisionProfile } from '../../fighters/collision/collisionProfiles';
import type { HitboxDefinition, InputAction, InputFrame } from '../../types/combat';
import { FighterRuntime } from '../FighterRuntime';

const input = (held: readonly InputAction[] = [], pressed: readonly InputAction[] = []): InputFrame => ({
  held: new Set(held),
  pressed: new Set(pressed),
  released: new Set(),
});

const blockHit: HitboxDefinition = {
  id: 'teste-block',
  x: 0,
  y: -40,
  width: 30,
  height: 40,
  kind: 'strike',
  level: 'mid',
  damage: 20,
  chipDamage: 2,
  hitStun: 8,
  blockStun: 6,
  hitStop: 0,
  priority: 1,
  knockbackX: 2,
  knockbackY: 0,
};

const throwHit: HitboxDefinition = {
  id: 'teste-throw',
  x: 0,
  y: -40,
  width: 30,
  height: 40,
  kind: 'throw',
  level: 'mid',
  damage: 10,
  chipDamage: 0,
  hitStun: 1,
  blockStun: 0,
  hitStop: 0,
  priority: 1,
  knockbackX: 0,
  knockbackY: 0,
  knockdown: true,
};

describe('pulo e agachamento', () => {
  it('sai do chão no mesmo frame em que o pulo é apertado', () => {
    const fighter = new FighterRuntime(rafaMare, 200, 1);
    fighter.beginFrame(input([], ['up']), 1, 400);
    fighter.finishFrame();
    expect(fighter.state).toBe('jump');
    expect(fighter.y).toBeLessThan(GROUND_Y);
  });

  it('W (up) apenas pula, não ataca e não ativa hitbox', () => {
    const fighter = new FighterRuntime(rafaMare, 200, 1);
    fighter.beginFrame(input([], ['up']), 1, 400);
    fighter.finishFrame();
    expect(fighter.state).toBe('jump');
    expect(fighter.isAttacking).toBe(false);
    expect(fighter.getActiveHitboxes().length).toBe(0);
    
    // Testar o avanço dos frames para garantir que em nenhum frame de pulo a hitbox é ativada.
    for (let frameNumber = 2; frameNumber <= 20; frameNumber += 1) {
      fighter.beginFrame(input(), frameNumber, 400);
      fighter.finishFrame();
      expect(fighter.isAttacking).toBe(false);
      expect(fighter.getActiveHitboxes().length).toBe(0);
    }
  });

  it('completa o arco, exibe o pouso e volta ao idle sem travar', () => {
    const fighter = new FighterRuntime(rafaMare, 200, 1);
    fighter.beginFrame(input(['up'], ['up']), 1, 400);
    fighter.finishFrame();

    let apexY = fighter.y;
    let frameNumber = 1;
    while (fighter.y < GROUND_Y && frameNumber < 240) {
      frameNumber += 1;
      fighter.beginFrame(input(), frameNumber, 400);
      fighter.finishFrame();
      apexY = Math.min(apexY, fighter.y);
    }

    // Arco coerente com sprites de ~176px: apex acima de 100px do chão.
    expect(GROUND_Y - apexY).toBeGreaterThan(100);
    // Tempo de voo em torno de 2*v/g (~34 frames), nunca o limite do laço.
    expect(frameNumber).toBeGreaterThan(20);
    expect(frameNumber).toBeLessThan(60);
    expect(fighter.y).toBe(GROUND_Y);
    expect(fighter.state).toBe('landing');
    for (let landingFrame = 0; landingFrame < LANDING_FRAMES; landingFrame += 1) {
      frameNumber += 1;
      fighter.beginFrame(input(), frameNumber, 400);
      fighter.finishFrame();
    }
    expect(fighter.state).toBe('idle');
  });

  it('reinicia o contador visual ao cruzar o ápice para fall', () => {
    const fighter = new FighterRuntime(rafaMare, 200, 1);
    fighter.beginFrame(input([], ['up']), 1, 400);
    fighter.finishFrame();

    for (let frame = 2; frame < 80; frame += 1) {
      fighter.beginFrame(input(), frame, 400);
      if (fighter.state === 'fall') {
        expect(fighter.stateFrame).toBe(0);
        return;
      }
      fighter.finishFrame();
    }
    throw new Error('Rafa não entrou em fall');
  });

  it('não permite pulo duplo segurando ou reapertando para cima no ar', () => {
    const fighter = new FighterRuntime(gutoBarba, 200, 1);
    fighter.beginFrame(input(['up'], ['up']), 1, 400);
    fighter.finishFrame();
    fighter.beginFrame(input(['up'], ['up']), 2, 400);
    fighter.finishFrame();
    const velocityAfterRepress = fighter.velocityY;
    // A velocidade segue o arco normal (não volta ao impulso inicial).
    expect(velocityAfterRepress).toBeGreaterThan(-gutoBarba.stats.jumpSpeed);
    expect(fighter.state).toBe('jump');
  });

  it('agacha segurando baixo, reduz hurtbox e volta ao idle ao soltar', () => {
    const fighter = new FighterRuntime(rafaMare, 200, 1);
    fighter.beginFrame(input(['down']), 1, 400);
    fighter.finishFrame();
    expect(fighter.state).toBe('crouch');
    const profile = getFighterCollisionProfile(rafaMare.id)!;
    expect(fighter.getHurtboxes()).toEqual(profile.poses.crouching.hurtboxes);

    const standingTop = Math.min(...profile.poses.standing.hurtboxes.map((box) => box.y));
    const crouchingTop = Math.min(...profile.poses.crouching.hurtboxes.map((box) => box.y));
    expect(crouchingTop).toBeGreaterThan(standingTop);

    fighter.beginFrame(input(), 2, 400);
    fighter.finishFrame();
    expect(fighter.state).toBe('idle');
    expect(fighter.getHurtboxes()).toEqual(profile.poses.standing.hurtboxes);
  });

  it('caminhar segurando baixo prioriza o agachamento', () => {
    const fighter = new FighterRuntime(rafaMare, 200, 1);
    fighter.beginFrame(input(['down', 'right']), 1, 400);
    fighter.finishFrame();
    expect(fighter.state).toBe('crouch');
  });
});

const rideJump = (fighter: FighterRuntime, startFrame: number): number => {
  let frameNumber = startFrame;
  while (fighter.y < GROUND_Y && frameNumber < 240) {
    frameNumber += 1;
    fighter.beginFrame(input(), frameNumber, 400);
    fighter.finishFrame();
  }
  return frameNumber;
};

describe('pulo diagonal', () => {
  it('pulo diagonal para frente aplica impulso fixado na decolagem', () => {
    const fighter = new FighterRuntime(rafaMare, 200, 1);
    fighter.beginFrame(input(['right'], ['up']), 1, 400);
    fighter.finishFrame();
    expect(fighter.state).toBe('jump');
    rideJump(fighter, 1);
    // Avança mesmo sem segurar direção durante o voo.
    expect(fighter.x).toBeGreaterThan(240);
    expect(fighter.state).toBe('landing');
  });

  it('pulo diagonal para trás afasta e é mais curto que para frente', () => {
    const forward = new FighterRuntime(rafaMare, 300, 1);
    forward.beginFrame(input(['right'], ['up']), 1, 500);
    forward.finishFrame();
    rideJump(forward, 1);

    const backward = new FighterRuntime(rafaMare, 300, 1);
    backward.beginFrame(input(['left'], ['up']), 1, 500);
    backward.finishFrame();
    rideJump(backward, 1);

    expect(backward.x).toBeLessThan(300);
    expect(forward.x - 300).toBeGreaterThan(300 - backward.x);
  });

  it('pulo vertical não desloca ao segurar direção depois da decolagem', () => {
    const fighter = new FighterRuntime(rafaMare, 200, 1);
    fighter.beginFrame(input([], ['up']), 1, 400);
    fighter.finishFrame();
    let frameNumber = 1;
    while (fighter.y < GROUND_Y && frameNumber < 240) {
      frameNumber += 1;
      fighter.beginFrame(input(['right']), frameNumber, 400);
      fighter.finishFrame();
    }
    expect(fighter.x).toBe(200);
  });

  it('Rafa tem pulo diagonal mais longo que Guto', () => {
    expect(rafaMare.stats.jumpForwardSpeed).toBeGreaterThan(gutoBarba.stats.jumpForwardSpeed);
    expect(rafaMare.stats.jumpBackwardSpeed).toBeGreaterThan(gutoBarba.stats.jumpBackwardSpeed);
  });
});

describe('pouso', () => {
  it('mantém o buffer de comando ativo durante os 6 frames de landing', () => {
    const fighter = new FighterRuntime(rafaMare, 200, 1);
    fighter.beginFrame(input(['up'], ['up']), 1, 400);
    fighter.finishFrame();
    let frameNumber = rideJump(fighter, 1);
    expect(fighter.state).toBe('landing');

    frameNumber += 1;
    fighter.beginFrame(input(['light'], ['light']), frameNumber, 400);
    fighter.finishFrame();
    for (let landingFrame = 0; landingFrame < LANDING_FRAMES - 2; landingFrame += 1) {
      frameNumber += 1;
      fighter.beginFrame(input(), frameNumber, 400);
      fighter.finishFrame();
    }
    expect(fighter.state).toBe('idle');

    frameNumber += 1;
    fighter.beginFrame(input(), frameNumber, 400);
    expect(fighter.currentMove?.id).toBe('lightPunch');
  });
});

describe('golpes direcionais e agachados', () => {
  it('frente + fraco executa o golpe avançando', () => {
    const fighter = new FighterRuntime(rafaMare, 200, 1);
    fighter.beginFrame(input(['right']), 1, 400);
    fighter.finishFrame();
    fighter.beginFrame(input(['right', 'light'], ['light']), 2, 400);
    expect(fighter.currentMove?.id).toBe('avancoMare');
  });

  it('baixo + forte executa a rasteira com hurtbox agachada', () => {
    const fighter = new FighterRuntime(rafaMare, 200, 1);
    fighter.beginFrame(input(['down', 'heavy'], ['heavy']), 1, 400);
    expect(fighter.currentMove?.id).toBe('rasteira');
    expect(fighter.getHurtboxes()).toEqual(
      getFighterCollisionProfile(rafaMare.id)!.poses.crouching.hurtboxes,
    );
  });

  it('diagonal baixo-frente ainda aciona o golpe agachado fraco', () => {
    const fighter = new FighterRuntime(gutoBarba, 200, 1);
    fighter.beginFrame(input(['down', 'right', 'light'], ['light']), 1, 400);
    expect(fighter.currentMove?.id).toBe('frontKick');
  });

  it('Guto executa chute frontal e rasteira com baixo + ataque', () => {
    const frontKick = new FighterRuntime(gutoBarba, 200, 1);
    frontKick.beginFrame(input(['down', 'light'], ['light']), 1, 400);
    expect(frontKick.currentMove?.id).toBe('frontKick');
    expect(frontKick.currentMove?.animation).toBe('crouchLight');
    expect(frontKick.currentMove?.hitboxes.length).toBeGreaterThan(0);

    const sweep = new FighterRuntime(gutoBarba, 200, 1);
    sweep.beginFrame(input(['down', 'heavy'], ['heavy']), 1, 400);
    expect(sweep.currentMove?.id).toBe('rasteiraUrso');
    expect(sweep.currentMove?.animation).toBe('crouchHeavy');
    expect(sweep.currentMove?.hitboxes.length).toBeGreaterThan(0);
  });
});

describe('ataques aéreos', () => {
  it('permite golpe fraco no ar e não o oferece no chão', () => {
    const grounded = new FighterRuntime(rafaMare, 200, 1);
    grounded.beginFrame(input(['light'], ['light']), 1, 400);
    expect(grounded.currentMove?.id).toBe('lightPunch');

    const airborne = new FighterRuntime(rafaMare, 200, 1);
    airborne.beginFrame(input([], ['up']), 1, 400);
    airborne.finishFrame();
    airborne.beginFrame(input(['light'], ['light']), 2, 400);
    airborne.finishFrame();
    expect(airborne.currentMove?.id).toBe('jumpLightNeutral');
  });

  it('desliga a hitbox do golpe aéreo ao aterrissar', () => {
    const fighter = new FighterRuntime(rafaMare, 200, 1);
    fighter.beginFrame(input([], ['up']), 1, 400);
    fighter.finishFrame();
    // Espera a descida para garantir aterrissagem durante os frames ativos.
    let frameNumber = 1;
    while (fighter.velocityY < 6 && frameNumber < 240) {
      frameNumber += 1;
      fighter.beginFrame(input(), frameNumber, 400);
      fighter.finishFrame();
    }
    frameNumber += 1;
    fighter.beginFrame(input(['heavy'], ['heavy']), frameNumber, 400);
    fighter.finishFrame();
    expect(fighter.currentMove?.id).toBe('jumpHeavyNeutral');

    let sawActiveHitbox = false;
    while (fighter.y < GROUND_Y && frameNumber < 240) {
      frameNumber += 1;
      fighter.beginFrame(input(), frameNumber, 400);
      sawActiveHitbox = sawActiveHitbox || fighter.getActiveHitboxes().length > 0;
      fighter.finishFrame();
    }
    expect(sawActiveHitbox).toBe(true);
    expect(fighter.isAttacking).toBe(false);
    expect(fighter.getActiveHitboxes().length).toBe(0);
  });

  it.each([
    [[], 'jumpHeavyNeutral'],
    [['right'], 'jumpHeavyForward'],
    [['left'], 'jumpHeavyBackward'],
  ] as const)('pulo %j + forte usa o chute aéreo correspondente', (directions, moveId) => {
    const fighter = new FighterRuntime(gutoBarba, 200, 1);
    fighter.beginFrame(input([...directions, 'heavy'], ['up', 'heavy']), 1, 400);
    expect(fighter.state).toBe('jump');
    expect(fighter.currentMove).toBeNull();
    fighter.finishFrame();

    fighter.beginFrame(input(), 2, 400);
    expect(fighter.currentMove?.id).toBe(moveId);
    expect(fighter.currentMove?.animation).toMatch(/^airHeavy/);
    expect(fighter.currentMove?.hitboxes.length).toBeGreaterThan(0);
  });

  it('pulo + fraco entra no ar antes de consumir o soco aéreo', () => {
    const fighter = new FighterRuntime(gutoBarba, 200, 1);
    fighter.beginFrame(input(['light'], ['up', 'light']), 1, 400);
    expect(fighter.state).toBe('jump');
    fighter.finishFrame();
    fighter.beginFrame(input(), 2, 400);
    expect(fighter.currentMove?.id).toBe('jumpLightNeutral');
  });
});

describe('especiais e energia', () => {
  it('super exige e consome energia', () => {
    const semEnergia = new FighterRuntime(rafaMare, 200, 1);
    semEnergia.beginFrame(input(['right', 'special'], ['special']), 1, 400);
    expect(semEnergia.currentMove).toBeNull();

    const comEnergia = new FighterRuntime(rafaMare, 200, 1);
    comEnergia.forceMeter(100);
    comEnergia.beginFrame(input(['right', 'special'], ['special']), 1, 400);
    expect(comEnergia.currentMove?.id).toBe('chuteRessaca');
    expect(comEnergia.meter).toBe(0);
  });

  it('baixo + especial ativa o Eco Tatuado com custo de energia', () => {
    const fighter = new FighterRuntime(rafaMare, 200, 1);
    fighter.forceMeter(60);
    fighter.beginFrame(input(['down', 'special'], ['special']), 1, 400);
    fighter.finishFrame();
    expect(fighter.currentMove?.id).toBe('ecoTatuado');
    expect(fighter.meter).toBe(10);

    for (let frameNumber = 2; frameNumber <= 14; frameNumber += 1) {
      fighter.beginFrame(input(), frameNumber, 400);
      fighter.consumeMoveEvents();
      fighter.finishFrame();
    }
    expect(fighter.passiveFrames).toBeGreaterThan(0);
  });

  it('Guto usa especial neutro, frente + especial e baixo + especial', () => {
    const muralha = new FighterRuntime(gutoBarba, 200, 1);
    muralha.beginFrame(input(['special'], ['special']), 1, 400);
    expect(muralha.currentMove?.id).toBe('muralhaNorte');

    const gancho = new FighterRuntime(gutoBarba, 200, 1);
    gancho.beginFrame(input(['right', 'special'], ['special']), 1, 400);
    expect(gancho.currentMove?.id).toBe('ganchoUrso');

    const abraco = new FighterRuntime(gutoBarba, 200, 1);
    abraco.forceMeter(100);
    abraco.beginFrame(input(['down', 'special'], ['special']), 1, 400);
    expect(abraco.currentMove?.id).toBe('abracoGlacial');
    expect(abraco.meter).toBe(0);
  });
});

describe('estados defensivos do lutador', () => {
  it('não permite bloquear durante um ataque ativo', () => {
    const fighter = new FighterRuntime(rafaMare, 200, 1);
    fighter.beginFrame(input(['light'], ['light']), 1, 400);
    fighter.finishFrame();
    fighter.beginFrame(input(['block']), 2, 400);
    expect(fighter.currentMove?.id).toBe('lightPunch');
    expect(fighter.isBlocking('mid', 'strike')).toBe(false);
  });

  it('permite alternar entre guarda alta e baixa durante block stun', () => {
    const fighter = new FighterRuntime(rafaMare, 200, 1);
    fighter.beginFrame(input(['block']), 1, 400);
    fighter.applyHit(blockHit, -1, true, 1, false);
    fighter.finishFrame();
    fighter.beginFrame(input(['block', 'down']), 2, 400);
    expect(fighter.state).toBe('blockCrouching');
    expect(fighter.isBlocking('low', 'strike')).toBe(true);
    expect(fighter.isBlocking('overhead', 'strike')).toBe(false);
  });

  it('limpa armadura quando Muralha Norte é interrompida por throw', () => {
    const fighter = new FighterRuntime(gutoBarba, 200, 1);
    fighter.beginFrame(input(['special'], ['special']), 1, 400);
    fighter.consumeMoveEvents();
    fighter.finishFrame();
    for (let frameNumber = 2; frameNumber <= 5; frameNumber += 1) {
      fighter.beginFrame(input(), frameNumber, 400);
      fighter.consumeMoveEvents();
      fighter.finishFrame();
    }
    expect(fighter.armorHits).toBe(1);
    fighter.applyHit(throwHit, -1, false, 1, false);
    expect(fighter.armorHits).toBe(0);
  });

  it('protege knockdown e wake-up sem permitir ataque invencível', () => {
    const fighter = new FighterRuntime(rafaMare, 200, 1);
    fighter.applyHit(throwHit, -1, false, 1, false);
    fighter.finishFrame();
    expect(fighter.state).toBe('knockdown');
    expect(fighter.getHurtboxes().length).toBe(0);

    for (let frameNumber = 1; frameNumber <= 42; frameNumber += 1) {
      fighter.beginFrame(input(), frameNumber, 400);
      fighter.finishFrame();
    }
    expect(fighter.state).toBe('wakeUp');
    expect(fighter.getHurtboxes().length).toBe(0);

    for (let frameNumber = 43; frameNumber <= 64; frameNumber += 1) {
      fighter.beginFrame(input(), frameNumber, 400);
      fighter.finishFrame();
    }
    expect(fighter.state).toBe('idle');
    fighter.beginFrame(input(), 65, 400);
    expect(fighter.getHurtboxes().length > 0).toBe(true);
  });
});
