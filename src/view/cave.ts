// Геометрия пещеры из сетки: пол, стены из гранёных глыб (инстансы по чанкам), сталагмиты, галька.
import {
  BufferAttribute, BufferGeometry, Color, ConeGeometry, Group, IcosahedronGeometry, InstancedMesh,
  Matrix4, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3, Euler,
} from 'three';
import { fbm, hash2, mulberry32 } from '../core/rng';
import { Style } from '../data/styles';
import { Grid } from '../world/grid';
import { darkify } from './darkness';

const CHUNK = 12;

export function roughen(geo: BufferGeometry, amp: number, seed: number): BufferGeometry {
  const pos = geo.getAttribute('position') as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = fbm(x * 1.7 + y * 0.9 + 31, z * 1.7 - y * 0.6 + 17, seed, 2) - 0.5;
    const k = 1 + n * amp;
    pos.setXYZ(i, x * k, y * (1 + n * amp * 0.5), z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

export interface Cave { group: Group; dispose(): void }

export function buildCave(grid: Grid, style: Style, seed: number): Cave {
  const rng = mulberry32(seed);
  const group = new Group();
  const disposables: { dispose(): void }[] = [];

  // ---------- пол
  const floorMat = darkify(new MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, flatShading: true }));
  const SUB = 2, step = 1 / SUB;
  const idx = new Map<number, number>();
  const verts: number[] = [], cols: number[] = [], tris: number[] = [];
  const cA = new Color(style.floor), cB = new Color(style.floorAlt), c = new Color();
  const vid = (gx: number, gz: number): number => {
    const key = gz * (grid.w * SUB + 1) + gx;
    let v = idx.get(key);
    if (v === undefined) {
      const x = gx * step + (hash2(gx, gz, seed + 21) - 0.5) * 0.34, z = gz * step + (hash2(gx, gz, seed + 22) - 0.5) * 0.34;
      const y = (fbm(x * 0.9, z * 0.9, seed + 5, 3) - 0.5) * 0.16;
      v = verts.length / 3;
      verts.push(x, y, z);
      c.copy(cA).lerp(cB, Math.min(1, Math.max(0, (fbm(x * 0.23, z * 0.23, seed + 9, 3) - 0.3) * 2.2)));
      const j = 0.94 + hash2(gx, gz, seed) * 0.12;
      cols.push(c.r * j, c.g * j, c.b * j);
      idx.set(key, v);
    }
    return v;
  };
  for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) {
    if (grid.dist[j * grid.w + i] > 1) continue;
    for (let sj = 0; sj < SUB; sj++) for (let si = 0; si < SUB; si++) {
      const gx = i * SUB + si, gz = j * SUB + sj;
      const a = vid(gx, gz), b = vid(gx + 1, gz), d = vid(gx, gz + 1), e = vid(gx + 1, gz + 1);
      if ((gx + gz) % 2 === 0) tris.push(a, d, b, b, d, e); else tris.push(a, d, e, a, e, b);
    }
  }
  const floorGeo = new BufferGeometry();
  floorGeo.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  floorGeo.setAttribute('color', new BufferAttribute(new Float32Array(cols), 3));
  floorGeo.setIndex(tris);
  floorGeo.computeVertexNormals();
  const floor = new Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  group.add(floor);
  disposables.push(floorGeo, floorMat);

  // ---------- стены: глыбы
  const boulderGeo = roughen(new IcosahedronGeometry(1, 1), 0.55, seed + 1);
  const wallMat = darkify(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: 0, flatShading: true }), true);
  disposables.push(boulderGeo, wallMat);
  const perChunk = new Map<number, { m: Matrix4; c: Color }[]>();
  const m = new Matrix4(), q = new Quaternion(), e = new Euler(), s = new Vector3(), p = new Vector3();
  const rA = new Color(style.rock), rB = new Color(style.rockAlt);
  const push = (i: number, j: number, ring: number) => {
    const jx = (rng() - 0.5) * 0.5, jz = (rng() - 0.5) * 0.5;
    const sx = 0.72 + rng() * 0.4, sz = 0.72 + rng() * 0.4;
    const sy = ring === 1 ? 1.2 + rng() * 1.3 : 2.2 + rng() * 1.6;
    e.set((rng() - 0.5) * 0.5, rng() * Math.PI * 2, (rng() - 0.5) * 0.5);
    q.setFromEuler(e);
    p.set(i + 0.5 + jx, sy * 0.25, j + 0.5 + jz);
    s.set(sx, sy, sz);
    m.compose(p, q, s);
    const key = Math.floor(j / CHUNK) * 1000 + Math.floor(i / CHUNK);
    let arr = perChunk.get(key);
    if (!arr) perChunk.set(key, (arr = []));
    arr.push({ m: m.clone(), c: rA.clone().lerp(rB, rng()).multiplyScalar(0.85 + rng() * 0.3) });
  };
  for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) {
    const d = grid.dist[j * grid.w + i];
    if (d === 1) { push(i, j, 1); if (rng() < 0.35) push(i, j, 1); }
    else if (d === 2 && rng() < 0.8) push(i, j, 2);
  }
  for (const arr of perChunk.values()) {
    const im = new InstancedMesh(boulderGeo, wallMat, arr.length);
    arr.forEach((it, k) => { im.setMatrixAt(k, it.m); im.setColorAt(k, it.c); });
    im.castShadow = true; im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
    disposables.push(im);
  }

  // ---------- сталагмиты (препятствия) и галька
  const spikeGeo = roughen(new ConeGeometry(0.34, 1.5, 6, 3), 0.5, seed + 2);
  spikeGeo.translate(0, 0.7, 0);
  const pebbleGeo = roughen(new IcosahedronGeometry(1, 0), 0.5, seed + 3);
  const decoMat = darkify(new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }));
  disposables.push(spikeGeo, pebbleGeo, decoMat);
  const spikes: { m: Matrix4; c: Color }[] = [], pebbles: { m: Matrix4; c: Color }[] = [];
  for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) {
    if (!grid.floorCell(i, j)) continue;
    const nearWall = !grid.floorCell(i + 1, j) || !grid.floorCell(i - 1, j) || !grid.floorCell(i, j + 1) || !grid.floorCell(i, j - 1);
    if (nearWall && rng() < 0.16) {
      const x = i + 0.5 + (rng() - 0.5) * 0.4, z = j + 0.5 + (rng() - 0.5) * 0.4, k = 0.6 + rng() * 0.9;
      e.set((rng() - 0.5) * 0.25, rng() * 6.28, (rng() - 0.5) * 0.25); q.setFromEuler(e);
      spikes.push({ m: new Matrix4().compose(p.set(x, -0.05, z), q, s.set(k, k * (0.8 + rng() * 0.7), k)), c: rA.clone().lerp(rB, rng()) });
      grid.obstacles.push({ x, z, r: 0.26 * k });
    }
    const n = rng() < 0.35 ? 1 + Math.floor(rng() * 2) : 0;
    for (let k = 0; k < n; k++) {
      const sc = 0.025 + rng() * rng() * 0.09;
      e.set(rng() * 6.28, rng() * 6.28, rng() * 6.28); q.setFromEuler(e);
      pebbles.push({ m: new Matrix4().compose(p.set(i + rng(), sc * 0.3, j + rng()), q, s.set(sc * (1 + rng()), sc, sc * (1 + rng()))), c: rA.clone().lerp(rB, rng()) });
    }
  }
  const addInst = (geo: BufferGeometry, arr: { m: Matrix4; c: Color }[], shadow: boolean) => {
    if (!arr.length) return;
    const im = new InstancedMesh(geo, decoMat, arr.length);
    arr.forEach((it, k) => { im.setMatrixAt(k, it.m); im.setColorAt(k, it.c); });
    im.castShadow = shadow; im.receiveShadow = true;
    im.frustumCulled = false;
    group.add(im);
    disposables.push(im);
  };
  addInst(spikeGeo, spikes, true);
  addInst(pebbleGeo, pebbles, true);

  return { group, dispose() { disposables.forEach((d) => d.dispose()); } };
}

/** Удобный помощник: поставить объект на пол. */
export function place(o: Object3D, x: number, z: number, y = 0): void { o.position.set(x, y, z); }
