#!/usr/bin/env node
// Автопрогон первого куска «залов памяти»: дверь прихожей, лаз под завалом, сидящий за столом, чаши (ошибка и верный порядок),
// стук и дверь кухни, щель, тень статуи на знаке и каменная плита, точка возврата помнит решённое.
// node tools/halls.mjs <outDir> <baseUrl>      (кадры настоящего вида — только по http)
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out, base] = process.argv.slice(2);
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const D = (e) => page.evaluate(e);
const wait = (s) => page.waitForTimeout(s * 1000);
const G = 'window.__GAME__.game';
let n = 0, bad = 0;
const shot = async (name) => { await page.screenshot({ path: `${out}/${String(n++).padStart(2, '0')}-${name}.png` }); };
const ok = (name, cond, extra = '') => { if (!cond) bad++; console.log(cond ? 'ok  ' : 'FAIL', name, extra); };
const until = (cond, t = 120) => page.waitForFunction(cond, null, { timeout: t * 1000 }).then(() => true, () => false);
const tp = (x, z) => D(`window.__GAME__.tp(${x}, ${z})`);
const act = async () => { await page.keyboard.press('Space'); await wait(0.4); };
const prompt = () => D(`document.querySelector('#act')?.textContent ?? ''`);
const evs = (k) => D(`${G}.events.filter((e) => e[1] === '${k}').map((e) => e[2])`);
await page.goto(base + (base.includes('?') ? '&' : '?') + 'skip=1&reset=1&calm=1');
await page.waitForFunction('window.__GAME__?.ready', null, { timeout: 180000 });
await D(`setInterval(() => { const g = ${G}; g.lamp.oil = Math.max(g.lamp.oil, 80); }, 200)`);

// 1) прихожая: дверь закрыта и не пускает; открывается с первого раза
await tp(179.9, 195.4); await wait(1.5);
ok('hall door prompt', (await prompt()).includes('ткрыть'), await prompt()); await shot('hall-door');
const blocked = await D(`(() => { const g = ${G}, p = { x: 178.9, z: 195.3 }; g.grid.collide(p, 0.32); return p.x > 178.95; })()`);
ok('closed door blocks the way', blocked);
await act(); await wait(2.2);
ok('hall door opens', await D(`${G}.halls.isOpen('hall')`)); await shot('hall-open');
ok('open door lets through', await D(`(() => { const g = ${G}, p = { x: 178.7, z: 195.3 }; g.grid.collide(p, 0.32); return Math.abs(p.x - 178.7) < 0.05; })()`));

// 2) лаз под завалом: ползком, медленно, огонь не прикрыть; посреди — скрежет и глаза
await tp(155.2, 180.5);
ok('crawling in the collapse', await until(`${G}.halls.crawl > 0.8 && ${G}.halls.speedK < 0.6`, 30), await D(`${G}.halls.crawl.toFixed(2) + ' speed ' + ${G}.halls.speedK.toFixed(2)`)); await shot('crawl');
await tp(152.5, 179.55); await wait(1.5);
ok('something scrapes in the crawl', (await evs('scare')).includes('crawl')); await shot('crawl-mid');

// 3) кухня: за столом сидят; зажёг чашу — никого
await tp(129.4, 161.0); await wait(2.5);
ok('someone sits at the table', (await evs('scare')).includes('seat') && await D(`${G}.halls.sets[0].seatK > 0.5`)); await shot('seat');
ok('the dark waits while you think', await D(`${G}.halls.holdTide`));
const order = await D(`${G}.halls.order('kitchen')`);
// сначала — не тот порядок
await tp(order[1].x + 0.9, order[1].z + 0.9); await wait(1.2);
ok('bowl prompt', (await prompt()).includes('чашу'), await prompt());
await act();
ok('the sitter is gone once a bowl burns', await until(`${G}.halls.sets[0].seatK < 0.1`, 30));
ok('wrong order puts the bowls out', await until(`${G}.events.some((e) => e[1] === 'bowlsOut')`, 30)); await wait(0.6); await shot('bowls-out');
// теперь — как на рисунке
for (const b of order) { await tp(b.x + 0.9, b.z + 0.9); await wait(1.3); await act(); await wait(0.8); }
ok('right order solves it', await D(`${G}.flags.has('solved-kitchen')`)); await shot('bowls-lit');
ok('kitchen door stays shut until the knocks', !(await D(`${G}.halls.isOpen('kitchen')`)));
ok('then it opens by itself', await until(`${G}.halls.isOpen('kitchen')`, 60)); await wait(2); await tp(126.6, 156.6); await wait(1.5); await shot('kitchen-open');

// 4) щель за дверью: боком
await tp(126.5, 152.6);
ok('squeezing through the crack', await until(`${G}.halls.squeeze > 0.8 && ${G}.halls.speedK < 0.7`, 30)); await shot('crack');

// 5) статуя: тень на знаке — плита уходит
const spot = await D(`${G}.halls.shadowSpot('statue')`);
await tp(109.6, 150.6); await wait(1.5);
ok('slab is shut', !(await D(`${G}.halls.isOpen('slab')`))); await shot('slab-shut');
await tp(spot.x, spot.z); await wait(0.6); await shot('shadow');
ok('shadow on the sign opens the slab', await until(`${G}.halls.isOpen('slab')`, 60)); await wait(3.5); await shot('slab-open');
ok('slab lets through', await D(`(() => { const g = ${G}, p = { x: 105.6, z: 150.3 }; g.grid.collide(p, 0.32); return Math.hypot(p.x - 105.6, p.z - 150.3) < 0.05; })()`));

// 6) точка возврата помнит решённое
await wait(1);
const saved = await D(`${G}.halls.save()`);
ok('checkpoint remembers doors and puzzles', saved.open.length === 3 && saved.solved.length === 2, JSON.stringify(saved));
await browser.close();
if (errors.length) { console.log('ERRORS:\n' + errors.slice(0, 6).join('\n')); bad++; }
process.exit(bad ? 1 : 0);
