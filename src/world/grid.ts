// Сетка пещеры: 1 клетка = 1 м. Пол вырезается «кистью» вдоль ломаных, край изъеден шумом.
import { fbm } from '../core/rng';

export interface Carve { pts: [number, number][]; r: number }
export interface Obstacle { x: number; z: number; r: number }

export class Grid {
  readonly cells: Uint8Array;   // 1 — пол
  readonly dist: Uint8Array;    // для стен: расстояние (Чебышёв) до пола, 0 — пол, 255 — далеко
  obstacles: Obstacle[] = [];

  constructor(readonly w: number, readonly h: number, carves: Carve[], seed: number) {
    this.cells = new Uint8Array(w * h);
    this.dist = new Uint8Array(w * h).fill(255);
    for (let j = 1; j < h - 1; j++) {
      for (let i = 1; i < w - 1; i++) {
        const x = i + 0.5, z = j + 0.5;
        let d = 1e9;
        for (const c of carves) d = Math.min(d, distPolyline(x, z, c.pts) - c.r);
        const rough = (fbm(x * 0.33, z * 0.33, seed, 3) - 0.5) * 1.7;
        if (d + rough < 0) this.cells[j * w + i] = 1;
      }
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (this.cells[j * w + i]) { this.dist[j * w + i] = 0; continue; }
      let best = 255;
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
        if (this.floorCell(i + di, j + dj)) best = Math.min(best, Math.max(Math.abs(di), Math.abs(dj)));
      }
      this.dist[j * w + i] = best;
    }
  }

  floorCell(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.w && j < this.h && this.cells[j * this.w + i] === 1;
  }
  isFloor(x: number, z: number): boolean { return this.floorCell(Math.floor(x), Math.floor(z)); }

  /** Расстояние от точки до ближайшей стены (грубо, до 4 м). */
  wallDist(x: number, z: number): number {
    let best = 4;
    const ci = Math.floor(x), cj = Math.floor(z);
    for (let j = cj - 4; j <= cj + 4; j++) for (let i = ci - 4; i <= ci + 4; i++) {
      if (this.floorCell(i, j)) continue;
      const nx = Math.max(i, Math.min(x, i + 1)), nz = Math.max(j, Math.min(z, j + 1));
      best = Math.min(best, Math.hypot(x - nx, z - nz));
    }
    return best;
  }

  /** Выталкивает круг из стен и препятствий. Меняет p на месте. */
  collide(p: { x: number; z: number }, radius: number): void {
    for (let iter = 0; iter < 2; iter++) {
      const ci = Math.floor(p.x), cj = Math.floor(p.z);
      for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
        if (this.floorCell(i, j)) continue;
        const nx = Math.max(i, Math.min(p.x, i + 1)), nz = Math.max(j, Math.min(p.z, j + 1));
        let dx = p.x - nx, dz = p.z - nz;
        const d = Math.hypot(dx, dz);
        if (d >= radius) continue;
        if (d < 1e-5) { dx = p.x - (i + 0.5); dz = p.z - (j + 0.5); const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; p.x += dx * radius; p.z += dz * radius; }
        else { p.x += (dx / d) * (radius - d); p.z += (dz / d) * (radius - d); }
      }
      for (const o of this.obstacles) {
        const dx = p.x - o.x, dz = p.z - o.z, rr = radius + o.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-9) continue;
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (rr - d); p.z += (dz / d) * (rr - d);
      }
    }
  }
}

function distPolyline(x: number, z: number, pts: [number, number][]): number {
  if (pts.length === 1) return Math.hypot(x - pts[0][0], z - pts[0][1]);
  let best = 1e9;
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
    const vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
    best = Math.min(best, Math.hypot(x - (ax + vx * t), z - (az + vz * t)));
  }
  return best;
}
