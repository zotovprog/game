// Игра: сборка глубины из данных и главный цикл. Сюжетные сцены и выборы — в systems/story.ts.
import { Group, Mesh, MeshBasicMaterial, SphereGeometry, Sprite, Vector3 } from 'three';
import { Sfx } from '../audio/sfx';
import { Input } from '../core/input';
import { clamp, damp, lerp, mulberry32, smooth } from '../core/rng';
import { loadTrace, Trace } from '../core/save';
import { LevelDef } from '../data/level';
import { Style } from '../data/styles';
import { TX } from '../data/texts';
import { T } from '../data/tuning';
import { Darkness, DarkWorld, SafeLight } from '../systems/dark';
import { addOil, flamePower, isDead, LampState, lightRadius, newLamp, stepLamp } from '../systems/lamp';
import { Story } from '../systems/story';
import { Hud } from '../ui/hud';
import { buildCave } from '../view/cave';
import { addDarkLight, beginDarkLights, commitDarkLights, darkU } from '../view/darkness';
import { Dust } from '../view/dust';
import { makeGlow } from '../view/glow';
import { Human } from '../view/human';
import { Lantern } from '../view/lantern';
import { LightPool } from '../view/lightpool';
import { Candle, Fire, Gate, makeFlask, Wisp } from '../view/props';
import { Spirit } from '../view/spirit';
import { Stage } from '../view/stage';
import { Grid } from '../world/grid';

export type Mode = 'menu' | 'intro' | 'play' | 'dead' | 'end';
export type NpcId = 'efim' | 'vera' | 'boy';
export interface Npc {
  id: NpcId; h: Human; x: number; z: number; dir: number; speed01: number;
  state: 'wait' | 'follow' | 'left' | 'walkoff' | 'gone' | 'exit' | 'stay';
  candle: Candle | null; path: [number, number][]; load: number;
}
export interface Prompt { text: string; d: number; x: number; z: number; act: () => void }
interface Timer { t: number; fn: () => void }

export class Game {
  readonly grid: Grid;
  readonly hero: Human;
  readonly lantern: Lantern;
  readonly lamp: LampState = newLamp();
  readonly dark: Darkness;
  readonly pool: LightPool;
  readonly gate: Gate;
  readonly story: Story;
  readonly trace: Trace = loadTrace();
  readonly pos = { x: 0, z: 0 };
  readonly face = { x: 0, z: 1 };
  readonly flasks: { g: Group; x: number; z: number; taken: boolean; own: boolean }[] = [];
  readonly braziers: { f: Fire; x: number; z: number }[] = [];
  readonly wisps: { w: Wisp; id: string; x: number; z: number }[] = [];
  readonly npcs: Record<NpcId, Npc>;
  readonly companions: Npc[] = [];
  readonly flags = new Set<string>();
  readonly lampWorld = new Vector3();
  readonly bowl = { x: 0, z: 0 };
  readonly lampOnGround = { x: 0, z: 0 };
  readonly deadAt = { x: 0, z: 0 };
  // семья у костра
  readonly family: { fire: Fire; x: number; z: number; father: Human; mother: Human; state: 'wait' | 'fire' | 'boy' | 'left' };
  // девочка, которую можно только нести
  readonly mila: { h: Human; x: number; z: number; state: 'wait' | 'carried' | 'down' | 'vera' | 'left' | 'lost'; alone: number; ember: Sprite };
  // заплутавшая тень
  readonly shade: { v: Spirit; x: number; z: number; state: 'wait' | 'follow' | 'left' | 'gone'; isTrue: boolean; hurt: number; warned: boolean };
  readonly toy: { g: Group; x: number; z: number; taken: boolean };
  mode: Mode = 'menu';
  radius = 2.3;                 // сглаженный радиус круга света
  gateOpen = 0;                 // к чему стремятся Врата
  gust = 0;                     // 0..1 — порыв задувает лампу
  chroma = 0;
  frozen = false;               // сцена: герой не управляется
  autoWalk: { x: number; z: number } | null = null;
  /** К чему повёрнут герой, пока им нельзя управлять (разговор, сцена). */
  lookAt: { x: number; z: number } | null = null;
  private yaw = 2.4;
  beacon: { glow: Sprite; color: number } | null = null;
  private dust: Dust;
  private campfire: Fire;
  private crumbs: { x: number; z: number }[] = [];
  private timers: Timer[] = [];
  private stepAcc = 0;
  private speed01 = 0;
  private whisperT = 8;
  private barkT = 26;
  private rng = mulberry32((Date.now() & 0xffff) + 5);
  private paused = false;
  private stood = false;
  private pressure = 0.5;
  private still = 0;            // сколько секунд герой стоит
  private stillHinted = false;
  private drift = { x: 0, z: 0, dx: 0, dz: 0 };
  private flow = [0, 0];

  constructor(readonly stage: Stage, readonly hud: Hud, readonly input: Input, readonly sfx: Sfx, readonly style: Style, readonly def: LevelDef, opts: { skip: boolean }) {
    const scene = stage.scene;
    this.grid = new Grid(def.w, def.h, def.carves, def.seed);
    scene.add(buildCave(this.grid, style, def).group);
    this.grid.buildFlow(def.gate.bowl[0], def.gate.bowl[1]);
    const snap = (p: [number, number], c = 0.7) => this.grid.snap(p[0], p[1], c);

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
    const mkNpc = (id: NpcId, at: [number, number], h: Human, path: [number, number][], load: number): Npc => {
      const [x, z] = snap(at);
      h.root.position.set(x, 0, z);
      scene.add(h.root);
      return { id, h, x, z, dir: 0, speed01: 0, state: 'wait', candle: null, path, load };
    };
    const camp = (at: [number, number], seed: number): [Fire, number, number] => {
      const f = new Fire(style, 'campfire', seed);
      const [x, z] = snap(at, 0.9);
      f.group.position.set(x, 0, z);
      scene.add(f.group);
      this.grid.obstacles.push({ x, z, r: 0.5 });
      return [f, x, z];
    };
    const efim = mkNpc('efim', def.efim.at, new Human({ cloak: style.cloakOld, skin: style.skin, hood: false, hair: 0x8f8a80, hunch: 0.22, height: 1.68 }), [], 1);
    efim.h.setPose('sit', true);
    const [ef, ecx, ecz] = camp(def.efim.fire, 3);
    this.campfire = ef;
    efim.dir = Math.atan2(ecx - efim.x, ecz - efim.z);
    const vera = mkNpc('vera', def.vera.at, new Human({ cloak: style.cloakWoman, skin: style.skin, height: 1.62 }), def.vera.path, 1);
    const vw = this.wisps.find((w) => w.id === def.vera.wisp);
    if (vw) vera.dir = Math.atan2(vw.x - vera.x, vw.z - vera.z);

    // семья: отец, мать с младенцем, мальчик
    const [ff, fx, fz] = camp(def.family.fire, 5);
    const sit = (h: Human, dx: number, dz: number): Human => {
      const [x, z] = this.grid.snap(fx + dx, fz + dz, 0.4);
      h.root.position.set(x, 0, z);
      h.root.rotation.y = Math.atan2(fx - x, fz - z);
      h.setPose('sit', true); h.update(0.016, 0, 0);
      scene.add(h.root);
      return h;
    };
    const father = sit(new Human({ cloak: 0x2e3238, skin: style.skin, hood: false, hair: 0x2a2420, hunch: 0.3 }), -1.25, -0.5);
    const mother = sit(new Human({ cloak: 0x3d3234, skin: style.skin, height: 1.6, hunch: 0.2 }), 0.9, -1.0);
    const bundle = new Mesh(new SphereGeometry(0.14, 7, 5), new MeshBasicMaterial({ color: 0x000000 }));
    bundle.scale.set(1, 0.8, 1.5); bundle.position.set(0, 1.0, 0.24);
    mother.body.add(bundle);
    const boy = mkNpc('boy', [fx + 0.5, fz + 1.25], new Human({ cloak: 0x3a3a34, skin: style.skin, hood: false, hair: 0x3a2e24, height: 1.18, child: true }), [], T.lamp.boyLoad);
    boy.h.setPose('sit', true);
    boy.dir = Math.atan2(fx - boy.x, fz - boy.z);
    this.family = { fire: ff, x: fx, z: fz, father, mother, state: 'wait' };
    this.npcs = { efim, vera, boy };

    // Мила у тлеющего уголька
    {
      const [x, z] = snap(def.mila.at, 0.8);
      const h = new Human({ cloak: 0x32403a, skin: style.skin, height: 1.08, child: true });
      h.setPose('sit', true);
      h.root.position.set(x, 0, z);
      scene.add(h.root);
      const ember = makeGlow(style.fire, 0.5, 0.8);
      ember.position.set(x + 0.45, 0.08, z + 0.3);
      scene.add(ember);
      this.mila = { h, x, z, state: 'wait', alone: 0, ember };
    }
    // заплутавшая тень: правда она или ложь — каждый раз заново
    {
      const [x, z] = snap(def.shade.at, 0.8);
      const v = new Spirit(style, 0.37, 0.52, 0.55);
      v.group.position.set(x, 0, z);
      v.alpha = 0;
      scene.add(v.group);
      this.shade = { v, x, z, state: 'wait', isTrue: Math.random() < 0.55, hurt: 0, warned: false };
    }
    // её ботинок в завале
    {
      const [x, z] = snap(def.toy.at, 0.4);
      const g = new Group();
      const boot = new Mesh(new SphereGeometry(0.09, 7, 5), new MeshBasicMaterial({ color: 0x5a2f24 }));
      boot.scale.set(0.8, 0.7, 1.5); boot.position.y = 0.07;
      const glow = makeGlow(style.fire, 0.45, 0.35);
      glow.position.y = 0.1;
      g.add(boot, glow);
      g.position.set(x, 0, z);
      scene.add(g);
      this.toy = { g, x, z, taken: false };
    }

    // Врата и чаша
    this.gate = new Gate(style);
    this.gate.group.position.set(def.gate.at[0], 0, def.gate.at[1]);
    this.gate.group.rotation.y = Math.PI / 4;
    [this.bowl.x, this.bowl.z] = snap(def.gate.bowl, 1);
    this.gate.bowl.position.set(this.bowl.x, 0, this.bowl.z);
    scene.add(this.gate.group, this.gate.bowl);
    this.grid.obstacles.push({ x: this.bowl.x, z: this.bowl.z, r: 0.5 });

    this.dark = new Darkness(scene, style, this.grid);
    this.dark.onSound = (s, pan, vol) => this.sfx.dark(s, pan, vol);
    this.pool = new LightPool(scene, 3);
    this.dust = new Dust(style.lamp, stage.mobile ? 150 : 280);
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
  /** Свет в чаше Врат: лампа прежнего носителя или огарок того, кто остался. */
  lightBowl(color: number): void {
    if (this.beacon) return;
    const glow = makeGlow(color, 2.4, 0.9);
    glow.position.set(this.bowl.x, 1.25, this.bowl.z);
    this.stage.scene.add(glow);
    this.beacon = { glow, color };
  }

  after(sec: number, fn: () => void): void { this.timers.push({ t: sec, fn }); }
  dist(x: number, z: number): number { return Math.hypot(this.pos.x - x, this.pos.z - z); }
  get ember(): boolean { return this.lamp.held && this.lamp.oil <= 0; }
  get carrying(): boolean { return this.mila.state === 'carried'; }
  get stoodUp(): boolean { return this.stood; }
  setStood(): void { this.stood = true; }
  /** Мир глазами тьмы — нужен и сюжету (для появления «вернувшихся»). */
  world(active = true): DarkWorld {
    return { px: this.pos.x, pz: this.pos.z, fx: this.face.x, fz: this.face.z, rx: this.stage.right.x, rz: this.stage.right.z, radius: this.radius, wick: this.lamp.wick, ember: false, active, safe: [] };
  }

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
      if (!this.stood && (dx || dz || inp.hit('Space'))) { this.stood = true; this.hero.setPose('stand'); }
      if (this.hero.lying) dx = dz = 0;
    }
    const l = Math.hypot(dx, dz);
    const wading = this.grid.kindAt(this.pos.x, this.pos.z) === 'water' && this.grid.wallDist(this.pos.x, this.pos.z) > 1.1;
    const sp = T.player.speed * (this.autoWalk ? 0.6 : 1) * (this.lamp.held ? 1 : 0.6) * (this.carrying ? T.player.carry : 1) * (wading ? T.player.wade : 1);
    if (l > 0.01) {
      this.pos.x += dx * sp * dt; this.pos.z += dz * sp * dt;
      this.grid.collide(this.pos, T.player.radius);
      this.face.x = damp(this.face.x, dx / l, 12, dt); this.face.z = damp(this.face.z, dz / l, 12, dt);
      this.stepAcc += l * sp * dt;
      if (this.stepAcc > 0.78) { this.stepAcc = 0; if (wading) this.sfx.splash(0.6 + 0.4 * l); else this.sfx.step(0.6 + 0.4 * l); }
      const last = this.crumbs[this.crumbs.length - 1];
      if (!last || Math.hypot(last.x - this.pos.x, last.z - this.pos.z) > 0.5) { this.crumbs.push({ x: this.pos.x, z: this.pos.z }); if (this.crumbs.length > 300) this.crumbs.shift(); }
      this.still = 0;
    } else this.still += dt;
    this.speed01 = l;
    this.hero.root.position.x = this.pos.x; this.hero.root.position.z = this.pos.z;
    // пока героем нельзя управлять, он повёрнут к собеседнику; отпустило — разворачивается обратно:
    // по этому развороту видно, что снова можно идти
    const held = (this.hud.busy || this.frozen) && !this.autoWalk;
    if (!held) this.lookAt = null;
    const want = this.lookAt ? Math.atan2(this.lookAt.x - this.pos.x, this.lookAt.z - this.pos.z) : Math.atan2(this.face.x, this.face.z);
    const turn = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
    this.yaw += turn * (1 - Math.exp(-(this.lookAt ? 6 : l > 0.01 ? 14 : 8) * dt));
    if (this.stood) this.hero.root.rotation.y = this.yaw;
  }

  /** Точка на следе героя в need метрах позади. */
  private trail(need: number): [number, number] {
    let tx = this.pos.x, tz = this.pos.z, px = tx, pz = tz;
    for (let k = this.crumbs.length - 1; k >= 0 && need > 0; k--) {
      const c = this.crumbs[k];
      need -= Math.hypot(c.x - px, c.z - pz); px = c.x; pz = c.z; tx = c.x; tz = c.z;
    }
    return [tx, tz];
  }

  /** Спутники идут по следу героя; брошенная Вера уходит на огонёк; тень держится у края света. */
  private moveNpcs(dt: number, t: number): void {
    const walkTo = (n: { x: number; z: number; dir: number; speed01: number }, tx: number, tz: number, max: number): number => {
      const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
      if (d > 0.35) {
        const v = Math.min(max, d * 2.2);
        n.x += (dx / d) * v * dt; n.z += (dz / d) * v * dt;
        const p = { x: n.x, z: n.z }; this.grid.collide(p, 0.3); n.x = p.x; n.z = p.z;
        n.dir = Math.atan2(dx, dz); n.speed01 = v / T.player.speed;
      } else n.speed01 = 0;
      return d;
    };
    const gp = this.gate.group.position;
    this.companions.forEach((n, i) => {
      if (n.state === 'exit') { walkTo(n, gp.x + 1.2, gp.z + 1.2, T.player.speed * 0.7); return; }
      if (n.state === 'stay') { walkTo(n, this.bowl.x + 1.0, this.bowl.z + 0.4, T.player.speed * 0.6); return; }
      const [tx, tz] = this.trail(1.5 * (i + 1));
      if (this.dist(n.x, n.z) > 1.3 * (i + 1)) walkTo(n, tx, tz, T.player.speed * 1.1); else n.speed01 = 0;
    });
    const v = this.npcs.vera;
    if (v.state === 'walkoff') {
      const [tx, tz] = v.path[0] ?? [v.x, v.z];
      if (walkTo(v, tx, tz, T.player.speed * 0.8) < 0.6) { v.path.shift(); if (!v.path.length) this.story.veraTaken(); }
    }
    for (const n of Object.values(this.npcs)) {
      if (n.state === 'gone') continue;
      n.h.root.position.x = n.x; n.h.root.position.z = n.z;
      n.h.root.rotation.y = n.dir;
      n.h.update(dt, t + n.x, n.speed01);
      if (n.candle) {
        const wp = n.candle.group.getWorldPosition(_v);
        n.candle.update(t, wp.x, wp.y + 0.1, wp.z);
      }
    }
    this.mila.h.update(dt, t + 5, 0);
    // тень
    const sh = this.shade;
    if (sh.state === 'follow') {
      const [tx, tz] = this.trail(Math.max(2.4, this.radius * 0.9));
      const dx = tx - sh.x, dz = tz - sh.z, d = Math.hypot(dx, dz);
      if (d > 0.3) { const st = Math.min(d, 4.2 * dt); sh.x += (dx / d) * st; sh.z += (dz / d) * st; }
    }
    if (sh.state !== 'gone') {
      const d = this.dist(sh.x, sh.z);
      sh.v.alpha = damp(sh.v.alpha, sh.state === 'left' ? 0.5 : d < this.radius + 6 ? 0.92 : 0, 2.5, dt);
      sh.v.face = 0.7; sh.v.agitation = clamp(sh.hurt / T.shade.warn, 0, 1);
      sh.v.burn = clamp((sh.hurt - T.shade.warn) / (T.shade.burn - T.shade.warn), 0, 0.85);
      sh.v.group.position.set(sh.x, 0, sh.z);
      sh.v.group.rotation.y = Math.atan2(this.pos.x - sh.x, this.pos.z - sh.z);
      sh.v.update(t);
    }
  }

  private interact(): void {
    const hit = this.input.hit('Space', 'Enter', 'KeyF');
    const list: Prompt[] = [];
    const near = (x: number, z: number, r: number, text: string, act: () => void) => { const d = this.dist(x, z); if (d < r) list.push({ text, d, x, z, act }); };
    if (!this.lamp.held) near(this.lampOnGround.x, this.lampOnGround.z, 1.3, TX.promptLamp, () => this.story.pickLamp());
    else {
      const n = this.npcs, s = this.story;
      if (!this.flags.has('dead')) near(this.deadAt.x, this.deadAt.z, 1.5, TX.promptDead, () => s.examineDead());
      for (const b of this.braziers) if (!b.f.lit) near(b.x, b.z, 1.7, TX.promptBrazier, () => s.lightBrazier(b.f));
      if (n.efim.state === 'wait') near(n.efim.x, n.efim.z, 2.1, TX.promptTalk, () => s.talkEfim());
      if (n.vera.state === 'wait') near(n.vera.x, n.vera.z, 2.1, TX.promptTalk, () => s.talkVera());
      if (this.family.state === 'wait') near(this.family.x, this.family.z, 2.6, TX.promptTalk, () => s.talkFamily());
      if (this.mila.state === 'wait') near(this.mila.x, this.mila.z, 1.9, TX.promptTalk, () => s.talkMila());
      if (this.mila.state === 'down') near(this.mila.x, this.mila.z, 1.6, TX.mila.promptUp, () => s.liftMila());
      if (this.shade.state === 'wait') near(this.shade.x, this.shade.z, 3.4, TX.promptTalk, () => s.talkShade());
      if (!this.toy.taken) near(this.toy.x, this.toy.z, 1.3, TX.promptToy, () => s.pickToy());
      near(this.bowl.x, this.bowl.z, 1.9, TX.bowl.prompt, () => s.bowl());
      if (this.carrying && !list.length) list.push({ text: TX.mila.promptDown, d: 9, x: this.pos.x + this.face.x, z: this.pos.z + this.face.z, act: () => s.dropMila() });
    }
    list.sort((p, q) => p.d - q.d);
    this.hud.prompt(list[0]?.text ?? null);
    if (hit && list[0]) { this.lookAt = { x: list[0].x, z: list[0].z }; list[0].act(); }
    // масло подбирается само: в панике не до кнопок
    for (const f of this.flasks) {
      if (f.taken || !this.lamp.held || this.dist(f.x, f.z) > 0.95) continue;
      f.taken = true; f.g.visible = false;
      addOil(this.lamp, f.own ? T.lamp.ownLamp : T.lamp.flask);
      this.sfx.pickup();
      this.hud.hint(f.own ? TX.ownLamp : TX.flask, 2.5);
    }
  }

  die(): void {
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
    if (lamp.held && this.mode === 'play' && !talking && !this.carrying) {
      if (this.input.wickSet !== null) lamp.wick = lerp(T.lamp.wickMin, T.lamp.wickMax, this.input.wickSet);
      lamp.wick = clamp(lamp.wick + this.input.wickHold * T.lamp.wickRate * dt + this.input.wickDelta, T.lamp.wickMin, T.lamp.wickMax);
    }
    this.input.wickDelta = 0; this.input.wickSet = null;
    lamp.snuff = this.gust;
    const wasOil = lamp.oil;
    let load = 0;
    for (const n of this.companions) if (n.state === 'follow') load += n.load;
    if (live) stepLamp(lamp, dt, load);
    if (lamp.held && wasOil > T.lamp.lowOil && lamp.oil <= T.lamp.lowOil) hud.hint(TX.oilLow, 4);
    if (lamp.held && wasOil > 0 && lamp.oil <= 0) { hud.hint(TX.ember, 4); this.sfx.snuff(); }
    const rTarget = lamp.held ? lightRadius(lamp) : 2.3;
    this.radius = damp(this.radius, rTarget, rTarget < this.radius ? 3 : 6, dt);
    const power = lamp.held ? flamePower(lamp) : 0.16;
    this.lantern.update(t, power, this.radius, this.style.lampGain);
    this.lantern.group.getWorldPosition(this.lampWorld);

    if (live) { this.interact(); this.story.zones(); this.story.wisps(); this.story.drama(dt); } else hud.prompt(null);

    // огни мира
    beginDarkLights(); this.pool.begin();
    darkU.uLamp.value.set(this.lampWorld.x, this.lampWorld.z);
    addDarkLight(this.lampWorld.x, this.lampWorld.y, this.lampWorld.z, this.radius * (0.965 + 0.035 * this.lantern.flicker));
    const safe: SafeLight[] = [];
    let fireNear = 0;
    const fire = (f: Fire, x: number, z: number) => {
      f.update(t, dt);
      if (f.k <= 0.02) return;
      const r = T.fire.radius * f.k;
      addDarkLight(x, 1, z, r); this.pool.add(f.emitter); safe.push({ x, z, r });
      fireNear = Math.max(fireNear, 1 - smooth(1.5, 9, this.dist(x, z)));
    };
    this.campfire.update(t, dt);
    fire(this.family.fire, this.family.x, this.family.z);
    for (const b of this.braziers) fire(b.f, b.x, b.z);
    for (const w of this.wisps) {
      w.w.update(t, dt);
      if (w.w.k > 0.02) { addDarkLight(w.x, 1, w.z, T.wisp.glow * w.w.k); this.pool.add(w.w.emitter); }
    }
    for (const n of Object.values(this.npcs)) {
      if (n.candle && n.state !== 'gone') { addDarkLight(n.candle.emitter.x, 1, n.candle.emitter.z, T.candle.radius); this.pool.add(n.candle.emitter); }
    }
    const gp = this.gate.group.position;
    this.gate.update(t, dt, this.gateOpen);
    addDarkLight(gp.x + 1.2, 1, gp.z + 1.2, 4.2 + this.gate.open * 15);
    this.pool.add(this.gate.emitter);
    if (this.gate.open > 0.2) safe.push({ x: gp.x + 1.5, z: gp.z + 1.5, r: 2.6 + this.gate.open * 15 });
    if (this.beacon) {
      addDarkLight(this.bowl.x, 1, this.bowl.z, 5.5);
      this.pool.add({ x: this.bowl.x, y: 1.4, z: this.bowl.z, color: this.beacon.color, intensity: 26 * (0.9 + 0.1 * this.lantern.flicker), distance: 9 });
      safe.push({ x: this.bowl.x, z: this.bowl.z, r: 5.5 });
    }
    commitDarkLights(this.pos.x, this.pos.z);
    this.pool.commit(this.pos.x, this.pos.z);

    // стоишь — тьма подползает: языки растут, пока не двинешься
    const inSafe = safe.some((s) => Math.hypot(s.x - this.pos.x, s.z - this.pos.z) < s.r);
    const creep = live && lamp.held && !inSafe ? smooth(T.still.wait, T.still.wait + T.still.grow, this.still) : 0;
    if (creep > 0.7 && !this.stillHinted && this.flags.has('firstDark')) { this.stillHinted = true; hud.hint(TX.still, 5); }
    darkU.uLobe.value = damp(darkU.uLobe.value, 0.24 + 0.4 * creep + 0.2 * this.pressure, 1.5, dt);
    darkU.uEdgeNoise.value = this.style.edgeNoise * (1 + 0.5 * creep);

    // тьма
    const w = this.world(lamp.held && this.mode === 'play' && !talking && this.dist(gp.x, gp.z) > 9 && this.dist(this.shade.x, this.shade.z) > (this.shade.state === 'wait' ? 7 : 0));
    w.ember = this.ember || this.gust > 0.5; w.safe = safe;
    const touched = this.dark.update(dt, t, w);
    if (touched && live && this.gust < 0.1) {
      if (this.ember) this.die();
      else {
        lamp.oil = Math.max(0, lamp.oil - T.lamp.touchDrain * (touched.kind === 'shade' ? 1 : 1.6));
        this.sfx.touch(); S.shake = 0.7; this.chroma = 1;
        this.dark.dismiss(touched);
        hud.whisper(TX.whispers[Math.floor(this.rng() * TX.whispers.length)]);
      }
    }
    if (live && isDead(lamp)) this.die();

    // шёпот из темноты и реплики спутников
    if (live && lamp.held) {
      this.whisperT -= dt * (0.4 + this.dark.nearness + this.pressure);
      if (this.whisperT <= 0 && this.dark.hunters.length) {
        this.whisperT = 9 + this.rng() * 9;
        const side = Math.cos(this.dark.nearestAngle) * S.right.x + Math.sin(this.dark.nearestAngle) * S.right.z;
        hud.whisper(TX.whispers[Math.floor(this.rng() * TX.whispers.length)], side > 0 ? 0.9 : 0.1);
        this.sfx.whisper(clamp(side, -1, 1));
      }
      this.barkT -= dt;
      if (this.barkT <= 0) { this.barkT = 24 + this.rng() * 18; this.story.bark(this.rng()); }
    }

    // давление: чем меньше круг, тем теснее кадр и громче тьма
    let pr = lamp.held ? (1 - smooth(1.6, 5.4, this.radius)) * 0.5 + this.dark.nearness * 0.12 + creep * 0.12 : 0.42;
    if (this.ember) pr = 0.62 + 0.38 * clamp(lamp.ember / T.lamp.emberTime, 0, 1);
    if (this.mode === 'dead') pr = 1;
    if (this.mode === 'end') pr = 0;
    this.pressure = damp(this.pressure, pr, this.mode === 'dead' ? 1.2 : 2.5, dt);
    S.pressure = clamp(this.pressure + this.sfx.beat * 0.045, 0, 1);
    S.viewHTarget = this.mode === 'end' ? 17 : 14 - 3.2 * this.pressure;
    this.chroma = Math.max(0, this.chroma - dt * 1.6);
    S.chroma = this.chroma * 0.02 + (this.ember ? 0.003 : 0);
    const side = Math.cos(this.dark.nearestAngle) * S.right.x + Math.sin(this.dark.nearestAngle) * S.right.z;
    this.sfx.update(dt, {
      pressure: this.pressure, power, near: this.dark.nearness, pan: side, fire: fireNear,
      dawn: Math.max(this.gate.open, 1 - smooth(4, 26, this.dist(gp.x, gp.z))) * (this.mode === 'menu' ? 0 : 1),
      quiet: this.mode === 'menu' || this.mode === 'dead',
    });

    // сквозняк: пыль сносит к выходу
    this.grid.flowDir(this.pos.x, this.pos.z, this.flow);
    this.drift.dx = damp(this.drift.dx, this.flow[0], 1.2, dt); this.drift.dz = damp(this.drift.dz, this.flow[1], 1.2, dt);
    this.drift.x += this.drift.dx * 0.55 * dt; this.drift.z += this.drift.dz * 0.55 * dt;
    this.dust.update(t, this.lampWorld, this.radius, power, S.mobile ? 2.2 : 2.4 * S.renderer.getPixelRatio(), this.drift.x, this.drift.z);
    hud.setOil(lamp.oil, lamp.oil <= T.lamp.lowOil);
    hud.setWick((lamp.wick - T.lamp.wickMin) / (T.lamp.wickMax - T.lamp.wickMin), this.carrying);
    window.__metrics = { mode: this.mode, oil: Math.round(lamp.oil), wick: +lamp.wick.toFixed(2), x: +this.pos.x.toFixed(1), z: +this.pos.z.toFixed(1), companions: this.companions.length, flags: [...this.flags] };
    this.input.endFrame();
    S.render(dt, _focus.set(this.pos.x, 0, this.pos.z), this.lampWorld);
  }
}

const _v = new Vector3(), _focus = new Vector3();
