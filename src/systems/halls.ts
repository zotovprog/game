// Залы памяти: правила. Двери (простая, запертая загадкой, каменная плита), чаши — зажечь в порядке с рисунка,
// тень статуи на знаке, теснины (лаз и щель) и поставленные страшные моменты. Вид — view/hall.ts.
import { Mesh, MeshBasicMaterial } from 'three';
import { clamp, damp } from '../core/rng';
import { BowlsDef, ShadowDef, TightDef } from '../data/level';
import { TX } from '../data/texts';
import { T } from '../data/tuning';
import type { Game } from '../scenes/game';
import { buildHalls, BowlView, DoorView, HallView } from '../view/hall';
import { Human } from '../view/human';
import { distPolyline, distRect } from '../world/grid';

interface Door { v: DoorView; open: boolean; k: number }
interface BowlSet { def: BowlsDef; v: BowlView[]; seq: number[]; solved: boolean; busy: boolean; seat: Human | null; seatMat: MeshBasicMaterial | null; seatK: number; seen: boolean; gone: boolean }
interface Shadow { def: ShadowDef; k: number; solved: boolean }
export interface HallSave { open: string[]; solved: string[] }
type Near = (x: number, z: number, r: number, text: string, act: () => void) => void;

export class Halls {
  readonly view: HallView;
  private doors: Door[];
  private sets: BowlSet[];
  private shadows: Shadow[];
  /** 0..1 — герой ползёт под завалом / протискивается боком */
  crawl = 0; squeeze = 0;
  private crawlScare = false;
  /** двери, которые вот-вот откроются сами: до тех пор их не открыть */
  private staged = new Set<string>();

  constructor(private g: Game) {
    this.view = buildHalls(g.grid, g.style, g.def);
    g.stage.scene.add(this.view.group);
    this.doors = this.view.doors.map((v) => ({ v, open: false, k: 0 }));
    for (const d of this.doors) g.grid.obstacles.push(...this.view.blockers.get(d.v.def.id)!);
    this.sets = g.def.bowls.map((def) => {
      const s: BowlSet = { def, v: this.view.bowls.get(def.id)!, seq: [], solved: false, busy: false, seat: null, seatMat: null, seatK: 0, seen: false, gone: !def.scare };
      if (def.scare) {
        // тот, кто сидит за столом: чёрный силуэт, пока не подойдёшь и не зажжёшь огонь
        const h = new Human({ cloak: 0, skin: 0, hunch: 0.34 });
        s.seatMat = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 });
        h.root.traverse((o) => { if (o instanceof Mesh) { o.material = s.seatMat!; o.castShadow = false; o.receiveShadow = false; } });
        h.setPose('sit', true); h.update(0.016, 0, 0);
        h.root.position.set(def.scare.seat[0], 0.1, def.scare.seat[1]); h.root.rotation.y = def.scare.face;
        h.root.visible = false; h.root.scale.multiplyScalar(1.08);
        g.stage.scene.add(h.root);
        s.seat = h;
        g.phantoms.pin(def.scare.seat[0], def.scare.seat[1], 1.32);              // глаза видны раньше, чем сам сидящий
      }
      return s;
    });
    this.shadows = g.def.shadows.map((def) => ({ def, k: 0, solved: false }));
  }

  private door(id: string): Door | undefined { return this.doors.find((d) => d.v.def.id === id); }
  private pan(x: number, z: number): number { const g = this.g; return clamp(((x - g.pos.x) * g.stage.right.x + (z - g.pos.z) * g.stage.right.z) / 9, -1, 1); }
  private lockedBy(d: Door): boolean {
    const lock = d.v.def.lock;
    if (this.staged.has(d.v.def.id)) return true;
    return !!lock && !(this.sets.find((s) => s.def.id === lock)?.solved || this.shadows.find((s) => s.def.id === lock)?.solved);
  }

  private openDoor(d: Door, quiet = false): void {
    if (d.open) return;
    d.open = true;
    const bl = this.view.blockers.get(d.v.def.id)!;
    this.g.grid.obstacles = this.g.grid.obstacles.filter((o) => !bl.includes(o));
    if (quiet) { d.k = 1; return; }
    this.g.ev('door', d.v.def.id);
    if (d.v.def.kind === 'slab') this.g.sfx.rumble(2.6, this.pan(d.v.x, d.v.z)); else this.g.sfx.creak(this.pan(d.v.x, d.v.z));
  }

  /** Что можно сделать рядом: открыть дверь, зажечь чашу. */
  prompts(near: Near): void {
    const g = this.g;
    for (const d of this.doors) {
      if (d.open || d.v.def.kind === 'slab') continue;
      if (this.lockedBy(d)) near(d.v.x, d.v.z, 1.5, TX.door.locked, () => { g.sfx.rattle(this.pan(d.v.x, d.v.z)); g.stage.shake = Math.max(g.stage.shake, 0.08); });
      else near(d.v.x, d.v.z, 1.6, TX.door.open, () => this.openDoor(d));
    }
    if (!g.lamp.lit || g.lamp.oil <= 0) return;
    for (const s of this.sets) {
      if (s.solved || s.busy) continue;
      s.v.forEach((b, i) => { if (!b.f.lit) near(b.x, b.z, 1.7, TX.door.bowl, () => this.lightBowl(s, i)); });
    }
  }

  private lightBowl(s: BowlSet, i: number): void {
    const g = this.g, b = s.v[i];
    b.f.lit = true; b.f.strength = 1;
    g.sfx.ignite(); g.ev('bowl', String(i));
    s.seq.push(i);
    this.vanishSeat(s);
    const n = s.seq.length;
    if (s.def.order[n - 1] !== i) {
      // не тот порядок: огни гаснут разом, и тьма придвигается
      s.busy = true;
      g.after(0.9, () => {
        for (const o of s.v) o.f.lit = false;
        s.seq = []; s.busy = false;
        g.sfx.snuff(this.pan(b.x, b.z)); g.sfx.dark('hiss', 0, 0.9);
        g.phantoms.surge(3.5); g.stage.shake = Math.max(g.stage.shake, 0.3); g.chroma = Math.max(g.chroma, 0.5);
        g.pace.lungeT = Math.min(g.pace.lungeT, 2.5);
        g.ev('bowlsOut', s.def.id); g.pace.hush(5, g.dread);
      });
      return;
    }
    if (n < s.def.order.length) return;
    // все три — как на рисунке: за дверью трижды стучат, потом она открывается сама
    s.solved = true; g.flags.add(`solved-${s.def.id}`);
    g.ev('solved', s.def.id); g.pace.hush(9, g.dread);
    const d = this.door(s.def.id);
    if (!d) return;
    const pan = this.pan(d.v.x, d.v.z);
    this.staged.add(d.v.def.id);
    for (let k = 0; k < 3; k++) g.after(1.6 + k * 0.7, () => { g.sfx.dark('knock', pan, 1); g.stage.shake = Math.max(g.stage.shake, 0.12); });
    g.after(4.6, () => { this.staged.delete(d.v.def.id); this.openDoor(d); g.story.checkpoint(); });
  }

  private vanishSeat(s: BowlSet): void {
    if (s.gone) return;
    s.gone = true;
    this.g.phantoms.unpin(s.def.scare!.seat[0], s.def.scare!.seat[1]);
    this.g.sfx.dark('breath', this.pan(s.def.scare!.seat[0], s.def.scare!.seat[1]), 0.8);
  }

  /** Герой внутри теснины? Возвращает её или null. */
  private tightAt(x: number, z: number): TightDef | null {
    for (const t of this.g.def.tights) if (distPolyline(x, z, t.pts) < 1.05) return t;
    return null;
  }
  /** Для спутников: 0..1 ползёт, 0..1 протискивается. */
  poseAt(x: number, z: number): [number, number] { const t = this.tightAt(x, z); return [t?.kind === 'crawl' ? 1 : 0, t?.kind === 'squeeze' ? 1 : 0]; }
  /** Насколько теснина замедляет шаг. */
  get speedK(): number { return 1 - (1 - T.hall.crawlSpeed) * this.crawl - (1 - T.hall.squeezeSpeed) * this.squeeze; }
  /** В теснине руки заняты: огонь не прикрыть. */
  get handsBusy(): boolean { return this.crawl > 0.5 || this.squeeze > 0.5; }
  /** Круг света в лазе меньше: огонь прижат к земле. */
  get lightK(): number { return 1 - (1 - T.hall.crawlLight) * this.crawl; }
  /** Чаши — живой огонь: светят и кормят огонёк. */
  get fires(): BowlView[] { return this.sets.flatMap((s) => s.v); }
  /** Пока решаешь загадку рядом, тьма за спиной ждёт. */
  get holdTide(): boolean {
    const g = this.g;
    return this.sets.some((s) => !s.solved && g.dist(s.v[0].x, s.v[0].z) < T.hall.holdTide) || this.shadows.some((s) => !s.solved && g.dist(s.def.statue[0], s.def.statue[1]) < T.hall.holdTide);
  }

  update(dt: number, t: number): void {
    const g = this.g, live = g.mode === 'play';
    // двери
    for (const d of this.doors) {
      d.k = damp(d.k, d.open ? 1 : 0, d.v.def.kind === 'slab' ? 0.9 : 2.2, dt);
      if (d.v.def.kind === 'slab') d.v.pivot.position.y = -2.75 * d.k + (d.open && d.k < 0.97 ? Math.sin(t * 40) * 0.012 : 0);
      else d.v.pivot.rotation.y = (d.v.def.axis === 'z' ? -Math.PI / 2 - 1.75 * d.k : 1.75 * d.k) + (this.lockedBy(d) ? 0 : Math.sin(t * 0.7 + d.v.x) * 0.012 * (1 - d.k));
    }
    // теснины
    const tight = live ? this.tightAt(g.pos.x, g.pos.z) : null;
    this.crawl = damp(this.crawl, tight?.kind === 'crawl' ? 1 : 0, 5, dt);
    this.squeeze = damp(this.squeeze, tight?.kind === 'squeeze' ? 1 : 0, 5, dt);
    if (tight?.kind === 'crawl' && !this.crawlScare && live) {
      // посреди лаза: что-то скребётся совсем рядом, и глаза — вплотную
      const a = tight.pts[0], b = tight.pts[tight.pts.length - 1], mid = Math.hypot(g.pos.x - (a[0] + b[0]) / 2, g.pos.z - (a[1] + b[1]) / 2);
      if (mid < 1.2) {
        this.crawlScare = true;
        g.sfx.dark('scrape', -0.6, 0.9); g.after(0.8, () => g.sfx.dark('breath', 0.5, 0.8));
        g.phantoms.surge(2.6); g.chroma = Math.max(g.chroma, 0.35);
        g.ev('scare', 'crawl'); g.pace.hush(8, g.dread);
      }
    }
    // чаши: знак у горящей чаши светится; сидящий за столом
    for (const s of this.sets) {
      s.v.forEach((b) => { b.plate.emissiveIntensity = damp(b.plate.emissiveIntensity, b.f.lit ? 1.1 : 0, 4, dt); });
      if (!s.seat || !s.seatMat || !s.def.scare) continue;
      const room = g.def.rooms.find((r) => r.id === s.def.id);
      const inside = !!room && distRect(g.pos.x, g.pos.z, room.rect) < 0;
      if (inside && !s.seen && live) { s.seen = true; g.ev('scare', 'seat'); g.pace.hush(8, g.dread); }
      if (!s.gone && s.seen && g.dist(s.def.scare.seat[0], s.def.scare.seat[1]) < 2.1) this.vanishSeat(s);
      s.seatK = damp(s.seatK, s.gone ? 0 : 1, s.gone ? 7 : 1.2, dt);
      s.seat.root.visible = s.seatK > 0.02;
      s.seatMat.opacity = s.seatK;
      if (s.seat.root.visible) { s.seat.talk = 0; s.seat.update(dt, t, 0); s.seat.head.rotation.y = clamp(Math.atan2(g.pos.x - s.def.scare.seat[0], g.pos.z - s.def.scare.seat[1]) - s.def.scare.face, -1.1, 1.1) * (s.seen ? 1 : 0); }
    }
    // тень на знаке
    for (const s of this.shadows) {
      const d = this.door(s.def.door);
      if (!d) continue;
      if (!s.solved && live) {
        const on = g.lamp.held && g.lamp.lit && g.lamp.oil > 0 && this.shadowOn(s, d);
        const was = s.k;
        s.k = clamp(s.k + (on ? dt / T.hall.shadowTime : -dt * 1.4), 0, 1);
        if (on && was === 0) { g.sfx.dark('scrape', this.pan(d.v.x, d.v.z), 0.5); g.ev('shadow', 'on'); }
        if (s.k >= 1) {
          s.solved = true; g.flags.add(`solved-${s.def.id}`);
          g.ev('solved', s.def.id); g.pace.hush(9, g.dread);
          g.stage.shake = Math.max(g.stage.shake, 0.35);
          this.openDoor(d);
          g.after(2.8, () => g.story.checkpoint());
        }
      }
      if (d.v.emblem) d.v.emblem.emissiveIntensity = damp(d.v.emblem.emissiveIntensity, s.solved ? 0.9 : s.k * 1.6, 6, dt);
    }
  }

  /** Тень статуи от огня героя падает на знак двери? */
  private shadowOn(s: Shadow, d: Door): boolean {
    const g = this.g, [sx, sz] = s.def.statue, hx = g.pos.x, hz = g.pos.z;
    const dist = Math.hypot(hx - sx, hz - sz);
    if (dist < 0.9 || dist > T.hall.shadowReach) return false;
    if (d.v.def.axis === 'z') {
      // стена стоит на x = d.x; герой — дальше от неё, чем статуя
      if ((hx - sx) * (sx - d.v.x) <= 0.2) return false;
      const zHit = sz + ((sz - hz) / (sx - hx)) * (d.v.x - sx);
      return Math.abs(zHit - d.v.z) < T.hall.shadowAim;
    }
    if ((hz - sz) * (sz - d.v.z) <= 0.2) return false;
    const xHit = sx + ((sx - hx) / (sz - hz)) * (d.v.z - sz);
    return Math.abs(xHit - d.v.x) < T.hall.shadowAim;
  }

  /** Где встать, чтобы тень легла на знак (для автопрогонов). */
  shadowSpot(id: string, back = 2.4): { x: number; z: number } | null {
    const s = this.shadows.find((q) => q.def.id === id), d = s && this.door(s.def.door);
    if (!s || !d) return null;
    const dx = s.def.statue[0] - d.v.x, dz = s.def.statue[1] - d.v.z, l = Math.hypot(dx, dz);
    return { x: s.def.statue[0] + (dx / l) * back, z: s.def.statue[1] + (dz / l) * back };
  }

  /** Для точки возврата. */
  save(): HallSave { return { open: this.doors.filter((d) => d.open).map((d) => d.v.def.id), solved: [...this.sets.filter((s) => s.solved).map((s) => s.def.id), ...this.shadows.filter((s) => s.solved).map((s) => s.def.id)] }; }
  restore(s: HallSave | undefined): void {
    if (!s) return;
    for (const set of this.sets) if (s.solved.includes(set.def.id)) { set.solved = true; set.seen = true; if (!set.gone) { set.gone = true; this.g.phantoms.unpin(set.def.scare!.seat[0], set.def.scare!.seat[1]); } for (const b of set.v) { b.f.lit = true; b.f.k = 1; } this.g.flags.add(`solved-${set.def.id}`); }
    for (const sh of this.shadows) if (s.solved.includes(sh.def.id)) { sh.solved = true; sh.k = 1; this.g.flags.add(`solved-${sh.def.id}`); }
    for (const d of this.doors) if (s.open.includes(d.v.def.id)) this.openDoor(d, true);
  }

  /** Для карты и автопрогонов: что где. */
  marks(): { x: number; z: number; c: string; t: string }[] {
    return [
      ...this.doors.map((d) => ({ x: d.v.x, z: d.v.z, c: d.open ? '#6f6' : '#f66', t: `дверь ${d.v.def.id}` })),
      ...this.sets.flatMap((s) => s.v.map((b, i) => ({ x: b.x, z: b.z, c: '#fc6', t: `чаша ${i}` }))),
      ...this.shadows.map((s) => ({ x: s.def.statue[0], z: s.def.statue[1], c: '#ccc', t: 'статуя' })),
    ];
  }
  /** Для автопрогонов: порядок чаш. */
  order(id: string): { x: number; z: number }[] { const s = this.sets.find((q) => q.def.id === id); return s ? s.def.order.map((i) => ({ x: s.v[i].x, z: s.v[i].z })) : []; }
  isOpen(id: string): boolean { return !!this.door(id)?.open; }
}
