#!/usr/bin/env node
// Автопрогон огня и диалогов: текст по центру в начале, «Дальше» и тап в любое место, жаровня кормит огонёк,
// порыв ветра (сбивает / ладонь спасает), раздувание, жесты говорящих, память огней, тьма за спиной.
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

// 2) огонь от жаровни: зажёг — у неё огонёк разгорается заново; ложный огонь рядом гаснет
await page.goto(q('skip=1&reset=1'));
await page.waitForFunction('window.__GAME__?.ready', null, { timeout: 120000 });
ok('nothing at the top of the screen', await D(`!document.querySelector('#goal') && !document.querySelector('#oil')`));
await D(`(() => { const g = ${G}, b = g.braziers[0]; g.flags.add('firstDark'); g.wind.t = 999; g.lamp.oil = 22; window.__GAME__.tp(b.x + 1.2, b.z + 0.6); })()`);
await wait(1.5);
const w5 = `${G}.wisps.find((w) => w.id === 'w5').w.out`;
ok('false light burns before the fire is lit', (await D(w5)) === false);
await page.keyboard.press('Space');
ok('brazier lit from the flame', await until(`${G}.braziers[0].f.lit`, 60));
await wait(1); await shot('feeding');
ok('flame feeds at the living fire', await until(`${G}.lamp.oil > 95`, 180), 'oil ' + (await D(`${G}.lamp.oil`)).toFixed(0));
ok('false light nearby goes out', (await D(w5)) === true);
await D(`window.__GAME__.tp(140, 174.5)`); await wait(1.5);

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
// 6) пещера помнит огни: зажжённая жаровня горит и в новой попытке
await page.goto(q('skip=1'));
await page.waitForFunction('window.__GAME__?.ready', null, { timeout: 120000 });
ok('cave remembers the lit brazier', await D(`${G}.braziers[0].f.lit === true && ${G}.braziers[0].kept === true && ${G}.braziers[1].f.lit === false`));
// 7) тьма за спиной: доходит до огня, давит, гасит; догнала — пьёт огонь
await D(`(() => { const g = ${G}, b = g.braziers[0]; g.flags.add('firstDark'); g.wind.t = 999; g.lamp.oil = 95; window.__GAME__.tp(145, 176.8); g.tide.on = true; g.tide.f = b.flow + 12; })()`);
ok('living fire holds the dark', await until(`${G}.braziers[0].life < 53 && ${G}.braziers[0].f.lit`, 240), 'f ' + (await D(`${G}.tide.f.toFixed(0) + ' vs fire ' + ${G}.braziers[0].flow`)));
await D(`${G}.braziers[0].life = 3`);
ok('the dark puts the fire out', await until(`${G}.braziers[0].dead && !${G}.braziers[0].f.lit`, 240));
await wait(1.5); await shot('fire-fell');
ok('fallen fire is forgotten', await D(`!JSON.parse(localStorage.getItem('cave-remembers.v1')).fires.includes(0)`));
const o1 = await D(`${G}.lamp.oil`);
await D(`(() => { const g = ${G}; g.tide.f = g.grid.flowAt(g.pos.x, g.pos.z) + 1; })()`);
ok('caught by the dark: flame drains fast', await until(`${G}.lamp.oil < ${o1 - 12} || ${G}.mode === 'dead'`, 120), 'oil ' + o1.toFixed(0) + ' → ' + (await D(`${G}.lamp.oil`)).toFixed(0));
await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.slice(0, 8).join('\n')); process.exit(1); }
process.exit(bad ? 1 : 0);
