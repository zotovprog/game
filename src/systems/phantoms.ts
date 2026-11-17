// Те, кого нет: глаза в темноте и фигура, идущая в ней.
// Глаза видны только там, куда свет не достаёт, и закрываются, стоит ему подойти.
// Фигура — чёрный силуэт человека сразу за краем света; за ним едва заметная мгла, на которой он и читается.
// Шагнёшь к нему со светом — никого.
// И то и другое рисуется поверх дыма, отдельной сценой.
import { Group, Mesh, MeshBasicMaterial, Scene, Sprite, SpriteMaterial } from 'three';
import { damp, mulberry32 } from '../core/rng';
import { Style } from '../data/styles';
import { T } from '../data/tuning';
import { makeGlow } from '../view/glow';
import { Human } from '../view/human';
import { Grid } from '../world/grid';

export interface PhantomWorld {
  px: number; pz: number; radius: number;
  lit: boolean;                 // лампа горит
  dread: number;                // 0..1
  active: boolean;              // тьма уже «проснулась», идёт игра
  lights: { x: number; z: number; r: number }[];     // все круги света (лампа, огни)
  rx: number; rz: number;       // «вправо» на экране в плоскости пола
  eyesCap: number;              // темп: сколько пар глаз сейчас позволено (пока лампа горит)
  walker: boolean;              // темп: идущему можно появиться
}

interface Eyes { g: Group; a: Sprite; b: Sprite; x: number; z: number; h: number; open: number; age: number; life: number; cool: number; on: boolean; blink: number; seed: number; gap: number }

export class Phantoms {
  private rng = mulberry32(31337);
  private eyes: Eyes[] = [];
  private walker: Human;
  private walk = { on: false, t: 0, cool: 28, x: 0, z: 0, dx: 0, dz: 0, step: 0, k: 0, leaving: false };
  private flat: MeshBasicMaterial; private walkEyes: Eyes | null = null; private mist: Sprite;
  /** шаг того, кого нет: панорама −1..1 */
  onStep: (pan: number) => void = () => {};
  /** идущий появился */
  onAppear: () => void = () => {};
  /** посветил на фигуру — она исчезла */
  onVanish: () => void = () => {};
  /** сколько пар глаз сейчас открыто (для проверок) */
  openEyes = 0;
  private pins: Eyes[] = [];
  private style: Style; private over: Scene;

  constructor(private grid: Grid, style: Style, over: Scene) {
    const P = T.phantom;
    this.style = style; this.over = over;
    for (let i = 0; i < P.maxEyes; i++) { const e = this.mkEyes(); e.cool = 4 + this.rng() * 10; this.eyes.push(e); }
    // один плоский чёрный цвет без глубины: чистый силуэт поверх дыма
    this.walker = new Human({ cloak: 0, skin: 0, hunch: 0.32 });
    this.flat = new MeshBasicMaterial({ color: style.walker, depthTest: false, depthWrite: false, transparent: true, opacity: 0 });
    this.walker.root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      for (const old of Array.isArray(m.material) ? m.material : [m.material]) old.dispose();
      m.material = this.flat; m.castShadow = false; m.receiveShadow = false;
      m.renderOrder = 2;
    });
    this.walker.root.visible = false;
    // чёрное на чёрном не видно: позади фигуры — слабая холодная мгла, как дым, поймавший далёкий отсвет
    this.mist = makeGlow(style.mist, 1, 1);
    (this.mist.material as SpriteMaterial).depthTest = false; this.mist.renderOrder = 1; this.mist.visible = false;
    over.add(this.mist, this.walker.root);
  }

  private mkEyes(): Eyes {
    const a = makeGlow(this.style.eyes, 1, 1), b = makeGlow(this.style.eyes, 1, 1);
    for (const s of [a, b]) { const m = s.material as SpriteMaterial; m.depthTest = false; m.opacity = 0; }
    const g = new Group();
    g.add(a, b); g.visible = false;
    this.over.add(g);
    return { g, a, b, x: 0, z: 0, h: 1.5, open: 0, age: 0, life: 4, cool: 0, on: false, blink: 2, seed: this.rng() * 6.28, gap: 0.055 };
  }
  /** Глаза, которые стоят на месте (тень над костями): видны из темноты, пока до них не дошёл свет. */
  pin(x: number, z: number, h: number): { x: number; z: number } { const e = this.mkEyes(); Object.assign(e, { x, z, h, on: true }); this.pins.push(e); return e; }
  unpin(x: number, z: number): void {
    const i = this.pins.findIndex((e) => Math.hypot(e.x - x, e.z - z) < 0.2);
    if (i >= 0) { this.over.remove(this.pins[i].g); this.pins.splice(i, 1); }
  }
  private draw(e: Eyes, t: number, w: PhantomWorld, glow: number): void {
    const P = T.phantom;
    const lid = e.blink < 0 ? 0.12 : 1;
    const sway = Math.sin(t * 0.7 + e.seed) * 0.03;
    const cx = e.x + w.rx * sway, cz = e.z + w.rz * sway, y = e.h + Math.sin(t * 0.9 + e.seed * 2) * 0.012;
    e.a.position.set(cx - w.rx * e.gap, y, cz - w.rz * e.gap);
    e.b.position.set(cx + w.rx * e.gap, y, cz + w.rz * e.gap);
    const size = P.eyeSize * (0.85 + 0.3 * e.open);
    e.a.scale.set(size, size * lid, 1); e.b.scale.set(size, size * lid, 1);
    const op = e.open * glow;
    (e.a.material as SpriteMaterial).opacity = op; (e.b.material as SpriteMaterial).opacity = op;
    e.g.visible = op > 0.01;
  }

  private dark(x: number, z: number, w: PhantomWorld, k = 1.12): boolean {
    for (const l of w.lights) if (Math.hypot(x - l.x, z - l.z) < l.r * k) return false;
    return true;
  }

  update(dt: number, t: number, w: PhantomWorld): void {
    const P = T.phantom;
    this.surgeT = Math.max(0, this.surgeT - dt);
    const want = !w.active ? 0 : this.surgeT > 0 ? P.maxEyes : Math.min(P.maxEyes, (w.lit ? Math.min(w.eyesCap, 1 + Math.round(w.dread * P.eyesPerDread)) : P.eyesOut));
    this.openEyes = 0;
    this.eyes.forEach((e, i) => {
      if (!e.on) {
        e.g.visible = false;
        if (i >= want) return;
        if ((e.cool -= dt) > 0) return;
        // место: в темноте, на полу, недалеко за краем света; без света — совсем рядом
        const ang = this.rng() * 6.283;
        const d = !w.lit ? 1.5 + this.rng() * 2.4 : this.surgeT > 0 ? w.radius * (1.12 + this.rng() * 0.3) + 0.3 : w.radius * (1.18 + this.rng() * 0.75) + 0.5;
        const x = w.px + Math.cos(ang) * d, z = w.pz + Math.sin(ang) * d;
        if (!this.grid.isFloor(x, z) || !this.dark(x, z, w)) { e.cool = 0.25; return; }
        const low = this.rng() < 0.3;
        Object.assign(e, { x, z, h: low ? 0.35 + this.rng() * 0.45 : 1.4 + this.rng() * 0.4, age: 0, life: P.eyeLife[0] + this.rng() * (P.eyeLife[1] - P.eyeLife[0]), on: true, open: 0, blink: 1 + this.rng() * 3, gap: 0.062 + this.rng() * 0.03 });
        return;
      }
      e.age += dt;
      const seen = !this.dark(e.x, e.z, w, 1.04);
      const closing = seen || e.age > e.life || i >= want + 2;
      e.open = damp(e.open, closing ? 0 : 1, closing ? (seen ? 16 : 5) : 1.6, dt);
      if (closing && e.open < 0.03) {
        e.on = false; e.g.visible = false;
        e.cool = w.lit ? (P.eyeGap[0] + this.rng() * (P.eyeGap[1] - P.eyeGap[0])) * (1.25 - w.dread) : 0.4 + this.rng() * 1.2;
        return;
      }
      if ((e.blink -= dt) < -0.13) e.blink = 1.5 + this.rng() * 4;
      this.draw(e, t, w, P.eyeGlow * (w.lit ? 1 : 1.25));
      if (e.open > 0.5) this.openEyes++;
    });

    for (const e of this.pins) {
      const far = Math.hypot(e.x - w.px, e.z - w.pz);
      e.open = damp(e.open, w.active && far < 17 && this.dark(e.x, e.z, w, 1.0) ? 1 : 0, 3, dt);
      if ((e.blink -= dt) < -0.13) e.blink = 2 + this.rng() * 5;
      this.draw(e, t, w, P.eyeGlow * 1.15);
    }

    // тот, кто идёт по кромке света: чёрный на освещённом полу, а шагнув в темноту — одни глаза
    const W = this.walk, h = this.walker;
    if (!W.on) {
      if (!w.active || !w.lit || !w.walker || w.radius < 3.6) return;
      if ((W.cool -= dt) > 0) return;
      const ang = this.rng() * 6.283, side = this.rng() < 0.5 ? -1 : 1;
      const ox = Math.cos(ang), oz = Math.sin(ang), d0 = w.radius * P.walkFrom;
      const sx = w.px + ox * d0, sz = w.pz + oz * d0;
      let dx = -oz * side * 0.95 + ox * 0.3, dz = ox * side * 0.95 + oz * 0.3;
      const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      let ok = true;
      for (let k = 0; k <= 4 && ok; k++) ok = this.grid.isFloor(sx + dx * k * 1.1, sz + dz * k * 1.1);
      for (const lt of w.lights) if (ok && lt.r > 1.2 && Math.hypot(lt.x - w.px, lt.z - w.pz) > 1.5 && Math.hypot(sx - lt.x, sz - lt.z) < lt.r + 2) ok = false;   // у чужих огней ему делать нечего (лампа в руке — не в счёт)
      if (!ok) { W.cool = 1.2; return; }
      Object.assign(W, { on: true, t: 0, x: sx, z: sz, dx, dz, step: 0.2, k: 0, leaving: false });
      h.root.visible = true;
      this.onAppear();
      this.walkEyes ??= this.mkEyes();
      Object.assign(this.walkEyes, { h: 1.62, open: 0, on: true, gap: 0.07 });
    }
    W.t += dt;
    W.x += W.dx * P.walkSpeed * dt; W.z += W.dz * P.walkSpeed * dt;
    h.root.position.set(W.x, 0, W.z);
    h.root.rotation.y = Math.atan2(W.dx, W.dz);
    h.update(dt, t, 0.45);
    if (!W.leaving && (W.step -= dt) <= 0) { W.step = 0.56; this.onStep(Math.max(-1, Math.min(1, ((W.x - w.px) * w.rx + (W.z - w.pz) * w.rz) / 6))); }
    const d = Math.hypot(W.x - w.px, W.z - w.pz);
    const caught = d < w.radius * P.walkCaught;                // шагнул к нему со светом — там никого
    if (!W.leaving && (caught || d > w.radius * 1.5 + 1 || W.t > P.walkTime || !this.grid.isFloor(W.x + W.dx, W.z + W.dz))) {
      W.leaving = true;
      if (caught) this.onVanish();
    }
    W.k = damp(W.k, W.leaving ? 0 : 1, W.leaving ? (caught ? 14 : 2.5) : 5, dt);
    this.flat.opacity = W.k;
    this.mist.visible = true; this.mist.position.set(W.x, 1.0, W.z); this.mist.scale.set(2.3, 3.1, 1);
    (this.mist.material as SpriteMaterial).opacity = W.k * P.mist;
    // в темноте силуэт сливается с чернотой — остаются глаза, пока он не отвернётся
    const e = this.walkEyes!;
    e.x = W.x + W.dx * 0.1; e.z = W.z + W.dz * 0.1;
    e.open = damp(e.open, !W.leaving && W.t > 1.2 ? 1 : 0, 3, dt);
    if ((e.blink -= dt) < -0.13) e.blink = 1.5 + this.rng() * 3;
    this.draw(e, t, w, P.eyeGlow);
    if (W.leaving && W.k < 0.03) {
      W.on = false; h.root.visible = false; e.g.visible = false; this.mist.visible = false;
      W.cool = (P.walkGap[0] + this.rng() * (P.walkGap[1] - P.walkGap[0])) * (1.2 - 0.5 * w.dread);
    }
  }

  /** Испуг: на пару секунд глаза открываются вокруг все разом, у самого края света. */
  surge(sec = 2.6): void { this.surgeT = sec; for (const e of this.eyes) if (!e.on) e.cool = Math.random() * 0.25; }
  private surgeT = 0;
  /** Показать идущего прямо сейчас (для сцен и проверок). */
  hurry(): void { this.walk.cool = 0; }
  get walking(): boolean { return this.walk.on && !this.walk.leaving; }
  get walkerAt(): { x: number; z: number } { return { x: this.walk.x, z: this.walk.z }; }
}
