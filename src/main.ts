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
      ...Object.fromEntries(def.zones.map((z) => [`→ ${z.id}`, () => { game.pos.x = z.at[0] + 3; game.pos.z = z.at[1] + 3; }])),
      ...Object.fromEntries(([['Ефим', def.efim.at], ['Вера', def.vera.at], ['семья', def.family.fire], ['Мила', def.mila.at], ['тень', def.shade.at], ['ботинок', def.toy.at], ['чаша', def.gate.bowl]] as [string, [number, number]][]).map(([n, p]) => [`→ ${n}`, () => { game.pos.x = p[0] + 2.5; game.pos.z = p[1] + 2.5; }])),
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

let last = performance.now(), t = 0, frames = 0, fps = 60;
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now; t += dt;
  fps += (1 / Math.max(dt, 0.001) - fps) * 0.05;
  game.update(dt, t);
  dbg?.();
  if (++frames === 3) window.__GAME__ = { ready: true, game, tp: (x, z) => { game.pos.x = x; game.pos.z = z; } };
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
