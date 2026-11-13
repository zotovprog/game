// Живая тьма. Она — одно существо: ползёт в круг света языками, а те, кто в ней остался,
// — её лица. «Охотники» тянутся к лампе, «смотрящие» бродят в черноте, всплывают и тают.
import { Scene } from 'three';
import { clamp, damp, mulberry32, smooth } from '../core/rng';
import { Style } from '../data/styles';
import { T } from '../data/tuning';
import { darkU, TEND_MAX } from '../view/darkness';
import { Face } from '../view/faces';
import { Grid } from '../world/grid';

export type DarkKind = 'shade' | 'efim' | 'vera' | 'family' | 'self';
export type DarkSound = 'moan' | 'click' | 'breath' | 'knock' | 'cry' | 'scrape';
export interface Hunter {
  face: Face; kind: DarkKind; x: number; z: number; ang: number; orbit: number; off: number;
  state: 'lurk' | 'gone' | 'lunge' | 'still'; timer: number; stuck: number; seed: number;
  alpha: number; burn: number; probe: number; probeT: number;
}
interface Watcher { face: Face; x: number; z: number; h: number; vx: number; vz: number; life: number; span: number; peak: number; on: boolean }
export interface SafeLight { x: number; z: number; r: number }
export interface DarkWorld {
  px: number; pz: number; fx: number; fz: number;     // герой и куда он смотрит
  rx: number; rz: number;                             // «вправо» на экране — для панорамы звука
  radius: number; wick: number; ember: boolean; active: boolean;
  safe: SafeLight[];
}

const WATCHERS = 11;

export class Darkness {
  readonly hunters: Hunter[] = [];
  private watchers: Watcher[] = [];
  private rng = mulberry32(99);
  private soundT = 4;
  /** 0..1 — как близко ближайший охотник (для звука и давления) */
  nearness = 0;
  nearestAngle = 0;
  /** Тьма подаёт голос: тип, панорама −1..1, громкость 0..1 */
  onSound: (s: DarkSound, pan: number, vol: number) => void = () => {};

  constructor(private scene: Scene, private style: Style, private grid: Grid) {
    for (let i = 0; i < WATCHERS; i++) {
      const face = new Face(i, style.spiritFace, this.rng());
      scene.add(face.sprite);
      this.watchers.push({ face, x: 0, z: 0, h: 1.4, vx: 0, vz: 0, life: this.rng() * 6, span: 0, peak: 0, on: false });
    }
  }

  private make(kind: DarkKind): Hunter {
    const seed = this.rng();
    const face = new Face(Math.floor(seed * 97), this.style.spiritFace, seed);
    face.size = kind === 'shade' ? 0.75 + this.rng() * 0.35 : 1.15;
    this.scene.add(face.sprite);
    const h: Hunter = { face, kind, x: 0, z: 0, ang: this.rng() * 6.283, orbit: this.rng() < 0.5 ? -1 : 1, off: this.rng() * 1.2, state: 'gone', timer: this.rng() * 2, stuck: 0, seed, alpha: 0, burn: 0, probe: 0, probeT: 3 + this.rng() * 6 };
    this.hunters.push(h);
    return h;
  }

  get count(): number { return this.hunters.filter((s) => s.kind === 'shade').length; }
  setCount(n: number): void { for (let have = this.count; have < n; have++) this.make('shade'); }

  /** Неподвижное лицо-памятник (твой след). */
  placeStill(kind: DarkKind, x: number, z: number): void {
    const h = this.make(kind);
    h.state = 'still'; h.x = x; h.z = z;
  }

  /** Вернувшийся: тот, кого ты бросил. Обычный свет его не держит. */
  spawnNamed(kind: DarkKind, w: DarkWorld): void {
    const h = this.make(kind);
    h.ang = Math.atan2(-w.fz, -w.fx);            // появляется за спиной
    h.x = w.px + Math.cos(h.ang) * (w.radius + 2); h.z = w.pz + Math.sin(h.ang) * (w.radius + 2);
    h.state = 'lurk'; h.timer = 0;
  }

  /** Бросок из темноты: лицо летит на героя и сгорает у самого света. */
  lunge(x: number, z: number): void {
    const h = this.hunters.find((s) => s.kind === 'shade' && s.state !== 'lunge') ?? this.make('shade');
    h.x = x; h.z = z; h.state = 'lunge'; h.timer = 0; h.burn = 0; h.alpha = 1;
  }

  /** Вспыхнул огонь: тьма отшатывается. */
  scatter(): void {
    for (const h of this.hunters) if (h.kind === 'shade' && h.state === 'lurk') h.burn = Math.max(h.burn, 0.6);
    for (const w of this.watchers) w.life = Math.max(w.life, w.span - 0.6);
  }

  /** Насытился или сгорел: исчезает и вернётся позже. */
  dismiss(h: Hunter): void {
    h.state = 'gone'; h.timer = h.kind === 'shade' ? T.spirits.respawn : 14; h.alpha = 0;
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

  private respawnWatcher(wt: Watcher, w: DarkWorld): void {
    wt.on = false; wt.life = 0; wt.span = 1 + this.rng() * 2;         // пауза, если не нашлось места
    for (let k = 0; k < 8; k++) {
      const a = this.rng() * 6.283, far = this.rng();
      const d = w.radius + 1.6 + far * 8;
      const x = w.px + Math.cos(a) * d, z = w.pz + Math.sin(a) * d;
      if (!this.grid.isFloor(x, z)) continue;
      const huge = far > 0.55 && this.rng() < 0.1;
      wt.x = x; wt.z = z; wt.h = huge ? 2.6 : 0.8 + this.rng() * 1.5;
      wt.face.size = huge ? 2.6 + this.rng() : 0.5 + this.rng() * 0.6;
      const tang = a + Math.PI / 2, sp = (this.rng() - 0.5) * 0.9;
      wt.vx = Math.cos(tang) * sp; wt.vz = Math.sin(tang) * sp;
      wt.span = 4 + this.rng() * 8; wt.peak = huge ? 0.22 : 0.12 + this.rng() * 0.26; wt.on = true;
      return;
    }
  }

  /** Возвращает охотника, который дотянулся до героя, если такой есть. */
  update(dt: number, t: number, w: DarkWorld): Hunter | null {
    const S = T.spirits;
    let touched: Hunter | null = null;
    let near = 0, tn = 0;
    const tend = darkU.uTendrils.value;
    const pan = (x: number, z: number) => clamp(((x - w.px) * w.rx + (z - w.pz) * w.rz) / 6, -1, 1);

    for (const h of this.hunters) {
      const dx = h.x - w.px, dz = h.z - w.pz;
      const dist = Math.hypot(dx, dz);
      const named = h.kind !== 'shade';
      const place = (y: number) => h.face.sprite.position.set(h.x, y, h.z);

      if (h.state === 'still') {
        h.alpha = damp(h.alpha, dist < w.radius + 6 ? 0.55 : 0.15, 2, dt);
        place(1.6); h.face.set(t, h.alpha);
        continue;
      }
      if (h.state === 'lunge') {
        h.timer += dt;
        if (dist > 1.1 && h.burn < 0.05) { h.x -= (dx / dist) * 12 * dt; h.z -= (dz / dist) * 12 * dt; }
        else h.burn = Math.min(1, h.burn + dt * 2.4);
        h.face.size = 1.2 + Math.min(1.6, h.timer * 3);
        place(1.5); h.face.set(t, 1 - h.burn, 1);
        if (tn < TEND_MAX) tend[tn++].set(h.x, h.z, 1.8, 1 - h.burn);
        if (h.burn >= 1) { h.state = 'gone'; h.timer = S.respawn; h.alpha = 0; h.face.size = 0.9; h.face.set(t, 0); }
        near = 1;
        continue;
      }
      if (!w.active) { h.alpha = damp(h.alpha, 0, 3, dt); h.face.set(t, h.alpha * 0.4); continue; }

      // желанная дистанция: за границей света; при малом круге — внутри него
      let D = w.radius + S.margin + h.off * 0.6 - Math.max(0, S.boldRadius - w.radius) * S.boldDepth;
      if (named && w.wick < 0.8) D = Math.min(D, w.radius * 0.45);
      if (w.ember) D = 0.2;
      D = Math.max(0.2, D);

      if (h.state === 'gone') {
        h.timer -= dt; h.alpha = 0; h.face.set(t, 0);
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

      // язык тьмы время от времени пробует свет на вкус
      h.probeT -= dt;
      if (h.probeT <= 0) h.probeT = 6 + this.rng() * 9;
      h.probe = damp(h.probe, h.probeT < 3 ? 1 : 0, 1.6, dt);

      const inRock = !this.grid.isFloor(h.x, h.z);
      h.alpha = damp(h.alpha, inRock ? 0 : 1, 3, dt);
      const live = h.alpha * (1 - h.burn);
      const reach = Math.max(1.0, dist - h.probe * 1.9);
      if (tn < TEND_MAX && live > 0.05 && dist > 0.01) tend[tn++].set(w.px + (dx / dist) * reach, w.pz + (dz / dist) * reach, 1.0 + h.seed * 0.7, live);
      const surf = smooth(0.6, 0.9, Math.sin(t * 0.33 + h.seed * 40) * 0.5 + 0.5);
      const close = 1 - smooth(w.radius - 0.4, w.radius + 1.6, dist);
      place(1.25 + Math.sin(t * 0.8 + h.seed * 9) * 0.25);
      h.face.set(t, live * (named ? 0.75 : clamp(Math.max(surf * 0.3, close * 0.8), 0, 1)), close);

      if (!inRock) {
        const n = 1 - smooth(1.0, 7, dist);
        if (n > near) { near = n; this.nearestAngle = Math.atan2(dz, dx); }
        if (dist < S.touch && h.burn < 0.3) touched = h;
      }
    }
    for (; tn < TEND_MAX; tn++) tend[tn].set(0, 0, 0, 0);

    // смотрящие: бродят в черноте, проступают и тают; свет их стирает
    for (const wt of this.watchers) {
      wt.life += dt;
      if (!wt.on) { if (wt.life > wt.span && w.active) this.respawnWatcher(wt, w); wt.face.set(t, 0); continue; }
      wt.x += wt.vx * dt; wt.z += wt.vz * dt;
      const d = Math.hypot(wt.x - w.px, wt.z - w.pz);
      let lit = d < w.radius + 0.7 || d > w.radius + 13 || !w.active;
      for (const s of w.safe) if (Math.hypot(wt.x - s.x, wt.z - s.z) < s.r + 0.5) lit = true;
      if (lit && wt.life < wt.span - 0.5) wt.life = wt.span - 0.5;
      const env = smooth(0, 1.8, wt.life) * (1 - smooth(wt.span - 1.4, wt.span, wt.life));
      wt.face.sprite.position.set(wt.x, wt.h, wt.z);
      wt.face.set(t, env * wt.peak);
      if (wt.life >= wt.span) { wt.on = false; wt.life = 0; wt.span = 0.5 + this.rng() * 3; }
    }

    // голоса тьмы: откуда-то сбоку, всегда из черноты
    this.soundT -= dt * (0.6 + near + (w.ember ? 1.5 : 0));
    if (this.soundT <= 0 && w.active) {
      this.soundT = 2.2 + this.rng() * 5;
      const live = this.watchers.filter((x) => x.on);
      const src = live[Math.floor(this.rng() * live.length)];
      if (src) {
        const d = Math.hypot(src.x - w.px, src.z - w.pz);
        const roll = this.rng();
        const kind: DarkSound = roll < 0.3 ? 'moan' : roll < 0.52 ? 'breath' : roll < 0.72 ? 'click' : roll < 0.86 ? 'knock' : roll < 0.95 ? 'scrape' : 'cry';
        this.onSound(kind, pan(src.x, src.z), clamp(1.3 - d / 14, 0.25, 1));
      }
    }
    this.nearness = damp(this.nearness, near, 4, dt);
    return touched;
  }
}
