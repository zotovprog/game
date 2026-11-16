#!/usr/bin/env node
// Озвучка через ElevenLabs. Берёт реплики из src/data/texts.ts, записывает недостающие и складывает всё в пакеты
// public/voice/<роль>-<n>.mp3; src/data/voice.json хранит, где в пакете лежит каждая реплика (ключ → пакет, смещение, длина, секунды).
// Ключ API в скрипт не передаётся: его подставляет прокси окружения.
// node tools/voice.mjs --dry      — только посчитать, что и сколько знаков будет записано
// node tools/voice.mjs            — записать недостающее (уже записанное не трогает)
// node tools/voice.mjs --only efim,narrator — только эти роли
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
const run = promisify(execFile);
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const OUT = 'public/voice', MANIFEST = 'src/data/voice.json';
const MODEL = 'eleven_v4';

// состав: роль → голос из библиотеки пользователя (решение #30)
const VOICE = {
  narrator: 'pM78bgjPVk0JXtaEnFoj',   // Nester Surovy
  efim: 'LxiqOV1uxBCgYTeitAHf',       // Bowo
  vera: 'nkvv6waLzFah2jTNUZGT',       // Tatyana Voloshina
  mila: 'Nggzl2QAXh3OijoXD116',       // Candy
  father: 'TUQNWEvVPBLzMBSVDPUA',     // Alex Bell
  mother: 'nkvv6waLzFah2jTNUZGT',     // Tatyana Voloshina
  boy: 'kwajW3Xh5svCeKU5ky2S',        // Dmitry
  shade: 'ZAs871VKqeAhWHigmemn',      // Lea Wander
  dark: 'LxiqOV1uxBCgYTeitAHf',       // Bowo
};
const voiceOf = (role) => VOICE[role.replace('-ghost', '')];

/** Тот же ключ считает игра (src/audio/voice.ts): FNV-1a по UTF-8 строки «роль|текст». */
export function key(role, text) {
  let h = 0x811c9dc5;
  for (const b of Buffer.from(`${role}|${text}`, 'utf8')) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
const { TX } = await import(path.resolve('src/data/texts.ts'));        // Node 22 читает .ts сам, без сборки

// ---------- сценарий: роль, текст (ровно как на экране), режиссёрская пометка
const lines = new Map();
const add = (role, text, tag) => { for (const t of [text].flat()) { const k = key(role, t); if (!lines.has(k)) lines.set(k, { role, text: t, tag }); } };
const N = (text, tag = '[hushed, mysterious]') => add('narrator', text, tag);
const F = TX.forsaken, E = TX.endings;

// рассказчик — тихий голос самой пещеры
// указания, что делать (цель, отряд, ладонь, фитиль, привал), вслух не читаются — только текстом: голос оставлен истории
N([TX.intro, TX.afterLamp, TX.note, TX.call, TX.cairn, TX.walker, TX.hole.adult, TX.dead, TX.draft,
  TX.cairnRemember, TX.seeWisp, TX.wispTrap, TX.water, TX.longDark, TX.gateHall, TX.toy, TX.ownGhost, TX.ownLamp, TX.keeper,
  TX.vera.taken, TX.mila.carried, TX.shade.nameFalseHint, TX.bowl.empty, TX.bowl.lit].flat());
N([TX.firstDark, TX.wave, TX.waveEnd, TX.oilLow, TX.ember].flat(), '[tense, urgent whisper]');
N([F.scream.efim('Ефим'), F.scream.efim('Старик'), F.scream.family(), F.scream.mila(), F.warn.efim, F.warn.family, F.warn.mila, F.cut,
  F.found.efim('Ефим'), F.found.efim('Старик'), F.found.family(), F.found.mila(), F.quiet,
  TX.taken('Ефим'), TX.taken('Вера'), TX.taken('Тёма'), `${TX.taken('Вера')} ${TX.takenMila}`, TX.mila.lost, TX.shade.burned], '[grim, hushed]');
N([E.alone.open, E.together.open, E.beacon.open, E.price.open, Object.values(E.who), E.memory].flat(), '[slow, grave whisper]');
N(E.dead.lines, '[cold, final whisper]');

// Ефим — старик у погасшего костра
const ef = TX.efim;
add('efim', ef.talk, '[frightened old man, hoarse whisper]');
add('efim', ef.accepted, '[relieved, shaky]');
add('efim', ef.refused, '[resigned, hollow]');
add('efim', ef.poor, '[weak, gentle]');
add('efim', [ef.barks, ef.sense].flat(), '[urgent hoarse whisper]');
add('efim', ef.gate, '[awed, voice breaking]');
add('efim', ef.stay, '[tired, calm, final]');
add('efim', TX.grab.efim, '[old man screaming in terror]');
add('efim', TX.freed.efim, '[gasping, shaken]');
add('efim-ghost', [ef.ghost, F.calls.efim, F.last.efim].flat(), '[hollow dead whisper]');

// Вера — мать, которая ищет дочь
const ve = TX.vera;
add('vera', ve.talk, '[desperate, voice shaking]');
add('vera', ve.accepted, '[trembling, hopeful]');
add('vera', ve.refused[0], '[hollow, resolved]');
add('vera', ve.refused[1], '[calling out desperately]');
add('vera', ve.poor, '[hollow, resolved]');
add('vera', ve.barks, '[anxious whisper]');
add('vera', ve.gate, '[awed whisper]');
add('vera', [ve.stay, ve.reunionNo].flat(), '[quiet, choking back tears]');
add('vera', ve.reunion, '[sobbing with relief]');
add('vera', ve.reunionAsk, '[pleading, breathless]');
add('vera', TX.grab.vera, '[woman screaming in terror]');
add('vera', TX.freed.vera, '[gasping, shaken]');
add('vera-ghost', ve.ghost, '[hollow dead whisper]');

// Мила — семь лет
const mi = TX.mila;
add('mila', [mi.talk, mi.down, mi.barks, mi.wisp].flat(), '[tiny scared child, whisper]');
add('mila', mi.afterLie, '[hopeful small voice]');
add('mila', [mi.afterTruth, mi.left].flat(), '[small, sad, stubborn]');
add('mila', mi.alone, '[child crying out in panic]');
add('mila-ghost', [mi.waited, F.calls.mila, F.last.mila].flat(), '[ghostly child whisper]');

// семья: отец, мать, Тёма
const fa = TX.family;
add('father', fa.talk, '[hoarse, in pain, wary]');
add('father', fa.fireDone, '[moved, exhausted]');
add('father', fa.refused[0], '[flat, bitter]');
add('father', fa.poor, '[gruff, urgent]');
add('mother', fa.motherLine, '[pleading, hushed]');
add('mother', fa.boyDone, '[urgent whisper, holding back tears]');
add('mother', fa.refused[1], '[cold, protective whisper]');
for (const g of ['father-ghost', 'mother-ghost']) {
  add(g, [fa.ghost, F.calls.family, F.last.family].flat(), '[hollow dead whisper]');
  add(g, [fa.ghostBoy, F.callBoy].flat(), '[ghostly, tender, coaxing whisper]');
}
add('boy', [fa.barks, F.boyAgain].flat(), '[scared little boy, whisper]');
add('boy', fa.gate, '[awed child]');
add('boy', TX.grab.boy, '[child screaming in terror]');
add('boy', TX.freed.boy, '[shaky, trying to be brave]');
add('boy', TX.hole.go, '[nervous, quick]');
add('boy', TX.hole.done, '[excited whisper]');
add('boy', F.boyScream, '[child screaming, panicked]');
add('boy', F.boyHears, '[excited, desperate]');
add('boy-ghost', [F.calls.family, F.last.family].flat(), '[ghostly child whisper]');
// общие реплики спутников
for (const r of ['efim', 'vera', 'boy']) { add(r, TX.lostReact, '[panicked whisper]'); add(r, F.react, '[uneasy whisper]'); }

// тень — заблудившаяся девочка (или то, что ею притворяется)
const sh = TX.shade;
add('shade', [sh.talk, sh.accepted, sh.sense].flat(), '[ghostly whisper, pleading]');
add('shade', sh.nameTrue, '[fragile, hesitant whisper]');
add('shade', sh.nameFalse, '[sweet, slightly wrong]');
add('shade', sh.refusedTrue, '[sad, fading whisper]');
add('shade', [sh.refusedFalse, sh.betray].flat(), '[cold, mocking whisper]');
add('shade', sh.hurt, '[shrieking in pain]');
add('shade', sh.gate, '[soft wonder]');
// тьма
add('dark', TX.whispers, '[cold inhuman whisper]');

// ---------- что уже записано: достаём реплики из пакетов во временную папку
fs.mkdirSync(OUT, { recursive: true });
const work = path.join(tmp, 'lines'); fs.mkdirSync(work);
const old = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { packs: [], lines: {} };
const manifest = {};                                           // ключ → длительность
if (old.packs) {
  const bufs = old.packs.map((p) => (fs.existsSync(`${OUT}/${p}`) ? fs.readFileSync(`${OUT}/${p}`) : null));
  for (const [k, [pi, off, len, dur]] of Object.entries(old.lines)) if (bufs[pi]) { fs.writeFileSync(`${work}/${k}.mp3`, bufs[pi].subarray(off, off + len)); manifest[k] = dur; }
} else for (const [k, dur] of Object.entries(old)) if (fs.existsSync(`${OUT}/${k}.mp3`)) { fs.copyFileSync(`${OUT}/${k}.mp3`, `${work}/${k}.mp3`); manifest[k] = dur; }   // прежний вид: по файлу на реплику
const todo = [...lines.entries()].filter(([k, l]) => (!only || only.includes(l.role.replace('-ghost', ''))) && !manifest[k]);
const by = {};
for (const [, l] of lines) { const r = l.role; by[r] ??= { n: 0, ch: 0 }; by[r].n++; by[r].ch += l.text.length + l.tag.length + 1; }
console.log('реплик всего', lines.size, '· по ролям:', Object.entries(by).map(([r, v]) => `${r} ${v.n}/${v.ch}`).join('  '));
console.log('к записи', todo.length, 'реплик,', todo.reduce((a, [, l]) => a + l.text.length + l.tag.length + 1, 0), 'знаков с пометками');
if (dry) process.exit(0);

// ---------- запись
async function record(k, l) {
  const raw = path.join(tmp, `${k}-raw.mp3`), out = `${work}/${k}.mp3`;
  const body = JSON.stringify({ text: `${l.tag} ${l.text}`, model_id: MODEL, language_code: 'ru', voice_settings: { stability: 0 } });
  for (let attempt = 0; attempt < 4; attempt++) {
    const { stdout } = await run('curl', ['-sS', '-m', '120', '-o', raw, '-w', '%{http_code}', '-X', 'POST',
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceOf(l.role)}?output_format=mp3_44100_128`, '-H', 'Content-Type: application/json', '-d', body]).catch((e) => ({ stdout: 'ERR ' + e.message }));
    if (stdout === '200') break;
    const err = fs.existsSync(raw) ? fs.readFileSync(raw, 'utf8').slice(0, 240) : '';
    if (stdout === '401' || /quota|credits|limit_reached/i.test(err)) throw new Error(`STOP ${stdout} ${err}`);
    if (attempt === 3) throw new Error(`${stdout} ${err}`);
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1) ** 2));
  }
  // ровная громкость, без тишины по краям, моно
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-af',
    'silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.12,areverse,loudnorm=I=-19:TP=-2:LRA=11',
    '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '64k', out]);
  const { stdout: d } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]);
  manifest[k] = Math.round(parseFloat(d) * 100) / 100;
}
let done = 0, failed = 0, stop = null;
const queue = todo.slice();
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length && !stop) {
    const [k, l] = queue.shift();
    try { await record(k, l); done++; }
    catch (e) { failed++; if (String(e.message).startsWith('STOP')) stop = e.message; console.log('не записано:', l.role, JSON.stringify(l.text.slice(0, 40)), e.message.slice(0, 200)); }
    if ((done + failed) % 20 === 0) console.log('…', done + failed, '/', todo.length);
  }
}));
// ---------- пакеты: по роли, не больше ~700 КБ каждый; порядок — как в сценарии (ранние реплики грузятся первыми)
for (const f of fs.readdirSync(OUT)) fs.rmSync(`${OUT}/${f}`);
const packs = [], index = {}, open = {};
for (const [k, l] of lines) {
  if (!manifest[k]) continue;
  const role = l.role.replace('-ghost', ''), data = fs.readFileSync(`${work}/${k}.mp3`);
  let p = open[role];
  if (!p || p.size + data.length > 700e3) { p = open[role] = { i: packs.length, size: 0, parts: [] }; packs.push({ name: `${role}-${packs.filter((x) => x.role === role).length}.mp3`, role, p }); }
  index[k] = [p.i, p.size, data.length, manifest[k]];
  p.parts.push(data); p.size += data.length;
}
for (const { name, p } of packs) fs.writeFileSync(`${OUT}/${name}`, Buffer.concat(p.parts));
fs.writeFileSync(MANIFEST, JSON.stringify({ packs: packs.map((x) => x.name), lines: index }));
const secs = Math.round(Object.values(index).reduce((a, v) => a + v[3], 0));
console.log('записано', done, '· ошибок', failed, stop ? `· остановлено: ${stop}` : '', '· в игре', Object.keys(index).length, 'реплик,', secs, 'с звука,', packs.length, 'пакетов:', packs.map((x) => `${x.name} ${Math.round(x.p.size / 1024)}К`).join(' '));
process.exit(failed ? 1 : 0);
