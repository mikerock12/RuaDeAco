import { describe, expect, it } from 'vitest';
import { CpuController } from '../../ai/CpuController';
import { gutoBarba } from '../../fighters/gutoBarba';
import { rafaMare } from '../../fighters/rafaMare';
import type { FighterDefinition, InputAction, InputFrame } from '../../types/combat';
import { CombatWorld } from '../CombatWorld';

const input = (held: readonly InputAction[] = [], pressed: readonly InputAction[] = []): InputFrame => ({
  held: new Set(held),
  pressed: new Set(pressed),
  released: new Set(),
});
const empty = input();

const enterFight = (world: CombatWorld): void => {
  for (let frame = 0; frame < 105; frame += 1) world.step(empty, empty);
};

const approach = (world: CombatWorld): void => {
  for (let frame = 0; frame < 70; frame += 1) world.step(input(['right']), empty);
  // Frames neutros para expirar a amostra de "frente" e garantir que o
  // próximo botão saia como golpe neutro, não como golpe avançando.
  for (let frame = 0; frame < 4; frame += 1) world.step(empty, empty);
};

const snapshotAtAttackerFrame = (
  world: CombatWorld,
  targetFrame: number,
): ReturnType<CombatWorld['snapshot']> => {
  for (let step = 0; step < 600; step += 1) {
    const snapshot = world.snapshot();
    if (snapshot.fighters[0].stateFrame === targetFrame) return snapshot;
    world.step(empty, empty);
  }
  throw new Error(`Atacante não alcançou o frame ${targetFrame}`);
};

describe('integração do mundo de combate', () => {
  it('resolve dano e defesa com caixas próprias', () => {
    const strikeWorld = new CombatWorld(rafaMare, gutoBarba, 'cpu');
    enterFight(strikeWorld);
    approach(strikeWorld);
    const healthBefore = strikeWorld.fighters[1].health;
    strikeWorld.step(input(['light'], ['light']), empty);
    for (let frame = 0; frame < 22; frame += 1) strikeWorld.step(empty, empty);
    expect(strikeWorld.fighters[1].health < healthBefore).toBe(true);

    const blockWorld = new CombatWorld(rafaMare, gutoBarba, 'cpu');
    enterFight(blockWorld);
    approach(blockWorld);
    const blockedHealth = blockWorld.fighters[1].health;
    const blockedX = blockWorld.fighters[1].x;
    blockWorld.step(input(['light'], ['light']), input(['block']));
    for (let frame = 0; frame < 12; frame += 1) blockWorld.step(empty, input(['block']));
    expect(blockWorld.fighters[1].health).toBe(blockedHealth);
    expect(blockWorld.fighters[1].x > blockedX).toBe(true);
    expect(blockWorld.drainEvents().some((event) => event.type === 'blocked')).toBe(true);
  });

  it('executa projétil e super a partir do command buffer', () => {
    const specialWorld = new CombatWorld(rafaMare, gutoBarba, 'training');
    enterFight(specialWorld);
    specialWorld.step(input(['special'], ['special']), empty);
    for (let frame = 0; frame < 14; frame += 1) specialWorld.step(empty, empty);
    const projectile = specialWorld.snapshot().projectiles[0];
    expect(projectile).toMatchObject({
      projectileId: 'onda-curta',
      sourceMoveId: 'maoDaMare',
    });
    expect(projectile?.ageFrames).toBeGreaterThan(0);

    const superWorld = new CombatWorld(rafaMare, gutoBarba, 'training');
    enterFight(superWorld);
    superWorld.step(input(['right', 'special'], ['special']), empty);
    expect(superWorld.fighters[0].currentMove?.id).toBe('chuteRessaca');
    expect(superWorld.fighters[0].meter).toBe(100);
  });

  it('remove projéteis imediatamente ao entrar em roundOver', () => {
    const world = new CombatWorld(rafaMare, gutoBarba, 'versus');
    enterFight(world);
    world.step(input(['special'], ['special']), empty);
    for (let frame = 0; frame < 14; frame += 1) world.step(empty, empty);
    expect(world.snapshot().projectiles).toHaveLength(1);

    world.timeFrames = 1;
    world.step(empty, empty);

    expect(world.snapshot()).toMatchObject({
      phase: 'roundOver',
      projectiles: [],
    });
    world.step(empty, empty);
    expect(world.snapshot().projectiles).toEqual([]);
  });

  it('reconhece baixo + especial nos golpes de energia', () => {
    const ecoWorld = new CombatWorld(rafaMare, gutoBarba, 'training');
    enterFight(ecoWorld);
    ecoWorld.step(input(['down', 'special'], ['special']), empty);
    expect(ecoWorld.fighters[0].currentMove?.id).toBe('ecoTatuado');

    const abracoWorld = new CombatWorld(gutoBarba, rafaMare, 'training');
    enterFight(abracoWorld);
    abracoWorld.step(input(['down', 'special'], ['special']), empty);
    expect(abracoWorld.fighters[0].currentMove?.id).toBe('abracoGlacial');
  });

  it('agarrão do Guto só conecta dentro do alcance', () => {
    const farWorld = new CombatWorld(gutoBarba, rafaMare, 'versus');
    enterFight(farWorld);
    farWorld.drainEvents();
    farWorld.step(input(['right', 'special'], ['special']), empty);
    for (let frame = 0; frame < 70; frame += 1) farWorld.step(empty, empty);
    expect(farWorld.drainEvents().some((event) => event.type === 'hit')).toBe(false);

    const nearWorld = new CombatWorld(gutoBarba, rafaMare, 'versus');
    enterFight(nearWorld);
    nearWorld.fighters[0].x = 300;
    nearWorld.fighters[1].x = 330;
    nearWorld.drainEvents();
    nearWorld.step(input(['right', 'special'], ['special']), empty);
    for (let frame = 0; frame < 70; frame += 1) nearWorld.step(empty, empty);
    const events = nearWorld.drainEvents();
    expect(events.some((event) => event.type === 'hit' && event.moveId === 'ganchoUrso')).toBe(true);
  });

  it('mantém atacante e vítima separados durante todo o Gancho do Urso', () => {
    const world = new CombatWorld(gutoBarba, rafaMare, 'versus');
    enterFight(world);
    world.fighters[0].x = 300;
    world.fighters[1].x = 330;
    const victimHealth = world.fighters[1].health;
    const victimStates = new Set<string>();

    world.step(input(['right', 'special'], ['special']), empty);
    for (let frame = 0; frame < 90; frame += 1) {
      world.step(empty, empty);
      const snapshot = world.snapshot();
      const attacker = snapshot.fighters[0];
      const victim = snapshot.fighters[1];
      victimStates.add(victim.state);

      if (victim.grabbedBy) {
        expect(victim.grabbedBy).toBe(attacker.id);
        expect(attacker.grabbedBy).toBeNull();
        expect(attacker.state).toBe('specialAttack');
        expect(snapshot.activeGrab).toMatchObject({
          attackerId: 'guto-barba',
          victimId: 'rafa-mare',
          moveId: 'ganchoUrso',
        });
      }

      if (victim.state === 'thrown') {
        expect(victim.grabbedBy).toBeNull();
        expect(world.fighters[1].velocityX).toBeCloseTo(
          gutoBarba.moves.ganchoUrso!.grab?.throwVelocityX ?? 0,
        );
        expect(world.fighters[1].velocityY).toBeCloseTo(
          gutoBarba.moves.ganchoUrso!.grab?.throwVelocityY ?? 0,
        );
        break;
      }
    }

    expect(victimStates).toContain('grabbedFront');
    expect(victimStates).toContain('grabbedLifted');
    expect(victimStates).toContain('thrown');
    expect(world.fighters[1].health).toBeLessThan(victimHealth);
    expect(world.snapshot().activeGrab).toBeNull();
  });

  it('sincroniza hold e release do Gancho com o stateFrame apresentado', () => {
    const world = new CombatWorld(gutoBarba, rafaMare, 'versus');
    enterFight(world);
    world.fighters[0].x = 300;
    world.fighters[1].x = 330;
    world.step(input(['right', 'special'], ['special']), empty);

    const hold = snapshotAtAttackerFrame(world, 14);
    expect(hold.activeGrab?.attackerFrame).toBe(14);
    expect(hold.fighters[1]).toMatchObject({
      state: 'grabbedLifted',
      grabbedBy: 'guto-barba',
      victimPoseFrame: 0,
    });

    const release = snapshotAtAttackerFrame(world, 35);
    expect(release.activeGrab).toBeNull();
    expect(release.fighters[1]).toMatchObject({
      state: 'thrown',
      grabbedBy: null,
      victimPhaseFrame: 0,
      victimPhaseFrames: 0,
    });
  });

  it('usa a animação frozen da própria vítima no Abraço Glacial', () => {
    const world = new CombatWorld(gutoBarba, rafaMare, 'training');
    enterFight(world);
    world.fighters[0].x = 300;
    world.fighters[1].x = 332;
    const victimStates = new Set<string>();

    world.step(input(['down', 'special'], ['special']), empty);
    for (let frame = 0; frame < 180; frame += 1) {
      world.step(empty, empty);
      victimStates.add(world.snapshot().fighters[1].state);
    }

    expect(victimStates).toContain('grabbedFront');
    expect(victimStates).toContain('frozen');
    expect(victimStates).toContain('thrown');
  });

  it('sincroniza hold, freeze e release do Abraço com o stateFrame apresentado', () => {
    const world = new CombatWorld(gutoBarba, rafaMare, 'versus');
    enterFight(world);
    world.fighters[0].forceMeter(100);
    world.fighters[0].x = 300;
    world.fighters[1].x = 332;
    world.step(input(['down', 'special'], ['special']), empty);

    const hold = snapshotAtAttackerFrame(world, 19);
    expect(hold.activeGrab?.attackerFrame).toBe(19);
    expect(hold.fighters[1]).toMatchObject({
      state: 'grabbedFront',
      victimPoseFrame: 5,
    });

    const freeze = snapshotAtAttackerFrame(world, 28);
    expect(freeze.activeGrab?.attackerFrame).toBe(28);
    expect(freeze.fighters[1]).toMatchObject({
      state: 'frozen',
      grabbedBy: 'guto-barba',
      victimPoseFrame: 0,
    });

    const release = snapshotAtAttackerFrame(world, 91);
    expect(release.activeGrab).toBeNull();
    expect(release.fighters[1]).toMatchObject({
      state: 'thrown',
      grabbedBy: null,
      victimPhaseFrame: 0,
      victimPhaseFrames: 0,
    });
  });

  it('aplica pequenos offsets específicos da vítima sem trocar os sprites do atacante', () => {
    const gancho = gutoBarba.moves.ganchoUrso!;
    const configuredGuto: FighterDefinition = {
      ...gutoBarba,
      moves: {
        ...gutoBarba.moves,
        ganchoUrso: {
          ...gancho,
          grab: {
            ...gancho.grab!,
            victimOffsets: {
              'rafa-mare': {
                anchorOffsetX: 7,
                anchorOffsetY: -3,
                rotationOffset: 0.1,
              },
            },
          },
        },
      },
    };
    const world = new CombatWorld(configuredGuto, rafaMare, 'versus');
    enterFight(world);
    world.fighters[0].x = 300;
    world.fighters[1].x = 330;
    world.step(input(['right', 'special'], ['special']), empty);

    let captured = false;
    for (let frame = 0; frame < 30; frame += 1) {
      world.step(empty, empty);
      const [attacker, victim] = world.snapshot().fighters;
      if (victim.state !== 'grabbedFront') continue;
      captured = true;
      expect(victim.x).toBeCloseTo(attacker.x + 57);
      expect(victim.y).toBeCloseTo(attacker.y - 4);
      expect(victim.victimRotation).toBeCloseTo(0.1);
      break;
    }
    expect(captured).toBe(true);
  });

  it('concede a armadura configurada da Muralha Norte', () => {
    const world = new CombatWorld(gutoBarba, rafaMare, 'training');
    enterFight(world);
    world.step(input(['special'], ['special']), empty);
    for (let frame = 0; frame < 4; frame += 1) world.step(empty, empty);
    expect(world.fighters[0].armorHits).toBe(1);
  });

  it('credita meter simetricamente em trades de mesma prioridade', () => {
    const world = new CombatWorld(rafaMare, rafaMare, 'versus');
    enterFight(world);
    for (let frame = 0; frame < 42; frame += 1) {
      world.step(input(['right']), input(['left']));
    }
    world.step(input(['light'], ['light']), input(['light'], ['light']));
    for (let frame = 0; frame < 8; frame += 1) world.step(empty, empty);
    expect(world.fighters[0].health).toBe(world.fighters[1].health);
    expect(world.fighters[0].meter).toBe(world.fighters[1].meter);
    expect(world.fighters[0].meter > 0).toBe(true);
  });

  it('compara percentual de vida no timeout e repete empates', () => {
    const percentageWorld = new CombatWorld(rafaMare, gutoBarba, 'versus');
    enterFight(percentageWorld);
    percentageWorld.fighters[1].health = 1001;
    percentageWorld.timeFrames = 1;
    percentageWorld.step(empty, empty);
    expect(percentageWorld.fighters[0].state).toBe('victory');

    const drawWorld = new CombatWorld(rafaMare, gutoBarba, 'versus');
    enterFight(drawWorld);
    drawWorld.timeFrames = 1;
    drawWorld.step(empty, empty);
    expect(drawWorld.snapshot().roundDraw).toBe(true);
    expect(drawWorld.snapshot().roundWins).toEqual([0, 0]);
  });

  it('mantém atraso mínimo de reação até na CPU difícil', () => {
    const world = new CombatWorld(rafaMare, gutoBarba, 'cpu');
    const cpu = new CpuController(gutoBarba, 1, 'hard', () => 0.5);
    for (let frame = 0; frame < 6; frame += 1) {
      expect(cpu.sample(world.snapshot()).held.size).toBe(0);
    }
  });
});
