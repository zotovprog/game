#!/usr/bin/env node
// Автопрогон ядра «Веди отряд»: цель на экране, отставшего хватает тьма, его можно отбить, можно потерять,
// людей можно оставить у огня. node tools/party.mjs <outDir> <baseUrl>
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out = '.studioigor/captures/party', base = 'http://localhost:5199/'] = process.argv.slice(2);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base + '?skip=1&reset=1&calm=1');
await page.waitForFunction('window.__GAME__?.ready', null, { timeout: 120000 });
let n = 0;
const D = (expr) => page.evaluate(expr);
const wait = (s) => page.waitForTimeout(s * 1000);
const key = async (k) => { await page.keyboard.down(k); await wait(0.12); await page.keyboard.up(k); };
const goal = () => D(`document.querySelector('#goal span').textContent`);
const shot = async (name) => { await page.screenshot({ path: `${out}/${String(n++).padStart(2, '0')}-${name}.png` }); console.log(name, '|', await goal(), '|', (await D('window.__metrics.flags')).slice(-4).join(',')); };
const talk = async () => { for (let i = 0; i < 40; i++) { const st = await D(`(() => { const d = document.querySelector('#dialog'); return d.classList.contains('hidden') ? 'closed' : d.querySelectorAll('.opts button').length ? 'choice' : 'line'; })()`); if (st !== 'line') return st; await key('Space'); await wait(0.45); } return 'timeout'; };
const E = 'window.__GAME__.game.npcs.efim';

await wait(1.5); await shot('goal-bar');
// Ефим идёт с нами
await D(`(() => { const g = window.__GAME__.game, p = g.npcs.efim; g.lamp.oil = 90; window.__GAME__.tp(p.x + 1.3, p.z + 0.4); })()`); await wait(1.2);
await key('Space'); await wait(0.6); await talk(); await key('Digit1'); await wait(0.6); await talk(); await wait(1);
await shot('with-efim');
// уходим от него: тьма хватает
await D(`(() => { const g = window.__GAME__.game; g.pos.x += 7; g.pos.z += 5; })()`);
await page.waitForFunction(`${E}.grab > 0.15`, null, { timeout: 120000 });
await shot('grabbed');
// возвращаем свет: отпускает
await D(`(() => { const g = window.__GAME__.game, p = g.npcs.efim; g.pos.x = p.x + 1.2; g.pos.z = p.z + 0.8; })()`);
await page.waitForFunction(`${E}.grab < 0.02 && ${E}.out === 0`, null, { timeout: 120000 });
console.log('freed: grab', await D(`${E}.grab.toFixed(2)`), 'state', await D(`${E}.state`));
// оставить у огня: зажигаем жаровню и оставляем
await D(`(() => { const g = window.__GAME__.game, b = g.braziers[0]; window.__GAME__.tp(b.x + 1.2, b.z + 0.6); })()`); await wait(1.5);
await key('Space'); await wait(3);
console.log('prompt at lit brazier:', await D(`document.querySelector('#act').textContent`));
await key('Space'); await wait(2);
console.log('camp state', await D(`${E}.state`));
await D(`(() => { const g = window.__GAME__.game; g.pos.x += 9; g.pos.z += 6; })()`); await wait(8);
console.log('left at fire for 8 s: state', await D(`${E}.state`), 'grab', await D(`${E}.grab.toFixed(2)`));
await shot('camped');
// возвращаемся, зовём, уходим без света: теперь заберёт
await D(`(() => { const g = window.__GAME__.game, b = g.braziers[0]; g.pos.x = b.x + 1.2; g.pos.z = b.z + 0.6; })()`); await wait(1.5);
console.log('prompt on return:', await D(`document.querySelector('#act').textContent`));
await key('Space'); await wait(1.5);
await D(`(() => { const g = window.__GAME__.game; window.__GAME__.tp(150, 178); })()`); await wait(2);
await D(`(() => { const g = window.__GAME__.game; g.pos.x += 8; g.pos.z += 4; })()`);
await page.waitForFunction(`window.__metrics.flags.includes('efimLost')`, null, { timeout: 240000 });
await wait(1.5); await shot('taken');
await browser.close();
if (errors.length) { console.error('ERRORS:\n' + errors.slice(0, 8).join('\n')); process.exit(1); }
