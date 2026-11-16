// Живая тьма. Она — одно существо без лица: стоит стеной дыма за краем света и тянется к лампе
// языками. «Охотники» — невидимые точки её внимания: по ним строятся языки (см. view/volume.ts),
// они же решают, когда тьма дотянулась до героя. Картинок в темноте нет — только дым и звук.
import { clamp, damp, mulberry32, smooth } from '../core/rng';
import { T } from '../data/tuning';
import { darkU, TEND_MAX } from '../view/darkness';
import { Grid } from '../world/grid';

export type DarkKind = 'shade' | 'efim' | 'vera' | 'family';
export type DarkSound = 'moan' | 'click' | 'breath' | 'knock' | 'cry' | 'scrape' | 'hiss' | 'sizzle';
export interface Hunter {
  kind: DarkKind; x: number; z: number; ang: number; orbit: number; off: number;
  state: 'lurk' | 'gone' | 'windup' | 'lunge'; timer: number; stuck: number; seed: number;
  alpha: number; burn: number; probe: number; probeT: number;
  cool: number;                     // сколько секунд до следующего броска
  fake: boolean;                    // срежиссированный бросок: пугает, но не кусает
  run: number;                      // сколько метров уже пролетел бросок
}
export interface SafeLight { x: number; z: number; r: number }
export interface DarkWorld {
  px: number; pz: number; fx: number; fz: number;     // герой и куда он смотрит
  rx: number; rz: number;                             // «вправо» на экране — для панорамы звука
  radius: number; wick: number; ember: boolean; active: boolean;
  dread: number;                                      // 0..1 — насколько тьма осмелела
  repel: boolean;                                     // свет сейчас достаточно ярок, чтобы сжечь бросок
  block: boolean;                                     // лампа прикрыта ладонью: бросок бьётся о руку и не достаёт масла
  safe: SafeLight[];
}

export class Darkness {
  readonly hunters: Hunter[] = [];
  private rng = mulberry32(99);
  private soundT = 4;
  /** Языки, которые задаёт игра на один кадр (тьма тащит отставшего): x, z, ширина, сила. */
  readonly extra: { x: number; z: number; w: number; s: number }[] = [];
  /** 0..1 — как близко ближайший язык тьмы (для звука и давления) */
  nearness = 0;
  nearestAngle = 0;
  /** сколько бросков за этот кадр разбилось о ладонь */
  blocked = 0;
  /** Тьма подаёт голос: тип, панорама −1..1, громкость 0..1 */
  onSound: (s: DarkSound, pan: number, vol: number) => void = () => {};

  constructor(private grid: Grid) {}

  private make(kind: DarkKind): Hunter {
    const seed = this.rng();
    const h: Hunter = { kind, x: 0, z: 0, ang: this.rng() * 6.283, orbit: this.rng() < 0.5 ? -1 : 1, off: this.rng() * 1.2, state: 'gone', timer: this.rng() * 2, stuck: 0, seed, alpha: 0, burn: 0, probe: 0, probeT: 3 + this.rng() * 6, cool: 6 + this.rng() * 8, fake: false, run: 0 };
    this.hunters.push(h);
    return h;
  }

  get count(): number { return this.hunters.filter((s) => s.kind === 'shade').length; }
  setCount(n: number): void { for (let have = this.count; have < n; have++) this.make('shade'); }

  /** Вернувшийся: тот, кого ты бросил. Обычный свет его не держит. */
  spawnNamed(kind: DarkKind, w: DarkWorld): void {
    const h = this.make(kind);
    h.ang = Math.atan2(-w.fz, -w.fx);            // подступает со спины
    h.x = w.px + Math.cos(h.ang) * (w.radius + 2); h.z = w.pz + Math.sin(h.ang) * (w.radius + 2);
    h.state = 'lurk'; h.timer = 0;
  }

  /** Бросок: язык тьмы выстреливает из черноты к герою и сгорает у самой лампы. */
  lunge(x: number, z: number): void {
    const h = this.hunters.find((s) => s.kind === 'shade' && s.state !== 'lunge') ?? this.make('shade');
    h.x = x; h.z = z; h.state = 'lunge'; h.timer = 0; h.burn = 0; h.alpha = 1; h.fake = true; h.run = 0;
  }

  /** Вспыхнул огонь: тьма отшатывается. */
  scatter(): void {
    for (const h of this.hunters) if (h.kind === 'shade' && h.state === 'lurk') h.burn = Math.max(h.burn, 0.6);
  }

  /** Насытился или сгорел: исчезает и вернётся позже. */
  dismiss(h: Hunter): void {
    h.state = 'gone'; h.timer = h.kind === 'shade' ? T.spirits.respawn : 14; h.alpha = 0;
  }

  /** Пауза до следующего броска: от lungeSlow в начале до lungeFast на глубине. */
  private cooldown(dread: number, named: boolean): number {
    return (T.dread.lungeSlow + (T.dread.lungeFast - T.dread.lungeSlow) * dread) * (0.7 + this.rng() * 0.6) * (named ? 0.6 : 1);
  }

  private pickAngle(h: Hunter, w: DarkWorld, D: number): void {
    const back = Math.atan2(-w.fz, -w.fx);
    let best = h.ang, bestScore = -1e9;
    for (let k = 0; k < 14; k++) {
      const a = this.rng() * 6.283;
      if (!this.grid.isFloor(w.px + Math.cos(a) * D, w.pz + Math.sin(a) * D)) continue;
      let score = Math.cos(a - back) * 1.2 + this.rng();           // со спины — лучше
      for (const o of this.hunters) if (o !== h && o.state === 'lurk') score -= Math.max(0, 1.5 - Math.abs(Math.atan2(Math.sin(a - o.ang), Math.cos(a - o.ang))));
      if (score > bestScore) { bestScore = score; best = a; }
    }
    h.ang = best;
  }

  /** Возвращает язык тьмы, который дотянулся до героя, если такой есть. */
  update(dt: number, w: DarkWorld): Hunter | null {
    const S = T.spirits;
    this.blocked = 0;
    let touched: Hunter | null = null;
    let near = 0, tn = 0;
    const tend = darkU.uTendrils.value;
    for (const e of this.extra) if (tn < TEND_MAX) tend[tn++].set(e.x, e.z, e.w, e.s);
    this.extra.length = 0;

    for (const h of this.hunters) {
      const dx = h.x - w.px, dz = h.z - w.pz;
      const dist = Math.hypot(dx, dz);
      const named = h.kind !== 'shade';

      if (h.state === 'windup') {
        // слышно и видно, что она сейчас бросится: язык набухает у самой границы света
        h.timer += dt;
        const k = Math.min(1, h.timer / T.dread.windup);
        const reach = Math.max(1.2, Math.min(dist, w.radius * (1.0 - 0.3 * k)));
        if (tn < TEND_MAX && dist > 0.01) tend[tn++].set(w.px + (dx / dist) * reach, w.pz + (dz / dist) * reach, 1.4 + k * 1.2, 1);
        near = Math.max(near, 0.6 + 0.4 * k);
        this.nearestAngle = Math.atan2(dz, dx);
        if (h.timer >= T.dread.windup) { h.state = 'lunge'; h.timer = 0; h.burn = 0; h.fake = false; h.run = 0; }
        continue;
      }
      if (h.state === 'lunge') {
        h.timer += dt;
        const step = T.dread.lungeSpeed * (h.fake ? 1.3 : 1) * dt;
        if (dist > 1.0 && h.burn < 0.05) { h.x -= (dx / dist) * step; h.z -= (dz / dist) * step; h.run += step; }
        else if (h.burn < 0.05 && !h.fake) {
          // дотянулась: яркий свет сжигает бросок, тусклый — она отпивает масло
          if (w.repel) { h.burn = 0.06; this.onSound('sizzle', 0, 1); }
          else if (w.block) { h.burn = 0.06; this.blocked++; this.onSound('knock', 0, 1); }
          else { touched = h; h.state = 'gone'; h.timer = S.respawn; h.alpha = 0; h.cool = this.cooldown(w.dread, named); continue; }
        }
        if (h.burn >= 0.05 || h.fake && dist <= 1.0 || h.run > T.dread.lungeReach) h.burn = Math.min(1, Math.max(h.burn, 0.05) + dt * 2.0);
        if (tn < TEND_MAX) tend[tn++].set(h.x, h.z, 2.2, 1 - h.burn);
        if (h.burn >= 1) { h.state = 'gone'; h.timer = S.respawn * (h.fake ? 1 : 1.6); h.alpha = 0; h.cool = this.cooldown(w.dread, named); }
        near = 1;
        continue;
      }
      if (!w.active) { h.alpha = damp(h.alpha, 0, 3, dt); continue; }

      // желанная дистанция: за границей света; при малом круге — внутри него
      let D = w.radius + S.margin + h.off * 0.6 - Math.max(0, S.boldRadius - w.radius) * S.boldDepth;
      if (named && w.wick < 0.8) D = Math.min(D, w.radius * 0.45);
      if (w.ember) D = 0.2;
      D = Math.max(0.2, D);

      if (h.state === 'gone') {
        h.timer -= dt; h.alpha = 0;
        if (h.timer <= 0) {
          this.pickAngle(h, w, D + 3);
          h.x = w.px + Math.cos(h.ang) * (D + 3.5); h.z = w.pz + Math.sin(h.ang) * (D + 3.5);
          h.state = 'lurk'; h.burn = 0; h.stuck = 0;
        }
        continue;
      }

      h.ang += h.orbit * 0.12 * dt;
      let tx = w.px + Math.cos(h.ang) * D, tz = w.pz + Math.sin(h.ang) * D;
      const ok = this.grid.isFloor(tx, tz);
      h.stuck = ok ? Math.max(0, h.stuck - dt) : h.stuck + dt;
      if (h.stuck > 1.2) { this.pickAngle(h, w, D); h.stuck = 0; tx = w.px + Math.cos(h.ang) * D; tz = w.pz + Math.sin(h.ang) * D; }

      // свет жжёт: если язык зашёл глубже, чем осмеливается, или к живому огню
      let burning = dist < D - 0.5 && !w.ember;
      let ax = 0, az = 0;
      for (const s of w.safe) {
        const sx = h.x - s.x, sz = h.z - s.z, sd = Math.hypot(sx, sz);
        if (sd < s.r) { burning = true; ax += sx / (sd || 1); az += sz / (sd || 1); }
      }
      if (burning) {
        h.burn = Math.min(1, h.burn + dt * S.burnRate);
        const l = dist || 1;
        h.x += ((dx / l) + ax) * S.fleeSpeed * dt; h.z += ((dz / l) + az) * S.fleeSpeed * dt;
        if (h.burn >= 1) { h.state = 'gone'; h.timer = S.respawn * (0.6 + this.rng()); }
      } else {
        h.burn = Math.max(0, h.burn - dt * 0.8);
        const behind = (dx * w.fx + dz * w.fz) / (dist || 1) < -0.15;
        const sp = (w.ember ? 2.4 : behind ? S.backSpeed : S.speed) * (named ? 1.25 : 1);
        const mx = tx - h.x, mz = tz - h.z, ml = Math.hypot(mx, mz);
        if (ml > 0.05) { const st = Math.min(ml, sp * dt); h.x += (mx / ml) * st; h.z += (mz / ml) * st; }
      }

      // язык тьмы время от времени пробует свет на вкус; при малом круге — почти не убирается
      h.probeT -= dt * (1 + 2 * smooth(4.5, 2.2, w.radius));
      if (h.probeT <= 0) h.probeT = 6 + this.rng() * 9;
      h.probe = damp(h.probe, h.probeT < 3.4 ? 1 : 0, 1.4, dt);

      const inRock = !this.grid.isFloor(h.x, h.z);
      h.alpha = damp(h.alpha, inRock ? 0 : 1, 3, dt);
      // бросок: чем глубже и страшнее, тем чаще
      h.cool -= dt;
      if (h.cool <= 0 && !inRock && !burning && !w.ember && dist < w.radius + 4.5 && h.alpha > 0.6) {
        h.state = 'windup'; h.timer = 0;
        this.onSound('hiss', clamp((dx * w.rx + dz * w.rz) / 5, -1, 1), 1);
        continue;
      }
      const live = h.alpha * (1 - h.burn);
      const reach = Math.max(0.9, dist - h.probe * (named ? 2.6 : 2.1));
      if (tn < TEND_MAX && live > 0.05 && dist > 0.01) tend[tn++].set(w.px + (dx / dist) * reach, w.pz + (dz / dist) * reach, (named ? 1.5 : 1.0) + h.seed * 0.7, live);

      if (!inRock) {
        const n = 1 - smooth(1.0, 7, dist);
        if (n > near) { near = n; this.nearestAngle = Math.atan2(dz, dx); }
        if (dist < S.touch && h.burn < 0.3) touched = h;
      }
    }
    for (; tn < TEND_MAX; tn++) tend[tn].set(0, 0, 0, 0);

    // голоса тьмы: всегда из черноты, откуда-то сбоку
    this.soundT -= dt * (0.5 + 0.5 * near + (w.ember ? 1 : 0) + 0.5 * smooth(4.5, 2.2, w.radius));
    if (this.soundT <= 0 && w.active) {
      this.soundT = T.darkSound[0] + this.rng() * (T.darkSound[1] - T.darkSound[0]);          // редко: тишина пугает сильнее
      const a = this.rng() * 6.283, d = w.radius + 1.5 + this.rng() * 8;
      const side = Math.cos(a) * w.rx + Math.sin(a) * w.rz;
      const roll = this.rng();
      const kind: DarkSound = roll < 0.3 ? 'moan' : roll < 0.52 ? 'breath' : roll < 0.72 ? 'click' : roll < 0.86 ? 'knock' : roll < 0.95 ? 'scrape' : 'cry';
      this.onSound(kind, clamp(side * 1.2, -1, 1), clamp(1.3 - d / 14, 0.25, 1));
    }
    this.nearness = damp(this.nearness, near, 4, dt);
    return touched;
  }
}
