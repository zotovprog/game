// Игра: сборка глубины из данных и главный цикл. Сюжетные сцены — в systems/story.ts.
import { Group, IcosahedronGeometry, Mesh, MeshStandardMaterial, Sprite, Vector3 } from 'three';
import { Sfx } from '../audio/sfx';
import { Input } from '../core/input';
import { clamp, damp, mulberry32, smooth } from '../core/rng';
import { loadTrace, Trace } from '../core/save';
import { LevelDef } from '../data/level';
import { Style } from '../data/styles';
import { TX } from '../data/texts';
import { T } from '../data/tuning';
import { addOil, flamePower, isDead, LampState, lightRadius, newLamp, stepLamp } from '../systems/lamp';
import { SafeLight, SpiritSystem, SpiritWorld } from '../systems/spirits';
import { Story } from '../systems/story';
import { Hud } from '../ui/hud';
import { buildCave, roughen } from '../view/cave';
import { addDarkLight, beginDarkLights, commitDarkLights, darkify } from '../view/darkness';
import { Dust } from '../view/dust';
import { Human } from '../view/human';
import { Lantern } from '../view/lantern';
import { LightPool } from '../view/lightpool';
import { Candle, Fire, Gate, makeFlask, Wisp } from '../view/props';
import { Stage } from '../view/stage';
import { Grid } from '../world/grid';

export type Mode = 'menu' | 'intro' | 'play' | 'cut' | 'dead' | 'end';
export interface Npc {
  id: 'efim' | 'vera'; h: Human; x: number; z: number; dir: number; speed01: number;
  state: 'wait' | 'follow' | 'left' | 'walkoff' | 'gone' | 'exit';
  candle: Candle | null; path: [number, number][];
}
interface Timer { t: number; fn: () => void }

export class Game {
  readonly grid: Grid;
  readonly hero: Human;
  readonly lantern: Lantern;
  readonly lamp: LampState = newLamp();
  readonly spirits: SpiritSystem;
  readonly pool: LightPool;
  readonly gate: Gate;
  readonly story: Story;
  readonly trace: Trace = loadTrace();
  readonly pos = { x: 0, z: 0 };
  readonly face = { x: 0, z: 1 };
  readonly flasks: { g: Group; x: number; z: number; taken: boolean; own: boolean }[] = [];
  readonly braziers: { f: Fire; x: number; z: number }[] = [];
  readonly wisps: { w: Wisp; id: string; x: number; z: number }[] = [];
  readonly npcs: Record<'efim' | 'vera', Npc>;
  readonly companions: Npc[] = [];
  readonly flags = new Set<string>();
  readonly lampWorld = new Vector3();
  readonly bowl = { x: 0, z: 0 };
  readonly lampOnGround = { x: 0, z: 0 };
  readonly deadAt = { x: 0, z: 0 };
  mode: Mode = 'menu';
  radius = 1.7;                 // сглаженный радиус круга света
  gateOpen = 0;                 // к чему стремятся Врата
  gust = 0;                     // 0..1 — порыв задувает лампу
  chroma = 0;
  frozen = false;               // сцена: герой не управляется
  autoWalk: { x: number; z: number } | null = null;
  beaconGlow: Sprite | null = null;
  private dust: Dust;
  private campfire: Fire;
  private crumbs: { x: number; z: number }[] = [];
  private timers: Timer[] = [];
  private stepAcc = 0;
  private speed01 = 0;
  private whisperT = 8;
  private barkT = 30;
  private rng = mulberry32(5);
  private paused = false;
  private stood = false;
  private pressure = 0.5;

  constructor(readonly stage: Stage, readonly hud: Hud, readonly input: Input, readonly sfx: Sfx, readonly style: Style, readonly def: LevelDef, opts: { skip: boolean }) {
    const scene = stage.scene;
    this.grid = new Grid(def.w, def.h, def.carves, def.seed);
    scene.add(buildCave(this.grid, style, def.seed).group);
    const snap = (p: [number, number], c = 0.7) => this.grid.snap(p[0], p[1], c);

    // каменные столбы
    const pg = roughen(new IcosahedronGeometry(1, 1), 0.5, 41);
    const pm = darkify(new MeshStandardMaterial({ color: style.rock, roughness: 0.95, flatShading: true }), true);
    for (const [x, z, r] of def.pillars) {
      const m = new Mesh(pg, pm);
      m.position.set(x, 0.7, z); m.scale.set(r * 1.3, 2.3 + (x % 3) * 0.3, r * 1.3); m.rotation.set(0.1, x * 1.7, -0.08);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
      this.grid.obstacles.push({ x, z, r });
    }

    // герой и лампа
    this.hero = new Human({ cloak: style.cloakPlayer, skin: style.skin, bodyShadow: false });
    [this.pos.x, this.pos.z] = snap(def.start.hero);
    this.hero.setPose('lie', true);
    this.hero.root.rotation.y = 2.4;
    scene.add(this.hero.root);
    this.lantern = new Lantern(style, stage.mobile ? 512 : 1024);
    [this.lampOnGround.x, this.lampOnGround.z] = snap(def.start.lamp);
    this.lantern.group.position.set(this.lampOnGround.x, 0.02, this.lampOnGround.z);
    scene.add(this.lantern.group);

    // тот, кто нёс её до тебя
    const dead = new Human({ cloak: style.cloakDead, skin: 0x6c6a66, hunch: 0.55 });
    [this.deadAt.x, this.deadAt.z] = snap(def.start.dead, 0.4);
    dead.root.position.set(this.deadAt.x, 0, this.deadAt.z);
    dead.root.rotation.y = Math.atan2(this.lampOnGround.x - this.deadAt.x, this.lampOnGround.z - this.deadAt.z);
    dead.setPose('sit', true); dead.update(0.016, 0, 0);
    scene.add(dead.root);

    for (const p of def.flasks) this.addFlask(...snap(p, 0.5), false);
    def.braziers.forEach((p, i) => {
      const [x, z] = snap(p, 0.9);
      const f = new Fire(style, 'brazier', i + 11);
      f.group.position.set(x, 0, z);
      scene.add(f.group);
      this.grid.obstacles.push({ x, z, r: 0.45 });
      this.braziers.push({ f, x, z });
    });
    def.wisps.forEach((wd, i) => {
      const [x, z] = snap(wd.at, 0.5);
      const w = new Wisp(style, i + 1);
      w.group.position.set(x, 1.15, z);
      scene.add(w.group);
      this.wisps.push({ w, id: wd.id, x, z });
    });

    // люди
    const mkNpc = (id: 'efim' | 'vera', at: [number, number], h: Human, path: [number, number][]): Npc => {
      const [x, z] = snap(at);
      h.root.position.set(x, 0, z);
      scene.add(h.root);
      return { id, h, x, z, dir: 0, speed01: 0, state: 'wait', candle: null, path };
    };
    const efim = mkNpc('efim', def.efim.at, new Human({ cloak: style.cloakOld, skin: style.skin, hood: false, hair: 0x8f8a80, hunch: 0.22, height: 1.68 }), []);
    efim.h.setPose('sit', true);
    this.campfire = new Fire(style, 'campfire', 3);
    const [cx, cz] = snap(def.efim.fire, 0.9);
    this.campfire.group.position.set(cx, 0, cz);
    scene.add(this.campfire.group);
    this.grid.obstacles.push({ x: cx, z: cz, r: 0.5 });
    efim.dir = Math.atan2(cx - efim.x, cz - efim.z);
    const vera = mkNpc('vera', def.vera.at, new Human({ cloak: style.cloakWoman, skin: style.skin, height: 1.62 }), def.vera.path);
    const vw = this.wisps.find((w) => w.id === def.vera.wisp);
    if (vw) vera.dir = Math.atan2(vw.x - vera.x, vw.z - vera.z);
    this.npcs = { efim, vera };

    // Врата и чаша
    this.gate = new Gate(style);
    this.gate.group.position.set(def.gate.at[0], 0, def.gate.at[1]);
    this.gate.group.rotation.y = Math.PI / 4;
    [this.bowl.x, this.bowl.z] = snap(def.gate.bowl, 1);
    this.gate.bowl.position.set(this.bowl.x, 0, this.bowl.z);
    scene.add(this.gate.group, this.gate.bowl);
    this.grid.obstacles.push({ x: this.bowl.x, z: this.bowl.z, r: 0.5 });

    this.spirits = new SpiritSystem(scene, style, this.grid);
    this.pool = new LightPool(scene, 3);
    this.dust = new Dust(style.lamp, stage.mobile ? 140 : 260);
    scene.add(this.dust.points);
    this.story = new Story(this);
    this.story.applyTrace();

    stage.target.set(this.pos.x, 0, this.pos.z);
    stage.fade = 1;
    if (opts.skip) this.story.skipIntro(); else this.story.menu();
    hud.onPause = () => this.pause(!this.paused);
  }

  addFlask(x: number, z: number, own: boolean): void {
    const g = makeFlask(this.style);
    g.position.set(x, 0, z);
    this.stage.scene.add(g);
    this.flasks.push({ g, x, z, taken: false, own });
  }

  after(sec: number, fn: () => void): void { this.timers.push({ t: sec, fn }); }
  dist(x: number, z: number): number { return Math.hypot(this.pos.x - x, this.pos.z - z); }
  get ember(): boolean { return this.lamp.held && this.lamp.oil <= 0; }

  pause(on: boolean): void {
    if (this.mode !== 'play' && on) return;
    this.paused = on;
    this.sfx.suspend(on);
    this.hud.screen(on ? { title: TX.paused, sub: '', button: TX.resume, small: this.hud.controlsHint(), onButton: () => this.pause(false) } : null);
  }

  /** Взять лампу с пола. */
  takeLamp(): void {
    this.lamp.held = true;
    this.hero.attach(this.lantern.group);
    this.lantern.group.position.set(0, -0.3, 0);
    this.lantern.group.rotation.set(0, 0, 0);
    this.hud.showHud(true);
    this.sfx.relight();
  }

  private move(dt: number): void {
    const inp = this.input, S = this.stage;
    let dx = 0, dz = 0;
    if (this.autoWalk) {
      const ax = this.autoWalk.x - this.pos.x, az = this.autoWalk.z - this.pos.z, l = Math.hypot(ax, az);
      if (l > 0.3) { dx = ax / l; dz = az / l; }
    } else if (!this.frozen && !this.hud.busy && this.mode === 'play') {
      dx = S.right.x * inp.moveX + S.up.x * inp.moveY;
      dz = S.right.z * inp.moveX + S.up.z * inp.moveY;
      if (!this.stood && (dx || dz || inp.hit('Space'))) { this.stood = true; this.hero.setPose('stand'); this.story.onStand(); }
      if (this.hero.lying) dx = dz = 0;
    }
    const l = Math.hypot(dx, dz);
    const sp = T.player.speed * (this.autoWalk ? 0.6 : 1) * (this.lamp.held ? 1 : 0.6);
    if (l > 0.01) {
      this.pos.x += dx * sp * dt; this.pos.z += dz * sp * dt;
      this.grid.collide(this.pos, T.player.radius);
      this.face.x = damp(this.face.x, dx / l, 12, dt); this.face.z = damp(this.face.z, dz / l, 12, dt);
      this.stepAcc += l * sp * dt;
      if (this.stepAcc > 0.78) { this.stepAcc = 0; this.sfx.step(0.6 + 0.4 * l); }
      const last = this.crumbs[this.crumbs.length - 1];
      if (!last || Math.hypot(last.x - this.pos.x, last.z - this.pos.z) > 0.5) { this.crumbs.push({ x: this.pos.x, z: this.pos.z }); if (this.crumbs.length > 300) this.crumbs.shift(); }
    }
    this.speed01 = l;
    this.hero.root.position.x = this.pos.x; this.hero.root.position.z = this.pos.z;
    if (this.stood) this.hero.root.rotation.y = Math.atan2(this.face.x, this.face.z);
  }

  /** Спутники идут по следу героя; Вера, если её бросили, уходит на огонёк. */
  private moveNpcs(dt: number, t: number): void {
    const walkTo = (n: Npc, tx: number, tz: number, max: number): number => {
      const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
      if (d > 0.35) {
        const v = Math.min(max, d * 2.2);
        n.x += (dx / d) * v * dt; n.z += (dz / d) * v * dt;
        const p = { x: n.x, z: n.z }; this.grid.collide(p, 0.3); n.x = p.x; n.z = p.z;
        n.dir = Math.atan2(dx, dz); n.speed01 = v / T.player.speed;
      } else n.speed01 = 0;
      return d;
    };
    this.companions.forEach((n, i) => {
      if (n.state === 'exit') { walkTo(n, this.gate.group.position.x + 1.2, this.gate.group.position.z + 1.2, T.player.speed * 0.7); return; }
      let need = 1.5 * (i + 1), tx = this.pos.x, tz = this.pos.z, px = this.pos.x, pz = this.pos.z;
      for (let k = this.crumbs.length - 1; k >= 0 && need > 0; k--) {
        const c = this.crumbs[k];
        need -= Math.hypot(c.x - px, c.z - pz); px = c.x; pz = c.z; tx = c.x; tz = c.z;
      }
      if (this.dist(n.x, n.z) > 1.3 * (i + 1)) walkTo(n, tx, tz, T.player.speed * 1.1); else n.speed01 = 0;
    });
    const v = this.npcs.vera;
    if (v.state === 'walkoff') {
      const [tx, tz] = v.path[0] ?? [v.x, v.z];
      if (walkTo(v, tx, tz, T.player.speed * 0.8) < 0.6) { v.path.shift(); if (!v.path.length) this.story.veraTaken(); }
    }
    for (const n of [this.npcs.efim, this.npcs.vera]) {
      if (n.state === 'gone') continue;
      n.h.root.position.x = n.x; n.h.root.position.z = n.z;
      n.h.root.rotation.y = n.dir;
      n.h.update(dt, t + (n.id === 'efim' ? 3 : 7), n.speed01);
      if (n.candle) {
        const wp = n.candle.group.getWorldPosition(_v);
        n.candle.update(t, wp.x, wp.y + 0.1, wp.z);
      }
    }
  }

  private interact(): void {
    const hit = this.input.hit('Space', 'Enter', 'KeyF');
    let prompt: string | null = null, act: (() => void) | null = null;
    const near = (x: number, z: number, r: number) => this.dist(x, z) < r;
    if (!this.lamp.held) {
      if (near(this.lampOnGround.x, this.lampOnGround.z, 1.3)) { prompt = TX.promptLamp; act = () => this.story.pickLamp(); }
    } else {
      const n = this.npcs;
      if (!this.flags.has('dead') && near(this.deadAt.x, this.deadAt.z, 1.5)) { prompt = TX.promptDead; act = () => this.story.examineDead(); }
      for (const b of this.braziers) if (!b.f.lit && near(b.x, b.z, 1.7)) { prompt = TX.promptBrazier; act = () => this.story.lightBrazier(b.f); }
      if (n.efim.state === 'wait' && near(n.efim.x, n.efim.z, 2.1)) { prompt = TX.promptTalk; act = () => this.story.talk('efim'); }
      if (n.vera.state === 'wait' && near(n.vera.x, n.vera.z, 2.1)) { prompt = TX.promptTalk; act = () => this.story.talk('vera'); }
      if (near(this.bowl.x, this.bowl.z, 1.9)) { prompt = TX.promptBowl; act = () => this.story.bowl(); }
    }
    this.hud.prompt(prompt);
    if (hit && act) act();
    // масло подбирается само: в панике не до кнопок
    for (const f of this.flasks) {
      if (f.taken || !this.lamp.held || !near(f.x, f.z, 0.95)) continue;
      f.taken = true; f.g.visible = false;
      addOil(this.lamp, f.own ? T.lamp.ownLamp : T.lamp.flask);
      this.sfx.pickup();
      this.hud.hint(f.own ? TX.ownLamp : TX.flask, 2.5);
    }
  }

  private die(): void {
    if (this.mode !== 'play') return;
    this.mode = 'dead';
    this.story.death();
  }

  update(dt: number, t: number): void {
    const S = this.stage, lamp = this.lamp, hud = this.hud;
    this.input.update();
    if (this.input.hit('Escape', 'KeyP') && (this.mode === 'play' || this.paused)) this.pause(!this.paused);
    if (this.paused) { this.input.endFrame(); S.render(0, _focus.set(this.pos.x, 0, this.pos.z), this.lampWorld); return; }
    hud.update(dt);
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; tm.t -= dt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); } }

    const talking = hud.busy;
    const live = this.mode === 'play' && !talking && !this.frozen;
    this.move(dt);
    this.moveNpcs(dt, t);
    this.hero.update(dt, t, this.speed01);

    // фитиль и масло
    if (lamp.held && this.mode === 'play' && !talking) {
      lamp.wick = clamp(lamp.wick + this.input.wickHold * T.lamp.wickRate * dt + this.input.wickDelta, T.lamp.wickMin, T.lamp.wickMax);
    }
    this.input.wickDelta = 0;
    lamp.snuff = this.gust;
    const wasOil = lamp.oil;
    if (live) stepLamp(lamp, dt, this.companions.length);
    if (lamp.held && wasOil > T.lamp.lowOil && lamp.oil <= T.lamp.lowOil) hud.hint(TX.oilLow, 4);
    if (lamp.held && wasOil > 0 && lamp.oil <= 0) { hud.hint(TX.ember, 4); this.sfx.snuff(); }
    const rTarget = lamp.held ? lightRadius(lamp) : 2.3;
    this.radius = damp(this.radius, rTarget, rTarget < this.radius ? 3 : 6, dt);
    const power = lamp.held ? flamePower(lamp) : 0.16;
    this.lantern.update(t, power, this.radius, this.style.lampGain);
    this.lantern.group.getWorldPosition(this.lampWorld);

    if (this.mode === 'play' && !talking && !this.frozen) { this.interact(); this.story.zones(); this.story.wisps(); } else hud.prompt(null);

    // огни мира
    beginDarkLights(); this.pool.begin();
    addDarkLight(this.lampWorld.x, this.lampWorld.y, this.lampWorld.z, this.radius * (0.965 + 0.035 * this.lantern.flicker));
    const safe: SafeLight[] = [];
    let fireNear = 0;
    this.campfire.update(t, dt);
    for (const b of this.braziers) {
      b.f.update(t, dt);
      if (b.f.k > 0.02) {
        const r = T.fire.radius * b.f.k;
        addDarkLight(b.x, 1, b.z, r); this.pool.add(b.f.emitter); safe.push({ x: b.x, z: b.z, r });
        fireNear = Math.max(fireNear, 1 - smooth(1.5, 9, this.dist(b.x, b.z)));
      }
    }
    for (const w of this.wisps) {
      w.w.update(t, dt);
      if (w.w.k > 0.02) { addDarkLight(w.x, 1, w.z, T.wisp.glow * w.w.k); this.pool.add(w.w.emitter); }
    }
    for (const n of [this.npcs.efim, this.npcs.vera]) {
      if (n.candle && n.state !== 'gone') { addDarkLight(n.candle.emitter.x, 1, n.candle.emitter.z, T.candle.radius); this.pool.add(n.candle.emitter); }
    }
    const gp = this.gate.group.position;
    this.gate.update(t, dt, this.gateOpen);
    addDarkLight(gp.x + 1.2, 1, gp.z + 1.2, 4.2 + this.gate.open * 15);
    this.pool.add(this.gate.emitter);
    if (this.gate.open > 0.2) safe.push({ x: gp.x + 1.5, z: gp.z + 1.5, r: 2.6 + this.gate.open * 15 });
    if (this.beaconGlow) {
      addDarkLight(this.bowl.x, 1, this.bowl.z, 5.5);
      this.pool.add({ x: this.bowl.x, y: 1.4, z: this.bowl.z, color: this.style.lamp, intensity: 26 * (0.9 + 0.1 * this.lantern.flicker), distance: 9 });
      safe.push({ x: this.bowl.x, z: this.bowl.z, r: 5.5 });
    }
    commitDarkLights(this.pos.x, this.pos.z);
    this.pool.commit(this.pos.x, this.pos.z);

    // духи
    const w: SpiritWorld = {
      px: this.pos.x, pz: this.pos.z, fx: this.face.x, fz: this.face.z, radius: this.radius, wick: lamp.wick,
      ember: this.ember || this.gust > 0.5, active: lamp.held && this.mode === 'play' && !talking && this.dist(gp.x, gp.z) > 9, safe,
    };
    const touched = this.spirits.update(dt, t, w);
    if (touched && live && this.gust < 0.1) {
      if (this.ember) this.die();
      else {
        lamp.oil = Math.max(0, lamp.oil - T.lamp.touchDrain * (touched.kind === 'shade' ? 1 : 1.6));
        this.sfx.touch(); S.shake = 0.7; this.chroma = 1;
        this.spirits.dismiss(touched);
        hud.whisper(TX.whispers[Math.floor(this.rng() * TX.whispers.length)]);
      }
    }
    if (live && isDead(lamp)) this.die();

    // шёпот из темноты и реплики спутников
    if (live && lamp.held) {
      this.whisperT -= dt * (0.4 + this.spirits.nearness + this.pressure);
      if (this.whisperT <= 0 && this.spirits.list.length) {
        this.whisperT = 9 + this.rng() * 9;
        const side = Math.cos(this.spirits.nearestAngle) * S.right.x + Math.sin(this.spirits.nearestAngle) * S.right.z;
        hud.whisper(TX.whispers[Math.floor(this.rng() * TX.whispers.length)], side > 0 ? 0.9 : 0.1);
        this.sfx.whisper(clamp(side, -1, 1));
      }
      this.barkT -= dt;
      if (this.barkT <= 0 && this.companions.length) {
        this.barkT = 28 + this.rng() * 20;
        const n = this.companions[Math.floor(this.rng() * this.companions.length)];
        const barks = TX[n.id].barks;
        hud.hint(`${TX[n.id].realName}: «${barks[Math.floor(this.rng() * barks.length)]}»`, 5);
        this.sfx.voice(n.id);
      }
    }

    // давление: чем меньше круг, тем теснее кадр и громче тьма
    let pr = lamp.held ? (1 - smooth(1.6, 5.4, this.radius)) * 0.5 + this.spirits.nearness * 0.12 : 0.42;
    if (this.ember) pr = 0.62 + 0.38 * clamp(lamp.ember / T.lamp.emberTime, 0, 1);
    if (this.mode === 'dead') pr = 1;
    if (this.mode === 'end') pr = 0;
    this.pressure = damp(this.pressure, pr, this.mode === 'dead' ? 1.2 : 2.5, dt);
    S.pressure = clamp(this.pressure + this.sfx.beat * 0.045, 0, 1);
    S.viewHTarget = this.mode === 'end' ? 17 : 14.5 - 3.4 * this.pressure;
    this.chroma = Math.max(0, this.chroma - dt * 1.6);
    S.chroma = this.chroma * 0.02 + (this.ember ? 0.003 : 0);
    const side = Math.cos(this.spirits.nearestAngle) * S.right.x + Math.sin(this.spirits.nearestAngle) * S.right.z;
    this.sfx.update(dt, {
      pressure: this.pressure, power, near: this.spirits.nearness, pan: side, fire: fireNear,
      dawn: Math.max(this.gate.open, 1 - smooth(4, 26, this.dist(gp.x, gp.z))) * (this.mode === 'menu' ? 0 : 1),
      quiet: this.mode === 'menu' || this.mode === 'dead',
    });

    this.dust.update(t, this.lampWorld, this.radius, power, S.mobile ? 2 : 2.4 * S.renderer.getPixelRatio());
    hud.setOil(lamp.oil, lamp.wick, lamp.oil <= T.lamp.lowOil);
    window.__metrics = { mode: this.mode, oil: Math.round(lamp.oil), wick: +lamp.wick.toFixed(2), x: +this.pos.x.toFixed(1), z: +this.pos.z.toFixed(1), companions: this.companions.length, flags: [...this.flags] };
    this.input.endFrame();
    S.render(dt, _focus.set(this.pos.x, 0, this.pos.z), this.lampWorld);
  }
}

const _v = new Vector3(), _focus = new Vector3();
