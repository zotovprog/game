#!/usr/bin/env node
// Обзор мест уровня: телепорт + кадр. node tools/places.mjs <outDir> [baseUrl] [wick]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out = '.studioigor/captures/places', base = 'http://localhost:5199/', wick = '0.75'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base + '?skip=1&reset=1');
await page.waitForFunction('window.__GAME__?.ready');
const places = [['start', 184, 198], ['cart', 161, 183], ['efim', 135.5, 173.5], ['columns', 117, 143], ['water', 108, 181], ['family', 127.5, 118.5], ['vera', 79, 131], ['void', 86, 97], ['mila', 72, 92], ['shade', 73.5, 166], ['throat', 52, 56], ['gate', 31, 37]];
let n = 0;
for (const [name, x, z] of places) {
  await page.evaluate(([x, z, w]) => { const g = window.__GAME__.game; window.__GAME__.tp(x, z); g.lamp.wick = w; g.lamp.oil = 80; }, [x, z, +wick]);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${out}/${String(n++).padStart(2, '0')}-${name}.png` });
  console.log(name, JSON.stringify(await page.evaluate('window.__metrics')).slice(0, 110));
}
console.log('scene', JSON.stringify(await page.evaluate(`(() => { let tris = 0, meshes = 0; window.__GAME__.game.stage.scene.traverse((o) => { if (o.isMesh && o.geometry) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } }); return { tris: Math.round(tris), meshes }; })()`)));
await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.slice(0, 8).join('\n')); process.exit(1); }
