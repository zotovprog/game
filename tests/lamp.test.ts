import { describe, expect, it } from 'vitest';
import { T } from '../src/data/tuning';
import { addOil, burnRate, isDead, lightRadius, newLamp, stepLamp } from '../src/systems/lamp';

describe('лампа', () => {
  it('яркий фитиль жжёт масло быстрее, спутники — ещё быстрее', () => {
    expect(burnRate(1, 0)).toBeGreaterThan(burnRate(0.3, 0) * 2);
    expect(burnRate(0.5, 2)).toBeCloseTo(burnRate(0.5, 0) * (1 + 2 * T.lamp.companionBurn));
  });
  it('круг света растёт с фитилём и чахнет на остатках масла', () => {
    const s = newLamp(); s.held = true;
    s.wick = 1; const big = lightRadius(s);
    s.wick = T.lamp.wickMin; expect(lightRadius(s)).toBeLessThan(big * 0.5);
    s.wick = 1; s.oil = 2; expect(lightRadius(s)).toBeLessThan(big * 0.6);
  });
  it('без масла — отсрочка, потом тьма; склянка спасает', () => {
    const s = newLamp(); s.held = true; s.oil = 0.01;
    stepLamp(s, 1, 0); expect(s.oil).toBe(0);
    stepLamp(s, T.lamp.emberTime - 1, 0); expect(isDead(s)).toBe(false);
    addOil(s, T.lamp.flask); stepLamp(s, 0.1, 0); expect(s.ember).toBe(0);
    s.oil = 0; stepLamp(s, T.lamp.emberTime + 0.1, 0); expect(isDead(s)).toBe(true);
  });
  it('стартового масла при фитиле по умолчанию хватает на 2–3 минуты', () => {
    const sec = T.lamp.startOil / burnRate(T.lamp.wickDefault, 0);
    expect(sec).toBeGreaterThan(110); expect(sec).toBeLessThan(200);
  });
});
