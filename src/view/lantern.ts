// Лампа: модель, пламя, свет с тенями. Яркость задаётся извне (0..1) — см. systems/lamp.
import {
  Color, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight,
  SphereGeometry, Sprite, TorusGeometry,
} from 'three';
import { vnoise } from '../core/rng';
import { Style } from '../data/styles';
import { darkify } from './darkness';
import { makeGlow } from './glow';

export class Lantern {
  readonly group = new Group();
  readonly light: PointLight;
  private flame: Mesh;
  private glass: Mesh;
  private glow: Sprite;
  private halo: Sprite;
  private flameColor: Color;
  /** текущий «выход» с учётом мерцания, 0..1 */
  flicker = 1;

  constructor(style: Style, shadowSize = 1024) {
    const metal = darkify(new MeshStandardMaterial({ color: 0x2a2520, roughness: 0.6, metalness: 0.6, flatShading: true }));
    const base = new Mesh(new CylinderGeometry(0.075, 0.085, 0.035, 8), metal);
    const cap = new Mesh(new ConeGeometry(0.085, 0.07, 8), metal);
    cap.position.y = 0.215;
    const ring = new Mesh(new TorusGeometry(0.045, 0.008, 4, 10), metal);
    ring.position.y = 0.29;
    this.group.add(base, cap, ring);
    for (let i = 0; i < 4; i++) {
      const post = new Mesh(new CylinderGeometry(0.007, 0.007, 0.17, 4), metal);
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      post.position.set(Math.cos(a) * 0.066, 0.1, Math.sin(a) * 0.066);
      this.group.add(post);
    }
    this.flameColor = new Color(style.lamp);
    this.glass = new Mesh(
      new CylinderGeometry(0.058, 0.058, 0.16, 8, 1, true),
      new MeshBasicMaterial({ color: this.flameColor.clone().multiplyScalar(0.5), transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.glass.position.y = 0.1;
    this.flame = new Mesh(new SphereGeometry(0.028, 6, 5), new MeshBasicMaterial({ color: 0xffffff }));
    this.flame.position.y = 0.085;
    this.glow = makeGlow(style.lamp, 0.9, 1.0);
    this.glow.position.y = 0.1;
    this.halo = makeGlow(style.lamp, 5, 0.02);
    this.halo.position.y = 0.1;
    this.group.add(this.glass, this.flame, this.glow, this.halo);

    this.light = new PointLight(style.lamp, 0, 12, 0.9);
    this.light.position.y = 0.1;
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(shadowSize, shadowSize);
    this.light.shadow.camera.near = 0.12;
    this.light.shadow.camera.far = 14;
    this.light.shadow.bias = -0.006;
    this.light.shadow.normalBias = 0.04;
    this.group.add(this.light);
  }

  /** power 0..1 — сила пламени, radius — радиус круга света в метрах. */
  update(t: number, power: number, radius: number, gain: number): void {
    const n = vnoise(t * 7.3, 1.7) * 0.6 + vnoise(t * 19.1, 9.2) * 0.4; // 0..1
    const unstable = power < 0.35 ? (0.35 - power) * 2.2 : 0;            // слабое пламя дрожит сильнее
    this.flicker = 1 - (0.1 + unstable * 0.5) * n;
    const p = power * this.flicker;
    this.light.intensity = (3.5 + 25 * p) * gain * (power > 0.001 ? 1 : 0);
    this.light.distance = Math.max(1.5, radius * 1.55);
    const fc = (this.flame.material as MeshBasicMaterial).color;
    fc.copy(this.flameColor).lerp(new Color(0xffffff), 0.35).multiplyScalar(1.2 + 3.5 * p);
    this.flame.scale.set(1, 0.8 + 1.4 * p + n * 0.25, 1);
    (this.glow.material as { opacity: number }).opacity = 0.2 + 0.4 * p;
    this.glow.scale.setScalar(0.25 + 0.4 * p);
    (this.halo.material as { opacity: number }).opacity = p;
    this.halo.scale.setScalar(Math.max(0.5, radius * 1.1));
    (this.glass.material as MeshBasicMaterial).opacity = 0.15 + 0.3 * p;
  }
}
