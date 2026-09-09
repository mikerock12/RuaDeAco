import type Phaser from 'phaser';
import { audioManager } from '../audio/AudioManager';
import type { FighterRuntime } from '../combat/FighterRuntime';
import { toWorldRect } from '../combat/geometry';
import type { CombatEvent } from '../types/combat';
import { contactPoint } from './contactPoint';

/** Presentation only: fixed pool, no particles, timers or changes to simulation. */
export class CombatFeedback {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly flash: Phaser.GameObjects.Rectangle;
  private readonly sparks = Array.from({ length: 6 }, () => ({ x: 0, y: 0, age: 200, block: false, heavy: false }));
  private readonly swings = [{ move: '', frame: -1, played: false }, { move: '', frame: -1, played: false }];
  private cursor = 0;
  private flashLife = 0;
  private lastImpact = -Infinity;
  private readonly reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor(private readonly scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(30).setName('combat-contact-sparks');
    this.flash = scene.add.rectangle(320, 180, 640, 360, 0xc9eeff, 0).setDepth(31).setName('combat-soft-flash');
  }

  event(event: CombatEvent, fighters: readonly FighterRuntime[]): void {
    if (event.type === 'hit' || event.type === 'blocked' || event.type === 'parry') {
      const attacker = event.attackerIndex !== undefined ? fighters[event.attackerIndex] : fighters.find(f => f.id === event.attacker);
      const defender = event.defenderIndex !== undefined ? fighters[event.defenderIndex] : fighters.find(f => f.id === event.defender);
      const move = attacker?.definition.moves[event.moveId ?? ''];
      const heavy = move?.state === 'heavyAttack' || move?.state === 'specialAttack' || !!event.isSuper;
      const block = event.type !== 'hit';
      audioManager.play(block ? 'block' : heavy ? 'hitHeavy' : 'hit');
      if (defender) {
        const hurt = defender.getEvaluatedHurtboxes().map(box => toWorldRect(box, defender));
        const hits = attacker?.getEvaluatedHitboxes().map(box => toWorldRect(box, attacker)) ?? [];
        const point = contactPoint(hits, hurt, { x: defender.x - defender.facing * 12, y: defender.y - 64 });
        Object.assign(this.sparks[this.cursor]!, point, { age: 0, block, heavy });
        this.cursor = (this.cursor + 1) % this.sparks.length;
      }
      if (!block && heavy) this.impact(60, 0.0018, 45);
    }
    if (event.type === 'special' && event.isSuper) this.impact(90, 0.002, 80);
    if (event.type === 'knockout') this.impact(110, 0.003, 100);
  }

  private impact(duration: number, intensity: number, flash: number): void {
    if (this.reducedMotion || this.scene.time.now - this.lastImpact < 180) return;
    this.lastImpact = this.scene.time.now;
    this.scene.cameras.main.shake(duration, intensity, false);
    this.flashLife = flash;
  }

  update(delta: number, fighters: readonly FighterRuntime[], paused: boolean): void {
    if (paused) return;
    fighters.forEach((fighter, index) => {
      const swing = this.swings[index]!;
      const move = fighter.currentMove;
      if (!move) { swing.move = ''; swing.played = false; return; }
      if (move.id !== swing.move || fighter.stateFrame < swing.frame) swing.played = false;
      swing.move = move.id;
      swing.frame = fighter.stateFrame;
      if (!swing.played && move.state !== 'specialAttack' && fighter.getActiveHitboxes().length > 0) {
        audioManager.play('swing');
        swing.played = true;
      }
    });
    this.graphics.clear();
    const elapsed = Math.min(delta, 50);
    this.flashLife = Math.max(0, this.flashLife - elapsed);
    this.flash.setFillStyle(0xc9eeff, this.flashLife / 100 * 0.1);
    for (const spark of this.sparks) {
      spark.age += elapsed;
      if (spark.age >= 180) continue;
      const progress = spark.age / 180;
      const radius = (spark.heavy ? 16 : 11) * (0.5 + progress);
      this.graphics.lineStyle(spark.block ? 2 : 1, spark.block ? 0x80e7ff : 0xffd269, 1 - progress);
      if (spark.block) this.graphics.strokeCircle(spark.x, spark.y, radius * 0.7);
      else for (let ray = 0; ray < 6; ray += 1) {
        const angle = ray * Math.PI / 3;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        this.graphics.lineBetween(spark.x + dx * radius * 0.3, spark.y + dy * radius * 0.3, spark.x + dx * radius, spark.y + dy * radius);
      }
      this.graphics.fillStyle(0xf5f9e5, (1 - progress) * 0.85);
      this.graphics.fillRect(spark.x - 2, spark.y - 2, 4, 4);
    }
  }
}
