// Лица во тьме: бледные смазанные «рожи», нарисованные на canvas. Тьма состоит из них.
import { AdditiveBlending, CanvasTexture, Color, Sprite, SpriteMaterial } from 'three';
import { mulberry32 } from '../core/rng';

const cache: CanvasTexture[] = [];
const canvases: HTMLCanvasElement[] = [];
export const FACE_VARIANTS = 7;

function draw(seed: number): HTMLCanvasElement {
  const r = mulberry32(seed * 7919 + 13);
  const c = document.createElement('canvas');
  c.width = 128; c.height = 176;
  const g = c.getContext('2d')!;
  const blob = (x: number, y: number, rx: number, ry: number, rot: number, stops: [number, string][]) => {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(rx, ry);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 6.283); g.fill(); g.restore();
  };
  // череп: вытянутый, без чёткого края
  const tilt = (r() - 0.5) * 0.3, long = 62 + r() * 18;
  blob(64, 80, 40 + r() * 6, long, tilt, [[0, 'rgba(255,255,255,0.95)'], [0.55, 'rgba(235,235,240,0.7)'], [0.85, 'rgba(200,200,210,0.18)'], [1, 'rgba(200,200,210,0)']]);
  // потёки вниз
  for (let i = 0; i < 4; i++) blob(40 + r() * 48, 120 + r() * 30, 3 + r() * 5, 22 + r() * 26, 0, [[0, 'rgba(220,220,228,0.35)'], [1, 'rgba(220,220,228,0)']]);
  // глазницы: пустые, разного размера
  const ey = 62 + r() * 10, ex = 15 + r() * 5;
  const hole: [number, string][] = [[0, 'rgba(0,0,0,1)'], [0.6, 'rgba(0,0,0,0.96)'], [1, 'rgba(0,0,0,0)']];
  g.globalCompositeOperation = 'destination-out';
  blob(64 - ex, ey + (r() - 0.5) * 6, 9 + r() * 6, 11 + r() * 9, (r() - 0.5) * 0.7, hole);
  blob(64 + ex, ey + (r() - 0.5) * 6, 9 + r() * 6, 11 + r() * 9, (r() - 0.5) * 0.7, hole);
  // рот: распахнут слишком широко
  const kind = Math.floor(r() * 3);
  if (kind === 0) blob(64 + (r() - 0.5) * 6, 116 + r() * 8, 12 + r() * 6, 20 + r() * 16, (r() - 0.5) * 0.25, hole);
  else if (kind === 1) blob(64, 112 + r() * 8, 22 + r() * 8, 7 + r() * 5, (r() - 0.5) * 0.3, hole);
  else { blob(58, 114, 8, 13, 0.2, hole); blob(70, 122, 7, 15, -0.2, hole); }
  blob(64, 92, 4, 6, 0, [[0, 'rgba(0,0,0,0.7)'], [1, 'rgba(0,0,0,0)']]);
  g.globalCompositeOperation = 'source-over';
  return c;
}

export function faceCanvas(i: number): HTMLCanvasElement {
  const k = ((i % FACE_VARIANTS) + FACE_VARIANTS) % FACE_VARIANTS;
  return (canvases[k] ??= draw(k + 1));
}
export function faceTexture(i: number): CanvasTexture {
  const k = ((i % FACE_VARIANTS) + FACE_VARIANTS) % FACE_VARIANTS;
  return (cache[k] ??= new CanvasTexture(faceCanvas(k)));
}

/** Лицо-спрайт. opacity 0..1 задаёт, насколько оно проступило из черноты. */
export class Face {
  readonly sprite: Sprite;
  private mat: SpriteMaterial;
  private tintColor: Color;
  size = 1;
  constructor(variant: number, tint: number, readonly seed: number) {
    this.tintColor = new Color(tint);
    this.mat = new SpriteMaterial({ map: faceTexture(variant), color: this.tintColor.clone(), blending: AdditiveBlending, transparent: true, depthWrite: false });
    this.sprite = new Sprite(this.mat);
    this.sprite.renderOrder = 8;
    this.sprite.visible = false;
  }
  /** stretch — насколько раскрыт рот/вытянуто лицо (0..1). */
  set(t: number, opacity: number, stretch = 0): void {
    const o = Math.max(0, opacity);
    this.sprite.visible = o > 0.01;
    if (!this.sprite.visible) return;
    this.mat.color.copy(this.tintColor).multiplyScalar(o);
    const breathe = 1 + Math.sin(t * 1.7 + this.seed * 30) * 0.05;
    const tw = Math.sin(t * 9 + this.seed * 50) * 0.02 * (1 + stretch * 3);
    this.sprite.scale.set(this.size * 0.73 * (breathe + tw), this.size * (breathe + stretch * 0.5 - tw), 1);
    this.mat.rotation = Math.sin(t * 0.6 + this.seed * 20) * 0.12 + (this.seed - 0.5) * 0.5;
  }
}
