// Реквизит: костёр/жаровня, ложный огонёк, склянка масла.
import {
  Color, ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PointLight, Sprite,
} from 'three';
import { mulberry32, vnoise } from '../core/rng';
import { Style } from '../data/styles';
import { darkify } from './darkness';
import { makeGlow } from './glow';

/** Огонь: костёр или жаровня. lit — горит ли; радиус безопасного круга берётся из tuning. */
export class Fire {
  readonly group = new Group();
  private flames: Mesh[] = [];
  private glow: Sprite;
  private embers: Sprite;
  private light: PointLight;
  private k = 0;
  lit = false;

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
    this.group.add(this.embers);
    this.glow = makeGlow(style.fire, 2.2, 0.9);
    this.glow.position.y = fy + 0.25;
    this.light = new PointLight(style.fire, 0, 9, 1.8);
    this.light.position.y = fy + 0.45;
    this.group.add(this.glow, this.light);
    this.update(0, 0);
  }

  update(t: number, dt: number): void {
    this.k += ((this.lit ? 1 : 0) - this.k) * Math.min(1, dt * 2.5);
    const k = this.k;
    this.flames.forEach((f, i) => {
      f.visible = k > 0.02;
      const n = vnoise(t * 6 + i * 3.7, i);
      f.scale.set(k * (0.7 + n * 0.5), k * (0.7 + n * 1.1), k * (0.7 + n * 0.5));
      f.rotation.y = t * (1 + i * 0.3);
    });
    const fl = 0.85 + vnoise(t * 8.1, 3) * 0.3;
    (this.glow.material as { opacity: number }).opacity = k * fl;
    (this.embers.material as { opacity: number }).opacity = (1 - k) * (0.25 + 0.3 * vnoise(t * 1.3, 7));
    this.light.intensity = 26 * k * fl;
  }
}

/** Ложный огонёк: бледный, дрожит мелко и часто, свет от него холодный и ничего толком не освещает. */
export class Wisp {
  readonly group = new Group();
  private core: Mesh;
  private glow: Sprite;
  private light: PointLight;
  private col: Color;
  k = 1;

  constructor(style: Style, readonly seed = 1) {
    this.col = new Color(style.wisp);
    this.core = new Mesh(new IcosahedronGeometry(0.05, 1), new MeshBasicMaterial({ color: this.col.clone().multiplyScalar(4) }));
    this.glow = makeGlow(style.wisp, 1.5, 0.7);
    this.light = new PointLight(style.wisp, 3, 3.2, 2);
    this.group.add(this.core, this.glow, this.light);
    this.group.position.y = 1.15;
  }

  update(t: number): void {
    const j = vnoise(t * 23 + this.seed * 7, 1) - 0.5, j2 = vnoise(t * 19, this.seed + 5) - 0.5;
    this.core.position.set(j * 0.08, Math.sin(t * 1.1 + this.seed) * 0.12 + j2 * 0.06, j2 * 0.08);
    this.glow.position.copy(this.core.position);
    const f = (0.55 + 0.45 * vnoise(t * 31, this.seed)) * this.k;
    (this.glow.material as { opacity: number }).opacity = f;
    this.glow.scale.setScalar(1.1 + f * 0.6);
    (this.core.material as MeshBasicMaterial).color.copy(this.col).multiplyScalar(4 * f);
    this.light.intensity = 3 * f;
    this.group.visible = this.k > 0.01;
  }
}

/** Склянка масла: мутно-янтарная, чуть светится, чтобы её можно было заметить на границе света. */
export function makeFlask(style: Style): Group {
  const g = new Group();
  const glass = new Mesh(new CylinderGeometry(0.07, 0.09, 0.2, 6), new MeshBasicMaterial({ color: new Color(style.lamp).multiplyScalar(0.55) }));
  glass.position.y = 0.1;
  const neck = new Mesh(new CylinderGeometry(0.03, 0.045, 0.08, 6), darkify(new MeshStandardMaterial({ color: 0x3a3028, roughness: 0.8, flatShading: true })));
  neck.position.y = 0.24;
  const glow = makeGlow(style.lamp, 0.7, 0.35);
  glow.position.y = 0.12;
  g.add(glass, neck, glow);
  return g;
}
