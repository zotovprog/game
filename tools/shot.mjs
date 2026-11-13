#!/usr/bin/env node
// Быстрый снимок: node tools/shot.mjs <out.png> <url> [waitSeconds] [width] [height] [evalJS]
import { chromium } from 'playwright';
const [out, url, wait = '1.5', w = '1280', h = '720', js = ''] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForFunction('window.__GAME__?.ready', null, { timeout: 60000 });
if (js) await page.evaluate(js);
await page.waitForTimeout(+wait * 1000);
await page.screenshot({ path: out });
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('ok', out);
