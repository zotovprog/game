#!/usr/bin/env node
// Автопрогон «рук» и диалогов: текст по центру в начале, кнопка «Дальше» и тап в любое место,
// долив склянки, порыв ветра (гасит / ладонь спасает), разжигание, жесты говорящих.
// node tools/hands.mjs <outDir> <baseUrl>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out = '.studioigor/captures/hands', base = 'http://localhost:5199/'] = process.argv.slice(2);
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const q = (s) => base + (base.includes('?') ? '&' : '?') + s;
const D = (e) => page.evaluate(e);
const wait = (s) => page.waitForTimeout(s * 1000);
const G = 'window.__GAME__.game';
let n = 0, bad = 0;
const shot = async (name) => { await page.screenshot({ path: `${out}/${String(n++).padStart(2, '0')}-${name}.png` }); };
const ok = (name, cond, extra = '') => { if (!cond) bad++; console.log(cond ? 'ok  ' : 'FAIL', name, extra); };
const until = (cond, t = 240) => page.waitForFunction(cond, null, { timeout: t * 1000 }).then(() => true, () => false);

// 1) начало: текст по центру, «Дальше», тап в любое место
await page.goto(q('reset=1'));
await page.waitForFunction('window.__GAME__?.ready', null, { timeout: 120000 });
await page.click('.overlay button');
ok('intro text centred', await until(`document.querySelector('#dialog.centered:not(.hidden) .txt')?.textContent.length > 0`));
await wait(1.2); await shot('intro-centred');
const l0 = await D(`document.querySelector('#dialog .txt').textContent`);
await page.click('#dialog .next');
ok('«Дальше» advances', await until(`document.querySelector('#dialog .txt').textContent !== ${JSON.stringify(l0)}`, 30));
const l1 = await D(`document.querySelector('#dialog .txt').textContent`);
await wait(0.6); await page.mouse.click(120, 330);
ok('tap anywhere advances', await until(`document.querySelector('#dialog .txt').textContent !== ${JSON.stringify(l1)} || document.querySelector('#dialog').classList.contains('hidden')`, 30));

// 2) долив: стоя, держать R
await page.goto(q('skip=1&reset=1'));
await page.waitForFunction('window.__GAME__?.ready', null, { timeout: 120000 });
await D(`(() => { const g = ${G}; g.flags.add('firstDark'); g.wind.t = 999; g.lamp.oil = 30; g.lamp.flasks = 1; window.__GAME__.tp(140, 174.5); })()`);
await wait(1.5);
await page.keyboard.down('KeyR');
await until(`${G}.lamp.pour > 0.35`, 120); await shot('pouring');
ok('pour: flask spent, oil up', await until(`${G}.lamp.flasks === 0 && ${G}.lamp.oil > 55`, 180), 'oil ' + (await D(`${G}.lamp.oil`)).toFixed(0));
await page.keyboard.up('KeyR');

// 3) порыв без ладони гасит лампу; держать R — разжечь
await D(`(() => { const g = ${G}; g.wind.phase = 'idle'; g.wind.t = 0; })()`);
ok('gust warns', await until(`${G}.wind.phase !== 'idle'`, 60));
ok('unshielded lamp blown out', await until(`${G}.lamp.lit === false`, 240), 'radius ' + (await D(`${G}.radius`)).toFixed(2));
await wait(1.5); await shot('blown-out');
await page.keyboard.down('KeyR');
ok('relit by holding', await until(`${G}.lamp.lit === true`, 240));
await page.keyboard.up('KeyR');

// 4) ладонь спасает от порыва
await until(`${G}.wind.phase === 'idle'`, 120);
await page.keyboard.down('ShiftLeft');
await D(`(() => { const g = ${G}; g.wind.t = 0; })()`);
await until(`${G}.wind.phase === 'blow'`, 120); await shot('shielded-gust');
await until(`${G}.wind.phase === 'idle'`, 120);
ok('shielded lamp survives', await D(`${G}.lamp.lit === true`));
await page.keyboard.up('ShiftLeft');

// 5) кто говорит — тот и двигается; выбранный ответ произносит герой
await D(`(() => { const g = ${G}; g.wind.t = 999; g.lamp.oil = 80; const e = g.npcs.efim; window.__GAME__.tp(e.x + 1.2, e.z + 0.9); })()`);
await wait(2);
await page.keyboard.press('Space');
ok('npc speaks', await until(`${G}.npcs.efim.h.talk === 1`, 60));
await wait(1.5); await shot('npc-talks');
ok('choice shown', await until(`document.querySelectorAll('#dialog .opts button').length >= 2`, 240));
await page.click('#dialog .opts button');
ok('hero says the choice', await until(`${G}.hero.talk === 1`, 60), JSON.stringify(await D(`document.querySelector('#dialog .who').textContent + ': ' + document.querySelector('#dialog .txt').textContent`)));
await wait(1.2); await shot('hero-talks');
await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.slice(0, 8).join('\n')); process.exit(1); }
process.exit(bad ? 1 : 0);
