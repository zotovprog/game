#!/usr/bin/env node
// Автопрогон сюжета: встречи, выборы, финал. node tools/tour.mjs <outDir> [baseUrl]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out = '.studioigor/captures/tour', base = 'http://localhost:5199/'] = process.argv.slice(2);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base + '?skip=1&reset=1&calm=1');
await page.waitForFunction('window.__GAME__?.ready');
let n = 0;
const m = () => page.evaluate('window.__metrics');
const shot = async (name) => { await page.screenshot({ path: `${out}/${String(n++).padStart(2, '0')}-${name}.png` }); const x = await m(); console.log(name, `oil=${x.oil} comp=${x.companions} mode=${x.mode}`, x.flags.slice(-6).join(',')); };
const wait = (s) => page.waitForTimeout(s * 1000);
const key = async (k) => { await page.keyboard.down(k); await wait(0.12); await page.keyboard.up(k); };
const D = (expr) => page.evaluate(expr);
const near = async (what, dx = 1.3, dz = 0.4) => { await D(`(() => { const g = window.__GAME__.game, p = ${what}; g.lamp.oil = Math.max(g.lamp.oil, 70); window.__GAME__.tp(p.x + ${dx}, p.z + ${dz}); })()`); await wait(1.2); };
/** Пролистать реплики до выбора или конца разговора. */
const talk = async () => {
  for (let i = 0; i < 40; i++) {
    const st = await D(`(() => { const d = document.querySelector('#dialog'); return d.classList.contains('hidden') ? 'closed' : d.querySelectorAll('.opts button').length ? 'choice' : 'line'; })()`);
    if (st !== 'line') return st;
    await key('Space'); await wait(0.45);
  }
  return 'timeout';
};
const act = async () => { await key('Space'); await wait(0.6); return talk(); };

await wait(1); await shot('start');
await near('window.__GAME__.game.npcs.efim'); console.log('efim', await act()); await shot('efim-choice');
await key('Digit1'); await wait(0.6); await talk(); await shot('efim-with');
await near('window.__GAME__.game.toy', 0.7, 0.3); console.log('toy', await act()); await shot('toy');
await near('window.__GAME__.game.family', 1.7, 1.3); console.log('family', await act()); await shot('family-choice');
await key('Digit1'); await wait(0.6); await talk(); await wait(2); await shot('family-fire');
await near('window.__GAME__.game.shade', 2.4, 0.5); await wait(1.5); await shot('shade'); console.log('shade', await act()); await shot('shade-choice');
await key('Digit2'); await wait(0.6); console.log('shade name', await talk()); await shot('shade-name');
await key('Digit1'); await wait(0.6); await talk(); await shot('shade-follow');
await near('window.__GAME__.game.npcs.vera'); console.log('vera', await act()); await shot('vera-choice');
await key('Digit1'); await wait(0.6); await talk();
await near('window.__GAME__.game.mila', 2.6, 1.0); await wait(1.5); console.log('reunion', await talk()); await wait(1.5); await talk(); await shot('reunion');
console.log('shade true?', await D('window.__GAME__.game.shade.isTrue'), 'state', await D('window.__GAME__.game.shade.state'), 'mila', await D('window.__GAME__.game.mila.state'));
await near('window.__GAME__.game.bowl', 1.2, 0.9); await wait(2); console.log('bowl', await act()); await shot('bowl-choice');
console.log('options', await D(`[...document.querySelectorAll('#dialog .opts button span')].map((b) => b.firstChild.textContent)`));
await key('Digit2'); await wait(0.6); await talk(); await wait(5); await shot('gate-open');
await page.waitForSelector('.overlay.black', { timeout: 240000 });
await wait(24); await shot('ending');
console.log('ending text:', await D(`document.querySelector('.overlay.black').innerText.replace(/\\n+/g, ' | ')`));
await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.slice(0, 8).join('\n')); process.exit(1); }
