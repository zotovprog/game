import '@fontsource/amatic-sc/cyrillic-700.css';
import '@fontsource/amatic-sc/latin-700.css';
import '@fontsource/neucha/cyrillic-400.css';
import '@fontsource/neucha/latin-400.css';
import { Mesh, Points, Sprite } from 'three';
import { Sfx } from './audio/sfx';
import { Input } from './core/input';
import { DEPTH1 } from './data/level';
import { STYLE } from './data/styles';
import { Game } from './scenes/game';
import { addOil } from './systems/lamp';
import { onRestart } from './systems/story';
import { mountDebug } from './ui/debug';
import { Hud } from './ui/hud';
import { Stage } from './view/stage';

declare global {
  interface Window { __GAME__?: { ready: boolean; game?: Game; tp?: (x: number, z: number) => void }; __metrics?: Record<string, unknown> }
}

// ?skip=1 — без вступления · ?debug=1 — панель настройки и телепорты · ?reset=1 — забыть след
const params = new URLSearchParams(location.search);
if (params.has('reset')) { try { localStorage.clear(); } catch { /* пусто */ } }
const ui = document.getElementById('ui')!;
const stage = new Stage(document.getElementById('game') as HTMLCanvasElement, STYLE);
const sfx = new Sfx();
const def = DEPTH1;
let game: Game;
let dbg: (() => void) | null = null;

function boot(autostart: boolean): void {
  // убрать прошлую попытку: геометрия и материалы освобождаются, рендерер и звук остаются
  stage.scene.traverse((o) => {
    if (o instanceof Mesh || o instanceof Points || o instanceof Sprite) {
      o.geometry?.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
    }
  });
  stage.scene.clear();
  ui.replaceChildren();
  stage.pressure = 0; stage.chroma = 0; stage.shake = 0;
  const hud = new Hud(ui);
  const input = new Input(hud.area, hud.mark);
  hud.input = input;
  game = new Game(stage, hud, input, sfx, STYLE, def, { skip: params.has('skip') });
  if (autostart) game.story.begin();
  if (params.has('debug')) {
    dbg = mountDebug(ui, {
      '+20 масла': () => addOil(game.lamp, 20),
      'масло = 2': () => { game.lamp.oil = 2; },
      ...Object.fromEntries(def.zones.map((z) => [`→ ${z.id}`, () => tp(z.at[0] + 3, z.at[1] + 3)])),
      ...Object.fromEntries(([['Ефим', def.efim.at], ['Вера', def.vera.at], ['семья', def.family.fire], ['Мила', def.mila.at], ['тень', def.shade.at], ['ботинок', def.toy.at], ['чаша', def.gate.bowl]] as [string, [number, number]][]).map(([n, p]) => [`→ ${n}`, () => tp(p[0] + 2.5, p[1] + 2.5)])),
    }, () => `fps ${fps.toFixed(0)} · ${JSON.stringify(window.__metrics)}`);
  }
  if (window.__GAME__) window.__GAME__.game = game;
}
boot(false);
onRestart(() => boot(true));

// звук разрешён только после жеста: включаем при первом же нажатии
const wake = () => sfx.init();
addEventListener('pointerdown', wake, { once: true });
addEventListener('keydown', wake, { once: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) game.pause(true); });

/** Телепорт для отладки и автопрогонов: спутники и тень переносятся вместе с героем. */
function tp(x: number, z: number): void {
  game.pos.x = x; game.pos.z = z;
  game.companions.forEach((n, i) => { if (n.state === 'follow') { n.x = x + 0.8 + i * 0.5; n.z = z + 0.8; } });
  if (game.shade.state === 'follow') { game.shade.x = x + 2; game.shade.z = z + 2; }
}

let last = performance.now(), t = 0, frames = 0, fps = 60;
function frame(now: number): void {
  const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1);   // первый кадр после долгой сборки может прийти «из прошлого»
  last = now; t += dt;
  fps += (1 / Math.max(dt, 0.001) - fps) * 0.05;
  game.update(dt, t);
  dbg?.();
  if (++frames === 3) window.__GAME__ = { ready: true, game, tp };
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
