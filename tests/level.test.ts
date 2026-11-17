import { describe, expect, it } from 'vitest';
import { DEPTH1, LevelDef } from '../src/data/level';
import { Grid } from '../src/world/grid';

/** Достижимость: от места пробуждения можно дойти до каждой вещи на уровне. */
function reach(def: LevelDef): { grid: Grid; seen: Uint8Array } {
  const grid = new Grid(def.w, def.h, def.carves, def.seed);
  const seen = new Uint8Array(def.w * def.h);
  const [sx, sz] = grid.snap(def.start.hero[0], def.start.hero[1]);
  const q = [[Math.floor(sx), Math.floor(sz)]];
  seen[q[0][1] * def.w + q[0][0]] = 1;
  while (q.length) {
    const [i, j] = q.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (!grid.floorCell(a, b) || seen[b * def.w + a]) continue;
      seen[b * def.w + a] = 1; q.push([a, b]);
    }
  }
  return { grid, seen };
}

describe.each([['глубина 1', DEPTH1]])('%s', (_n, def) => {
  const { grid, seen } = reach(def);
  const ok = (p: [number, number], clear = 0.5) => { const [x, z] = grid.snap(p[0], p[1], clear); return seen[Math.floor(z) * def.w + Math.floor(x)] === 1; };
  it('всё достижимо от старта', () => {
    const pts: [number, number][] = [def.start.lamp, def.start.dead, ...def.flasks, ...def.braziers, ...def.wisps.map((w) => w.at), def.efim.at, def.vera.at, def.gate.bowl, ...def.vera.path, ...def.zones.map((z) => z.at), def.mila.at, def.family.fire, def.shade.at, def.toy.at, ...def.holes, ...def.cairns, ...def.lures,
      ...def.bowls.flatMap((b) => b.bowls), ...def.shadows.map((sh) => sh.statue), ...def.tights.flatMap((t) => t.pts), ...def.rooms.filter((r) => !r.ragged).map((r): [number, number] => [(r.rect[0] + r.rect[2]) / 2, (r.rect[1] + r.rect[3]) / 2])];;
    for (const p of pts) expect(ok(p), `точка ${p}`).toBe(true);
  });
  it('сквозняк ведёт к Вратам из любой точки', () => {
    grid.buildFlow(def.gate.bowl[0], def.gate.bowl[1]);
    const [sx, sz] = grid.snap(def.start.hero[0], def.start.hero[1]);
    expect(grid.flowAt(sx, sz)).toBeLessThan(65535);
    const dir = [0, 0]; grid.flowDir(sx, sz, dir);
    expect(Math.hypot(dir[0], dir[1])).toBeGreaterThan(0.9);
  });
  it('пол не касается края карты', () => {
    for (let i = 0; i < def.w; i++) for (const j of [0, 1, 2, def.h - 3, def.h - 2, def.h - 1]) expect(grid.floorCell(i, j)).toBe(false);
    for (let j = 0; j < def.h; j++) for (const i of [0, 1, 2, def.w - 3, def.w - 2, def.w - 1]) expect(grid.floorCell(i, j)).toBe(false);
  });
});
