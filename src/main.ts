import { STYLES } from './data/styles';
import { startLookdev } from './scenes/lookdev';
import { Stage } from './view/stage';

declare global {
  interface Window { __GAME__?: { ready: boolean; [k: string]: unknown }; __metrics?: Record<string, unknown> }
}

const params = new URLSearchParams(location.search);
const style = STYLES[params.get('style') ?? 'a'] ?? STYLES.a;
const stage = new Stage(document.getElementById('game') as HTMLCanvasElement, style);
const scene = params.get('scene') ?? 'lookdev';

let tick: (dt: number, t: number) => void;
if (scene === 'lookdev') tick = startLookdev(stage, style, params);
else tick = startLookdev(stage, style, params);

let last = performance.now(), t = 0, frames = 0;
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now; t += dt;
  tick(dt, t);
  if (++frames === 3) window.__GAME__ = { ready: true };
  requestAnimationFrame(frame);
}
window.__metrics = { scene, style: style.id };
requestAnimationFrame(frame);
