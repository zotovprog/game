#!/usr/bin/env node
// Тьма при разном свете: кадры в одном месте с фитилём 1 / 0.55 / 0.15 и на последнем издыхании.
// node tools/dark.mjs <url> <outDir> [x z]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [url, out, x = '135.5', z = '173.5'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
await page.goto(url + '?skip=1&reset=1');
await page.waitForFunction('window.__GAME__?.ready', null, { timeout: 120000 });
const spots = process.argv[6] === 'tour'
  ? [['start', 0.55, 80, 184, 198], ['columns', 0.55, 80, 117, 143], ['throat', 0.55, 80, 52, 56], ['gate', 0.55, 80, 27, 33], ['family', 0.55, 80, 127.5, 118.5], ['shade', 0.4, 80, 73.5, 166]]
  : [['bright', 1, 80, +x, +z], ['mid', 0.55, 80, +x, +z], ['dim', 0.15, 80, +x, +z], ['low', 0.15, 3, +x, +z]];
for (const [name, wick, oil, sx, sz] of spots) {
  await page.evaluate(([x, z, w, o]) => { const g = window.__GAME__.game; window.__GAME__.tp(x, z); g.lamp.oil = o; g.lamp.ember = 0; if (g.family.state === 'wait' && Math.hypot(g.family.x - x, g.family.z - z) < 5) { g.family.fire.lit = true; g.family.state = 'fire'; } }, [sx, sz, wick, oil]);
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(name, JSON.stringify(await page.evaluate('({ r: +window.__GAME__.game.radius.toFixed(2), mode: window.__metrics.mode })')));
}
await browser.close();
if (errors.length) console.error('MESSAGES:\n' + [...new Set(errors)].slice(0, 6).join('\n'));
