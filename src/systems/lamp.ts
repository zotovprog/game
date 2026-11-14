// Лампа — единственный ресурс: масло, фитиль, радиус света. Чистая логика без three.js.
import { T } from '../data/tuning';

export interface LampState {
  oil: number;        // 0..100
  wick: number;       // 0..1
  held: boolean;
  ember: number;      // сколько секунд уже горит на последнем издыхании
  snuff: number;      // 0..1 — внешнее «задувание» (порыв ветра), временно
}

export const newLamp = (): LampState => ({ oil: T.lamp.startOil, wick: T.lamp.wickDefault, held: false, ember: 0, snuff: 0 });

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
  const r = (L.radiusMin + (L.radiusMax - L.radiusMin) * s.wick) * oilVigor(s.oil);
  return Math.max(L.emberRadius, r * (1 - s.snuff) + L.emberRadius * s.snuff);
}

/** Сила пламени 0..1 для вида и звука. */
export function flamePower(s: LampState): number {
  if (s.oil <= 0) return 0.05 * (1 - s.snuff);
  return Math.max(0.05, (0.18 + 0.82 * s.wick) * (0.4 + 0.6 * oilVigor(s.oil)) * (1 - s.snuff * 0.92));
}

/** mult — множитель расхода (на глубине тьма сама пьёт масло). */
export function stepLamp(s: LampState, dt: number, companions: number, mult = 1): void {
  if (!s.held) return;
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

export const isDead = (s: LampState): boolean => s.held && s.oil <= 0 && s.ember >= T.lamp.emberTime;
