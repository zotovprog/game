// Мягкое свечение-спрайт: рисуется один раз на canvas.
import { AdditiveBlending, CanvasTexture, Color, Sprite, SpriteMaterial } from 'three';

let tex: CanvasTexture | null = null;
export function glowTexture(): CanvasTexture {
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.16)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  tex = new CanvasTexture(c);
  return tex;
}

export function makeGlow(color: number, size: number, intensity = 1): Sprite {
  const mat = new SpriteMaterial({ map: glowTexture(), color: new Color(color).multiplyScalar(intensity), blending: AdditiveBlending, depthWrite: false, transparent: true });
  const s = new Sprite(mat);
  s.scale.setScalar(size);
  return s;
}
