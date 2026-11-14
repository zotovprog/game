// Лицо для скримера: рисуется на canvas. В самой тьме картинок нет — она объёмная (view/volume.ts).
import { mulberry32 } from '../core/rng';

const canvases: HTMLCanvasElement[] = [];
export const FACE_VARIANTS = 8;

function draw(seed: number): HTMLCanvasElement {
  const r = mulberry32(seed * 7919 + 13);
  const W = 128, H = 192;
  const tmp = document.createElement('canvas');
  tmp.width = W; tmp.height = H;
  const g = tmp.getContext('2d')!;
  const blob = (x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1 = 0, mid = 0.6) => {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(rx, ry);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, `rgba(226,228,234,${a0})`); gr.addColorStop(mid, `rgba(214,216,224,${a0 * 0.8})`); gr.addColorStop(1, `rgba(200,202,212,${a1})`);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 6.283); g.fill(); g.restore();
  };
  const cut = (x: number, y: number, rx: number, ry: number, rot = 0, a = 1, mid = 0.55) => {
    g.globalCompositeOperation = 'destination-out'; blob(x, y, rx, ry, rot, a, 0, mid); g.globalCompositeOperation = 'source-over';
  };
  const type = seed % 4;                                   // 0 крик · 1 оскал · 2 безглазое · 3 детское
  const jaw = type === 0 ? 26 + r() * 16 : type === 1 ? 8 : 12 + r() * 8;
  const tilt = (r() - 0.5) * 0.35;
  // череп из нескольких масс: неровный, со впалыми щеками
  blob(64, 58, 36 + r() * 5, 40 + r() * 6, tilt, 0.85);
  blob(64, 92, 28 + r() * 4, 42, tilt * 0.5, 0.8);
  blob(64 + (r() - 0.5) * 8, 124 + jaw * 0.5, 17 + r() * 5, 24 + jaw * 0.6, 0, 0.7);
  cut(34 + r() * 4, 104, 12 + r() * 5, 26, 0.2, 0.75);
  cut(94 - r() * 4, 106, 12 + r() * 5, 26, -0.2, 0.75);
  // глазницы: глубокие, неодинаковые, с чёрными потёками
  const ey = 66 + r() * 8, ex = 16 + r() * 4, drop = (r() - 0.5) * 12;
  const eye = (x: number, y: number, k: number) => {
    const rx = (type === 3 ? 8 : 10 + r() * 6) * k, ry = (type === 3 ? 9 : 12 + r() * 10) * k;
    if (type !== 2) cut(x, y, rx, ry, (r() - 0.5) * 0.8, 1, 0.7);
    else cut(x, y + 4, rx * 1.3, ry * 0.35, (r() - 0.5) * 0.4, 0.9);          // заросшие щели
    cut(x + (r() - 0.5) * 4, y + ry + 12 + r() * 14, 2.5 + r() * 2.5, 16 + r() * 22, (r() - 0.5) * 0.15, 0.8);
    if (type !== 2 && r() < 0.5) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(x + (r() - 0.5) * 3, y + (r() - 0.5) * 3, 1.5, 0, 6.283); g.fill(); }
  };
  eye(64 - ex, ey, 1); eye(64 + ex, ey + drop, 0.75 + r() * 0.7);
  cut(64 + (r() - 0.5) * 3, 94, 3.5, 7, 0, 0.8);
  // рот
  const my = 116 + r() * 6;
  if (type === 0) cut(64 + (r() - 0.5) * 6, my + jaw * 0.45, 11 + r() * 6, 16 + jaw * 0.7, (r() - 0.5) * 0.2, 1, 0.75);
  else if (type === 1) {
    cut(64, my, 26 + r() * 6, 8 + r() * 3, (r() - 0.5) * 0.25, 1, 0.8);
    g.fillStyle = 'rgba(235,235,240,0.75)';
    for (let x = 44; x < 86; x += 5 + r() * 2) g.fillRect(x, my - 6 + r() * 2, 2.6, 5 + r() * 5);
  } else if (type === 2) cut(64, my + 6, 8 + r() * 5, 20 + r() * 12, (r() - 0.5) * 0.3, 1, 0.7);
  else cut(64, my + 2, 9 + r() * 3, 5 + r() * 4, (r() - 0.5) * 0.5, 1, 0.7);
  // тление: края изъедены, по лицу трещины
  for (let i = 0; i < 46; i++) {
    const an = r() * 6.283, d = 0.55 + r() * 0.5;
    cut(64 + Math.cos(an) * 40 * d, 92 + Math.sin(an) * 70 * d, 2 + r() * 9, 2 + r() * 11, r() * 3, 0.3 + r() * 0.5);
  }
  g.globalCompositeOperation = 'destination-out';
  g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 1.1;
  for (let i = 0; i < 4; i++) {
    let x = 34 + r() * 60, y = 30 + r() * 40;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 7; k++) { x += (r() - 0.5) * 14; y += 6 + r() * 12; g.lineTo(x, y); }
    g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  // оплывание: одну сторону лица тянет вниз
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const o = c.getContext('2d')!;
  const melt = type === 2 || r() < 0.45 ? 10 + r() * 22 : 3 + r() * 5, side = r() < 0.5 ? 1 : -1;
  for (let x = 0; x < W; x++) {
    const k = Math.max(0, ((x / W - 0.5) * side + 0.15)) ** 1.5 * melt + Math.sin(x * 0.35 + seed) * 1.5;
    o.drawImage(tmp, x, 0, 1, H, x, k * 0.6, 1, H - 6 + k);
  }
  return c;
}

export function faceCanvas(i: number): HTMLCanvasElement {
  const k = ((i % FACE_VARIANTS) + FACE_VARIANTS) % FACE_VARIANTS;
  return (canvases[k] ??= draw(k + 1));
}
