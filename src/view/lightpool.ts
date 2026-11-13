// Пул точечных источников без теней: число огней в шейдере постоянно, ближайшие к герою получают свет.
import { PointLight, Scene } from 'three';

export interface Emitter { x: number; y: number; z: number; color: number; intensity: number; distance: number }

export class LightPool {
  private lights: PointLight[] = [];
  private list: Emitter[] = [];
  constructor(scene: Scene, n = 3) {
    for (let i = 0; i < n; i++) {
      const l = new PointLight(0xffffff, 0, 8, 1.6);
      this.lights.push(l);
      scene.add(l);
    }
  }
  begin(): void { this.list.length = 0; }
  add(e: Emitter): void { if (e.intensity > 0.01) this.list.push(e); }
  commit(fx: number, fz: number): void {
    this.list.sort((a, b) => (a.x - fx) ** 2 + (a.z - fz) ** 2 - ((b.x - fx) ** 2 + (b.z - fz) ** 2));
    this.lights.forEach((l, i) => {
      const e = this.list[i];
      if (!e) { l.intensity = 0; return; }
      l.position.set(e.x, e.y, e.z); l.color.set(e.color); l.intensity = e.intensity; l.distance = e.distance;
    });
  }
}
