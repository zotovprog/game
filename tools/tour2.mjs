#!/usr/bin/env node
// Автопрогон 2: вступление, лампа, смерть, след прошлой попытки, телефон. node tools/tour2.mjs <outDir> [baseUrl]
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const [out = '.studioigor/captures/tour2', base = 'http://localhost:5199/'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let n = 0;
const shot = async (name, p = page) => { await p.screenshot({ path: `${out}/${String(n++).padStart(2, '0')}-${name}.png` }); console.log(name, JSON.stringify(await p.evaluate('window.__metrics'))); };
const wait = (s) => page.waitForTimeout(s * 1000);
const key = async (k, hold = 0.12) => { await page.keyboard.down(k); await wait(hold); await page.keyboard.up(k); };
const mode = () => page.evaluate('window.__metrics.mode');

await page.goto(base + '?reset=1');
await page.waitForFunction('window.__GAME__?.ready');
await page.click('.overlay button');
await wait(4); await shot('intro-text');
await page.waitForFunction('window.__metrics.mode === "play"', null, { timeout: 120000 });
await wait(1); await shot('awake');
await key('KeyA', 0.4); await wait(2.5); await shot('stood');
// дойти до лампы: телепорт вплотную и взять
await page.evaluate('(() => { const g = window.__GAME__.game; window.__GAME__.tp(g.lampOnGround.x + 0.6, g.lampOnGround.z + 0.5); })()');
await wait(1); await shot('lamp-prompt');
await key('Space'); await wait(3); await shot('lamp-taken');
// масло на нуле: отсрочка и смерть
await page.evaluate('window.__GAME__.tp(160, 180); window.__GAME__.game.flags.add("firstSpirit"); window.__GAME__.game.lamp.oil = 0.5');
await wait(5); await shot('ember');
await page.waitForFunction('window.__metrics.mode === "dead"', null, { timeout: 180000 });
await wait(2); await shot('dying');
await page.waitForSelector('.overlay button', { timeout: 120000 });
await wait(9); await shot('dead-screen');
console.log('trace', await page.evaluate('localStorage.getItem("cave-remembers.v1")'));
// вторая попытка: без меню, сразу вступление; у места гибели — твой дух и твоя лампа
await page.click('.overlay button');
await page.waitForFunction('window.__GAME__?.ready && window.__metrics?.mode === "play"', null, { timeout: 180000 });
console.log('after restart', await mode());
await page.goto(base + '?skip=1');
await page.waitForFunction('window.__GAME__?.ready');
await page.evaluate('window.__GAME__.tp(163.5, 182)');
await wait(4); await shot('own-ghost');
// телефон
const phone = await browser.newContext({ ...devices['iPhone 13'] });
const pp = await phone.newPage();
pp.on('pageerror', (e) => errors.push('phone: ' + String(e)));
await pp.goto(base + '?skip=1&reset=1');
await pp.waitForFunction('window.__GAME__?.ready');
await pp.touchscreen.tap(100, 500);
await pp.waitForTimeout(2500); await shot('phone-portrait', pp);
await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
