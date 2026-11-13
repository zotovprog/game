#!/usr/bin/env node
// Склеивает сборку dist/ в один HTML-фрагмент без внешних файлов (для публикации одной страницей).
// node tools/artifact.mjs <out.html>
import fs from 'node:fs';
import path from 'node:path';
const out = process.argv[2] ?? 'dist/single.html';
const dir = 'dist/assets';
const files = fs.readdirSync(dir);
const js = files.filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const css = files.filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const html = `<title>Пещера помнит</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Old+Standard+TT:ital,wght@0,400;0,700;1,400&display=swap">
<style>${css}</style>
<canvas id="game"></canvas>
<div id="ui"></div>
<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(out, (html.length / 1024).toFixed(0) + ' KB');
