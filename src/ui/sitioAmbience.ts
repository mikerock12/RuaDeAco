/** Ecossistema visual local: não importa CombatWorld nem compartilha RNG com a luta. */
export type FarmSpecies = 'hen' | 'duck' | 'snake' | 'lizard';
export type FarmAction = 'walk' | 'lay' | 'eat' | 'challenge' | 'fight' | 'retreat';
export interface FarmAnimal {
  species: FarmSpecies;
  x: number;
  y: number;
  direction: -1 | 1;
  action: FarmAction;
  timer: number;
  layIn: number;
  laid: boolean;
  targetEgg: number | null;
  frame: number;
}
export interface FarmEgg {
  active: boolean;
  x: number;
  y: number;
  age: number;
  eater: 'snake' | 'lizard';
}
const animal = (species: FarmSpecies, x: number, y: number, direction: -1 | 1, layIn = 0): FarmAnimal => ({
  species, x, y, direction, action: 'walk', timer: 0, layIn, laid: false, targetEgg: null, frame: 0,
});
const SPEED: Record<FarmSpecies, number> = { hen: 18, duck: 23, snake: 36, lizard: 43 };
const approach = (value: number, target: number, step: number) =>
  value + Math.sign(target - value) * Math.min(Math.abs(target - value), step);

export class SitioAmbience {
  // Presença garantida: nenhum sorteio pode deixar uma espécie fora da arena.
  readonly animals = [
    animal('hen', 180, 259, 1, 2000),
    animal('hen', 458, 277, -1, 8000),
    animal('duck', 56, 246, 1),
    animal('duck', 598, 246, -1),
    animal('snake', 44, 273, 1),
    animal('lizard', 590, 281, -1),
  ];
  readonly eggs: FarmEgg[] = Array.from({ length: 6 }, () => ({
    active: false, x: 0, y: 0, age: 0, eater: 'snake',
  }));
  elapsed = 0;
  eggsLaid = 0;
  eggsEaten = { snake: 0, lizard: 0 };
  fights = 0;
  private nextFight = 18000;
  private meeting: { x: number; y: number } | null = null;

  constructor(private readonly random: () => number = Math.random) {}

  update(delta: number): void {
    if (!Number.isFinite(delta) || delta <= 0) return;
    const step = Math.min(delta, 100);
    const seconds = step / 1000;
    this.elapsed += step;
    this.nextFight -= step;
    for (const egg of this.eggs) {
      if (!egg.active) continue;
      egg.age += step;
      if (egg.age > 60000) egg.active = false;
    }
    const snake = this.animals[4]!;
    const lizard = this.animals[5]!;
    if (this.nextFight <= 0 && !this.meeting && snake.action === 'walk' && lizard.action === 'walk') {
      this.meeting = { x: Math.max(140, Math.min(500, (snake.x + lizard.x) / 2)), y: 267 };
      for (const rival of [snake, lizard]) {
        rival.action = 'challenge';
        rival.targetEgg = null;
      }
    }

    for (const actor of this.animals) {
      actor.timer += step;
      if (actor.action === 'lay') {
        actor.frame = 3;
        if (!actor.laid && actor.timer >= 450) {
          const egg = this.eggs.find(candidate => !candidate.active);
          if (egg) {
            Object.assign(egg, {
              active: true, x: actor.x - actor.direction * 9, y: actor.y, age: 0,
              eater: this.eggsLaid % 2 === 0 ? 'snake' : 'lizard',
            });
            this.eggsLaid++;
          }
          actor.laid = true;
        }
        if (actor.timer >= 1150) this.walk(actor);
        continue;
      }
      if (actor.action === 'fight') {
        actor.frame = 3;
        if (actor.timer >= 1350) {
          actor.action = 'retreat';
          actor.timer = 0;
          actor.direction = actor === snake ? -1 : 1;
        }
        continue;
      }
      if (actor.action === 'eat') {
        actor.frame = Math.floor(actor.timer / 180) % 3;
        if (actor.timer >= 1100) this.walk(actor);
        continue;
      }
      if (actor.action === 'retreat') {
        actor.x += actor.direction * SPEED[actor.species] * seconds;
        actor.frame = Math.floor(actor.timer / 130) % 3;
        if (actor.timer >= 1400) this.walk(actor);
        continue;
      }
      if (actor.action === 'challenge' && this.meeting) {
        const targetX = this.meeting.x + (actor === snake ? -15 : 15);
        actor.direction = actor === snake ? 1 : -1;
        actor.x = approach(actor.x, targetX, SPEED[actor.species] * seconds);
        actor.y = approach(actor.y, this.meeting.y, 32 * seconds);
      } else if (actor.species === 'snake' || actor.species === 'lizard') {
        // Alternar a preferência garante que os dois predadores comam, mesmo com velocidades diferentes.
        let egg = actor.targetEgg === null ? undefined : this.eggs[actor.targetEgg];
        if (!egg?.active || egg.eater !== actor.species) {
          actor.targetEgg = this.eggs.findIndex(candidate => candidate.active && candidate.eater === actor.species);
          if (actor.targetEgg < 0) actor.targetEgg = null;
          egg = actor.targetEgg === null ? undefined : this.eggs[actor.targetEgg];
        }
        if (egg) {
          actor.direction = egg.x >= actor.x ? 1 : -1;
          actor.x = approach(actor.x, egg.x - actor.direction * 18, SPEED[actor.species] * seconds);
          actor.y = approach(actor.y, egg.y, 32 * seconds);
          if (Math.abs(egg.x - actor.x) <= 20 && Math.abs(egg.y - actor.y) < 3) {
            egg.active = false;
            this.eggsEaten[actor.species]++;
            actor.targetEgg = null;
            actor.action = 'eat';
            actor.timer = 0;
          }
        } else this.patrol(actor, seconds);
      } else {
        this.patrol(actor, seconds);
        if (actor.species === 'hen') {
          actor.layIn -= step;
          if (actor.layIn <= 0) {
            actor.action = 'lay';
            actor.timer = 0;
            actor.laid = false;
            actor.layIn = 12000 + this.random() * 8000;
          }
        }
      }
      actor.frame = Math.floor(this.elapsed / (actor.species === 'duck' ? 155 : 130)) % (actor.species === 'duck' ? 4 : 3);
    }

    if (this.meeting && snake.action === 'challenge' && lizard.action === 'challenge'
      && Math.abs(snake.x - (this.meeting.x - 15)) < 1
      && Math.abs(lizard.x - (this.meeting.x + 15)) < 1
      && Math.abs(snake.y - this.meeting.y) < 1 && Math.abs(lizard.y - this.meeting.y) < 1) {
      for (const rival of [snake, lizard]) {
        rival.action = 'fight'; rival.timer = 0; rival.frame = 3;
      }
      this.fights++;
      this.meeting = null;
      this.nextFight = 22000 + this.random() * 14000;
    }
  }

  private walk(actor: FarmAnimal): void {
    actor.action = 'walk'; actor.timer = 0; actor.targetEgg = null;
  }

  private patrol(actor: FarmAnimal, seconds: number): void {
    actor.x += actor.direction * SPEED[actor.species] * seconds;
    if (actor.x >= 620) { actor.x = 620; actor.direction = -1; }
    if (actor.x <= 20) { actor.x = 20; actor.direction = 1; }
  }
}
