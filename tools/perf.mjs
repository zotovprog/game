#!/usr/bin/env node
// Замер кадра в нескольких местах пещеры: вызовы отрисовки, треугольники, время кадра.
// node tools/perf.mjs <baseUrl> [outDir]   (программный GL: сравнивать только «до/после»)
import { chromium } from 'playwright';
import fs from 'node:fs';
const [base = 'http://localhost:5199/', out = ''] = process.argv.slice(2);
if (out) fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base + (base.includes('?') ? '&' : '?') + 'skip=1&reset=1');
await page.waitForFunction('window.__GAME__?.ready', null, { timeout: 120000 });
const spots = [['start', 176, 193.5, 60], ['mine', 140, 174.5, 90], ['columns', 118, 142, 30], ['void', 88, 98, 12]];
for (const [name, x, z, oil] of spots) {
  await page.evaluate(`(() => { const g = window.__GAME__.game; g.lamp.oil = ${oil}; g.lamp.lit = true; window.__GAME__.tp(${x}, ${z}); })()`);
  await page.waitForTimeout(2500);
  const r = await page.evaluate(`new Promise((done) => {
    const g = window.__GAME__.game, info = g.stage.renderer.info; info.autoReset = false; info.reset();
    let n = 0, t0 = performance.now();
    const tick = () => { if (++n < 12) requestAnimationFrame(tick); else { const ms = (performance.now() - t0) / 12; done({ ms, calls: info.render.calls / 12, tris: info.render.triangles / 12 }); info.autoReset = true; } };
    requestAnimationFrame(tick);
  })`);
  console.log(name.padEnd(8), 'frame', r.ms.toFixed(0).padStart(5), 'ms · calls', r.calls.toFixed(0).padStart(5), '· tris', Math.round(r.tris).toLocaleString('en').padStart(10));
  if (out) await page.screenshot({ path: `${out}/${name}.png` });
}
await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.slice(0, 8).join('\n')); process.exit(1); }
