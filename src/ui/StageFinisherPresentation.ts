import type Phaser from 'phaser';
import type { FighterSnapshot } from '../combat/FighterRuntime';
import type { FinisherArena } from '../combat/stageFinisher';
import { FINISH_THROW, FINISH_SPLASH, FINISH_BITE, KITCHEN_DROP, KITCHEN_POT_X, KITCHEN_POT_Y,
  SITIO_IMPALE, SHED_DOORS_CLOSE_END, finisherVictimPose, victimHoldPoint, finisherMonsterPose, sitioFinisherStage } from '../combat/stageFinisher';

/** Camada cinematográfica limitada a pixels e curvas de frame; nenhuma partícula alocada por tick. */
export class StageFinisherPresentation {
  private readonly backdrop: Phaser.GameObjects.Graphics;
  private readonly effects: Phaser.GameObjects.Graphics;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor(scene: Phaser.Scene) {
    this.backdrop = scene.add.graphics().setDepth(-23.8).setName('finisher-atmosphere');
    this.effects = scene.add.graphics().setDepth(29).setName('finisher-cinematic-effects');
    this.frame = scene.add.graphics().setDepth(99).setName('finisher-cinematic-frame');
  }

  sync(arena: FinisherArena, tick: number | null, attacker: FighterSnapshot, victim: FighterSnapshot): void {
    this.backdrop.clear(); this.effects.clear(); this.frame.clear();
    if (tick === null) return;
    const fade = Math.min(1, tick / 24);
    this.frame.fillStyle(0x02040a, fade * 0.82).fillRect(0, 0, 640, 8).fillRect(0, 352, 640, 8);
    const color = arena === 'cozinha-macabra' ? 0xf5b36b : arena === 'sitio' ? 0xffd78a : 0x9ae4f2;
    this.backdrop.fillStyle(arena === 'sitio' ? 0x241608 : 0x081021, fade * 0.1).fillRect(0, 0, 640, 360);
    for (let edge = 0; edge < 4; edge++) this.backdrop.fillStyle(0x030408, fade * (4 - edge) * 0.025)
      .fillRect(edge * 12, 0, 12, 360).fillRect(628 - edge * 12, 0, 12, 360);
    const impact = arena === 'cozinha-macabra' ? KITCHEN_DROP : arena === 'sitio' ? SITIO_IMPALE : FINISH_SPLASH;
    if (tick >= FINISH_THROW && tick < impact && !this.reduced) {
      for (let trail = 1; trail <= 7; trail++) {
        const past = Math.max(FINISH_THROW, tick - trail * 2);
        const pose = finisherVictimPose(arena, past, attacker.x, attacker.facing, attacker.id, victim.id);
        const point = victimHoldPoint(pose, victim.id, attacker.facing);
        this.effects.fillStyle(color, (8 - trail) * 0.055).fillRect(Math.round(point.x) - 2, Math.round(point.y), 3, 2);
      }
    }
    let x: number, y: number;
    if (arena === 'cozinha-macabra') { x = KITCHEN_POT_X; y = KITCHEN_POT_Y; }
    else if (arena === 'sitio') { const stage = sitioFinisherStage(tick, attacker.x); x = stage.tridentTipX; y = stage.tridentTipY; }
    else { const monster = finisherMonsterPose(tick, attacker.x, attacker.facing); x = monster.x; y = 258; }
    const age = tick - impact;
    if (age >= 0 && age < 36) {
      const p = age / 36;
      for (let particle = 0; particle < 24; particle++) {
        const angle = particle * 2.399;
        const spread = (10 + particle % 6 * 7) * p;
        this.effects.fillStyle(particle % 3 ? color : 0xf5eee0, (1 - p) * 0.75)
          .fillRect(Math.round(x + Math.cos(angle) * spread), Math.round(y + Math.sin(angle) * spread * 0.6 + p * p * 22), 2, 2);
      }
    }
    if (arena === 'cozinha-macabra' && age >= 0) {
      for (let puff = 0; puff < 12; puff++) {
        const p = ((age + puff * 11) % 84) / 84;
        this.effects.fillStyle(puff % 2 ? 0xe7c9a2 : 0x9c9988, (1 - p) * 0.22)
          .fillRect(Math.round(x - 24 + puff % 6 * 9 + Math.sin(p * 4 + puff) * 4), Math.round(y - 8 - p * 62), 3 + Math.round(p * 4), 3);
      }
    }
    if (arena === 'sitio' && tick >= 34 && tick < SHED_DOORS_CLOSE_END) {
      for (let mote = 0; mote < 10; mote++) {
        const p = ((tick + mote * 17) % 100) / 100;
        this.effects.fillStyle(0xe0ba78, Math.sin(p * Math.PI) * 0.25)
          .fillRect(288 + mote % 5 * 15, Math.round(224 - p * 90), 1, 2);
      }
    }
    const beats = arena === 'cais-da-cidade' ? [FINISH_BITE, FINISH_BITE + 24, FINISH_BITE + 51]
      : arena === 'sitio' ? [SITIO_IMPALE, SHED_DOORS_CLOSE_END] : [KITCHEN_DROP];
    if (!this.reduced) for (const beat of beats) {
      const pulse = tick - beat;
      if (pulse >= 0 && pulse < 8) this.frame.fillStyle(arena === 'cais-da-cidade' ? 0x6b1631 : 0xffd49b, (1 - pulse / 8) * 0.12).fillRect(0, 8, 640, 344);
    }
  }
}
