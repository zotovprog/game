#!/usr/bin/env node
// Автопрогон «тьма забирает»: отказал Ефиму и ушёл — крик, кости, тень зовёт, свет её выжигает;
// взял Тёму без родителей — их забирают, тени зовут его по имени. Плюс глаза во тьме и идущий по краю света.
// node tools/forsaken.mjs <outDir> <baseUrl>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out = '.studioigor/captures/forsaken', base = 'http://localhost:5199/'] = process.argv.slice(2);
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
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
const talk = async (pick) => {
  for (let i = 0; i < 60; i++) {
    const st = await D(`(() => { const d = document.querySelector('#dialog'); return d.classList.contains('hidden') ? 'closed' : d.querySelectorAll('.opts button').length ? 'choice' : 'line'; })()`);
    if (st === 'closed') return;
    if (st === 'choice') { const b = page.locator('#dialog .opts button'); await b.nth(Math.min(pick, (await b.count()) - 1)).click(); await wait(0.5); continue; }
    await page.keyboard.press('Space'); await wait(0.5);
  }
};
await page.goto(q('skip=1&reset=1'));
await page.waitForFunction('window.__GAME__?.ready', null, { timeout: 120000 });
const prep = `const g = ${G}; g.flags.add('firstDark'); g.wind.t = 999; g.lamp.oil = 90;`;

// 1) глаза за краем света; идущий по краю
await D(`(() => { ${prep} g.dread = 0.6; window.__GAME__.tp(118, 142); window.__keep = setInterval(() => { g.lamp.oil = Math.max(g.lamp.oil, 80); }, 200); })()`);      // огонёк не даём прогореть, пока ждём
ok('eyes open in the dark', await until(`${G}.phantoms.openEyes > 0`, 240)); await shot('eyes');
await D(`${G}.phantoms.hurry()`);
ok('someone walks at the edge of light', await until(`${G}.phantoms.walking`, 120)); await wait(1.2); await shot('walker');
await until(`!${G}.phantoms.walking`, 120);
await D('clearInterval(window.__keep)');

// 2) отказал Ефиму → ушёл → крик → вернулся: кости и тень
await D(`(() => { ${prep} const e = g.npcs.efim; window.__GAME__.tp(e.x - 1.25, e.z + 1.25); })()`); await wait(2);
await page.keyboard.press('Space'); await wait(1); await talk(1);
ok('efim refused', await D(`${G}.npcs.efim.state === 'left'`));
await D(`(() => { ${prep} window.__GAME__.tp(118, 142); })()`);
ok('darkness takes Efim (scream)', await until(`${G}.flags.has('efimTaken')`, 400), 'lost ' + (await D(`${G}.story.tally().lost`)));
await wait(2.5); await shot('scream-hint');
await D(`(() => { ${prep} const c = g.forsaken.cases[0]; window.__GAME__.tp(c.x - 4.6, c.z + 3.6); })()`);
ok('bones and ghost found', await until(`${G}.forsaken.cases[0].seen`, 240)); await wait(2); await shot('efim-bones');
await D(`(() => { ${prep} const c = g.forsaken.cases[0]; window.__GAME__.tp(c.x - 0.9, c.z + 0.9); })()`);
ok('light burns the ghost away', await until(`${G}.forsaken.cases[0].state === 'quiet'`, 400)); await wait(1.5); await shot('efim-quiet');

// 3) взял Тёму, родителей оставил → их забирают → тени зовут Тёму, он отстаёт
await D(`(() => { ${prep} window.__GAME__.tp(g.family.x + 1.6, g.family.z + 1.9); })()`); await wait(2);
await page.keyboard.press('Space'); await wait(1); await talk(1);
ok('boy taken along', await D(`${G}.family.state === 'boy' && ${G}.npcs.boy.state === 'follow'`), await D(`${G}.family.state + '/' + ${G}.npcs.boy.state`));
await D(`(() => { ${prep} const b = g.npcs.boy; window.__GAME__.tp(100, 96); b.x = 100.8; b.z = 96.6; })()`);
ok('darkness takes the parents', await until(`${G}.flags.has('familyTaken')`, 400), 'lost ' + (await D(`${G}.story.tally().lost`)));
await wait(3.5); await shot('family-scream');
await D(`(() => { ${prep} const b = g.npcs.boy; window.__GAME__.tp(g.family.x + 4.4, g.family.z + 3.4); b.x = g.pos.x + 0.8; b.z = g.pos.z + 0.6; })()`);
ok('ghosts call the boy, he lags', await until(`${G}.flags.has('lureHint') && ${G}.npcs.boy.pace < 1`, 400)); await wait(2.5); await shot('family-ghosts');
await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.slice(0, 8).join('\n')); process.exit(1); }
process.exit(bad ? 1 : 0);
