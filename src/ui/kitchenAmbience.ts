/** Animação decorativa: nunca lê ou modifica o estado determinístico da luta. */
export const KITCHEN_LAYOUT = {
  grill: { x: 139, y: 142 },
  ratLanes: [249, 262, 278],
  maxBats: 5,
  maxRats: 3,
} as const;

export interface KitchenActor {
  active: boolean;
  age: number;
  duration: number;
  x: number;
  y: number;
  startX: number;
  endX: number;
  lane: number;
  frame: number;
  phase: number;
}

const actor = (): KitchenActor => ({
  active: false, age: 0, duration: 1, x: 0, y: 0,
  startX: 0, endX: 0, lane: 0, frame: 0, phase: 0,
});

export class KitchenAmbience {
  readonly bats = Array.from({ length: KITCHEN_LAYOUT.maxBats }, actor);
  readonly rats = Array.from({ length: KITCHEN_LAYOUT.maxRats }, actor);
  elapsed = 0;
  batWaves = 0;
  ratSpawns = 0;
  private nextBats = 1800;
  private nextRat = 900;

  constructor(private readonly random: () => number = Math.random) {}

  update(delta: number): void {
    // Retomadas de aba não disparam uma enxurrada de eventos atrasados.
    if (!Number.isFinite(delta) || delta <= 0) return;
    const step = Math.min(delta, 100);
    this.elapsed += step;
    this.nextBats -= step;
    this.nextRat -= step;
    if (this.nextBats <= 0) {
      this.spawnBats();
      this.nextBats = this.between(8000, 14000);
    }
    if (this.nextRat <= 0) {
      this.spawnRat();
      this.nextRat = this.between(4000, 8500);
    }
    for (const bat of this.bats) {
      if (!bat.active) continue;
      bat.age += step;
      if (bat.age >= bat.duration) { bat.active = false; continue; }
      const progress = Math.max(0, bat.age) / bat.duration;
      bat.x = Math.round(bat.startX + (bat.endX - bat.startX) * progress);
      bat.y = Math.round(KITCHEN_LAYOUT.grill.y - Math.sin(progress * Math.PI / 2) * 46
        + Math.sin(progress * Math.PI * 5 + bat.phase) * 10 * Math.min(1, progress * 8));
      bat.frame = Math.floor(Math.max(0, bat.age) / 100) % 4;
    }
    for (const rat of this.rats) {
      if (!rat.active) continue;
      rat.age += step;
      if (rat.age >= rat.duration) { rat.active = false; continue; }
      rat.x = Math.round(rat.startX + (rat.endX - rat.startX) * rat.age / rat.duration);
      rat.y = rat.lane;
      rat.frame = Math.floor(rat.age / 110) % 4;
    }
  }

  private between(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  private spawnBats(): void {
    this.batWaves++;
    const count = 2 + Math.floor(this.random() * 4);
    for (let index = 0; index < count; index++) {
      const bat = this.bats.find(candidate => !candidate.active);
      if (!bat) break;
      Object.assign(bat, {
        active: true, age: -index * 180, duration: this.between(4600, 7200),
        x: KITCHEN_LAYOUT.grill.x, y: KITCHEN_LAYOUT.grill.y,
        startX: KITCHEN_LAYOUT.grill.x, endX: this.random() < 0.2 ? -28 : 668,
        phase: this.between(0, Math.PI * 2), frame: 0,
      });
    }
  }

  private spawnRat(): void {
    const rat = this.rats.find(candidate => !candidate.active);
    if (!rat) return;
    this.ratSpawns++;
    const right = this.random() < 0.5;
    const lane = KITCHEN_LAYOUT.ratLanes[Math.floor(this.random() * KITCHEN_LAYOUT.ratLanes.length)]!;
    Object.assign(rat, {
      active: true, age: 0, duration: this.between(6500, 10000),
      startX: right ? -30 : 670, endX: right ? 670 : -30,
      x: right ? -30 : 670, y: lane, lane, frame: 0,
    });
  }
}
