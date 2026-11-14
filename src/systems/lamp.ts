// Лампа — единственный ресурс: масло, фитиль, радиус света. Чистая логика без three.js.
import { T } from '../data/tuning';

export interface LampState {
  oil: number;        // 0..100
  wick: number;       // 0..1
  held: boolean;
  ember: number;      // сколько секунд уже горит на последнем издыхании
  snuff: number;      // 0..1 — внешнее «задувание» (порыв ветра), временно
  lit: boolean;       // false — пламя задуло: масло есть, а света нет, пока не разожжёшь
  shield: number;     // 0..1 — насколько лампа прикрыта ладонью
  flasks: number;     // склянки в запасе
  pour: number;       // 0..1 — ход долива или розжига
}

export const newLamp = (): LampState => ({ oil: T.lamp.startOil, wick: T.lamp.wickDefault, held: false, ember: 0, snuff: 0, lit: true, shield: 0, flasks: T.lamp.startFlasks, pour: 0 });

/** Расход масла в секунду. */
export function burnRate(wick: number, companions: number): number {   // companions — суммарная «нагрузка», может быть дробной
  const L = T.lamp;
  return (L.burnBase + Math.pow(wick, L.burnPow) * L.burnWick) * (1 + companions * L.companionBurn);
}

/** Насколько пламя «живо» из-за остатка масла: 1 — полная лампа, oilFloor — на донышке. Круг сжимается вместе с маслом. */
export function oilVigor(oil: number): number {
  const L = T.lamp;
  return oil <= 0 ? 0 : L.oilFloor + (1 - L.oilFloor) * Math.sqrt(Math.min(1, oil / 100));
}

/** Радиус круга света в метрах. */
export function lightRadius(s: LampState): number {
  const L = T.lamp;
  if (s.oil <= 0) return L.emberRadius * (1 - s.snuff * 0.5);
  if (!s.lit) return L.outRadius;
  const r = (L.radiusMin + (L.radiusMax - L.radiusMin) * s.wick) * oilVigor(s.oil) * (1 - (1 - L.shieldRadius) * s.shield);
  return Math.max(L.emberRadius, r * (1 - s.snuff) + L.emberRadius * s.snuff);
}

/** Сила пламени 0..1 для вида и звука. */
export function flamePower(s: LampState): number {
  if (s.oil <= 0) return 0.05 * (1 - s.snuff);
  if (!s.lit) return 0.03;
  return Math.max(0.05, (0.18 + 0.82 * s.wick) * (0.4 + 0.6 * oilVigor(s.oil)) * (1 - s.snuff * 0.92) * (1 - 0.3 * s.shield));
}

/** mult — множитель расхода (на глубине тьма сама пьёт масло). */
export function stepLamp(s: LampState, dt: number, companions: number, mult = 1): void {
  if (!s.held) return;
  if (!s.lit && s.oil > 0) return;                 // задуло: масло не горит
  if (s.oil > 0) {
    s.oil = Math.max(0, s.oil - burnRate(s.wick, companions) * mult * dt);
    s.ember = 0;
  } else {
    s.ember += dt;
  }
}

export function addOil(s: LampState, amount: number): void {
  s.oil = Math.min(100, s.oil + amount);
  if (s.oil > 0) s.ember = 0;
}

/** Долить из запаса (или разжечь, если задуло). Возвращает, что произошло за этот шаг. */
export function pourStep(s: LampState, dt: number, holding: boolean): 'none' | 'poured' | 'relit' {
  const L = T.lamp;
  const relight = !s.lit && s.oil > 0;
  const can = holding && (relight || (s.flasks > 0 && s.oil < 97));
  if (!can) { s.pour = Math.max(0, s.pour - dt * 2.5); return 'none'; }
  s.pour += dt / (relight ? L.relightTime : L.pourTime);
  if (s.pour < 1) return 'none';
  s.pour = 0;
  if (relight) { s.lit = true; s.oil = Math.max(1, s.oil - L.relightCost); return 'relit'; }
  s.flasks--; addOil(s, L.flask); s.lit = true;
  return 'poured';
}

export const isDead = (s: LampState): boolean => s.held && s.oil <= 0 && s.ember >= T.lamp.emberTime;
