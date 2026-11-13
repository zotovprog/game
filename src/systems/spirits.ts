// Духи: стоят за границей света, крадутся со спины, заходят в круг, когда он мал.
// Их почти не видно: только провал в свете и лицо, которое всплывает на секунду.
import { Scene } from 'three';
import { clamp, damp, mulberry32, smooth } from '../core/rng';
import { Style } from '../data/styles';
import { T } from '../data/tuning';
import { Spirit } from '../view/spirit';
import { Grid } from '../world/grid';

export type SpiritKind = 'shade' | 'efim' | 'vera' | 'self';
interface Sp {
  view: Spirit; kind: SpiritKind; x: number; z: number; ang: number; orbit: number; off: number;
  state: 'lurk' | 'gone' | 'lunge' | 'still'; timer: number; stuck: number; seed: number;
}
export interface SafeLight { x: number; z: number; r: number }
export interface SpiritWorld {
  px: number; pz: number; fx: number; fz: number;     // герой и куда он смотрит
  radius: number; wick: number; ember: boolean; active: boolean;
  safe: SafeLight[];
}

export class SpiritSystem {
  readonly list: Sp[] = [];
  private rng = mulberry32(99);
  /** 0..1 — как близко ближайший дух (для звука и давления) */
  nearness = 0;
  nearestAngle = 0;

  constructor(private scene: Scene, private style: Style, private grid: Grid) {}

  private make(kind: SpiritKind): Sp {
    const seed = this.rng();
    const view = new Spirit(this.style, seed, kind === 'shade' ? 1.05 + this.rng() * 0.2 : 1.0);
    this.scene.add(view.group);
    view.alpha = 0;
    const sp: Sp = { view, kind, x: 0, z: 0, ang: this.rng() * 6.283, orbit: this.rng() < 0.5 ? -1 : 1, off: this.rng() * 1.2, state: 'gone', timer: this.rng() * 2, stuck: 0, seed };
    this.list.push(sp);
    return sp;
  }

  setCount(n: number): void {
    let have = this.list.filter((s) => s.kind === 'shade').length;
    while (have < n) { this.make('shade'); have++; }
  }

  /** Неподвижный дух-памятник (твой след). */
  placeStill(kind: SpiritKind, x: number, z: number): void {
    const sp = this.make(kind);
    sp.state = 'still'; sp.x = x; sp.z = z;
  }

  /** Вернувшийся: тот, кого ты бросил. Обычный свет его не держит. */
  spawnNamed(kind: 'efim' | 'vera', w: SpiritWorld): void {
    const sp = this.make(kind);
    sp.ang = Math.atan2(-w.fz, -w.fx);            // появляется за спиной
    sp.x = w.px + Math.cos(sp.ang) * (w.radius + 2); sp.z = w.pz + Math.sin(sp.ang) * (w.radius + 2);
    sp.state = 'lurk'; sp.timer = 0;
  }

  /** Бросок из темноты: лицо летит на героя и сгорает у самого света. */
  lunge(x: number, z: number): void {
    const sp = this.list.find((s) => s.kind === 'shade' && s.state !== 'lunge') ?? this.make('shade');
    sp.x = x; sp.z = z; sp.state = 'lunge'; sp.timer = 0; sp.view.burn = 0; sp.view.alpha = 1;
  }

  /** Все обычные духи шарахаются прочь (вспыхнул огонь). */
  scatter(): void {
    for (const sp of this.list) if (sp.kind === 'shade' && sp.state === 'lurk') sp.view.burn = Math.max(sp.view.burn, 0.6);
  }

  private pickAngle(sp: Sp, w: SpiritWorld, D: number): void {
    const back = Math.atan2(-w.fz, -w.fx);
    let best = sp.ang, bestScore = -1e9;
    for (let k = 0; k < 14; k++) {
      const a = this.rng() * 6.283;
      const x = w.px + Math.cos(a) * D, z = w.pz + Math.sin(a) * D;
      if (!this.grid.isFloor(x, z)) continue;
      let score = Math.cos(a - back) * 1.2 + this.rng();           // со спины — лучше
      for (const o of this.list) if (o !== sp && o.state === 'lurk') score -= Math.max(0, 1.5 - Math.abs(Math.atan2(Math.sin(a - o.ang), Math.cos(a - o.ang))));
      if (score > bestScore) { bestScore = score; best = a; }
    }
    sp.ang = best;
  }

  /** Возвращает духа, который дотянулся до героя, если такой есть. */
  update(dt: number, t: number, w: SpiritWorld): Sp | null {
    const S = T.spirits;
    let touched: Sp | null = null;
    let near = 0;
    for (const sp of this.list) {
      const v = sp.view;
      const dx = sp.x - w.px, dz = sp.z - w.pz;
      const dist = Math.hypot(dx, dz);

      if (sp.state === 'still') {
        v.group.position.set(sp.x, 0, sp.z);
        v.group.rotation.y = Math.atan2(w.px - sp.x, w.pz - sp.z);
        v.alpha = damp(v.alpha, dist < w.radius + 5 ? 0.9 : 0.3, 2, dt);
        v.face = 1; v.burn = 0; v.update(t);
        continue;
      }
      if (sp.state === 'lunge') {
        sp.timer += dt;
        if (dist > 1.0 && v.burn < 0.05) { sp.x -= (dx / dist) * 11 * dt; sp.z -= (dz / dist) * 11 * dt; }
        else v.burn = Math.min(1, v.burn + dt * 2.2);
        v.face = 1; v.alpha = 1; v.agitation = 1;
        if (v.burn >= 1) { sp.state = 'gone'; sp.timer = S.respawn; v.alpha = 0; }
        v.group.position.set(sp.x, 0, sp.z);
        v.group.rotation.y = Math.atan2(w.px - sp.x, w.pz - sp.z);
        v.update(t);
        near = 1;
        continue;
      }
      if (!w.active) { v.alpha = damp(v.alpha, 0, 3, dt); v.update(t); continue; }

      // желанная дистанция: за границей света; при малом круге — внутри него
      const named = sp.kind !== 'shade';
      let D = w.radius + S.margin + sp.off * 0.6 - Math.max(0, S.boldRadius - w.radius) * S.boldDepth;
      if (named && w.wick < 0.8) D = Math.min(D, w.radius * 0.45);
      if (w.ember) D = 0.2;
      D = Math.max(0.2, D);

      if (sp.state === 'gone') {
        sp.timer -= dt;
        v.alpha = 0;
        if (sp.timer <= 0) {
          this.pickAngle(sp, w, D + 3);
          sp.x = w.px + Math.cos(sp.ang) * (D + 3.5); sp.z = w.pz + Math.sin(sp.ang) * (D + 3.5);
          sp.state = 'lurk'; v.burn = 0; sp.stuck = 0;
        }
        v.update(t);
        continue;
      }

      // цель на окружности вокруг героя
      sp.ang += sp.orbit * 0.12 * dt;
      let tx = w.px + Math.cos(sp.ang) * D, tz = w.pz + Math.sin(sp.ang) * D;
      const targetOk = this.grid.isFloor(tx, tz);
      sp.stuck = targetOk ? Math.max(0, sp.stuck - dt) : sp.stuck + dt;
      if (sp.stuck > 1.2) { this.pickAngle(sp, w, D); sp.stuck = 0; tx = w.px + Math.cos(sp.ang) * D; tz = w.pz + Math.sin(sp.ang) * D; }

      // свет жжёт: если дух оказался глубже, чем осмеливается, или у живого огня
      let burning = dist < D - 0.5 && !w.ember;
      let ax = 0, az = 0;
      for (const s of w.safe) {
        const sx = sp.x - s.x, sz = sp.z - s.z, sd = Math.hypot(sx, sz);
        if (sd < s.r) { burning = true; ax += sx / (sd || 1); az += sz / (sd || 1); }
      }
      if (burning) {
        v.burn = Math.min(1, v.burn + dt * S.burnRate);
        const l = dist || 1;
        sp.x += ((dx / l) + ax) * S.fleeSpeed * dt; sp.z += ((dz / l) + az) * S.fleeSpeed * dt;
        if (v.burn >= 1) { sp.state = 'gone'; sp.timer = S.respawn * (0.6 + this.rng()); }
      } else {
        v.burn = Math.max(0, v.burn - dt * 0.8);
        const behind = (dx * w.fx + dz * w.fz) / (dist || 1) < -0.15;
        const sp0 = (w.ember ? 2.4 : behind ? S.backSpeed : S.speed) * (named ? 1.25 : 1);
        const mx = tx - sp.x, mz = tz - sp.z, ml = Math.hypot(mx, mz);
        if (ml > 0.05) { const st = Math.min(ml, sp0 * dt); sp.x += (mx / ml) * st; sp.z += (mz / ml) * st; }
      }

      const inRock = !this.grid.isFloor(sp.x, sp.z);
      v.alpha = damp(v.alpha, inRock ? 0 : named ? 0.95 : 0.7, 3, dt);
      // лицо всплывает редко; вблизи и у вернувшихся — всегда
      const surf = smooth(0.62, 0.9, Math.sin(t * 0.33 + sp.seed * 40) * 0.5 + 0.5);
      const close = 1 - smooth(w.radius - 0.5, w.radius + 1.2, dist);
      v.face = named ? 1 : clamp(Math.max(surf * 0.8, close), 0, 1);
      v.agitation = damp(v.agitation, w.ember || w.radius < 2.6 ? 1 : 0, 2, dt);
      v.group.position.set(sp.x, 0, sp.z);
      v.group.rotation.y = Math.atan2(w.px - sp.x, w.pz - sp.z);
      v.update(t);

      if (!inRock) {
        const n = 1 - smooth(1.0, 7, dist);
        if (n > near) { near = n; this.nearestAngle = Math.atan2(dz, dx); }
        if (dist < S.touch && v.burn < 0.3) touched = sp;
      }
    }
    this.nearness = damp(this.nearness, near, 4, dt);
    return touched;
  }

  /** Дух насытился или сгорел: исчезает и вернётся позже. */
  dismiss(sp: Sp): void {
    if (sp.kind !== 'shade') { sp.state = 'gone'; sp.timer = 14; sp.view.alpha = 0; return; }
    sp.state = 'gone'; sp.timer = T.spirits.respawn; sp.view.alpha = 0;
  }
}
