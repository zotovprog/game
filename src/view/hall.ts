// Залы памяти: куски чужой жизни, вросшие в камень. Пол, обрывки стен с обоями, двери, вещи,
// чаши со знаками, рисунки-подсказки на стенах, статуя и каменная плита. Только вид — правила в systems/halls.ts.
import {
  BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry,
  SphereGeometry, SRGBColorSpace,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm, hash2, smooth } from '../core/rng';
import { BowlsDef, DoorDef, LevelDef, RoomDef, ShadowDef, WallDef } from '../data/level';
import { Style } from '../data/styles';
import { Grid } from '../world/grid';
import { ART, TexId } from './art';
import { darkify, Tri } from './darkness';
import { Fire } from './props';

export interface DoorView { def: DoorDef; x: number; z: number; pivot: Group; emblem: MeshStandardMaterial | null }
export interface BowlView { f: Fire; x: number; z: number; plate: MeshStandardMaterial }
export interface HallView {
  group: Group;
  doors: DoorView[];
  bowls: Map<string, BowlView[]>;
  /** круги-препятствия закрытой двери: убираются, когда она открыта */
  blockers: Map<string, { x: number; z: number; r: number }[]>;
  dispose(): void;
}

const DOOR_W = 0.96, DOOR_H = 2.04, FALLBACK: Partial<Record<TexId, number>> = {
  decrepit_wallpaper: 0x6f6a5c, peeling_painted_wall: 0x7d5a52, rock_wall_10: 0x4a4038, old_linoleum_flooring_01: 0x8a6a3a, wood_planks_dirt: 0x3a2c22, worn_planks: 0x4a3c30,
};

/** Знаки: солнце, месяц, дом, вода, ладонь — нацарапаны мелом. */
function drawGlyph(k: CanvasRenderingContext2D, id: number, cx: number, cy: number, r: number): void {
  k.lineWidth = r * 0.17; k.lineCap = 'round'; k.lineJoin = 'round';
  k.beginPath();
  if (id === 0) {                                   // солнце: круг с точкой и лучами
    k.arc(cx, cy, r * 0.5, 0, 6.3);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; k.moveTo(cx + Math.cos(a) * r * 0.68, cy + Math.sin(a) * r * 0.68); k.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95); }
  } else if (id === 1) {                            // месяц
    k.arc(cx, cy, r * 0.78, 0.9, 5.4);
    k.arc(cx + r * 0.36, cy, r * 0.58, 4.6, 1.7, true);
    k.closePath();
  } else if (id === 2) {                            // дом
    k.moveTo(cx - r * 0.75, cy + r * 0.8); k.lineTo(cx - r * 0.75, cy - r * 0.1); k.lineTo(cx, cy - r * 0.9); k.lineTo(cx + r * 0.75, cy - r * 0.1); k.lineTo(cx + r * 0.75, cy + r * 0.8); k.closePath();
    k.moveTo(cx - r * 0.15, cy + r * 0.8); k.lineTo(cx - r * 0.15, cy + r * 0.25); k.lineTo(cx + r * 0.2, cy + r * 0.25); k.lineTo(cx + r * 0.2, cy + r * 0.8);
  } else if (id === 3) {                            // вода
    for (let j = -1; j <= 1; j++) { k.moveTo(cx - r * 0.85, cy + j * r * 0.45); k.bezierCurveTo(cx - r * 0.4, cy + j * r * 0.45 - r * 0.4, cx + r * 0.1, cy + j * r * 0.45 + r * 0.4, cx + r * 0.85, cy + j * r * 0.45); }
  } else {                                          // глаз
    k.moveTo(cx - r * 0.9, cy); k.quadraticCurveTo(cx, cy - r * 0.85, cx + r * 0.9, cy); k.quadraticCurveTo(cx, cy + r * 0.85, cx - r * 0.9, cy);
    k.moveTo(cx + r * 0.3, cy); k.arc(cx, cy, r * 0.3, 0, 6.3);
  }
  k.stroke();
}
function canvasTex(w: number, h: number, draw: (k: CanvasRenderingContext2D) => void, ink = '#efe6d2'): CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const k = c.getContext('2d')!;
  k.strokeStyle = k.fillStyle = ink;
  draw(k);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace;
  return t;
}

export function buildHalls(grid: Grid, style: Style, def: LevelDef): HallView {
  const group = new Group();
  const trash: { dispose(): void }[] = [];
  const triOf = (id: TexId, scale: number, gain: number): Tri | undefined => { const t = ART.tex[id]; return t ? { wallC: t.c, wallN: t.n, groundC: t.c, groundN: t.n, wall: scale, ground: scale, gain, bump: 1 } : undefined; };
  const wallMats = new Map<TexId, MeshStandardMaterial>();
  const wallMat = (id: TexId): MeshStandardMaterial => {
    let m = wallMats.get(id);
    if (!m) {
      const tri = triOf(id, id === 'rock_wall_10' ? 0.42 : 0.55, id === 'rock_wall_10' ? 1.7 : 1.0);
      m = darkify(new MeshStandardMaterial({ color: tri ? 0xffffff : FALLBACK[id] ?? 0x666666, roughness: 0.95, vertexColors: true }), true, false, false, tri);
      wallMats.set(id, m); trash.push(m);
    }
    return m;
  };
  /** Материал стен берёт цвет из вершин: у прочей геометрии он белый. */
  const white = <G extends BufferGeometry>(g: G): G => { g.setAttribute('color', new BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3)); return g; };
  const add = (m: Mesh, shadow = true): Mesh => { m.castShadow = shadow; m.receiveShadow = true; group.add(m); trash.push(m.geometry); return m; };
  const doorsOn = (w: WallDef) => def.doors.filter((d) => d.axis === w.axis && Math.abs((w.axis === 'x' ? d.at[1] : d.at[0]) - w.at) < 0.2);

  // ---------- полы
  for (const room of def.rooms) floor(room);
  function floor(room: RoomDef): void {
    const tex = ART.tex[room.floor];
    const [x0, z0, x1, z1] = room.rect, STEP = 0.5;
    const nx = Math.ceil((x1 - x0) / STEP), nz = Math.ceil((z1 - z0) / STEP);
    const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = Math.min(x1, x0 + i * STEP), z = Math.min(z1, z0 + j * STEP);
      pos.push(x, 0.035, z); uv.push(x / room.tile, z / room.tile);
      let a = 1;
      if (room.ragged) {                                                   // обрывок: край тает в камень неровно
        const edge = Math.min(x - x0, x1 - x, z - z0, z1 - z);
        a = smooth(0.0, 1.0, edge + (fbm(x * 0.9, z * 0.9, def.seed + 60, 2) - 0.5) * 1.3);
        if (!grid.isFloor(x, z)) a = 0;
      }
      const g = 0.86 + 0.28 * fbm(x * 0.6, z * 0.6, def.seed + 61, 2);
      col.push(g, g, g, a);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const v = j * (nx + 1) + i; idx.push(v, v + nx + 1, v + 1, v + 1, v + nx + 1, v + nx + 2); }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 4));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mat = darkify(new MeshStandardMaterial({
      map: tex?.c ?? null, normalMap: tex?.n ?? null, color: tex ? 0xffffff : FALLBACK[room.floor] ?? 0x555555, vertexColors: true, roughness: 0.82,
      transparent: !!room.ragged, depthWrite: !room.ragged, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    if (tex) mat.color.setScalar(room.floor === 'old_linoleum_flooring_01' ? 0.55 : 1.4);
    trash.push(mat);
    const m = add(new Mesh(geo, mat), false);
    m.renderOrder = 1;
  }

  // ---------- стены: обрывки, выше и ниже, с проёмами под двери
  const blockers = new Map<string, { x: number; z: number; r: number }[]>();
  for (const room of def.rooms) for (const w of room.walls) wall(w);
  function wall(w: WallDef): void {
    const H = w.h ?? 2.6, TH = 0.18, gaps = doorsOn(w).map((d) => (w.axis === 'x' ? d.at[0] : d.at[1]));
    const boxes: BufferGeometry[] = [];
    const box = (a: number, b: number, y0: number, y1: number) => {
      const len = b - a, g = w.axis === 'x' ? new BoxGeometry(len, y1 - y0, TH) : new BoxGeometry(TH, y1 - y0, len);
      const mid = (a + b) / 2;
      if (w.axis === 'x') g.translate(mid, (y0 + y1) / 2, w.at - TH / 2); else g.translate(w.at - TH / 2, (y0 + y1) / 2, mid);
      // лицо стены — обои; изнанка и торцы — тёмная штукатурка и кирпич
      const nrm = g.getAttribute('normal') as BufferAttribute, colr = new Float32Array(nrm.count * 3);
      for (let v = 0; v < nrm.count; v++) { const front = (w.axis === 'x' ? nrm.getZ(v) : nrm.getX(v)) > 0.5; const c = front ? 1 : nrm.getY(v) > 0.5 ? 0.34 : 0.16; colr[v * 3] = c; colr[v * 3 + 1] = c * (front ? 1 : 0.86); colr[v * 3 + 2] = c * (front ? 1 : 0.76); }
      g.setAttribute('color', new BufferAttribute(colr, 3));
      boxes.push(g);
    };
    const n = Math.max(1, Math.round((w.to - w.from) / 1.1)), seg = (w.to - w.from) / n;
    for (let i = 0; i < n; i++) {
      const a = w.from + i * seg, b = a + seg + 0.01;
      const fromEnd = Math.min(i, n - 1 - i);
      // края стены обломаны и уходят в камень; середина — почти целая
      let h = H * (fromEnd === 0 ? 0.35 + 0.3 * hash2(i, 7, def.seed) : fromEnd === 1 ? 0.7 + 0.2 * hash2(i, 8, def.seed) : 0.94 + 0.1 * hash2(i, 9, def.seed));
      const gap = gaps.find((c) => c + DOOR_W / 2 + 0.07 > a && c - DOOR_W / 2 - 0.07 < b);
      if (gap !== undefined) {
        h = H;
        const l = gap - DOOR_W / 2 - 0.07, r = gap + DOOR_W / 2 + 0.07;
        if (l > a + 0.02) box(a, l, 0, h);
        if (r < b - 0.02) box(r, b, 0, h);
        box(Math.max(a, l), Math.min(b, r), DOOR_H + 0.08, h);           // стена над дверью
        continue;
      }
      if (gaps.some((c) => Math.abs((a + b) / 2 - c) < 2.2)) h = H * (0.96 + 0.06 * hash2(i, 9, def.seed));
      box(a, b, 0, h);
    }
    const geo = mergeGeometries(boxes)!;
    boxes.forEach((g) => g.dispose());
    add(new Mesh(geo, wallMat(w.tex)));
    if (!w.solid) return;
    // стена посреди хода: не пускает, кроме проёма
    for (let c = w.from; c <= w.to; c += 0.42) {
      if (gaps.some((gc) => Math.abs(c - gc) < DOOR_W / 2 + 0.2)) continue;
      grid.obstacles.push(w.axis === 'x' ? { x: c, z: w.at - 0.05, r: 0.27 } : { x: w.at - 0.05, z: c, r: 0.27 });
    }
  }

  // ---------- двери
  const woodTex = ART.tex.worn_planks;
  const leafMat = darkify(new MeshStandardMaterial({ map: woodTex?.c ?? null, normalMap: woodTex?.n ?? null, color: woodTex ? 0xb8a898 : FALLBACK.worn_planks!, roughness: 0.9 }), true);
  const frameMat = darkify(new MeshStandardMaterial({ color: 0x2a211a, roughness: 1 }), true);
  const ironMat = darkify(new MeshStandardMaterial({ color: 0x3a3632, roughness: 0.5, metalness: 0.6 }));
  trash.push(leafMat, frameMat, ironMat);
  const doors: DoorView[] = def.doors.map((d) => {
    const [x, z] = d.at, pivot = new Group();
    let emblem: MeshStandardMaterial | null = null;
    const along = (o: number): [number, number] => (d.axis === 'x' ? [x + o, z] : [x, z + o]);       // сдвиг вдоль стены
    if (d.kind === 'wood') {
      // косяк и притолока
      for (const side of [-1, 1]) { const [px, pz] = along(side * (DOOR_W / 2 + 0.04)); const post = add(new Mesh(new BoxGeometry(0.1, DOOR_H + 0.1, 0.24), frameMat)); post.position.set(px, (DOOR_H + 0.1) / 2, pz); if (d.axis === 'z') post.rotation.y = Math.PI / 2; }
      const top = add(new Mesh(new BoxGeometry(DOOR_W + 0.2, 0.1, 0.24), frameMat));
      top.position.set(x, DOOR_H + 0.07, z); if (d.axis === 'z') top.rotation.y = Math.PI / 2;
      // створка на петлях: петля у края, полотно — от неё вдоль стены
      const [hx, hz] = along(-DOOR_W / 2);
      pivot.position.set(hx, 0, hz); if (d.axis === 'z') pivot.rotation.y = -Math.PI / 2;
      const leaf = new Mesh(new BoxGeometry(DOOR_W - 0.03, DOOR_H - 0.03, 0.055), leafMat);
      leaf.position.set(DOOR_W / 2, DOOR_H / 2, 0); leaf.castShadow = true; leaf.receiveShadow = true;
      // филёнки и ручка: дверь не доска
      for (const [py, ph] of [[0.55, 0.8], [1.5, 0.75]] as const) { const panel = new Mesh(new BoxGeometry(DOOR_W - 0.28, ph, 0.075), leafMat); panel.position.set(DOOR_W / 2, py, 0); pivot.add(panel); trash.push(panel.geometry); }
      const knob = new Mesh(new SphereGeometry(0.035, 8, 6), ironMat), knob2 = new Mesh(knob.geometry, ironMat);
      knob.position.set(DOOR_W - 0.12, 1.0, 0.06); knob2.position.set(DOOR_W - 0.12, 1.0, -0.06);
      pivot.add(leaf, knob, knob2); trash.push(leaf.geometry, knob.geometry);
      group.add(pivot);
    } else {
      // каменная плита со знаком: тень должна лечь на него
      const slab = new Mesh(white(d.axis === 'z' ? new BoxGeometry(0.34, 2.7, DOOR_W + 0.5) : new BoxGeometry(DOOR_W + 0.5, 2.7, 0.34)), wallMat('rock_wall_10'));
      slab.position.y = 1.35; slab.castShadow = true; slab.receiveShadow = true;
      const tex = canvasTex(256, 256, (k) => { k.globalAlpha = 0.95; drawGlyph(k, 4, 128, 128, 92); });
      emblem = darkify(new MeshStandardMaterial({ map: tex, transparent: true, color: 0x8f8a7c, emissive: 0xd6ecd0, emissiveMap: tex, emissiveIntensity: 0, roughness: 1, depthWrite: false }), false, true);
      const plate = new Mesh(new PlaneGeometry(0.95, 0.95), emblem);
      plate.position.set(d.axis === 'z' ? 0.18 : 0, 1.42, d.axis === 'z' ? 0 : 0.18); if (d.axis === 'z') plate.rotation.y = Math.PI / 2;
      pivot.position.set(x - (d.axis === 'z' ? 0.12 : 0), 0, z - (d.axis === 'x' ? 0.12 : 0));
      pivot.add(slab, plate); trash.push(slab.geometry, plate.geometry, emblem, tex);
      group.add(pivot);
    }
    blockers.set(d.id, [-0.3, 0.3].map((o) => { const [bx, bz] = along(o); return { x: bx, z: bz, r: 0.36 }; }));
    return { def: d, x, z, pivot, emblem };
  });

  // ---------- вещи
  for (const room of def.rooms) for (const p of room.props) {
    const m = ART.models[p.m];
    if (!m) continue;
    const k = p.h ? p.h / m.size.y : 1, g = new Group();
    for (const part of m.parts) { const mat = darkify(part.mat.clone(), true); trash.push(mat); const mesh = new Mesh(part.geo, mat); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); }
    g.position.set(p.at[0], p.y ?? 0, p.at[1]); g.rotation.y = p.ry ?? 0;
    if (p.s) g.scale.set(p.s[0], p.s[1], p.s[2]); else g.scale.setScalar(k);
    group.add(g);
    if (p.r) grid.obstacles.push({ x: p.at[0], z: p.at[1], r: p.r });
  }

  // ---------- чаши со знаками и рисунок на стене
  const fresco = (f: BowlsDef['fresco'], w: number, h: number, draw: (k: CanvasRenderingContext2D) => void, ink?: string) => {
    const tex = canvasTex(512, Math.round((512 * h) / w), draw, ink);
    const mat = darkify(new MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, depthWrite: false, side: DoubleSide }));
    const m = new Mesh(new PlaneGeometry(w, h), mat);
    m.position.set(f.at[0] + (f.axis === 'z' ? 0.02 : 0), f.y, f.at[1] + (f.axis === 'x' ? 0.02 : 0)); if (f.axis === 'z') m.rotation.y = Math.PI / 2;
    m.renderOrder = 2; group.add(m); trash.push(m.geometry, mat, tex);
  };
  const bowls = new Map<string, BowlView[]>();
  for (const b of def.bowls) bowlSet(b);
  function bowlSet(b: BowlsDef): void {
    bowls.set(b.id, b.bowls.map((at, i) => {
      const f = new Fire(style, 'brazier', 70 + i);
      f.group.position.set(at[0], 0, at[1]); f.group.scale.setScalar(0.82);
      group.add(f.group);
      grid.obstacles.push({ x: at[0], z: at[1], r: 0.42 });
      const tex = canvasTex(128, 128, (k) => drawGlyph(k, b.glyphs[i], 64, 64, 46));
      const plate = darkify(new MeshStandardMaterial({ map: tex, transparent: true, color: 0xb0a890, emissive: 0xffb46e, emissiveMap: tex, emissiveIntensity: 0, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));
      const pm = new Mesh(new PlaneGeometry(0.7, 0.7), plate);
      pm.rotation.x = -Math.PI / 2; pm.rotation.z = Math.PI / 4;              // лицом к камере
      pm.position.set(at[0] + 0.62, 0.06, at[1] + 0.62); pm.renderOrder = 2;
      group.add(pm); trash.push(pm.geometry, plate, tex);
      return { f, x: at[0], z: at[1], plate };
    }));
    // рисунок: знаки в том порядке, в каком зажигать; под каждым — зарубки
    fresco(b.fresco, 1.5, 0.68, (k) => {
      k.globalAlpha = 0.9;
      b.order.forEach((bi, n) => {
        const cx = 90 + n * 166;
        drawGlyph(k, b.glyphs[bi], cx, 92, 58);
        for (let t = 0; t <= n; t++) { k.lineWidth = 7; k.beginPath(); k.moveTo(cx - n * 11 + t * 22, 178); k.lineTo(cx - n * 11 + t * 22 - 4, 212); k.stroke(); }
      });
    }, '#1b1512');                                  // углём по крашеной стене
  }

  // ---------- статуя и рисунок про тень
  for (const s of def.shadows) statue(s);
  function statue(s: ShadowDef): void {
    const m = ART.models.gothic_statue, g = new Group();
    if (m) {
      const k = 1.95 / m.size.y;
      for (const part of m.parts) { const mat = darkify(part.mat.clone(), true); trash.push(mat); const mesh = new Mesh(part.geo, mat); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); }
      g.scale.setScalar(k);
    } else {
      const mat = wallMat('rock_wall_10');
      const body = new Mesh(white(new CylinderGeometry(0.28, 0.42, 1.5, 8)), mat), head = new Mesh(white(new SphereGeometry(0.24, 8, 6)), mat);
      body.position.y = 0.75; head.position.y = 1.7; body.castShadow = head.castShadow = true;
      g.add(body, head); trash.push(body.geometry, head.geometry);
    }
    g.position.set(s.statue[0], 0, s.statue[1]); g.rotation.y = s.face;
    group.add(g);
    grid.obstacles.push({ x: s.statue[0], z: s.statue[1], r: 0.62 });
    // рисунок: огонь — фигура — тень на двери со знаком
    fresco(s.fresco, 1.3, 0.56, (k) => {
      k.globalAlpha = 0.82; k.lineWidth = 8; k.lineCap = 'round';
      k.beginPath(); k.moveTo(70, 150); k.quadraticCurveTo(40, 105, 70, 55); k.quadraticCurveTo(100, 105, 70, 150); k.stroke();        // огонь
      k.beginPath(); k.arc(215, 62, 22, 0, 6.3); k.moveTo(215, 84); k.lineTo(215, 170); k.moveTo(180, 112); k.lineTo(250, 112); k.stroke();   // фигура
      k.strokeRect(372, 34, 96, 150);                                                                                               // дверь
      k.globalAlpha = 0.5; k.beginPath(); k.moveTo(240, 172); k.lineTo(372, 184); k.lineTo(372, 60); k.lineTo(240, 100); k.closePath(); k.fill();   // тень
      k.globalAlpha = 0.9; drawGlyph(k, 4, 420, 104, 30);
    });
  }

  return { group, doors, bowls, blockers, dispose() { trash.forEach((d) => d.dispose()); } };
}
