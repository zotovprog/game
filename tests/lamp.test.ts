import { describe, expect, it } from 'vitest';
import { T } from '../src/data/tuning';
import { addOil, burnRate, isDead, lightRadius, newLamp, stepLamp } from '../src/systems/lamp';

describe('лампа', () => {
  it('яркий фитиль жжёт масло быстрее, спутники — ещё быстрее', () => {
    expect(burnRate(1, 0)).toBeGreaterThan(burnRate(0.3, 0) * 2);
    expect(burnRate(0.5, 2)).toBeCloseTo(burnRate(0.5, 0) * (1 + 2 * T.lamp.companionBurn));
  });
  it('круг света растёт с фитилём и сжимается вместе с маслом', () => {
    const s = newLamp(); s.held = true; s.oil = 100;
    s.wick = 1; const big = lightRadius(s);
    s.wick = T.lamp.wickMin; expect(lightRadius(s)).toBeLessThan(big * 0.5);
    s.wick = 1;
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
  it('масло — это отсчёт: стартового хватает на 30–60 с, склянки — на 12–25 с', () => {
    const rate = burnRate(T.lamp.wickDefault, 0);
    expect(T.lamp.startOil / rate).toBeGreaterThan(30); expect(T.lamp.startOil / rate).toBeLessThan(60);
    expect(T.lamp.flask / rate).toBeGreaterThan(12); expect(T.lamp.flask / rate).toBeLessThan(25);
  });
});
