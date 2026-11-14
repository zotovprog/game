#!/usr/bin/env node
// Автопрогон 2: вступление, лампа, гибель, повтор со «следом», телефон. node tools/tour2.mjs <outDir> [baseUrl]
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const [out = '.studioigor/captures/tour2', base = 'http://localhost:5199/'] = process.argv.slice(2);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let n = 0;
const shot = async (name, p = page) => { await p.screenshot({ path: `${out}/${String(n++).padStart(2, '0')}-${name}.png` }); const x = await p.evaluate('window.__metrics'); console.log(name, `oil=${x.oil} mode=${x.mode}`); };
const wait = (s) => page.waitForTimeout(s * 1000);
const key = async (k, hold = 0.12) => { await page.keyboard.down(k); await wait(hold); await page.keyboard.up(k); };

await page.goto(base + '?reset=1');
await page.waitForFunction('window.__GAME__?.ready');
await wait(1); await shot('menu');
await page.click('.overlay button');
await page.waitForFunction('window.__metrics.mode === "play"', null, { timeout: 180000 });
await key('KeyA', 0.4); await wait(2.5);
await page.evaluate('(() => { const g = window.__GAME__.game; window.__GAME__.tp(g.lampOnGround.x + 0.6, g.lampOnGround.z + 0.5); })()');
await wait(1); await shot('lamp-button');
await page.click('#act'); await wait(3); await shot('lamp-taken');
await page.evaluate('window.__GAME__.tp(166, 186); window.__GAME__.game.flags.add("firstDark"); window.__GAME__.game.lamp.oil = 0.4');
await wait(6); await shot('ember');
await page.waitForFunction('window.__metrics.mode === "dead"', null, { timeout: 240000 });
await wait(0.4); await shot('death-scream');
await page.waitForSelector('.overlay.black button', { timeout: 120000 });
await wait(8); await shot('dead-screen');
await page.click('.overlay.black button');
await page.waitForFunction('window.__metrics?.mode === "play"', null, { timeout: 240000 });
console.log('restart ok, trace', await page.evaluate('localStorage.getItem("cave-remembers.v1")'));
await page.evaluate('(() => { const g = window.__GAME__.game; g.story.skipIntro(); window.__GAME__.tp(168.5, 187.5); })()');
await wait(5); await shot('own-ghost');
// телефон: портрет и альбом, с кнопкой действия и выбором
for (const [name, dev] of [['phone-portrait', devices['iPhone 13']], ['phone-landscape', devices['iPhone 13 landscape']]]) {
  const pp = await (await browser.newContext({ ...dev })).newPage();
  pp.on('pageerror', (e) => errors.push(name + ': ' + String(e)));
  await pp.goto(base + '?skip=1&reset=1', { timeout: 120000 });
  await pp.waitForFunction('window.__GAME__?.ready');
  await pp.evaluate('(() => { const g = window.__GAME__.game; window.__GAME__.tp(g.family.x + 1.7, g.family.z + 1.3); g.lamp.oil = 70; })()');
  await pp.waitForTimeout(7000); await shot(name + '-act', pp);
  await pp.tap('#act'); await pp.waitForTimeout(1500);
  for (let i = 0; i < 30; i++) {
    if (await pp.evaluate(`document.querySelectorAll('#dialog .opts button').length`)) break;
    await pp.tap('#dialog .txt'); await pp.waitForTimeout(500);
  }
  await pp.waitForTimeout(800); await shot(name + '-choice', pp);
}
await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.slice(0, 8).join('\n')); process.exit(1); }
