#!/usr/bin/env node
// Автопрогон: точка возврата у жаровни, бросок тьмы, вал в конце. node tools/check.mjs <outDir> <baseUrl>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out = '.studioigor/captures/check', base = 'http://localhost:5199/'] = process.argv.slice(2);
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base + '?skip=1&reset=1');
await page.waitForFunction('window.__GAME__?.ready', null, { timeout: 120000 });
const D = (e) => page.evaluate(e);
const wait = (s) => page.waitForTimeout(s * 1000);
const key = async (k) => { await page.keyboard.down(k); await wait(0.12); await page.keyboard.up(k); };
const G = 'window.__GAME__.game';
let n = 0;
const shot = async (name) => { await page.screenshot({ path: `${out}/${String(n++).padStart(2, '0')}-${name}.png` }); };
// 1) масло убывает быстро, круг сжимается
const r0 = await D(`${G}.radius`), o0 = await D(`${G}.lamp.oil`);
await key('KeyW'); await wait(12);
console.log('oil', o0.toFixed(0), '→', (await D(`${G}.lamp.oil`)).toFixed(0), '· radius', r0.toFixed(2), '→', (await D(`${G}.radius`)).toFixed(2), '· dread', (await D(`${G}.dread`)).toFixed(2));
// 2) жаровня = точка возврата; гибель → возврат к огню
await D(`(() => { const g = ${G}, b = g.braziers[0]; g.lamp.oil = 80; window.__GAME__.tp(b.x + 1.2, b.z + 0.6); })()`); await wait(1.5);
await key('Space'); await wait(2.5);
console.log('brazier lit', await D(`${G}.braziers[0].f.lit`));
await D(`(() => { const g = ${G}; window.__GAME__.tp(149, 177.5); g.lamp.oil = 0.3; })()`);
await page.waitForFunction('window.__metrics.mode === "dead"', null, { timeout: 240000 });
await page.waitForSelector('.overlay.black button', { timeout: 120000 });
await wait(7); await shot('dead');
console.log('death button:', await D(`document.querySelector('.overlay.black button').textContent`));
await page.click('.overlay.black button');
await page.waitForFunction('window.__metrics?.mode === "play" && window.__metrics.oil > 30', null, { timeout: 240000 });
await wait(3);
const b0 = await D(`(() => { const g = ${G}, b = g.braziers[0]; return { d: Math.hypot(g.pos.x - b.x, g.pos.z - b.z).toFixed(1), lit: b.f.lit, oil: Math.round(g.lamp.oil), flags: [...g.flags].length }; })()`);
console.log('resumed at fire:', JSON.stringify(b0)); await shot('resumed');
// 3) бросок: тусклый фитиль — отпивает масло, яркий — сгорает
await D(`(() => { const g = ${G}; window.__GAME__.tp(140, 174.5); g.flags.add('firstDark'); g.lamp.oil = 90; g.lamp.wick = 0.4; g.dread = 0.6; g.dark.setCount(3); for (const h of g.dark.hunters) h.cool = 0.5; })()`); await wait(2);
const oilA = await D(`${G}.lamp.oil`);
await page.waitForFunction(`${G}.dark.hunters.some((h) => h.state === 'windup' || h.state === 'lunge')`, null, { timeout: 180000 });
await shot('windup');
await page.waitForFunction(`${G}.flags.has('biteHint')`, null, { timeout: 240000 }).catch(() => console.log('no bite within timeout'));
console.log('bite: oil', oilA.toFixed(0), '→', (await D(`${G}.lamp.oil`)).toFixed(0), 'biteHint', await D(`${G}.flags.has('biteHint')`));
await D(`(() => { const g = ${G}; g.lamp.oil = 90; g.lamp.wick = 0.9; for (const h of g.dark.hunters) { if (h.state === 'lurk') h.cool = 0.5; } })()`);
const oilB = await D(`${G}.lamp.oil`);
await wait(45);
console.log('bright wick for a while: oil', oilB.toFixed(0), '→', (await D(`${G}.lamp.oil`)).toFixed(0), '(only burning, no bites expected)');
// 4) вал у глотки
await D(`(() => { const g = ${G}; g.lamp.oil = 95; g.lamp.wick = 0.8; window.__GAME__.tp(58.4, 64.4); })()`);
await page.waitForFunction(`${G}.wave.on`, null, { timeout: 120000 });
await wait(9); await shot('wave');
console.log('wave on, s =', (await D(`${G}.wave.s`)).toFixed(1), 'oil', (await D(`${G}.lamp.oil`)).toFixed(0), 'dread', (await D(`${G}.dread`)).toFixed(2));
await D(`window.__GAME__.tp(31, 37)`); await wait(4);
console.log('at gate: wave on', await D(`${G}.wave.on`));
await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.slice(0, 8).join('\n')); process.exit(1); }
