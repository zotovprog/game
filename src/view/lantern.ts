// Огонёк в руке: живое пламя над ладонью, свет с тенями. Сила задаётся извне (0..1) — см. systems/lamp.
// Сквозняк клонит пламя к Вратам — по нему видно, куда идти.
import { Color, ConeGeometry, Group, Mesh, MeshBasicMaterial, PointLight, SphereGeometry, Sprite } from 'three';
import { vnoise } from '../core/rng';
import { Style } from '../data/styles';
import { T } from '../data/tuning';
import { makeGlow } from './glow';

export class Lantern {
  readonly group = new Group();
  readonly light: PointLight;
  private tongue = new Group();        // само пламя: клонится целиком
  private flame: Mesh;
  private core: Mesh;
  private coal: Mesh;
  private glow: Sprite;
  private halo: Sprite;
  private flameColor: Color;
  /** текущий «выход» с учётом мерцания, 0..1 */
  flicker = 1;

  constructor(style: Style, shadowSize = 1024) {
    this.flameColor = new Color(style.lamp);
    // уголёк, из которого растёт пламя
    this.coal = new Mesh(new SphereGeometry(0.022, 6, 5), new MeshBasicMaterial({ color: 0x5a1c08 }));
    this.coal.scale.set(1.3, 0.7, 1.3);
    this.flame = new Mesh(new ConeGeometry(0.034, 0.13, 7, 3), new MeshBasicMaterial({ color: this.flameColor.clone(), transparent: true, opacity: 0.92 }));
    this.flame.position.y = 0.075;
    this.core = new Mesh(new SphereGeometry(0.019, 6, 5), new MeshBasicMaterial({ color: 0xffffff }));
    this.core.position.y = 0.035; this.core.scale.set(1, 1.5, 1);
    this.tongue.add(this.flame, this.core);
    this.glow = makeGlow(style.lamp, 0.9, 1.0);
    this.glow.position.y = 0.07;
    this.halo = makeGlow(style.lamp, 5, 0.02);
    this.halo.position.y = 0.07;
    this.group.add(this.coal, this.tongue, this.glow, this.halo);

    this.light = new PointLight(style.lamp, 0, 12, 0.9);
    this.light.position.y = 0.12;
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(shadowSize, shadowSize);
    this.light.shadow.camera.near = 0.12;
    this.light.shadow.camera.far = 14;
    this.light.shadow.bias = -0.006;
    this.light.shadow.normalBias = 0.04;
    this.group.add(this.light);
  }

  /** power 0..1 — сила пламени, radius — круг света в метрах; leanX/leanZ — куда клонит сквозняк (в осях держащего), gust — 0..1 порыв. */
  update(t: number, power: number, radius: number, gain: number, leanX = 0, leanZ = 0, gust = 0): void {
    const n = vnoise(t * 7.3, 1.7) * 0.6 + vnoise(t * 19.1, 9.2) * 0.4; // 0..1
    const unstable = power < 0.35 ? (0.35 - power) * 2.2 : 0;            // слабое пламя дрожит сильнее
    this.flicker = 1 - (0.1 + unstable * 0.5) * n;
    const p = power * this.flicker;
    this.light.intensity = (3 + 19 * p) * gain * (power > 0.001 ? 1 : 0);
    this.light.distance = Math.max(1.5, radius * 1.55);
    // пламя: чем сильнее, тем выше; клонится по сквозняку и мечется в порыв
    const h = 0.45 + 1.5 * p + n * 0.3;
    this.flame.scale.set(0.7 + 0.5 * p, h, 0.7 + 0.5 * p);
    this.flame.position.y = 0.01 + 0.065 * h;
    const k = T.draft.lean * (1 + 2.2 * gust), wob = (vnoise(t * 9.7, 4.1) - 0.5) * (0.25 + 1.2 * gust);
    this.tongue.rotation.set(leanZ * k + wob * 0.6, 0, -leanX * k + wob);
    (this.flame.material as MeshBasicMaterial).color.copy(this.flameColor).multiplyScalar(1.1 + 2.4 * p);
    (this.core.material as MeshBasicMaterial).color.setScalar(1.2 + 3 * p);
    this.core.visible = p > 0.08;
    (this.glow.material as { opacity: number }).opacity = 0.25 + 0.45 * p;
    this.glow.scale.setScalar(0.3 + 0.5 * p);
    (this.halo.material as { opacity: number }).opacity = p;
    this.halo.scale.setScalar(Math.max(0.5, radius * 1.1));
  }
}
