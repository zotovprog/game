#!/usr/bin/env node
// Кадры мест в новом виде (нужен http: текстуры и модели грузятся по сети).
// node tools/look.mjs <outDir> <baseUrl> "имя:x,z[:js]" ...   (огонёк держится полным, сквозняков нет)
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out, base, ...places] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
await page.goto(base + '?skip=1&reset=1&calm=1');
await page.waitForFunction('window.__GAME__?.ready', null, { timeout: 180000 });
await page.evaluate(`(() => { const g = window.__GAME__.game; setInterval(() => { g.lamp.oil = Math.max(g.lamp.oil, 95); }, 200); })()`);
for (const pl of places) {
  const [name, xz, js = ''] = pl.split(':'), [x, z] = xz.split(',').map(Number);      // третья часть — что выполнить перед кадром
  await page.evaluate(`(() => { const g = window.__GAME__.game; const [sx, sz] = g.grid.snap(${x}, ${z}, 0.4); window.__GAME__.tp(sx, sz); ${js} })()`);
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${out}/${name}.png` });
}
console.log('art', await page.evaluate(`JSON.stringify(window.__art ?? null)`), 'errors', errors.length, errors.slice(0, 4).join(' | '));
await browser.close();
