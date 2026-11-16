import { describe, expect, it } from 'vitest';
import { T } from '../src/data/tuning';
import { addOil, burnRate, fanStep, fanZone, isDead, knockFlame, lightRadius, needsFan, newLamp, pourStep, stepLamp } from '../src/systems/lamp';

describe('лампа', () => {
  it('спутники жгут масло быстрее', () => {
    expect(burnRate(2)).toBeCloseTo(burnRate(0) * (1 + 2 * T.lamp.companionBurn));
  });
  it('круг света сжимается вместе с маслом; ладонь делает его меньше', () => {
    const s = newLamp(); s.held = true; s.oil = 100;
    const big = lightRadius(s);
    s.shield = 1; expect(lightRadius(s)).toBeLessThan(big * 0.7); s.shield = 0;
    s.oil = 50; const half = lightRadius(s); expect(half).toBeLessThan(big * 0.9);
    s.oil = 10; expect(lightRadius(s)).toBeLessThan(half * 0.75);
  });
  it('без масла — отсрочка, потом тьма; склянка спасает', () => {
    const s = newLamp(); s.held = true; s.oil = 0.01;
    stepLamp(s, 1, 0); expect(s.oil).toBe(0);
    stepLamp(s, T.lamp.emberTime - 1, 0); expect(isDead(s)).toBe(false);
    addOil(s, T.lamp.flask); stepLamp(s, 0.1, 0); expect(s.ember).toBe(0);
    s.oil = 0; stepLamp(s, T.lamp.emberTime + 0.1, 0); expect(isDead(s)).toBe(true);
  });
  it('масло — отсчёт, но не казнь: стартового хватает на 45–75 с, склянки — на 20–35 с', () => {
    const rate = burnRate(0);
    expect(T.lamp.startOil / rate).toBeGreaterThan(45); expect(T.lamp.startOil / rate).toBeLessThan(75);
    expect(T.lamp.flask / rate).toBeGreaterThan(20); expect(T.lamp.flask / rate).toBeLessThan(35);
  });
  it('доливать надо самому: держать, пока не дольётся; отпустил — сброс', () => {
    const s = newLamp(); s.held = true; s.oil = 20; s.flasks = 2;
    expect(pourStep(s, T.lamp.pourTime * 0.6, true)).toBe('none');
    pourStep(s, 1, false); expect(s.pour).toBe(0); expect(s.flasks).toBe(2);
    pourStep(s, T.lamp.pourTime * 0.6, true);
    expect(pourStep(s, T.lamp.pourTime * 0.6, true)).toBe('poured');
    expect(s.flasks).toBe(1); expect(s.oil).toBe(20 + T.lamp.flask);
  });
  /** Игрок, который умеет: дует, пока огонёк ниже середины живой полосы. */
  const play = (s: ReturnType<typeof newLamp>, dread: number, secs: number): string => {
    for (let t = 0; t < secs; t += 1 / 60) {
      const r = fanStep(s, 1 / 60, s.draft < fanZone(s.fanT, dread).c, dread);
      if (r !== 'none') return r;
    }
    return 'none';
  };
  it('порыв сбивает пламя: круг сжат, масло горит, долить нельзя — сначала раздуй', () => {
    const s = newLamp(); s.held = true; s.oil = 60; s.flasks = 1;
    const full = lightRadius(s);
    knockFlame(s);
    expect(needsFan(s)).toBe(true);
    expect(lightRadius(s)).toBeLessThan(full * 0.8);
    expect(pourStep(s, T.lamp.pourTime * 2, true)).toBe('none'); expect(s.flasks).toBe(1);
  });
  it('раздувание — баланс: умелый спасает пламя, бездействие и «дуть без остановки» его гасят', () => {
    for (const dread of [0, 0.5, 1]) {
      const a = newLamp(); a.held = true; a.oil = 60; knockFlame(a);
      expect(play(a, dread, 12)).toBe('saved'); expect(a.lit).toBe(true); expect(a.falter).toBe(0);
    }
    const idle = newLamp(); idle.held = true; idle.oil = 60; knockFlame(idle);
    let r = 'none'; for (let t = 0; t < 20 && r === 'none'; t += 1 / 60) r = fanStep(idle, 1 / 60, false, 0);
    expect(r).toBe('out'); expect(idle.lit).toBe(false); expect(lightRadius(idle)).toBeLessThan(1.6);
    const mash = newLamp(); mash.held = true; mash.oil = 60; knockFlame(mash);
    r = 'none'; for (let t = 0; t < 30 && r === 'none'; t += 1 / 60) r = fanStep(mash, 1 / 60, true, 0);
    expect(r).toBe('out');
  });
  it('погасшую лампу можно раздуть заново; масло при этом не горит', () => {
    const s = newLamp(); s.held = true; s.oil = 50; s.lit = false;
    stepLamp(s, 5, 0); expect(s.oil).toBe(50);
    expect(play(s, 0.5, 15)).toBe('relit');
    expect(s.lit).toBe(true); expect(s.oil).toBe(50 - T.lamp.relightCost);
  });
});
