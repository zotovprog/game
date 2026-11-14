// Весь звук синтезируется на лету (WebAudio): гул пещеры, шёпот, сердце, шаги, капли, огонь, удары.
export interface AudioState {
  pressure: number;      // 0..1 — насколько тьма сжала круг
  power: number;         // 0..1 — сила пламени
  near: number;          // 0..1 — близость духов
  pan: number;           // -1..1 — с какой стороны ближайший
  fire: number;          // 0..1 — близость живого огня
  dawn: number;          // 0..1 — близость Врат
  quiet: boolean;        // меню/пауза/финал: приглушить
  zone: string;          // характер места: rubble / mine / columns / water / void / fissure / gate
  dread: number;         // 0..1 — общий страх: от него зависят пульс, провалы тишины, диссонанс
  oil: number;           // 0..1 — сколько масла: на донышке слышен тонкий звон
  wave: number;          // 0..1 — насколько близко вал тьмы
}

export type Voice = 'efim' | 'vera' | 'father' | 'mother' | 'mila' | 'boy' | 'shade';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode; private lp!: BiquadFilterNode; private rev!: GainNode;
  private white!: AudioBuffer; private brown!: AudioBuffer;
  private droneG!: GainNode; private dreadG!: GainNode; private airG!: GainNode; private airF!: BiquadFilterNode;
  private whG!: GainNode; private whPan!: StereoPannerNode; private hissG!: GainNode; private fireG!: GainNode; private dawnG!: GainNode;
  private tWh = 0; private tBeat = 0; private tSputter = 0; private tFire = 0;
  private drone: OscillatorNode[] = [];
  private roarG!: GainNode; private whineG!: GainNode;
  private tZone = 3; private tPulse = 0; private tSwell = 8; private tHush = 20; private hush = 0; private zoneNow = '';
  private stepFlip = false;

  get ready(): boolean { return this.ctx !== null; }
  private get now(): number { return this.ctx!.currentTime; }

  /** Вызывать из обработчика клика: браузер разрешает звук только после жеста. */
  init(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.white = this.noise(2, false); this.brown = this.noise(3, true);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5;
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 18000;
    this.master = c.createGain(); this.master.gain.value = 0;
    this.master.connect(this.lp).connect(comp).connect(c.destination);
    const conv = c.createConvolver(); conv.buffer = this.impulse(3.4);
    this.rev = c.createGain(); this.rev.gain.value = 0.55;
    this.rev.connect(conv).connect(this.master);

    // гул: два почти одинаковых тона дают медленное биение
    this.droneG = this.gain(0.0, this.master);
    for (const [f, type, g] of [[41, 'sine', 1], [43.4, 'sine', 0.8], [82.6, 'triangle', 0.16], [123.2, 'sine', 0.07]] as [number, OscillatorType, number][]) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f;
      this.drone.push(o);
      o.connect(this.gain(g, this.droneG)); o.start();
    }
    // тревога: тесный кластер, слышен только когда свет мал
    this.dreadG = this.gain(0, this.master);
    const dl = c.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 520; dl.connect(this.dreadG); dl.connect(this.gain(0.5, this.rev));
    for (const f of [233.1, 246.9, 261.6, 349.2]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = Math.random() * 30 - 15; o.connect(this.gain(0.25, dl)); o.start(); }
    // воздух
    this.airG = this.gain(0.0, this.master);
    this.airF = c.createBiquadFilter(); this.airF.type = 'bandpass'; this.airF.frequency.value = 240; this.airF.Q.value = 0.6;
    this.loop(this.brown).connect(this.airF).connect(this.airG);
    // шёпот: шум сквозь «гласные» форманты, громкость рубится на слоги
    this.whG = this.gain(0, null);
    this.whPan = c.createStereoPanner();
    this.whG.connect(this.whPan); this.whPan.connect(this.master); this.whPan.connect(this.gain(0.6, this.rev));
    const src = this.loop(this.white);
    for (const [f, q] of [[1750, 5], [2900, 6], [900, 3]]) { const b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; src.connect(b).connect(this.whG); }
    // шипение фитиля
    this.hissG = this.gain(0, this.master);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5200;
    this.loop(this.white).connect(hp).connect(this.hissG);
    // треск живого огня
    this.fireG = this.gain(0, this.master);
    const fb = c.createBiquadFilter(); fb.type = 'bandpass'; fb.frequency.value = 1500; fb.Q.value = 0.7;
    this.loop(this.brown).connect(fb).connect(this.fireG);
    // рассвет за Вратами: тёплое трезвучие
    this.dawnG = this.gain(0, this.master);
    this.dawnG.connect(this.gain(0.8, this.rev));
    for (const f of [110, 164.8, 220, 277.2, 329.6]) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(this.gain(f < 200 ? 0.5 : 0.25, this.dawnG)); o.start(); }
    // вал тьмы: низкий рёв по следу
    this.roarG = this.gain(0, this.master);
    const rl = c.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 260;
    this.loop(this.brown).connect(rl).connect(this.roarG); this.roarG.connect(this.gain(0.5, this.rev));
    // масло на донышке: тонкий звон в ушах
    this.whineG = this.gain(0, this.master);
    for (const f of [3050, 3127]) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(this.whineG); o.start(); }
    this.master.gain.setTargetAtTime(0.85, c.currentTime, 1.5);
  }

  private gain(v: number, to: AudioNode | null): GainNode { const g = this.ctx!.createGain(); g.gain.value = v; if (to) g.connect(to); return g; }
  private loop(buf: AudioBuffer): AudioBufferSourceNode { const s = this.ctx!.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * buf.duration); return s; }
  private noise(sec: number, brown: boolean): AudioBuffer {
    const c = this.ctx!, b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    return b;
  }
  private impulse(sec: number): AudioBuffer {
    const c = this.ctx!, b = c.createBuffer(2, c.sampleRate * sec, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lpv = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / d.length;
        lpv += ((Math.random() * 2 - 1) - lpv) * (0.5 - 0.42 * t);            // хвост темнее начала
        d[i] = lpv * Math.pow(1 - t, 2.6) * (i < 400 ? i / 400 : 1);
      }
    }
    return b;
  }
  /** Короткий шумовой звук с фильтром и огибающей. */
  private burst(buf: AudioBuffer, type: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, pan = 0, wet = 0.3, q = 1): void {
    const c = this.ctx!, t = this.now;
    const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = c.createStereoPanner(); p.pan.value = pan;
    s.connect(f).connect(g).connect(p); p.connect(this.master); if (wet > 0) p.connect(this.gain(wet, this.rev));
    s.start(t, Math.random() * buf.duration); s.stop(t + dur + 0.05);
  }
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, pan = 0, wet = 0.3, attack = 0.005): void {
    const c = this.ctx!, t = this.now;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = c.createStereoPanner(); p.pan.value = pan;
    o.connect(g).connect(p); p.connect(this.master); if (wet > 0) p.connect(this.gain(wet, this.rev));
    o.start(t); o.stop(t + dur + 0.05);
  }

  /** Высота гула и набор случайных звуков для каждой зоны: пещера звучит по-разному. */
  private static ZONES: Record<string, { hz: number; air: number; every: [number, number] }> = {
    rubble: { hz: 41, air: 240, every: [5, 11] }, mine: { hz: 36.7, air: 180, every: [4, 9] }, columns: { hz: 49, air: 320, every: [5, 10] },
    water: { hz: 32.7, air: 150, every: [1.2, 3.5] }, void: { hz: 27.5, air: 420, every: [6, 12] }, fissure: { hz: 43.6, air: 520, every: [4, 9] }, gate: { hz: 55, air: 300, every: [6, 12] },
  };
  private zoneSound(zone: string, dread: number): void {
    const pan = Math.random() * 1.8 - 0.9, r = Math.random();
    if (zone === 'mine') {
      if (r < 0.45) { const f = 160 + Math.random() * 120; this.tone('sawtooth', f, f * (0.7 + Math.random() * 0.5), 0.5 + Math.random() * 0.6, 0.035, pan, 1.3, 0.12); }   // скрип крепи
      else if (r < 0.75) { this.tone('triangle', 520 + Math.random() * 300, 180, 0.9, 0.03, pan, 1.8, 0.004); }                                      // звон железа
      else for (let i = 0; i < 4; i++) setTimeout(() => this.ctx && this.burst(this.brown, 'bandpass', 900 + Math.random() * 900, 500, 0.06, 0.12, pan, 0.9, 2), i * (90 + Math.random() * 120)); // осыпь
    } else if (zone === 'water') {
      const f = 900 + Math.random() * 1500; this.tone('sine', f, f * 0.5, 0.08, 0.05, pan, 1.6);                                                     // капля
      if (r < 0.2) setTimeout(() => this.ctx && this.burst(this.brown, 'lowpass', 300, 90, 0.7, 0.25, pan, 0.8), 200);                              // что-то плеснуло
    } else if (zone === 'columns') {
      const f = [196, 233, 262, 311][Math.floor(Math.random() * 4)] * (Math.random() < 0.3 ? 0.5 : 1);
      this.tone('sine', f, f * 0.995, 3.5, 0.028, pan, 2.4, 0.4); this.tone('sine', f * 2.01, f * 2, 2.2, 0.008, -pan, 2.4, 0.3);                    // камень гудит
    } else if (zone === 'void') {
      this.burst(this.brown, 'bandpass', 180 + Math.random() * 120, 520 + Math.random() * 300, 3.2 + Math.random() * 2, 0.5, pan, 0.6, 1.6);         // вой ветра
    } else if (zone === 'fissure') {
      if (r < 0.5) this.burst(this.white, 'bandpass', 2400, 700, 0.12, 0.09, pan, 1.6, 3);                                                           // треск камня
      else this.burst(this.brown, 'bandpass', 420, 260, 1.6, 0.35, pan, 0.9, 1.8);                                                                   // вздох в щели
    } else {
      const f = 1100 + Math.random() * 1200; this.tone('sine', f, f * 0.55, 0.07, 0.035, pan, 1.2);
      if (r < 0.25) for (let i = 0; i < 3; i++) setTimeout(() => this.ctx && this.burst(this.brown, 'bandpass', 800 + Math.random() * 700, 400, 0.07, 0.1, pan, 0.9, 2), i * 140);
    }
    if (dread > 0.55 && r > 0.8) this.tone('sine', 82, 77, 2.6, 0.12 * dread, 0, 0.8, 0.9);                                                          // глухой толчок из глубины
  }

  update(dt: number, s: AudioState): void {
    if (!this.ctx) return;
    const t = this.now, k = 0.25;
    const Z = Sfx.ZONES[s.zone] ?? Sfx.ZONES.rubble;
    // провалы тишины: гул вдруг обрывается — и это страшнее гула. Чем глубже, тем чаще.
    this.tHush -= dt;
    if (this.tHush <= 0 && !s.quiet) { this.tHush = 38 - 20 * s.dread + Math.random() * 14; this.hush = 2.2 + Math.random() * 1.6; }
    this.hush = Math.max(0, this.hush - dt);
    const q = (s.quiet ? 0.35 : 1) * (this.hush > 0 ? 0.04 : 1);
    // гул: высота своя у каждой зоны, плывёт и «дышит», а не стоит на месте
    if (s.zone !== this.zoneNow) {
      this.zoneNow = s.zone;
      const mult = [1, 1.058, 2.01, 3.0];
      this.drone.forEach((o, i) => o.frequency.setTargetAtTime(Z.hz * mult[i], t, 2.5));
    }
    const breathe = 0.75 + 0.25 * Math.sin(t * 0.21) * Math.sin(t * 0.083 + 1.3);
    this.droneG.gain.setTargetAtTime((0.045 + 0.1 * s.dread + 0.1 * s.pressure) * breathe * q, t, this.hush > 0 ? 0.08 : 0.6);
    this.drone[1]?.detune.setTargetAtTime(Math.sin(t * 0.07) * 35 + s.dread * 40, t, 1);
    this.dreadG.gain.setTargetAtTime(Math.pow(Math.max(s.pressure, s.near * 0.8, s.dread * 0.75), 2) * 0.06 * q, t, 0.6);
    this.airG.gain.setTargetAtTime((0.03 + 0.05 * s.pressure + (s.zone === 'void' ? 0.06 : 0)) * q, t, k);
    this.airF.frequency.setTargetAtTime(Z.air + 120 * Math.sin(t * 0.13) + 200 * s.pressure, t, 1);
    this.roarG.gain.setTargetAtTime(s.quiet ? 0 : s.wave * s.wave * 0.9, t, 0.3);
    this.whineG.gain.setTargetAtTime(s.quiet || s.oil > 0.25 ? 0 : (0.25 - s.oil) * 0.03, t, 0.5);
    // звуки места
    this.tZone -= dt;
    if (this.tZone <= 0 && !s.quiet && this.hush <= 0) { this.tZone = Z.every[0] + Math.random() * (Z.every[1] - Z.every[0]); this.zoneSound(s.zone, s.dread); }
    // пульс страха: редкие глухие удары, которые учащаются к Вратам
    if (s.dread > 0.3 && !s.quiet && this.hush <= 0) {
      this.tPulse -= dt;
      if (this.tPulse <= 0) {
        this.tPulse = 1.9 - 1.25 * s.dread;
        this.tone('sine', 46, 40, 0.5, 0.13 + 0.25 * s.dread, 0, 0.5, 0.01);
        if (s.dread > 0.7) setTimeout(() => this.ctx && this.tone('triangle', 92, 88, 0.2, 0.05, 0, 0.6, 0.01), (this.tPulse * 1000) / 2);
      }
    }
    // наплывы диссонанса
    this.tSwell -= dt;
    if (this.tSwell <= 0 && !s.quiet) {
      this.tSwell = 16 - 9 * s.dread + Math.random() * 8;
      if (s.dread > 0.25) { const f = 180 + Math.random() * 140, d = 3.5 + Math.random() * 2; for (const m of [1, 1.06, 1.5 + Math.random() * 0.05]) this.tone('sawtooth', f * m, f * m * (0.97 + Math.random() * 0.06), d, 0.012 + 0.02 * s.dread, Math.random() * 1.6 - 0.8, 1.6, d * 0.5); }
    }
    this.hissG.gain.setTargetAtTime(0.0035 * s.power * q, t, k);
    this.fireG.gain.setTargetAtTime(0.11 * s.fire * q, t, 0.4);
    this.dawnG.gain.setTargetAtTime(0.05 * s.dawn, t, 1.2);
    this.whPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, s.pan)), t, 0.3);
    // слоги шёпота
    this.tWh -= dt;
    if (this.tWh <= 0) {
      this.tWh = 0.07 + Math.random() * 0.16;
      const lvl = s.quiet ? 0 : Math.pow(Math.max(s.near, s.pressure * 0.7), 1.6) * 0.085;
      this.whG.gain.setTargetAtTime(Math.random() < 0.3 ? 0 : lvl * (0.3 + Math.random()), t, 0.03);
    }
    // треск огня — случайные всплески
    this.tFire -= dt;
    if (this.tFire <= 0 && s.fire > 0.05 && !s.quiet) { this.tFire = 0.05 + Math.random() * 0.3; this.burst(this.white, 'bandpass', 2000 + Math.random() * 3000, 1500, 0.03, 0.05 * s.fire, 0, 0.1, 2); }
    // сердце
    if (s.pressure > 0.4 && !s.quiet) {
      this.tBeat -= dt;
      if (this.tBeat <= 0) {
        this.tBeat = 1.15 - 0.72 * Math.pow((s.pressure - 0.4) / 0.6, 1.3);
        const v = 0.25 + 0.5 * s.pressure;
        this.tone('sine', 62, 36, 0.16, v, 0, 0.05);
        setTimeout(() => this.ctx && this.tone('sine', 54, 32, 0.14, v * 0.7, 0, 0.05), 150);
        this.beat = 1;
      }
    }
    this.beat = Math.max(0, this.beat - dt * 3.5);
    // чихание пламени на остатках масла
    this.tSputter -= dt;
    if (this.tSputter <= 0 && s.power < 0.22 && s.power > 0 && !s.quiet) { this.tSputter = 0.1 + Math.random() * 0.7; this.burst(this.white, 'highpass', 3000, 2500, 0.025, 0.03, 0, 0); }
  }
  /** 0..1 — затухающий импульс удара сердца (для виньетки). */
  beat = 0;

  step(vol = 1): void {
    if (!this.ctx) return;
    this.stepFlip = !this.stepFlip;
    const f = this.stepFlip ? 620 : 500;
    this.burst(this.brown, 'lowpass', f + Math.random() * 200, 200, 0.09, 0.2 * vol, 0, 0.35);
    this.burst(this.white, 'bandpass', 2400 + Math.random() * 800, 1800, 0.035, 0.012 * vol, 0, 0.2, 1.5);
  }
  pickup(): void {
    if (!this.ctx) return;
    this.tone('sine', 2350, 2300, 0.3, 0.05, 0.1, 0.5); this.tone('sine', 3520, 3480, 0.22, 0.03, -0.1, 0.5);
    setTimeout(() => this.ctx && this.burst(this.brown, 'lowpass', 500, 180, 0.35, 0.3, 0, 0.2), 120);
  }
  ignite(): void { if (this.ctx) { this.burst(this.brown, 'bandpass', 180, 1400, 0.7, 0.5, 0, 0.5, 0.8); this.burst(this.white, 'highpass', 2500, 5000, 0.25, 0.05); } }
  relight(): void { if (this.ctx) { this.burst(this.white, 'bandpass', 400, 2600, 0.35, 0.16, 0, 0.4, 0.9); } }
  snuff(pan = 0): void { if (this.ctx) this.burst(this.white, 'highpass', 6000, 700, 0.45, 0.12, pan, 0.8); }
  gust(): void { if (this.ctx) { this.burst(this.brown, 'bandpass', 160, 900, 1.1, 0.9, -0.5, 0.6, 0.7); setTimeout(() => this.ctx && this.burst(this.brown, 'bandpass', 800, 150, 1.6, 0.7, 0.5, 0.6, 0.7), 500); } }
  touch(): void { if (this.ctx) { this.tone('sine', 90, 30, 0.5, 0.6, 0, 0.3); this.burst(this.white, 'bandpass', 900, 3200, 0.3, 0.14, 0, 0.6, 3); } }
  /** Резкий удар: провал баса + расстроенный кластер. */
  stinger(): void {
    if (!this.ctx) return;
    this.tone('sine', 70, 24, 1.6, 0.9, 0, 0.4);
    for (let i = 0; i < 6; i++) this.tone('sawtooth', 380 + i * 97 + Math.random() * 40, 300 + i * 60, 1.1, 0.035, i % 2 ? 0.6 : -0.6, 0.9, 0.01);
    this.burst(this.white, 'bandpass', 3500, 600, 0.9, 0.2, 0, 0.9, 1.2);
  }
  /** Шёпот в самое ухо. */
  whisper(pan: number, vol = 0.12): void {
    if (!this.ctx) return;
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) setTimeout(() => this.ctx && this.burst(this.white, 'bandpass', 1500 + Math.random() * 1600, 1300 + Math.random() * 1200, 0.1 + Math.random() * 0.12, vol * (0.5 + Math.random() * 0.5), pan, 0.5, 4), i * 150);
  }
  /** Голос человека: бормотание из нескольких слогов; у детей — выше и короче. */
  voice(kind: Voice): void {
    if (!this.ctx) return;
    const base = { efim: 98, vera: 196, father: 110, mother: 208, mila: 330, boy: 300, shade: 350 }[kind];
    const form = { efim: 520, vera: 760, father: 560, mother: 800, mila: 1050, boy: 980, shade: 1150 }[kind];
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) setTimeout(() => {
      if (!this.ctx) return;
      const c = this.ctx, t = this.now, f = base * (0.92 + Math.random() * 0.2), d = 0.09 + Math.random() * 0.1;
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 0.9, t + d);
      const b = c.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = form; b.Q.value = 2.2;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(kind === 'shade' ? 0.07 : 0.11, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(b).connect(g); g.connect(this.master); g.connect(this.gain(kind === 'shade' ? 1.4 : 0.5, this.rev));
      o.start(t); o.stop(t + d + 0.05);
    }, i * 120);
  }
  /** Голоса самой тьмы: всегда из черноты, сбоку, с долгим эхом. */
  dark(kind: 'moan' | 'click' | 'breath' | 'knock' | 'cry' | 'scrape' | 'hiss' | 'sizzle', pan: number, vol: number): void {
    if (!this.ctx) return;
    const c = this.ctx, t = this.now;
    if (kind === 'hiss') {
      // она набирает воздух: нарастающий шёпот-шипение с той стороны, откуда бросится
      this.burst(this.white, 'bandpass', 500, 3400, 1.35, 0.26 * vol, pan, 0.5, 2.2);
      this.tone('sawtooth', 58, 96, 1.35, 0.1 * vol, pan, 0.4, 1.1);
      return;
    }
    if (kind === 'sizzle') {
      this.burst(this.white, 'highpass', 7000, 2200, 0.5, 0.2 * vol, pan, 0.5);
      this.tone('sine', 1400, 300, 0.35, 0.05 * vol, pan, 0.6);
      return;
    }
    if (kind === 'moan') {
      const f = 70 + Math.random() * 70, d = 1.6 + Math.random() * 1.4;
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (0.8 + Math.random() * 0.5), t + d * 0.6); o.frequency.linearRampToValueAtTime(f * 0.7, t + d);
      const b = c.createBiquadFilter(); b.type = 'bandpass'; b.Q.value = 3;
      b.frequency.setValueAtTime(420, t); b.frequency.linearRampToValueAtTime(760, t + d * 0.5); b.frequency.linearRampToValueAtTime(300, t + d);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.085 * vol, t + d * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      const p = c.createStereoPanner(); p.pan.value = pan;
      o.connect(b).connect(g).connect(p); p.connect(this.master); p.connect(this.gain(1.3, this.rev));
      o.start(t); o.stop(t + d + 0.1);
    } else if (kind === 'breath') {
      this.burst(this.brown, 'bandpass', 700, 380, 0.9, 0.5 * vol, pan, 0.6, 1.4);
      setTimeout(() => this.ctx && this.burst(this.brown, 'bandpass', 420, 620, 1.1, 0.4 * vol, pan, 0.6, 1.4), 1000);
    } else if (kind === 'click') {
      const n = 3 + Math.floor(Math.random() * 6);
      for (let i = 0; i < n; i++) setTimeout(() => this.ctx && this.burst(this.white, 'bandpass', 2600 + Math.random() * 1800, 2200, 0.018, 0.09 * vol, pan, 0.9, 6), i * (40 + Math.random() * 50));
    } else if (kind === 'knock') {
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) setTimeout(() => this.ctx && this.tone('sine', 150, 70, 0.1, 0.28 * vol, pan, 1.5), i * 330);
    } else if (kind === 'scrape') {
      for (let i = 0; i < 7; i++) setTimeout(() => this.ctx && this.burst(this.brown, 'bandpass', 900 + Math.random() * 500, 700, 0.16, 0.22 * vol, pan, 0.8, 2.5), i * 150);
    } else {
      // далёкий детский плач: три коротких всхлипа
      for (let i = 0; i < 3; i++) setTimeout(() => {
        if (!this.ctx) return;
        const f = 520 + Math.random() * 90;
        this.tone('sine', f, f * 0.78, 0.34, 0.03 * vol, pan, 2.2, 0.05);
        this.tone('triangle', f * 2, f * 1.5, 0.2, 0.008 * vol, pan, 2.2, 0.05);
      }, i * 430 + Math.random() * 60);
    }
  }
  /** Шаг по воде. */
  splash(vol = 1): void {
    if (!this.ctx) return;
    this.burst(this.white, 'bandpass', 900 + Math.random() * 500, 320, 0.2, 0.09 * vol, 0, 0.6, 1.1);
    this.burst(this.brown, 'lowpass', 420, 160, 0.14, 0.2 * vol, 0, 0.3);
  }
  /** Скример: визг из расстроенных пил поверх провала баса. */
  scream(): void {
    if (!this.ctx) return;
    this.tone('sine', 90, 22, 1.4, 1.0, 0, 0.3);
    for (let i = 0; i < 7; i++) { const f = 620 + i * 133 + Math.random() * 60; this.tone('sawtooth', f, f * (1.25 + Math.random() * 0.3), 0.75, 0.05, i % 2 ? 0.7 : -0.7, 0.8, 0.008); }
    this.burst(this.white, 'bandpass', 2200, 5200, 0.6, 0.3, 0, 0.8, 0.9);
  }
  /** Тьма смыкается: всё глохнет. */
  death(): void {
    if (!this.ctx) return;
    this.tone('sine', 110, 20, 3.5, 0.9, 0, 0.2);
    this.lp.frequency.setTargetAtTime(90, this.now, 0.9);
  }
  /** Вернуть слух после смерти/финала. */
  restore(): void { if (this.ctx) this.lp.frequency.setTargetAtTime(18000, this.now, 0.4); }
  /** Финальный аккорд. */
  chord(kind: 'alone' | 'together' | 'beacon'): void {
    if (!this.ctx) return;
    const notes = kind === 'together' ? [110, 164.8, 220, 277.2, 329.6, 440] : kind === 'beacon' ? [110, 164.8, 246.9, 329.6] : [103.8, 155.6, 207.7, 246.9];
    const c = this.ctx, t = this.now;
    notes.forEach((f, i) => {
      const o = c.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = f;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.07, t + 3 + i * 0.4); g.gain.setTargetAtTime(0.0001, t + 14, 4);
      o.connect(g); g.connect(this.master); g.connect(this.gain(0.9, this.rev));
      o.start(t); o.stop(t + 40);
    });
  }
  suspend(on: boolean): void { if (!this.ctx) return; if (on) void this.ctx.suspend(); else void this.ctx.resume(); }
}
