// Реквизит: костёр/жаровня, ложный огонёк, склянка масла, огарок, Врата с чашей.
import {
  BoxGeometry, Color, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Sprite, TorusGeometry, Vector3,
} from 'three';
import { mulberry32, vnoise } from '../core/rng';
import { Style } from '../data/styles';
import { darkify } from './darkness';
import { makeGlow } from './glow';
import { Emitter } from './lightpool';

/** Огонь: костёр или жаровня. Тёплый — это «человеческий» свет. */
export class Fire {
  readonly group = new Group();
  private flames: Mesh[] = [];
  private glow: Sprite;
  private embers: Sprite;
  private fy: number;
  k = 0;                      // 0..1 — насколько разгорелся
  strength = 1;               // 0..1 — сколько в нём осталось, когда на него давит тьма
  lean = { x: 0, z: 0 };      // сквозняк клонит пламя (в осях мира)
  lit = false;
  readonly emitter: Emitter;

  constructor(style: Style, kind: 'campfire' | 'brazier', seed = 1) {
    const rng = mulberry32(seed);
    const stone = darkify(new MeshStandardMaterial({ color: style.rockAlt, roughness: 1, flatShading: true }));
    const wood = darkify(new MeshStandardMaterial({ color: 0x1a120c, roughness: 1, flatShading: true }));
    let fy = 0.12;
    if (kind === 'campfire') {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * 6.283 + rng() * 0.3;
        const r = new Mesh(new IcosahedronGeometry(0.11 + rng() * 0.06, 0), stone);
        r.position.set(Math.cos(a) * 0.42, 0.05, Math.sin(a) * 0.42);
        r.castShadow = true;
        this.group.add(r);
      }
      for (let i = 0; i < 4; i++) {
        const log = new Mesh(new CylinderGeometry(0.035, 0.045, 0.6, 5), wood);
        log.rotation.set(1.25, i * 1.6 + rng(), 0);
        log.position.y = 0.1;
        log.castShadow = true;
        this.group.add(log);
      }
    } else {
      const leg = new Mesh(new CylinderGeometry(0.12, 0.2, 0.7, 6), stone);
      leg.position.y = 0.35; leg.castShadow = true;
      const bowl = new Mesh(new CylinderGeometry(0.42, 0.2, 0.26, 8), stone);
      bowl.position.y = 0.8; bowl.castShadow = true;
      this.group.add(leg, bowl);
      fy = 0.95;
    }
    this.fy = fy;
    const fc = new Color(style.fire);
    for (let i = 0; i < 4; i++) {
      const f = new Mesh(new ConeGeometry(0.1 + rng() * 0.05, 0.4, 5), new MeshBasicMaterial({ color: fc.clone().multiplyScalar(3.5 - i * 0.5), transparent: true, opacity: 0.9, depthWrite: false }));
      f.position.set((rng() - 0.5) * 0.2, fy + 0.2, (rng() - 0.5) * 0.2);
      f.visible = false;
      this.flames.push(f);
      this.group.add(f);
    }
    this.embers = makeGlow(style.fire, 0.55, 0.9);
    this.embers.position.y = fy;
    this.glow = makeGlow(style.fire, 2.2, 0.9);
    this.glow.position.y = fy + 0.25;
    this.group.add(this.embers, this.glow);
    this.emitter = { x: 0, y: 0, z: 0, color: style.fire, intensity: 0, distance: 10 };
    this.update(0, 0);
  }

  update(t: number, dt: number): void {
    this.k += ((this.lit ? this.strength : 0) - this.k) * Math.min(1, dt * 2.2);
    const k = this.k;
    this.flames.forEach((f, i) => {
      f.visible = k > 0.02;
      const n = vnoise(t * 6 + i * 3.7, i);
      f.scale.set(k * (0.7 + n * 0.5), k * (0.7 + n * 1.1), k * (0.7 + n * 0.5));
      f.rotation.set(this.lean.z * 0.5, t * (1 + i * 0.3), -this.lean.x * 0.5);          // клонится по сквозняку
    });
    const fl = 0.85 + vnoise(t * 8.1, 3) * 0.3;
    (this.glow.material as { opacity: number }).opacity = k * fl;
    (this.embers.material as { opacity: number }).opacity = (1 - k) * (0.22 + 0.3 * vnoise(t * 1.3, 7));
    const p = this.group.position;
    this.emitter.x = p.x; this.emitter.y = this.fy + 0.5; this.emitter.z = p.z;
    this.emitter.intensity = 30 * k * fl;
  }
}

/** Ложный огонёк: парит на высоте груди, бледный, дрожит мелко и часто. Настоящее масло так не светит. */
export class Wisp {
  readonly group = new Group();
  private core: Mesh;
  private glow: Sprite;
  private col: Color;
  k = 1;                      // 1 — горит, 0 — погас
  out = false;
  readonly emitter: Emitter;

  constructor(style: Style, readonly seed = 1) {
    this.col = new Color(style.wisp);
    this.core = new Mesh(new IcosahedronGeometry(0.045, 1), new MeshBasicMaterial({ color: this.col.clone().multiplyScalar(4) }));
    this.glow = makeGlow(style.wisp, 1.5, 0.75);
    this.group.add(this.core, this.glow);
    this.group.position.y = 1.15;
    this.emitter = { x: 0, y: 1.15, z: 0, color: style.wisp, intensity: 0, distance: 4 };
  }

  update(t: number, dt: number): void {
    this.k += ((this.out ? 0 : 1) - this.k) * Math.min(1, dt * 9);
    const j = vnoise(t * 23 + this.seed * 7, 1) - 0.5, j2 = vnoise(t * 19, this.seed + 5) - 0.5;
    this.core.position.set(j * 0.09, Math.sin(t * 1.1 + this.seed) * 0.12 + j2 * 0.07, j2 * 0.09);
    this.glow.position.copy(this.core.position);
    const f = (0.5 + 0.5 * vnoise(t * 31, this.seed)) * this.k;
    (this.glow.material as { opacity: number }).opacity = f;
    this.glow.scale.setScalar(1.1 + f * 0.7);
    (this.core.material as MeshBasicMaterial).color.copy(this.col).multiplyScalar(4 * f);
    this.group.visible = this.k > 0.01;
    const p = this.group.position;
    this.emitter.x = p.x; this.emitter.z = p.z; this.emitter.intensity = 2.5 * f;
  }
}

/** Склянка масла: стоит на полу и светит ровно, без дрожи. */
/** Кости на месте того, кого забрала тьма: череп, рёбра, длинные кости вразброс. */
export function makeBones(seed: number, small = false): Group {
  const rng = mulberry32(Math.floor(Math.abs(seed) * 97) + 3), g = new Group(), k = small ? 0.62 : 1;
  const mat = darkify(new MeshStandardMaterial({ color: new Color(0xb4ac9b), roughness: 0.95, flatShading: true }));
  const skull = new Mesh(new IcosahedronGeometry(0.105 * k, 1), mat);
  skull.scale.set(1, 0.92, 1.18); skull.position.set((rng() - 0.5) * 0.3, 0.085 * k, (rng() - 0.5) * 0.3); skull.rotation.set(rng() * 0.6, rng() * 6.28, rng() * 0.5);
  const jaw = new Mesh(new BoxGeometry(0.1 * k, 0.03 * k, 0.07 * k), mat);
  jaw.position.copy(skull.position).add(new Vector3(0.09 * k, -0.05 * k, 0.07 * k)); jaw.rotation.y = rng() * 6.28;
  g.add(skull, jaw);
  for (let i = 0; i < 6; i++) {                                // рёбра дугой
    const rib = new Mesh(new TorusGeometry(0.13 * k, 0.011 * k, 4, 7, Math.PI * 0.9), mat);
    rib.position.set(-0.28 * k + i * 0.035 * k, 0.03 + i * 0.006, 0.18 * k + (rng() - 0.5) * 0.05); rib.rotation.set(Math.PI / 2 + (rng() - 0.5) * 0.5, 0, 0.3 + (rng() - 0.5) * 0.5);
    g.add(rib);
  }
  for (let i = 0; i < 7; i++) {                                // руки и ноги
    const len = (0.24 + rng() * 0.2) * k;
    const b = new Mesh(new CylinderGeometry(0.016 * k, 0.02 * k, len, 5), mat);
    const a = rng() * 6.28, r = 0.15 + rng() * 0.4;
    b.position.set(Math.cos(a) * r * k, 0.022, Math.sin(a) * r * k); b.rotation.set(Math.PI / 2 + (rng() - 0.5) * 0.25, 0, rng() * 6.28);
    g.add(b);
  }
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  return g;
}

export function makeFlask(style: Style): Group {
  const g = new Group();
  const glass = new Mesh(new CylinderGeometry(0.07, 0.09, 0.2, 6), new MeshBasicMaterial({ color: new Color(style.lamp).multiplyScalar(0.75) }));
  glass.position.y = 0.1;
  const neck = new Mesh(new CylinderGeometry(0.03, 0.045, 0.08, 6), darkify(new MeshStandardMaterial({ color: 0x3a3028, roughness: 0.8, flatShading: true })));
  neck.position.y = 0.24;
  const glow = makeGlow(style.lamp, 0.8, 0.4);
  glow.position.y = 0.12;
  g.add(glass, neck, glow);
  return g;
}

/** Огарок спасённого: маленькое тёплое пламя. */
export class Candle {
  readonly group = new Group();
  private glow: Sprite;
  readonly emitter: Emitter;
  constructor(style: Style) {
    const wax = new Mesh(new CylinderGeometry(0.02, 0.024, 0.1, 5), new MeshBasicMaterial({ color: 0x8a7a66 }));
    wax.position.y = 0.05;
    const flame = new Mesh(new ConeGeometry(0.014, 0.05, 5), new MeshBasicMaterial({ color: new Color(style.fire).multiplyScalar(4) }));
    flame.position.y = 0.125;
    this.glow = makeGlow(style.fire, 0.8, 0.8);
    this.glow.position.y = 0.13;
    this.group.add(wax, flame, this.glow);
    this.emitter = { x: 0, y: 1, z: 0, color: style.fire, intensity: 0, distance: 4.5 };
  }
  update(t: number, x: number, y: number, z: number): void {
    const f = 0.8 + 0.4 * vnoise(t * 9, 5);
    (this.glow.material as { opacity: number }).opacity = f * 0.9;
    this.emitter.x = x; this.emitter.y = y; this.emitter.z = z; this.emitter.intensity = 5 * f;
  }
}

/** Врата: две плиты со щелью, за которой рассвет; перед ними чаша для лампы. */
export class Gate {
  readonly group = new Group();
  readonly bowl = new Group();
  private crack: Mesh;
  private dawn: Sprite;
  private slabL: Mesh; private slabR: Mesh;
  open = 0;                  // 0..1
  readonly emitter: Emitter;

  constructor(style: Style) {
    const stone = darkify(new MeshStandardMaterial({ color: style.rock, roughness: 0.95, flatShading: true }), false, true);
    const mk = (side: number) => {
      const s = new Mesh(new BoxGeometry(2.3, 5.2, 0.7), stone);
      s.position.set(side * 1.3, 2.6, 0);
      s.castShadow = true; s.receiveShadow = true;
      this.group.add(s);
      return s;
    };
    this.slabL = mk(-1); this.slabR = mk(1);
    const lintel = new Mesh(new BoxGeometry(5.6, 0.9, 0.9), stone);
    lintel.position.y = 5.5; lintel.castShadow = true;
    this.group.add(lintel);
    this.crack = new Mesh(new BoxGeometry(0.16, 4.9, 0.1), new MeshBasicMaterial({ color: new Color(style.fire).multiplyScalar(1.6) }));
    this.crack.position.set(0, 2.5, -0.1);
    this.dawn = makeGlow(style.fire, 5, 0.35);
    this.dawn.position.set(0, 2.2, 0.5);
    this.group.add(this.crack, this.dawn);

    const leg = new Mesh(new CylinderGeometry(0.16, 0.26, 0.75, 6), stone);
    leg.position.y = 0.37; leg.castShadow = true;
    const cup = new Mesh(new CylinderGeometry(0.5, 0.22, 0.28, 8), stone);
    cup.position.y = 0.86; cup.castShadow = true;
    this.bowl.add(leg, cup);
    this.emitter = { x: 0, y: 2.2, z: 0, color: style.fire, intensity: 0, distance: 16 };
  }

  update(t: number, dt: number, target: number): void {
    this.open += (target - this.open) * Math.min(1, dt * 0.6);
    const o = this.open;
    this.slabL.position.x = -1.3 - o * 1.1; this.slabR.position.x = 1.3 + o * 1.1;
    this.crack.scale.x = 1 + o * 26;
    const pulse = 0.85 + 0.15 * Math.sin(t * 0.7);
    (this.crack.material as MeshBasicMaterial).color.set(0xff8a3a).multiplyScalar((1.6 + o * 5) * pulse);
    (this.dawn.material as { opacity: number }).opacity = (0.35 + o * 0.65) * pulse;
    this.dawn.scale.setScalar(5 + o * 16);
    const p = this.group.position;
    this.emitter.x = p.x; this.emitter.z = p.z;
    this.emitter.intensity = (4 + o * 90) * pulse;
  }
}
