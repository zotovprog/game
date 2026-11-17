#!/usr/bin/env node
// Темп начала игры: бот проходит первые минуты (берёт огонь, зажигает жаровни и разгорается у них, идёт к Ефиму,
// берёт его, идёт дальше, прикрывает огонь, раздувает) и печатает журнал — что и когда свалилось на игрока — и плотность событий по 30 с.
// node tools/pace.mjs <baseUrl> [секунд игры=170]
import { chromium } from 'playwright';
const [base = 'http://localhost:5199/', secs = '170'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 256, height: 144 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base + (base.includes('?') ? '&' : '?') + 'reset=1');
await page.waitForFunction('window.__GAME__?.ready', null, { timeout: 120000 });
await page.click('.overlay button');
// бот живёт в странице: решает раз в 60 мс
await page.evaluate(`(() => {
  const g = window.__GAME__.game, K = (c, on) => g.input.hold(c, on);
  // дорога первого куска: дверь прихожей, жаровня, лаз под завалом, Ефим, кухня (чаши по рисунку, дверь), щель, жаровня, тень статуи, плита
  const way = [[183.9, 197.7, 'lamp'], [179.5, 195.35, 'door:hall'], [177, 194.4], [174, 193], [166, 186.5], [160.5, 182.5], [0, 0, 'b0'], [158.4, 181.5], [155.8, 180.7], [152.5, 179.55], [149.2, 178.4], [146, 177.3], [141, 174.8],
    [134.6, 172.2, 'efim'], [0, 0, 'b8'], [131.6, 167.6], [129.6, 163.2], [129.2, 161.2], [0, 0, 'bowl:0'], [0, 0, 'bowl:1'], [127.6, 161.7], [125.2, 161.2], [0, 0, 'bowl:2'], [126.6, 156.3, 'door:kitchen'], [126.5, 154.4], [126.5, 151.7], [123.7, 148.7], [0, 0, 'b1'],
    [0, 0, 'shadow:statue'], [107.3, 150.9], [104.4, 150.7], [98, 156], [0, 0, 'b2'], [94, 156], [88, 148], [82, 138], [0, 0, 'b3']];
  let i = 0, talkT = 0;
  window.__bot = setInterval(() => {
    const l = g.lamp, d = document.querySelector('#dialog');
    for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) K(c, false);
    if (g.mode !== 'play') { K('KeyR', false); K('ShiftLeft', false); return; }
    if (!d.classList.contains('hidden')) {                       // разговор: читает ~2.5 с и листает; в выборе берёт первое
      const opts = d.querySelectorAll('.opts button');
      if (++talkT > 40) { talkT = 0; if (opts.length) opts[0].click(); else g.input.press('Space'); }
      return;
    }
    talkT = 0;
    const need = l.held && l.oil > 0 && (l.falter > 0 || !l.lit);
    K('ShiftLeft', l.held && g.wind.phase !== 'idle' && !need);          // сквозняк — ладонь
    if (need) { K('KeyR', l.draft + l.draftV * 0.25 < g.fanC); return; }  // сбито — стоит и раздувает
    K('KeyR', false);
    if (g.dark.hunters.some((h) => h.state === 'windup' || (h.state === 'lunge' && !h.fake))) K('ShiftLeft', true);   // шипение — ладонь
    const w = way[Math.min(i, way.length - 1)], tag = w[2] || '';
    const bz = tag[0] === 'b' && tag.length === 2 ? g.braziers[+tag[1]] : null;
    const bowl = tag.startsWith('bowl:') ? g.halls.order('kitchen')[+tag.slice(5)] : null;
    const spot = tag.startsWith('shadow:') ? g.halls.shadowSpot(tag.slice(7)) : null;
    const at = tag === 'lamp' ? g.lampOnGround : tag === 'efim' ? g.npcs.efim : bz ? bz : bowl ? { x: bowl.x + 0.85, z: bowl.z + 0.85 } : spot ? spot : { x: w[0], z: w[1] };   // к огню, людям, жаровням и чашам — по их настоящему месту
    const dx = at.x - g.pos.x, dz = at.z - g.pos.z, dist = Math.hypot(dx, dz);
    if (dist < (tag === 'lamp' ? 0.9 : tag === 'efim' || bz ? 1.7 : bowl || spot || tag.startsWith('door:') ? 0.45 : 1.0)) {
      if (tag === 'lamp' && !l.held) { g.input.press('Space'); return; }
      if (tag === 'efim' && g.npcs.efim.state === 'wait') { g.input.press('Space'); return; }
      if (bz && !bz.dead) { if (!bz.f.lit) { g.input.press('Space'); return; } if (l.oil < 97) return; }      // зажёг — и стоит, пока огонёк не разгорится
      if (tag.startsWith('door:')) { if (!g.halls.isOpen(tag.slice(5))) { if (document.querySelector('#act')?.textContent.includes('ткрыть')) g.input.press('Space'); return; } }   // простую открывает, запертую ждёт
      if (bowl) { const lit = g.halls.fires.find((f) => f.x === bowl.x && f.z === bowl.z).f.lit; if (!lit) { if (document.querySelector('#act')?.textContent.includes('чашу')) g.input.press('Space'); return; } }
      if (spot && !g.halls.isOpen('slab')) return;                 // стоит так, чтобы тень легла на знак, и ждёт плиту
      if (i < way.length - 1) i++;
      return;
    }
    const mx = dx * g.stage.right.x + dz * g.stage.right.z, my = dx * g.stage.up.x + dz * g.stage.up.z, m = Math.hypot(mx, my) || 1;
    K('KeyD', mx / m > 0.38); K('KeyA', mx / m < -0.38); K('KeyW', my / m > 0.38); K('KeyS', my / m < -0.38);
  }, 60);
})()`);
const t0 = Date.now();
await page.waitForFunction(`window.__GAME__.game.playT >= ${+secs} || window.__GAME__.game.mode === 'dead' || window.__GAME__.game.mode === 'end'`, null, { timeout: 1500000 }).catch(() => console.log('(время вышло)'));
const r = await page.evaluate(`(() => { const g = window.__GAME__.game; return { ev: g.events, t: g.playT, mode: g.mode, x: g.pos.x, z: g.pos.z, oil: g.lamp.oil, comp: g.companions.length, stage: g.pace ? g.pace.stage : -1 }; })()`);
await browser.close();
const short = (s) => (s.length > 64 ? s.slice(0, 62) + '…' : s);
for (const [t, k, s] of r.ev) if (k !== 'dark') console.log(String(t.toFixed(0)).padStart(4) + 'с  ' + k.padEnd(8) + short(s));
const words = new Set(['hint', 'say', 'bark', 'whisper']), threat = new Set(['gust', 'knock', 'out', 'lunge', 'bite', 'block', 'scream', 'walker', 'press', 'fall', 'scare', 'bowlsOut']);
console.log('\nокно      слова  угрозы  звуки тьмы');
for (let a = 0; a < r.t; a += 30) {
  const win = r.ev.filter(([t]) => t >= a && t < a + 30);
  console.log(`${String(a).padStart(3)}–${String(a + 30).padEnd(4)} ${String(win.filter(([, k]) => words.has(k)).length).padStart(5)} ${String(win.filter(([, k]) => threat.has(k)).length).padStart(7)} ${String(win.filter(([, k]) => k === 'dark').length).padStart(8)}`);
}
console.log(`\nитог: ${r.t.toFixed(0)} с игры за ${((Date.now() - t0) / 1000).toFixed(0)} с · режим ${r.mode} · место ${r.x.toFixed(0)},${r.z.toFixed(0)} · масло ${r.oil.toFixed(0)} · спутников ${r.comp} · ступень ${r.stage}`);
if (errors.length) { console.error('ERRORS:\n' + errors.slice(0, 5).join('\n')); process.exit(1); }
