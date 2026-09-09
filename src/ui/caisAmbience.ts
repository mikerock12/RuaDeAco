import { CAIS_STAGE_LAYOUT } from './stagePresentation';

export type CaisEvent = 'ufo-pass' | 'ufo-close' | 'witch' | 'monster' | 'pirate-battle';
export const CAIS_EVENT_DURATIONS: Readonly<Record<CaisEvent, number>> = {
  'ufo-pass': 20000, 'ufo-close': 20000, witch: 22000, monster: 22000, 'pirate-battle': 42000,
};
export const CAIS_EVENTS: readonly CaisEvent[] = ['ufo-pass', 'ufo-close', 'witch', 'monster', 'pirate-battle'];
export interface CaisActorPose {
  visible: boolean; x: number; y: number; scale: number; alpha: number; frame: number; direction: -1 | 1;
}
const pose = (): CaisActorPose => ({ visible: false, x: 0, y: 0, scale: 1, alpha: 1, frame: 0, direction: 1 });
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Um diretor decorativo local; não usa relógio, eventos ou sorteio do combate. */
export class CaisAmbience {
  readonly ufo = pose();
  readonly witch = pose();
  readonly monster = pose();
  readonly ship = pose();
  readonly cannonball = pose();
  readonly actors = [this.ufo, this.witch, this.monster, this.ship, this.cannonball];
  readonly counts: Record<CaisEvent, number> = { 'ufo-pass': 0, 'ufo-close': 0, witch: 0, monster: 0, 'pirate-battle': 0 };
  elapsed = 0;
  event: CaisEvent | null = null;
  eventTime = 0;
  phase = 'quiet';
  idleRemaining: number;
  monsterReveal = 0;
  beamStrength = 0;
  fireStrength = 0;
  muzzleFlash = 0;
  impactStrength = 0;
  shots = 0;
  breaths = 0;
  completed = 0;
  private bag: CaisEvent[] = [];
  private lastEvent: CaisEvent | null = null;
  private direction: -1 | 1 = 1;
  private targetX = 320;
  private targetSlot = 0;

  constructor(private readonly random: () => number = Math.random) {
    this.idleRemaining = 6000 + this.roll() * 4000;
  }

  update(delta: number, playerOneX = 220, playerTwoX = 420): void {
    if (!Number.isFinite(delta) || delta <= 0) return;
    const step = Math.min(delta, 100);
    this.elapsed += step;
    if (!this.event) {
      this.idleRemaining -= step;
      if (this.idleRemaining > 0) return;
      this.start(playerOneX, playerTwoX);
    } else this.eventTime += step;
    const event = this.event!;
    if (this.eventTime >= CAIS_EVENT_DURATIONS[event]) {
      this.lastEvent = event;
      this.event = null;
      this.completed++;
      this.phase = 'quiet';
      this.idleRemaining = 9000 + this.roll() * 8000;
      this.hide();
      return;
    }
    this.hide();
    const t = this.eventTime;
    if (event === 'ufo-pass') {
      const p = t / CAIS_EVENT_DURATIONS[event];
      Object.assign(this.ufo, { visible: true, x: this.travel(-60, 700, p),
        y: CAIS_STAGE_LAYOUT.moon.y + Math.sin(p * Math.PI * 2) * 4, scale: 0.3, alpha: 0.9 });
      this.phase = 'behind-moon';
    } else if (event === 'ufo-close') {
      const focus = this.targetSlot === 0 ? playerOneX : playerTwoX;
      if (t > 6000 && t < 13000 && Number.isFinite(focus)) {
        this.targetX += clamp(focus - this.targetX, -step * 0.012, step * 0.012);
        this.targetX = clamp(this.targetX, 90, 550);
      }
      const arrival = smooth(t / 6000), exit = smooth((t - 13000) / 7000);
      Object.assign(this.ufo, { visible: true,
        x: mix(this.direction === 1 ? -70 : 710, this.targetX, arrival),
        y: mix(mix(80, 142, arrival), -110, exit) + Math.sin(t / 1100) * 2,
        scale: mix(mix(0.3, 1, arrival), 0.14, exit), alpha: 1 - smooth((t - 18000) / 2000) });
      this.beamStrength = smooth((t - 5500) / 2500) * (1 - smooth((t - 13500) / 2000));
      this.phase = t < 6000 ? 'approaching' : t < 13000 ? 'abduction-hover' : 'ascending';
    } else if (event === 'witch') {
      const p = t / CAIS_EVENT_DURATIONS[event];
      Object.assign(this.witch, { visible: true, x: this.travel(-70, 710, p),
        y: CAIS_STAGE_LAYOUT.moon.y + 30 + Math.sin(p * Math.PI * 2) * 9,
        scale: 0.65, alpha: 0.9, direction: this.direction });
      this.phase = 'moon-flyby';
    } else {
      const battle = event === 'pirate-battle';
      const riseStart = battle ? 9000 : 0, sinkStart = battle ? 29000 : 16000;
      this.monsterReveal = smooth((t - riseStart) / 6000) * (1 - smooth((t - sinkStart) / 6000));
      const fireStart = battle ? 17000 : 9000, fireEnd = battle ? 20500 : 13000;
      this.fireStrength = smooth((t - fireStart) / 700) * (1 - smooth((t - fireEnd) / 900));
      if (t >= fireStart && t - step < fireStart) this.breaths++;
      Object.assign(this.monster, { visible: this.monsterReveal > 0, x: this.targetX, y: 251,
        scale: 0.9, direction: this.direction, frame: this.fireStrength > 0 ? 2 : t > fireStart - 1600 && t < fireEnd ? 1 : 0 });
      this.phase = t < riseStart ? 'ship-arriving' : t < riseStart + 6000 ? 'surfacing'
        : this.fireStrength > 0 ? 'fire-breath' : t >= sinkStart ? 'submerging' : 'watching';
      if (battle) {
        const arrive = smooth(t / 10000), leave = smooth((t - 31000) / 11000);
        const x = mix(mix(-150, 150, arrive), 790, leave);
        Object.assign(this.ship, { visible: true, x: this.direction === 1 ? x : 640 - x,
          y: 249 + Math.sin(t / 1700), scale: 0.9, direction: this.direction });
        for (const firedAt of [20000, 23500, 27000]) {
          if (t >= firedAt && t - step < firedAt) this.shots++;
          const age = t - firedAt;
          this.muzzleFlash = Math.max(this.muzzleFlash, age >= 0 && age < 220 ? 1 - age / 220 : 0);
          if (age >= 0 && age < 1600) {
            const p = age / 1600;
            Object.assign(this.cannonball, { visible: true,
              x: mix(this.ship.x + this.direction * 55, this.monster.x - this.direction * 7, p),
              y: mix(this.ship.y - 26, this.monster.y - 66, p) - Math.sin(p * Math.PI) * 20 });
            this.phase = 'cannon-shot';
          }
          if (age >= 1600 && age < 2350) {
            this.impactStrength = 1 - (age - 1600) / 750;
            this.monster.frame = 3;
            this.phase = 'monster-recoil';
          }
        }
      }
    }
  }

  private start(playerOneX: number, playerTwoX: number): void {
    if (!this.bag.length) {
      this.bag = [...CAIS_EVENTS];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.roll() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j]!, this.bag[i]!];
      }
      if (this.bag[this.bag.length - 1] === this.lastEvent) [this.bag[0], this.bag[this.bag.length - 1]] = [this.bag[this.bag.length - 1]!, this.bag[0]!];
    }
    this.event = this.bag.pop()!;
    this.counts[this.event]++;
    this.eventTime = 0;
    this.idleRemaining = 0;
    this.direction = this.roll() < 0.5 ? 1 : -1;
    this.targetSlot = this.roll() < 0.5 ? 0 : 1;
    const focus = this.targetSlot === 0 ? playerOneX : playerTwoX;
    this.targetX = this.event === 'ufo-close' ? clamp(Number.isFinite(focus) ? focus : 320, 90, 550)
      : this.event === 'pirate-battle' ? (this.direction === 1 ? 400 : 240) : 290 + this.roll() * 70;
  }

  private roll(): number { return clamp(this.random(), 0, 0.999999); }
  private travel(from: number, to: number, t: number): number {
    return this.direction === 1 ? mix(from, to, t) : mix(to, from, t);
  }
  private hide(): void {
    for (const actor of this.actors) actor.visible = false;
    this.monsterReveal = 0; this.beamStrength = 0; this.fireStrength = 0;
    this.muzzleFlash = 0; this.impactStrength = 0;
  }
}
