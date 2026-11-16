#!/usr/bin/env node
// Автопрогон озвучки: записи грузятся по сети и звучат на репликах, подсказках и шёпоте.
// Нужен http (по file:// записи недоступны): node tools/voicecheck.mjs http://127.0.0.1:5311/
import { chromium } from 'playwright';
const [base = 'http://127.0.0.1:5311/'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [], got = { ok: 0, bad: 0 };
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => { if (r.url().includes('/voice/')) r.ok() ? got.ok++ : got.bad++; });
await page.goto(base + '?reset=1&calm=1');
await page.waitForFunction('window.__GAME__?.ready', null, { timeout: 120000 });
const D = (e) => page.evaluate(e), G = 'window.__GAME__.game', S = `${G}.sfx`;
const wait = (s) => page.waitForTimeout(s * 1000);
const until = (cond, t = 180) => page.waitForFunction(cond, null, { timeout: t * 1000 }).then(() => true, () => false);
let bad = 0;
const ok = (name, cond, extra = '') => { if (!cond) bad++; console.log(cond ? 'ok  ' : 'FAIL', name, extra); };
await page.click('.overlay button');                                   // «Проснуться»: звук включается по клику
ok('voices available', await until(`${S}.voiced === true`, 20));
ok('narrator reads the intro', await until(`${S}.played >= 1`, 120), 'played ' + (await D(`${S}.played`)));
await page.goto(base + '?skip=1&reset=1&calm=1');
await page.waitForFunction('window.__GAME__?.ready', null, { timeout: 120000 });
await page.mouse.click(300, 200); await wait(0.5);
await D(`(() => { const g = ${G}; g.sfx.init(); g.flags.add('firstDark'); g.lamp.oil = 90; const e = g.npcs.efim; window.__GAME__.tp(e.x - 1.25, e.z + 1.25); })()`); await wait(2);
const p0 = await D(`${S}.played`);
await page.keyboard.press('Space');
ok('Efim speaks with a recorded voice', await until(`${S}.played > ${p0}`, 120), 'len ' + (await D(`${S}.voiceLen('efim', 'Свет… Живой свет. Давно я его не видел.')`)));
ok('line waits for the voice', await D(`(() => { const d = document.querySelector('#dialog'); return !d.classList.contains('hidden'); })()`));
const p1 = await D(`${S}.played`);
await D(`${G}.hud.whisper('…останься…', 0.2)`);
ok('darkness whispers with a voice', await until(`${S}.played > ${p1}`, 120));
const p2 = await D(`${S}.played`);
await D(`${G}.hud.whisper('Тёма…', 0.8, 'mother-ghost')`);
ok('ghost calls with a voice', await until(`${S}.played > ${p2}`, 120));
console.log('voice files fetched:', got.ok, 'failed:', got.bad);
ok('no failed voice requests', got.bad === 0 && got.ok > 0);
await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.slice(0, 8).join('\n')); process.exit(1); }
process.exit(bad ? 1 : 0);
