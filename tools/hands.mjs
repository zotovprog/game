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
ok('pour: flask spent, oil up', await until(`${G}.lamp.flasks === 0 && ${G}.lamp.oil > 44`, 180), 'oil ' + (await D(`${G}.lamp.oil`)).toFixed(0));
await page.keyboard.up('KeyR');

// 3) порыв без ладони сбивает пламя; раздувание — удержать «тягу» в полосе
const robot = (on) => D(`(() => { clearInterval(window.__fan); const g = ${G}; if (!${on}) { g.input.hold('KeyR', false); return; }
  window.__fan = setInterval(() => { const l = g.lamp, need = l.oil > 0 && (l.falter > 0 || !l.lit); g.input.hold('KeyR', need && l.draft + l.draftV * 0.25 < g.fanC); }, 25); })()`);
const gustNow = () => D(`(() => { const g = ${G}; g.wind.phase = 'idle'; g.wind.t = 0; })()`);
await gustNow();
ok('gust warns', await until(`${G}.wind.phase !== 'idle'`, 60));
ok('unshielded flame is knocked, not out yet', await until(`${G}.lamp.falter > 0 && ${G}.lamp.lit`, 240), 'radius ' + (await D(`${G}.radius`)).toFixed(2));
await wait(1.5); await shot('falter');
await robot(true);
ok('fanning in the band saves the flame', await until(`${G}.lamp.falter === 0 && ${G}.lamp.lit`, 240));
await robot(false);
await D(`${G}.wind.t = 999`); await until(`${G}.wind.phase === 'idle'`, 120);
// не раздувать — погаснет; погасшую можно раздуть заново
await D(`(() => { const g = ${G}; g.lamp.oil = 70; })()`);
await gustNow();
await until(`${G}.lamp.falter > 0`, 240);
ok('ignored flame goes out', await until(`${G}.lamp.lit === false`, 400), 'radius ' + (await D(`${G}.radius`)).toFixed(2));
await D(`${G}.wind.t = 999`); await wait(1.2); await shot('blown-out');
await D(`${G}.lamp.oil = 80`);
await robot(true);
ok('dead lamp can be fanned back', await until(`${G}.lamp.lit === true`, 400));
await robot(false);

// 4) ладонь спасает от порыва
await until(`${G}.wind.phase === 'idle'`, 120);
await page.keyboard.down('ShiftLeft');
await D(`(() => { const g = ${G}; g.lamp.oil = 80; g.wind.t = 0; })()`);
await until(`${G}.wind.phase === 'blow'`, 120); await shot('shielded-gust');
await until(`${G}.wind.phase === 'idle'`, 120);
ok('shielded flame is untouched', await D(`${G}.lamp.lit === true && ${G}.lamp.falter === 0`));
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
// 6) лампа на пирамидке: зажёг — горит, тьма не подходит; пещера помнит её и после перезапуска
await page.keyboard.press('Space'); await wait(1);
await D(`(() => { const g = ${G}; g.hud.close?.(); })()`).catch(() => {});
await page.goto(q('skip=1&reset=1'));
await page.waitForFunction('window.__GAME__?.ready', null, { timeout: 120000 });
await D(`(() => { const g = ${G}; g.flags.add('firstDark'); g.wind.t = 999; g.lamp.oil = 70; const c = g.cairns[1]; window.__GAME__.tp(c.x + 1.0, c.z + 0.7); })()`);
await wait(2);
ok('cairn prompt', await until(`document.querySelector('#act') && !document.querySelector('#act').classList.contains('hidden') && /камнях/.test(document.querySelector('#act').textContent)`, 60), await D(`document.querySelector('#act').textContent`));
const oilC = await D(`${G}.lamp.oil`);
await page.keyboard.press('Space');
ok('cairn lit', await until(`${G}.cairns[1].lit && ${G}.cairns[1].k > 0.8`, 120), 'oil ' + oilC.toFixed(1) + ' → ' + (await D(`${G}.lamp.oil`)).toFixed(1));
ok('cairn is a safe light', await D(`${G}.safeLights.some((s) => Math.hypot(s.x - ${G}.cairns[1].x, s.z - ${G}.cairns[1].z) < 0.1)`));
await D(`window.__GAME__.tp(${G}.cairns[1].x + 4.5, ${G}.cairns[1].z + 3.2)`); await wait(2.5); await shot('cairn-lit');
// перезапуск без сброса: лампа на пирамидке уже горит
await page.goto(q('skip=1'));
await page.waitForFunction('window.__GAME__?.ready', null, { timeout: 120000 });
ok('cave remembers the lit cairn', await D(`${G}.cairns[1].lit === true && ${G}.cairns[0].lit === false`));
await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.slice(0, 8).join('\n')); process.exit(1); }
process.exit(bad ? 1 : 0);
