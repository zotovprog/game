// Пещера: сплошной сглаженный рельеф (пол + стены одной поверхностью) и то, что в ней стоит.
// Стены со стороны камеры низкие, дальние — высокие: героя видно, а скалы работают как задник.
import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Euler, Group, InstancedMesh,
  Matrix4, Mesh, MeshLambertMaterial, MeshStandardMaterial, PlaneGeometry, Quaternion, SphereGeometry, Vector3,
} from 'three';
import { clamp, fbm, hash2, lerp, mulberry32, smooth } from '../core/rng';
import { LevelDef } from '../data/level';
import { Style } from '../data/styles';
import { Grid, Kind } from '../world/grid';
import { darkify } from './darkness';

const SUB = 2, STEP = 1 / SUB, CH = 16;
const WALL_H: Record<Kind, number> = { rubble: 3.0, mine: 2.8, columns: 3.5, water: 3.2, void: 2.4, fissure: 3.4, gate: 4.2 };
const TONE: Record<Kind, number> = { rubble: 1, mine: 0.92, columns: 1.06, water: 0.72, void: 0.8, fissure: 0.95, gate: 1.1 };

export interface Cave { cairns: { x: number; y: number; z: number }[]; group: Group; dispose(): void }
interface Inst { m: Matrix4; c: Color }

/** Мягко мнёт геометрию шумом и пересчитывает гладкие нормали. */
function knead(geo: BufferGeometry, amp: number, seed: number, freq = 1.3): BufferGeometry {
  const pos = geo.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 + (fbm(x * freq + y * 0.7 + 31, z * freq - y * 0.5 + 17, seed, 2) - 0.5) * amp;
    pos.setXYZ(i, x * k, y, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

export function buildCave(grid: Grid, style: Style, def: LevelDef): Cave {
  const seed = def.seed, rng = mulberry32(seed);
  const group = new Group();
  const trash: { dispose(): void }[] = [];
  const cA = new Color(style.floor), cB = new Color(style.floorAlt), rA = new Color(style.rock), rB = new Color(style.rockAlt), col = new Color();

  // ---------- рельеф: высоты и цвета по вершинам
  const VW = grid.w * SUB + 1, VH = grid.h * SUB + 1;
  const hgt = new Float32Array(VW * VH).fill(NaN), px = new Float32Array(VW * VH), pz = new Float32Array(VW * VH), rgb = new Float32Array(VW * VH * 3);
  // 1) знаковое расстояние до границы пола: в камне — плюс, на полу — минус
  let sd = new Float32Array(VW * VH).fill(NaN);
  const fd = [0, 0, 0];
  for (let gz = 0; gz < VH; gz++) for (let gx = 0; gx < VW; gx++) {
    const x0 = gx * STEP, z0 = gz * STEP;
    const ci = Math.min(grid.w - 1, Math.floor(x0)), cj = Math.min(grid.h - 1, Math.floor(z0));
    let near = 255;
    for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 0; di++) {
      const i = ci + di, j = cj + dj;
      if (i >= 0 && j >= 0) near = Math.min(near, grid.dist[j * grid.w + i]);
    }
    if (near > 3) continue;
    grid.floorDist(x0, z0, fd);
    sd[gz * VW + gx] = fd[0] < 0.02 ? -Math.min(3, grid.wallDist(x0, z0)) : fd[0];
  }
  // 2) размытие: граница пола перестаёт быть лесенкой из клеток, стены — гладкие
  for (let pass = 0; pass < 3; pass++) {
    const nx = new Float32Array(VW * VH).fill(NaN);
    for (let gz = 1; gz < VH - 1; gz++) for (let gx = 1; gx < VW - 1; gx++) {
      const v = gz * VW + gx;
      if (Number.isNaN(sd[v])) continue;
      let sum = 0, wsum = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const q = sd[v + dj * VW + di];
        if (Number.isNaN(q)) continue;
        const wgt = (di === 0 ? 2 : 1) * (dj === 0 ? 2 : 1);
        sum += q * wgt; wsum += wgt;
      }
      nx[v] = sum / wsum;
    }
    sd = nx;
  }
  // 3) высоты и цвета
  const S = (gx: number, gz: number, fb: number): number => { const q = sd[gz * VW + gx]; return Number.isNaN(q) ? fb : q; };
  for (let gz = 1; gz < VH - 1; gz++) for (let gx = 1; gx < VW - 1; gx++) {
    const v = gz * VW + gx, d = sd[v];
    if (Number.isNaN(d)) continue;
    const x0 = gx * STEP, z0 = gz * STEP;
    const x = x0 + (hash2(gx, gz, seed + 21) - 0.5) * 0.2, z = z0 + (hash2(gx, gz, seed + 22) - 0.5) * 0.2;
    px[v] = x; pz[v] = z;
    const kind = grid.kindAt(Math.min(grid.w - 0.01, x0), Math.min(grid.h - 0.01, z0));
    let h: number;
    if (d <= 0) {
      const dIn = -d;
      h = (fbm(x * 0.9, z * 0.9, seed + 5, 3) - 0.5) * 0.1 + 0.13 * (1 - smooth(0, 0.8, dIn)) ** 2;
      if (kind === 'water') h -= 0.36 * smooth(0.5, 2.0, dIn);
      const grit = fbm(x * 1.9, z * 1.9, seed + 14, 2);                    // мелкая фактура: камень, а не ровная плита
      col.copy(cA).lerp(cB, clamp((fbm(x * 0.23, z * 0.23, seed + 9, 3) - 0.3) * 2.2, 0, 1)).multiplyScalar(TONE[kind] * (0.62 + grit * 0.7) * (0.92 + hash2(gx, gz, seed) * 0.16));
    } else {
      // камень со стороны камеры (+x+z от пола) — низкий бортик, иначе закроет героя
      const gxd = S(gx + 1, gz, d) - S(gx - 1, gz, d), gzd = S(gx, gz + 1, d) - S(gx, gz - 1, d), gl = Math.hypot(gxd, gzd) || 1;
      const facing = (gxd + gzd) / gl * 0.7071;
      const Hk = WALL_H[kind] * (0.8 + 0.45 * fbm(x * 0.15, z * 0.15, seed + 3, 2));
      const low = smooth(-0.1, 0.6, facing);
      const H = lerp(Hk, 1.2, low);
      h = 0.13 + H * (1 - Math.exp(-d * 1.9)) + (fbm(x * 0.42, z * 0.42, seed + 6, 2) - 0.5) * 0.9 * smooth(0.3, 1.7, d) + (hash2(gx, gz, seed + 4) - 0.5) * 0.03;
      const strata = 0.5 + 0.5 * Math.sin(h * 4.2 + fbm(x * 0.5, z * 0.5, seed + 12, 2) * 6);
      // за гребнем стены ничего нет: камень там чёрный, чтобы не казалось, будто туда можно пройти
      const beyond = (1 - low * smooth(0.3, 0.9, d)) * (1 - smooth(1.15, 2.0, d));
      col.copy(rA).lerp(rB, strata * 0.8).multiplyScalar(TONE[kind] * (1 - 0.06 * Math.min(h, 4)) * beyond);
    }
    hgt[v] = h; rgb[v * 3] = col.r; rgb[v * 3 + 1] = col.g; rgb[v * 3 + 2] = col.b;
  }
  // стены сглаживаются ещё раз по высоте: без торчащих граней и «осколков»
  for (let pass = 0; pass < 2; pass++) {
    const nx = hgt.slice();
    for (let gz = 1; gz < VH - 1; gz++) for (let gx = 1; gx < VW - 1; gx++) {
      const v = gz * VW + gx;
      if (Number.isNaN(hgt[v]) || !(sd[v] > 0.2)) continue;
      let sum = 0, wsum = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const q = hgt[v + dj * VW + di];
        if (Number.isNaN(q)) continue;
        const wgt = (di === 0 ? 2 : 1) * (dj === 0 ? 2 : 1);
        sum += q * wgt; wsum += wgt;
      }
      nx[v] = sum / wsum;
    }
    hgt.set(nx);
  }
  const terrainMat = darkify(new MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 }), true, false, true);
  trash.push(terrainMat);
  const P = (gx: number, gz: number, out: Vector3, fb: Vector3): Vector3 => {
    if (gx < 0 || gz < 0 || gx >= VW || gz >= VH) return out.copy(fb);
    const v = gz * VW + gx;
    return Number.isNaN(hgt[v]) ? out.copy(fb) : out.set(px[v], hgt[v], pz[v]);
  };
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), d2 = new Vector3(), o = new Vector3(), n = new Vector3();
  for (let cz = 0; cz * CH < grid.h; cz++) for (let cx = 0; cx * CH < grid.w; cx++) {
    const idx = new Map<number, number>(), pos: number[] = [], nor: number[] = [], cols: number[] = [], tris: number[] = [];
    const vid = (gx: number, gz: number): number => {
      const key = gz * VW + gx;
      let v = idx.get(key);
      if (v !== undefined) return v;
      v = pos.length / 3;
      o.set(px[key], hgt[key], pz[key]);
      pos.push(o.x, o.y, o.z);
      P(gx + 1, gz, a, o); P(gx - 1, gz, b, o); P(gx, gz + 1, c, o); P(gx, gz - 1, d2, o);
      n.crossVectors(c.sub(d2), a.sub(b)).normalize();
      if (n.y < 0) n.negate();
      nor.push(n.x, n.y, n.z);
      cols.push(rgb[key * 3], rgb[key * 3 + 1], rgb[key * 3 + 2]);
      idx.set(key, v);
      return v;
    };
    for (let gz = cz * CH * SUB; gz < Math.min((cz + 1) * CH * SUB, VH - 1); gz++) for (let gx = cx * CH * SUB; gx < Math.min((cx + 1) * CH * SUB, VW - 1); gx++) {
      const k = gz * VW + gx;
      if (Number.isNaN(hgt[k]) || Number.isNaN(hgt[k + 1]) || Number.isNaN(hgt[k + VW]) || Number.isNaN(hgt[k + VW + 1])) continue;
      const v00 = vid(gx, gz), v10 = vid(gx + 1, gz), v01 = vid(gx, gz + 1), v11 = vid(gx + 1, gz + 1);
      if ((gx + gz) % 2 === 0) tris.push(v00, v01, v10, v10, v01, v11); else tris.push(v00, v01, v11, v00, v11, v10);
    }
    if (!tris.length) continue;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(cols), 3));
    geo.setIndex(tris);
    const mesh = new Mesh(geo, terrainMat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    trash.push(geo);
  }

  // ---------- что стоит в пещере
  const rockMat = darkify(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 }), true, false, true);
  const woodMat = darkify(new MeshStandardMaterial({ color: 0x2a2018, roughness: 1 }), true);
  const ironMat = darkify(new MeshStandardMaterial({ color: 0x23262a, roughness: 0.55, metalness: 0.7 }));
  const boneMat = darkify(new MeshStandardMaterial({ color: 0xa8a294, roughness: 0.8 }));
  trash.push(rockMat, woodMat, ironMat, boneMat);
  const boulderGeo = new SphereGeometry(1, 9, 7);
  { // глыба: мятая, приплюснутая, с плоским низом — не шар
    const bp = boulderGeo.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
      const k = 0.72 + fbm(x * 1.1 + y * 0.8 + 3, z * 1.1 - y * 0.6 + 9, seed + 1, 3) * 0.75;
      bp.setXYZ(i, x * k * (1 + 0.25 * Math.sign(x) * hash2(i, 3, seed)), Math.max(-0.35, y * k * 0.62), z * k);
    }
    boulderGeo.computeVertexNormals();
  }
  const spikeGeo = new ConeGeometry(0.34, 1.7, 10, 9);
  { // сталагмит: наплывы, тупая вершина, лёгкий изгиб
    const sp = spikeGeo.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < sp.count; i++) {
      const y = sp.getY(i) / 1.7 + 0.5;                       // 0 у основания, 1 на вершине
      const k = 1 + 0.22 * Math.sin(y * 11 + sp.getX(i) * 3) + (fbm(sp.getX(i) * 3 + 5, y * 5, seed + 2, 2) - 0.5) * 0.5 + 0.5 * y * y;
      sp.setXYZ(i, sp.getX(i) * k + y * y * 0.16, sp.getY(i) * (1 - 0.12 * y), sp.getZ(i) * k);
    }
    spikeGeo.computeVertexNormals();
    spikeGeo.translate(0, 0.8, 0);
  }
  const colGeo = new CylinderGeometry(0.5, 0.62, 5, 10, 8);
  { // колонна с «талией» и наплывами
    const p = colGeo.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 5, k = 0.72 + 0.5 * Math.abs(y) ** 1.6 * 2 + (fbm(p.getX(i) * 2 + 3, y * 6, seed + 30, 2) - 0.5) * 0.3;
      p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k);
    }
    colGeo.computeVertexNormals();
    colGeo.translate(0, 2.3, 0);
  }
  const pebbleGeo = knead(new SphereGeometry(1, 6, 4), 0.4, seed + 3);
  trash.push(boulderGeo, spikeGeo, colGeo, pebbleGeo);
  const boulders: Inst[] = [], spikes: Inst[] = [], columns: Inst[] = [], pebbles: Inst[] = [], bones: Inst[] = [];
  const q = new Quaternion(), e = new Euler(), s = new Vector3(), p = new Vector3();
  const tint = () => rA.clone().lerp(rB, rng()).multiplyScalar(0.85 + rng() * 0.3);
  const keep: [number, number][] = [def.start.hero, def.start.lamp, def.start.dead, ...def.flasks, ...def.braziers, ...def.wisps.map((w) => w.at),
    def.efim.at, def.efim.fire, def.vera.at, ...def.vera.path, def.mila.at, def.family.fire, def.shade.at, def.toy.at, def.gate.bowl, def.cart, ...def.rails.flat()];
  const clear = (x: number, z: number, r: number) => keep.every((k) => Math.hypot(k[0] - x, k[1] - z) > r);
  const SPIKE: Record<Kind, number> = { rubble: 0.07, mine: 0.02, columns: 0.2, water: 0.16, void: 0.03, fissure: 0.16, gate: 0.02 };
  const BOULDER: Record<Kind, number> = { rubble: 0.1, mine: 0.04, columns: 0.05, water: 0.07, void: 0.1, fissure: 0.05, gate: 0.03 };
  for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) {
    if (!grid.floorCell(i, j)) continue;
    const kind = grid.kindAt(i, j);
    const nearWall = !grid.floorCell(i + 1, j) || !grid.floorCell(i - 1, j) || !grid.floorCell(i, j + 1) || !grid.floorCell(i, j - 1);
    const x = i + 0.5 + (rng() - 0.5) * 0.5, z = j + 0.5 + (rng() - 0.5) * 0.5;
    if (nearWall && rng() < SPIKE[kind] && clear(x, z, 1.2)) {
      const k = 0.5 + rng() * 1.1;
      e.set((rng() - 0.5) * 0.2, rng() * 6.28, (rng() - 0.5) * 0.2); q.setFromEuler(e);
      spikes.push({ m: new Matrix4().compose(p.set(x, -0.06, z), q, s.set(k, k * (0.7 + rng() * 0.8), k)), c: tint() });
      grid.obstacles.push({ x, z, r: 0.24 * k });
    } else if ((nearWall ? rng() < BOULDER[kind] : kind === 'void' && rng() < 0.014) && clear(x, z, 1.8)) {
      const r = nearWall ? 0.3 + rng() * 0.45 : 0.6 + rng() * 0.7;
      e.set(rng() * 0.6, rng() * 6.28, rng() * 0.6); q.setFromEuler(e);
      boulders.push({ m: new Matrix4().compose(p.set(x, r * 0.25, z), q, s.set(r * (0.9 + rng() * 0.4), r * (0.6 + rng() * 0.4), r)), c: tint() });
      if (r > 0.36) grid.obstacles.push({ x, z, r: r * 0.85 });
    }
    // колонный зал: столбы по неровной решётке
    if (kind === 'columns' && i % 4 === 0 && j % 4 === 0) {
      const cx = i + 0.5 + (rng() - 0.5) * 2.2, cz = j + 0.5 + (rng() - 0.5) * 2.2;
      if (grid.isFloor(cx, cz) && grid.wallDist(cx, cz) > 1.5 && clear(cx, cz, 2.2)) {
        const k = 0.75 + rng() * 0.6;
        e.set((rng() - 0.5) * 0.08, rng() * 6.28, (rng() - 0.5) * 0.08); q.setFromEuler(e);
        columns.push({ m: new Matrix4().compose(p.set(cx, -0.1, cz), q, s.set(k, 0.85 + rng() * 0.3, k)), c: tint() });
        grid.obstacles.push({ x: cx, z: cz, r: 0.56 * k });
      }
    }
    if (rng() < 0.22) {
      const sc = 0.025 + rng() * rng() * 0.07;
      e.set(rng() * 6.28, rng() * 6.28, rng() * 6.28); q.setFromEuler(e);
      pebbles.push({ m: new Matrix4().compose(p.set(i + rng(), sc * 0.3 + 0.02, j + rng()), q, s.set(sc * (1 + rng()), sc, sc * (1 + rng()))), c: tint() });
    }
  }
  // кости у ложных огней: они здесь не первые
  const boneGeo = new CylinderGeometry(0.018, 0.024, 0.34, 5);
  trash.push(boneGeo);
  for (const w of def.wisps) for (let k = 0; k < 9; k++) {
    const an = rng() * 6.28, r = 0.5 + rng() * 1.6;
    const [bx, bz] = grid.snap(w.at[0] + Math.cos(an) * r, w.at[1] + Math.sin(an) * r, 0.2);
    e.set(Math.PI / 2 + (rng() - 0.5) * 0.3, rng() * 6.28, rng() * 6.28); q.setFromEuler(e);
    bones.push({ m: new Matrix4().compose(p.set(bx, 0.04, bz), q, s.set(1, 0.6 + rng() * 0.9, 1)), c: new Color(1, 1, 1).multiplyScalar(0.7 + rng() * 0.3) });
  }
  // пирамидки: кто-то не дошёл и оставил лампу на камнях
  const lampGeo = new BoxGeometry(0.13, 0.2, 0.13);
  trash.push(lampGeo);
  const deadLamps: Inst[] = [];
  const cairns: { x: number; y: number; z: number }[] = [];
  for (const cp of def.cairns) {
    const [x, z] = grid.snap(cp[0], cp[1], 0.6);
    let y = 0;
    for (let k = 0; k < 4; k++) {
      const r = 0.34 - k * 0.07 + rng() * 0.04;
      e.set(rng() * 0.3, rng() * 6.28, rng() * 0.3); q.setFromEuler(e);
      boulders.push({ m: new Matrix4().compose(p.set(x + (rng() - 0.5) * 0.08, y + r * 0.3, z + (rng() - 0.5) * 0.08), q, s.set(r, r * 0.75, r)), c: tint() });
      y += r * 0.55;
    }
    e.set(0.25, rng() * 6.28, 0.1); q.setFromEuler(e);
    deadLamps.push({ m: new Matrix4().compose(p.set(x, y + 0.1, z), q, s.set(1, 1, 1)), c: new Color(1, 1, 1) });
    cairns.push({ x, y: y + 0.1, z });
    grid.obstacles.push({ x, z, r: 0.4 });
  }
  // выработка: ящики, бочки, брошенные доски
  const crateGeo = new BoxGeometry(1, 1, 1), barrelGeo = new CylinderGeometry(0.5, 0.44, 1, 9), plankGeo = new BoxGeometry(1.5, 0.05, 0.2);
  trash.push(crateGeo, barrelGeo, plankGeo);
  const crates: Inst[] = [], barrels: Inst[] = [], planks: Inst[] = [], rubble: Inst[] = [];
  const wood = () => new Color(1, 1, 1).multiplyScalar(0.7 + rng() * 0.5);
  for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) {
    if (!grid.floorCell(i, j)) continue;
    const kind = grid.kindAt(i, j), x = i + 0.5 + (rng() - 0.5) * 0.4, z = j + 0.5 + (rng() - 0.5) * 0.4;
    const wd = grid.wallDist(x, z);
    if (kind === 'mine' && wd < 1.4 && wd > 0.5 && clear(x, z, 1.6)) {
      const roll = rng();
      if (roll < 0.05) {
        const k = 0.42 + rng() * 0.3;
        e.set(0, rng() * 6.28, 0); q.setFromEuler(e);
        crates.push({ m: new Matrix4().compose(p.set(x, k / 2, z), q, s.set(k, k, k)), c: wood() });
        if (rng() < 0.35) crates.push({ m: new Matrix4().compose(p.set(x + 0.1, k + k * 0.35, z - 0.05), q, s.set(k * 0.7, k * 0.7, k * 0.7)), c: wood() });
        grid.obstacles.push({ x, z, r: k * 0.62 });
      } else if (roll < 0.075) {
        const k = 0.5 + rng() * 0.2, tip = rng() < 0.3;
        e.set(tip ? Math.PI / 2 : 0, rng() * 6.28, 0); q.setFromEuler(e);
        barrels.push({ m: new Matrix4().compose(p.set(x, tip ? k * 0.5 : k * 0.55, z), q, s.set(k, k * 1.1, k)), c: wood() });
        grid.obstacles.push({ x, z, r: k * 0.55 });
      }
    }
    if (kind === 'mine' && rng() < 0.03) {
      e.set(0, rng() * 6.28, (rng() - 0.5) * 0.1); q.setFromEuler(e);
      planks.push({ m: new Matrix4().compose(p.set(x, 0.05, z), q, s.set(0.6 + rng() * 0.6, 1, 1)), c: wood() });
    }
    // россыпь щебня: несколько камней кучкой
    if (rng() < (kind === 'rubble' || kind === 'void' ? 0.045 : 0.02)) {
      const n = 3 + Math.floor(rng() * 5);
      for (let k = 0; k < n; k++) {
        const sc = 0.06 + rng() * 0.15, an = rng() * 6.28, rr = rng() * 0.55;
        e.set(rng() * 6.28, rng() * 6.28, rng() * 6.28); q.setFromEuler(e);
        rubble.push({ m: new Matrix4().compose(p.set(x + Math.cos(an) * rr, sc * 0.35, z + Math.sin(an) * rr), q, s.set(sc * (1 + rng() * 0.6), sc * 0.7, sc)), c: tint() });
      }
    }
  }

  // по кускам 16×16 м: рисуется и отбрасывает тень только то, что рядом с камерой и лампой
  const add = (geo: BufferGeometry, mat: MeshStandardMaterial, arr: Inst[], shadow = true) => {
    const cells = new Map<number, Inst[]>();
    for (const it of arr) {
      const k = Math.floor(it.m.elements[12] / 16) + 64 * Math.floor(it.m.elements[14] / 16);
      const list = cells.get(k);
      if (list) list.push(it); else cells.set(k, [it]);
    }
    for (const list of cells.values()) {
      const im = new InstancedMesh(geo, mat, list.length);
      list.forEach((it, k) => { im.setMatrixAt(k, it.m); im.setColorAt(k, it.c); });
      im.castShadow = shadow; im.receiveShadow = true;
      im.computeBoundingSphere();
      group.add(im);
      trash.push(im);
    }
  };
  add(boulderGeo, rockMat, boulders); add(spikeGeo, rockMat, spikes); add(colGeo, rockMat, columns);
  add(pebbleGeo, rockMat, pebbles); add(boneGeo, boneMat, bones, false);
  add(pebbleGeo, rockMat, rubble); add(lampGeo, ironMat, deadLamps, false);
  add(crateGeo, woodMat, crates); add(barrelGeo, woodMat, barrels); add(plankGeo, woodMat, planks, false);

  // ---------- старая выработка: крепь, рельсы, вагонетка
  const mk = (geo: BufferGeometry, mat: MeshStandardMaterial, x: number, y: number, z: number, ry = 0, shadow = true) => {
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = shadow; m.receiveShadow = true;
    group.add(m); trash.push(geo);
    return m;
  };
  for (const cv of def.carves) {
    if (cv.kind !== 'mine' || cv.r > 2.6 || cv.pts.length < 2) continue;
    for (let k = 0; k < cv.pts.length - 1; k++) {
      const [ax, az] = cv.pts[k], [bx, bz] = cv.pts[k + 1];
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
      for (let t = 2.5; t < len - 1.5; t += 5.5) {
        const mx = ax + ux * t, mz = az + uz * t, half = cv.r - 0.75, ry = Math.atan2(-uz, ux) + Math.PI / 2;
        const ends: [number, number][] = [[mx - uz * half, mz + ux * half], [mx + uz * half, mz - ux * half]];
        if (!ends.every(([x, z]) => grid.isFloor(x, z))) continue;
        for (const [x, z] of ends) {
          mk(new CylinderGeometry(0.085, 0.11, 2.45, 6), woodMat, x, 1.2, z).rotation.z = (rng() - 0.5) * 0.08;
          grid.obstacles.push({ x, z, r: 0.15 });
        }
        mk(new BoxGeometry(half * 2 + 0.5, 0.16, 0.2), woodMat, mx, 2.45, mz, ry).rotation.z = (rng() - 0.5) * 0.05;
      }
    }
  }
  const sleepers: Inst[] = [];
  for (const line of def.rails) for (let k = 0; k < line.length - 1; k++) {
    const [ax, az] = line[k], [bx, bz] = line[k + 1];
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, ry = Math.atan2(-uz, ux);
    for (const side of [-0.36, 0.36]) mk(new BoxGeometry(len + 0.1, 0.07, 0.05), ironMat, (ax + bx) / 2 - uz * side, 0.1, (az + bz) / 2 + ux * side, ry, false);
    for (let t = 0.3; t < len; t += 0.85) {
      e.set(0, ry + (rng() - 0.5) * 0.12, 0); q.setFromEuler(e);
      sleepers.push({ m: new Matrix4().compose(p.set(ax + ux * t, 0.04, az + uz * t), q, s.set(1, 1, 1)), c: new Color(1, 1, 1) });
    }
  }
  const sleeperGeo = new BoxGeometry(0.17, 0.06, 1.15);
  trash.push(sleeperGeo);
  add(sleeperGeo, woodMat, sleepers, false);
  { // вагонетка, съехавшая с рельсов
    const [x, z] = grid.snap(def.cart[0], def.cart[1], 1);
    const body = mk(new BoxGeometry(1.5, 0.75, 0.95), ironMat, x, 0.62, z, 0.5);
    body.rotation.z = 0.16;
    for (const [dx, dz] of [[-0.5, -0.4], [0.5, -0.4], [-0.5, 0.4], [0.5, 0.4]]) {
      const w = mk(new CylinderGeometry(0.2, 0.2, 0.08, 10), ironMat, x + dx * Math.cos(0.5) + dz * Math.sin(0.5), 0.2, z - dx * Math.sin(0.5) + dz * Math.cos(0.5), 0.5);
      w.rotation.x = Math.PI / 2;
    }
    grid.obstacles.push({ x, z, r: 0.85 });
  }

  // ---------- чёрная вода в затопленных ходах
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) {
    if (grid.floorCell(i, j) && grid.kindAt(i, j) === 'water') { x0 = Math.min(x0, i); x1 = Math.max(x1, i + 1); z0 = Math.min(z0, j); z1 = Math.max(z1, j + 1); }
  }
  if (x1 > x0) {
    const water = new Mesh(new PlaneGeometry(x1 - x0 + 2, z1 - z0 + 2), darkify(new MeshLambertMaterial({ color: 0x07090b, transparent: true, opacity: 0.72 })));
    water.rotation.x = -Math.PI / 2;
    water.position.set((x0 + x1) / 2, -0.11, (z0 + z1) / 2);
    water.receiveShadow = true;
    group.add(water);
    trash.push(water.geometry, water.material as MeshLambertMaterial);
  }

  return { group, cairns, dispose() { trash.forEach((d) => d.dispose()); } };
}
