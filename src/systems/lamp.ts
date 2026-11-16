// Лампа — единственный ресурс: масло и круг света, который сжимается вместе с ним. Чистая логика без three.js.
import { T } from '../data/tuning';

export interface LampState {
  oil: number;        // 0..100
  held: boolean;
  ember: number;      // сколько секунд уже горит на последнем издыхании
  snuff: number;      // 0..1 — внешнее «задувание» (порыв ветра), временно
  lit: boolean;       // false — пламя задуло: масло есть, а света нет, пока не разожжёшь
  shield: number;     // 0..1 — насколько лампа прикрыта ладонью
  flasks: number;     // склянки в запасе
  pour: number;       // 0..1 — ход долива
  falter: number;     // 0 — пламя в порядке; 1→0 — сбито ветром и гаснет
  draft: number;      // 0..1 — тяга: как сильно ты сейчас дуешь на огонь
  draftV: number;
  fan: number;        // 0..1 — насколько раздул
  fanT: number;       // время с начала раздувания (по нему ходит живая полоса)
  inZone: boolean;    // тяга сейчас в живой полосе
}

export const newLamp = (): LampState => ({ oil: T.lamp.startOil, held: false, ember: 0, snuff: 0, lit: true, shield: 0, flasks: T.lamp.startFlasks, pour: 0, falter: 0, draft: 0, draftV: 0, fan: 0, fanT: 0, inZone: false });

/** Расход масла в секунду. */
export function burnRate(companions: number): number {   // companions — суммарная «нагрузка», может быть дробной
  return T.lamp.burn * (1 + companions * T.lamp.companionBurn);
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
  if (!s.lit) return L.outRadius * (1 + 0.55 * s.fan * (s.inZone ? 1 : 0.5));             // искры: чем ближе к огню, тем виднее
  let r = L.radius * oilVigor(s.oil) * (1 - (1 - L.shieldRadius) * s.shield);
  if (s.falter > 0) r *= (T.fan.rMin + (T.fan.rMax - T.fan.rMin) * s.falter) * (1 + 0.3 * s.fan);       // сбитое пламя: круг сжат и тает
  return Math.max(L.emberRadius, r * (1 - s.snuff) + L.emberRadius * s.snuff);
}

/** Сила пламени 0..1 для вида и звука. */
export function flamePower(s: LampState): number {
  if (s.oil <= 0) return 0.05 * (1 - s.snuff);
  if (!s.lit) return 0.03 + 0.14 * s.fan * (s.inZone ? 1 : 0.4);
  const falter = s.falter > 0 ? (0.3 + 0.5 * s.falter) * (s.inZone ? 1.15 : 0.85) : 1;
  return Math.max(0.05, T.lamp.power * (0.4 + 0.6 * oilVigor(s.oil)) * (1 - s.snuff * 0.92) * (1 - 0.3 * s.shield) * falter);
}

/** mult — множитель расхода (на глубине тьма сама пьёт масло). */
export function stepLamp(s: LampState, dt: number, companions: number, mult = 1): void {
  if (!s.held) return;
  if (!s.lit && s.oil > 0) return;                 // задуло: масло не горит
  if (s.oil > 0) {
    s.oil = Math.max(0, s.oil - burnRate(companions) * mult * dt);
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
/** Пламя сбито или лампа погасла (а масло есть): его надо раздувать. */
export const needsFan = (s: LampState): boolean => s.oil > 0 && (s.falter > 0 || !s.lit);

/** Долив: держать, стоя на месте, пока не дольётся. Сбитое или погасшее пламя сначала надо раздуть. */
export function pourStep(s: LampState, dt: number, holding: boolean): 'none' | 'poured' {
  const can = holding && !needsFan(s) && s.flasks > 0 && s.oil < 97;
  if (!can) { s.pour = Math.max(0, s.pour - dt * 2.5); return 'none'; }
  s.pour += dt / T.lamp.pourTime;
  if (s.pour < 1) return 'none';
  s.pour = 0;
  s.flasks--; addOil(s, T.lamp.flask);
  return 'poured';
}

/** Где сейчас «живая» полоса тяги (центр и полуширина, в долях шкалы). На глубине она уже. */
export function fanZone(t: number, dread: number): { c: number; w: number } {
  const F = T.fan;
  // полоса никогда не касается краёв шкалы: ни «не дуть вовсе», ни «дуть без остановки» её не удержат
  return { c: 0.5 + 0.19 * Math.sin(t * F.drift) + 0.05 * Math.sin(t * F.drift * 2.3 + 1.7), w: F.wide + (F.narrow - F.wide) * Math.min(1, Math.max(0, dread)) };
}

/**
 * Раздувание. Дуешь — тяга растёт, отпустил — падает; держи её в живой полосе.
 * В полосе пламя разгорается; вне её сбитое пламя тает, пока не погаснет совсем.
 * saved — сбитое пламя спасено; out — не удержал, погасло; relit — погасшую лампу удалось разжечь.
 */
export function fanStep(s: LampState, dt: number, blowing: boolean, dread: number): 'none' | 'saved' | 'out' | 'relit' {
  const F = T.fan;
  if (!needsFan(s)) { s.fan = 0; s.draft = 0; s.draftV = 0; s.fanT = 0; s.inZone = false; if (s.oil <= 0) s.falter = 0; return 'none'; }
  s.fanT += dt;
  s.draftV = (s.draftV + (blowing ? F.push : -F.fall) * dt) * Math.exp(-F.damp * dt);
  s.draft += s.draftV * dt;
  if (s.draft <= 0) { s.draft = 0; s.draftV = Math.max(0, s.draftV); }
  if (s.draft >= 1) { s.draft = 1; s.draftV = Math.min(0, s.draftV); }
  const z = fanZone(s.fanT, dread);
  s.inZone = Math.abs(s.draft - z.c) <= z.w;
  s.fan = s.inZone ? s.fan + dt / (s.lit ? F.save : F.relight) : Math.max(0, s.fan - dt * F.leak);
  if (!s.lit) {
    if (s.fan < 1) return 'none';
    s.lit = true; s.fan = 0; s.falter = 0; s.oil = Math.max(1, s.oil - T.lamp.relightCost);
    return 'relit';
  }
  if (!s.inZone) s.falter -= (dt / F.falterTime) * (1 + F.dreadRush * dread);
  if (s.fan >= 1) { s.falter = 0; s.fan = 0; return 'saved'; }
  if (s.falter <= 0) { s.falter = 0; s.lit = false; s.fan = 0; return 'out'; }
  return 'none';
}

/** Порыв сбил пламя (или добил уже сбитое). */
export function knockFlame(s: LampState): void { s.falter = s.falter > 0 ? Math.max(0.05, s.falter - T.fan.hitAgain) : 1; s.pour = 0; }

export const isDead = (s: LampState): boolean => s.held && s.oil <= 0 && s.ember >= T.lamp.emberTime;
