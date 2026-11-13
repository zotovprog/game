#!/usr/bin/env node
// Автопрогон ключевых сцен: телепорт по уровню, нажатия, кадры. node tools/tour.mjs <outDir> [baseUrl]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out = '.studioigor/captures/tour', base = 'http://localhost:5199/'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base + '?skip=1&reset=1');
await page.waitForFunction('window.__GAME__?.ready');
let n = 0;
const shot = async (name) => { await page.screenshot({ path: `${out}/${String(n++).padStart(2, '0')}-${name}.png` }); console.log(name, JSON.stringify(await page.evaluate('window.__metrics'))); };
const tp = (x, z) => page.evaluate(([x, z]) => window.__GAME__.tp(x, z), [x, z]);
const wait = (s) => page.waitForTimeout(s * 1000);
const key = async (k, hold = 0.12) => { await page.keyboard.down(k); await wait(hold); await page.keyboard.up(k); };
const set = (js) => page.evaluate(js);

await wait(1.5); await shot('start');
await key('KeyW', 2.5); await shot('walk');
await tp(160, 180); await wait(4); await shot('first-spirit');
await set('window.__GAME__.game.lamp.wick = 0.15'); await wait(4); await shot('wick-low');
await set('window.__GAME__.game.lamp.wick = 1'); await wait(2); await shot('wick-high');
await tp(157.3, 166.9); await wait(1); await key('Space'); await wait(3); await shot('brazier');
await tp(145.8, 141.6); await wait(1.5); await shot('efim-hall');
await key('Space'); await wait(1); await shot('efim-talk');
await key('Space'); await wait(0.6); await key('Space'); await wait(0.8); await shot('efim-choice');
await key('Digit1'); await wait(1.2); await shot('efim-accepted');
await key('Space'); await wait(0.5); await key('Space'); await wait(0.5);
await set('window.__GAME__.game.lamp.wick = 0.6');
await key('KeyA', 2.5); await shot('with-efim');
await tp(109, 151); await wait(1); await key('KeyS', 2.2); await wait(1.6); await shot('wisp-trap');
await tp(82, 102.5); await wait(2); await shot('vera-hall');
await tp(80, 101.5); await wait(0.5); await key('Space'); await wait(0.8); await key('Space'); await wait(0.5); await key('Space'); await wait(0.8); await key('Digit2'); await wait(1);
await key('Space'); await wait(0.5); await key('Space'); await wait(3); await shot('vera-leaves');
await tp(72, 86); await wait(1.5); await tp(70, 67); await wait(1.6); await shot('gust'); await wait(2.5); await shot('gust-after');
await tp(61, 49); await wait(3.5); await shot('returned');
await tp(34, 36); await wait(2); await shot('gate-hall');
await tp(26.7, 30.7); await wait(1.5); await shot('bowl');
await key('Space'); await wait(0.6); await key('Space'); await wait(0.6); await key('Space'); await wait(0.8); await shot('bowl-choice');
await key('Digit1'); await wait(7); await shot('beacon');
await wait(10); await shot('ending');
await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
