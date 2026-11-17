import { describe, expect, it } from 'vitest';
import { T } from '../src/data/tuning';
import { burnRate, fanStep, fanZone, feed, isDead, knockFlame, lightRadius, needsFan, newLamp, stepLamp } from '../src/systems/lamp';

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
  it('догорел — последние искры, потом тьма', () => {
    const s = newLamp(); s.held = true; s.oil = 0.01;
    stepLamp(s, 1, 0); expect(s.oil).toBe(0);
    stepLamp(s, T.lamp.emberTime - 1.2, 0); expect(isDead(s)).toBe(false);
    stepLamp(s, 1.3, 0); expect(isDead(s)).toBe(true);
  });
  it('огня хватает от жаровни до жаровни с запасом, но не навсегда', () => {
    const rate = burnRate(0);
    expect(T.lamp.startOil / rate).toBeGreaterThan(35); expect(T.lamp.startOil / rate).toBeLessThan(55);      // уголёк на старте: до первой жаровни 30 м
    expect(100 / rate).toBeGreaterThan(50); expect(100 / rate).toBeLessThan(75);                                // полный огонь: 120–200 м пути
  });
  it('у живого огня огонёк разгорается, а уголёк вспыхивает', () => {
    const s = newLamp(); s.held = true; s.oil = 10;
    feed(s, 1); expect(s.oil).toBe(10 + T.lamp.feed);
    feed(s, 10); expect(s.oil).toBe(100);
    s.oil = 30; s.lit = false; s.outT = 5; feed(s, 0.1); expect(s.lit).toBe(true); expect(s.outT).toBe(0);
  });
  it('сбитый до уголька огонь остывает: не раздул вовремя — смерть', () => {
    const s = newLamp(); s.held = true; s.oil = 50; s.lit = false;
    stepLamp(s, T.lamp.outLife - 1, 0); expect(isDead(s)).toBe(false); expect(s.oil).toBe(50);
    stepLamp(s, 1.1, 0); expect(isDead(s)).toBe(true);
  });
  /** Игрок, который умеет: дует, пока огонёк ниже середины живой полосы. */
  const play = (s: ReturnType<typeof newLamp>, dread: number, secs: number): string => {
    for (let t = 0; t < secs; t += 1 / 60) {
      const r = fanStep(s, 1 / 60, s.draft < fanZone(s.fanT, dread).c, dread);
      if (r !== 'none') return r;
    }
    return 'none';
  };
  it('порыв сбивает пламя: круг сжат, его надо раздувать', () => {
    const s = newLamp(); s.held = true; s.oil = 60;
    const full = lightRadius(s);
    knockFlame(s);
    expect(needsFan(s)).toBe(true);
    expect(lightRadius(s)).toBeLessThan(full * 0.8);
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
  it('уголёк можно раздуть заново, пока он не остыл', () => {
    const s = newLamp(); s.held = true; s.oil = 50; s.lit = false;
    expect(play(s, 0.5, 15)).toBe('relit');
    expect(s.lit).toBe(true); expect(s.oil).toBe(50 - T.lamp.relightCost);
  });
});
