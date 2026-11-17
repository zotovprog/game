#!/usr/bin/env node
// Карта куска уровня: node tools/map.mjs <out.png> <baseUrl> x0 z0 x1 z1 [px на метр=9]
import { chromium } from 'playwright';
const [out, base, x0, z0, x1, z1, px = '9'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.goto(base + '?skip=1&reset=1&calm=1');
await page.waitForFunction('window.__GAME__?.ready', null, { timeout: 180000 });
await page.evaluate(`(() => {
  const g = window.__GAME__.game, S = ${+px}, X0 = ${+x0}, Z0 = ${+z0}, X1 = ${+x1}, Z1 = ${+z1};
  const c = document.createElement('canvas'); c.id = 'map'; c.width = (X1 - X0) * S; c.height = (Z1 - Z0) * S;
  c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#111';
  const k = c.getContext('2d');
  const col = { rubble: '#6b6258', mine: '#8a6a3a', columns: '#5f7a7a', water: '#2f5a5a', void: '#4a4a78', fissure: '#7a4a44', gate: '#9a8a4a' };
  for (let z = Z0; z < Z1; z++) for (let x = X0; x < X1; x++) if (g.grid.floorCell(x, z)) { k.fillStyle = col[g.grid.kindAt(x + 0.5, z + 0.5)]; k.fillRect((x - X0) * S, (z - Z0) * S, S - 1, S - 1); }
  k.strokeStyle = '#333'; k.fillStyle = '#888'; k.font = '10px sans-serif';
  for (let x = Math.ceil(X0 / 10) * 10; x < X1; x += 10) { k.beginPath(); k.moveTo((x - X0) * S, 0); k.lineTo((x - X0) * S, c.height); k.stroke(); k.fillText(x, (x - X0) * S + 2, 10); }
  for (let z = Math.ceil(Z0 / 10) * 10; z < Z1; z += 10) { k.beginPath(); k.moveTo(0, (z - Z0) * S); k.lineTo(c.width, (z - Z0) * S); k.stroke(); k.fillText(z, 2, (z - Z0) * S + 10); }
  const dot = (x, z, color, label) => { k.fillStyle = color; k.beginPath(); k.arc((x - X0) * S, (z - Z0) * S, 4, 0, 7); k.fill(); k.fillStyle = '#fff'; k.fillText(label, (x - X0) * S + 6, (z - Z0) * S + 4); };
  g.braziers.forEach((b, i) => dot(b.x, b.z, '#ff8a3a', 'B' + i));
  dot(g.npcs.efim.x, g.npcs.efim.z, '#fff', 'Ефим'); dot(g.pos.x, g.pos.z, '#0f0', 'старт'); dot(g.family.x, g.family.z, '#ff0', 'семья');
  g.wisps.forEach((w) => dot(w.x, w.z, '#9fe', w.id)); g.lures.forEach((l, i) => dot(l.x, l.z, '#f6f', 'зов' + i));
  if (g.halls) for (const m of g.halls.marks()) dot(m.x, m.z, m.c, m.t);
  document.body.append(c);
})()`);
await page.locator('#map').screenshot({ path: out });
await browser.close();
