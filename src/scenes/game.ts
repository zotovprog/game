// Игра: сборка глубины из данных и главный цикл. Сюжетные сцены и выборы — в systems/story.ts.
import { Color, Group, Mesh, MeshBasicMaterial, SphereGeometry, Sprite, Vector3 } from 'three';
import { Sfx } from '../audio/sfx';
import { Input } from '../core/input';
import { clamp, damp, lerp, mulberry32, smooth } from '../core/rng';
import { loadTrace, saveTrace, Trace } from '../core/save';
import { LevelDef } from '../data/level';
import { Style } from '../data/styles';
import { TX } from '../data/texts';
import { T } from '../data/tuning';
import { Darkness, DarkWorld, SafeLight } from '../systems/dark';
import { Forsaken } from '../systems/forsaken';
import { Phantoms } from '../systems/phantoms';
import { addOil, flamePower, isDead, LampState, lightRadius, newLamp, pourStep, stepLamp } from '../systems/lamp';
import { Story } from '../systems/story';
import { Hud } from '../ui/hud';
import { buildCave } from '../view/cave';
import { addDarkLight, beginDarkLights, commitDarkLights, darkU } from '../view/darkness';
import { Dust } from '../view/dust';
import { makeGlow } from '../view/glow';
import { Human } from '../view/human';
import { Lantern } from '../view/lantern';
import { Emitter, LightPool } from '../view/lightpool';
import { Candle, Fire, Gate, makeFlask, Wisp } from '../view/props';
import { Spirit } from '../view/spirit';
import { Stage } from '../view/stage';
import { Grid } from '../world/grid';

export type Mode = 'menu' | 'intro' | 'play' | 'dead' | 'end';
export type NpcId = 'efim' | 'vera' | 'boy';
export interface Npc {
  id: NpcId; h: Human; x: number; z: number; dir: number; speed01: number;
  state: 'wait' | 'follow' | 'left' | 'walkoff' | 'gone' | 'exit' | 'stay' | 'camp' | 'crawl';
  candle: Candle | null; path: [number, number][]; load: number;
  out: number;                      // сколько секунд вне света
  grab: number;                     // 0..1 — насколько тьма уже утащила
  pace: number;                     // доля от обычной скорости (Ефим хромает)
  goal: { x: number; z: number } | null;   // куда идёт сам: огонь, у которого ждёт, или лаз
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
  /** лампы прежних носителей на пирамидках: зажжённые горят всегда и не подпускают тьму */
  readonly cairns: { x: number; y: number; z: number; lit: boolean; k: number; glow: Sprite; emitter: Emitter; old: boolean }[] = [];
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
  // лазы: пролезет только ребёнок
  readonly holes: { x: number; z: number; done: boolean; busy: boolean }[] = [];
  /** живые огни этого кадра: рядом с ними тьма не трогает */
  safeLights: SafeLight[] = [];
  /** без сквозняков — только для автопрогонов */
  calm = false;
  readonly phantoms: Phantoms;
  readonly forsaken: Forsaken;
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
  campfire: Fire;
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
  private actLock = 0;          // пауза для кнопки действия после разговора
  private stillHinted = false;
  private drift = { x: 0, z: 0, dx: 0, dz: 0 };
  private flow = [0, 0];
  private flowStart = 1;        // шагов от места пробуждения до Врат
  /** 0..1 — страх: растёт от входа к Вратам и с каждой потерей; от него зависят броски, дым, звук и расход масла */
  dread = 0;
  /** вал тьмы, идущий по следу героя в конце: s — на сколько метров он позади */
  readonly wave = { on: false, s: 99 };
  private lastPos = { x: 0, z: 0 };
  /** сквозняк: ждёт, предупреждает, дует; snuff — насколько он сейчас пригибает пламя */
  readonly wind = { phase: 'idle' as 'idle' | 'warn' | 'blow', t: 30, exposed: 0, snuff: 0, kept: false };


  constructor(readonly stage: Stage, readonly hud: Hud, readonly input: Input, readonly sfx: Sfx, readonly style: Style, readonly def: LevelDef, opts: { skip: boolean }) {
    const scene = stage.scene;
    this.grid = new Grid(def.w, def.h, def.carves, def.seed);
    const cave = buildCave(this.grid, style, def);
    scene.add(cave.group);
    cave.cairns.forEach((c, i) => {
      const glow = makeGlow(style.lamp, 0.75, 0.95);
      glow.position.set(c.x, c.y + 0.04, c.z); glow.visible = false;
      scene.add(glow);
      const old = this.trace.cairns.includes(i);
      this.cairns.push({ ...c, lit: old, k: old ? 1 : 0, glow, old, emitter: { x: c.x, y: c.y + 0.25, z: c.z, color: style.lamp, intensity: 0, distance: 6 } });
    });
    this.grid.buildFlow(def.gate.bowl[0], def.gate.bowl[1]);
    this.flowStart = Math.max(1, this.grid.flowAt(...this.grid.snap(def.start.hero[0], def.start.hero[1])));
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
      return { id, h, x, z, dir: 0, speed01: 0, state: 'wait', candle: null, path, load, out: 0, grab: 0, pace: id === 'efim' ? T.party.efimPace : 1, goal: null };
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

    // лазы: кольцо камней вокруг чёрной дыры, в глубине блестит масло
    for (const p of def.holes) {
      const [x, z] = snap(p, 0.35);
      const g = new Group();
      const pit = new Mesh(new SphereGeometry(0.42, 10, 6), new MeshBasicMaterial({ color: 0x000000 }));
      pit.scale.set(1, 0.12, 0.8); pit.position.y = 0.06;
      const glint = makeGlow(style.lamp, 0.35, 0.22);
      glint.position.y = 0.1;
      g.add(pit, glint);
      g.position.set(x, 0, z);
      scene.add(g);
      this.holes.push({ x, z, done: false, busy: false });
    }

    // Врата и чаша
    this.gate = new Gate(style);
    this.gate.group.position.set(def.gate.at[0], 0, def.gate.at[1]);
    this.gate.group.rotation.y = Math.PI / 4;
    [this.bowl.x, this.bowl.z] = snap(def.gate.bowl, 1);
    this.gate.bowl.position.set(this.bowl.x, 0, this.bowl.z);
    scene.add(this.gate.group, this.gate.bowl);
    this.grid.obstacles.push({ x: this.bowl.x, z: this.bowl.z, r: 0.5 });

    this.dark = new Darkness(this.grid);
    this.dark.onSound = (s, pan, vol) => this.sfx.dark(s, pan, vol);
    this.phantoms = new Phantoms(this.grid, style, stage.over);
    this.phantoms.onStep = (pan) => this.sfx.dark('knock', pan, 0.16);
    this.phantoms.onVanish = () => { this.sfx.dark('breath', 0, 0.5); if (!this.flags.has('walkerHint')) { this.flags.add('walkerHint'); this.hud.hint(TX.walker, 5); } };
    this.pool = new LightPool(scene, 3);
    this.dust = new Dust(style.lamp, stage.mobile ? 150 : 280);
    scene.add(this.dust.points);
    this.forsaken = new Forsaken(this);
    this.story = new Story(this);
    // озвучка: кто это сказал → чей голос; где он стоит → с какой стороны слышно
    const roles: Record<string, string> = {
      '': 'narrator', [TX.efim.name]: 'efim', [TX.efim.realName]: 'efim', [TX.vera.name]: 'vera', [TX.vera.realName]: 'vera', [TX.mila.name]: 'mila', [TX.mila.realName]: 'mila',
      [TX.family.name]: 'father', [TX.family.realName]: 'father', [TX.family.mother]: 'mother', [TX.family.boy]: 'boy', [TX.shade.name]: 'shade',
    };
    const ghosts = ['dark', 'efim-ghost', 'vera-ghost', 'mila-ghost', 'father-ghost', 'mother-ghost', 'boy-ghost', 'narrator'];
    hud.onVoice = (kind, who, text) => {
      if (kind === 'hint') return this.sfx.narrBacklog >= 2 ? 0 : this.sfx.say('narrator', text, 'narr');
      if (kind === 'screen') return this.sfx.say('narrator', text, 'narr');
      if (kind === 'whisper') {
        const pan = who[0] === '<' ? -0.75 : 0.75, role = who.slice(1) || ghosts.find((r) => this.sfx.voiceLen(r, text) > 0);
        return role ? this.sfx.say(role, text, 'free', pan) : 0;
      }
      const role = roles[who];
      if (role === undefined) return 0;
      if (kind === 'pre') { this.sfx.preload(role, text); return 0; }
      return this.sfx.say(role, text, 'dialog', role === 'narrator' ? 0 : this.panOf(this.story.speakerOf(who)));
    };
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
  /** Зажечь лампу на пирамидке от своей: островок света и метка пройденного. Пещера помнит его и в следующий раз. */
  lightCairn(i: number): void {
    const c = this.cairns[i], lamp = this.lamp;
    if (!c || c.lit) return;
    if (lamp.oil <= T.cairn.cost + 1) { this.hud.hint(TX.noOil, 3); return; }
    lamp.oil -= T.cairn.cost;
    c.lit = true;
    this.sfx.relight(); this.chroma = 0.25;
    this.hud.hint(this.flags.has('cairnLit') ? TX.cairnAgain : TX.cairnLit, this.flags.has('cairnLit') ? 2 : 8);
    this.flags.add('cairnLit'); this.flags.add('cairn');
    if (!this.trace.cairns.includes(i)) { this.trace.cairns.push(i); saveTrace(this.trace); }
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
    return { px: this.pos.x, pz: this.pos.z, fx: this.face.x, fz: this.face.z, rx: this.stage.right.x, rz: this.stage.right.z, radius: this.radius, wick: this.lamp.wick, ember: false, active, dread: this.dread, repel: this.lamp.wick >= T.dread.repelWick && this.lamp.oil > 0 && this.lamp.lit && this.lamp.shield < 0.5, block: this.lamp.shield > 0.6, safe: [] };
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
    const sp = T.player.speed * (this.autoWalk ? 0.6 : 1) * (this.lamp.held ? 1 : 0.6) * (this.carrying ? T.player.carry : 1) * (wading ? T.player.wade : 1) * (1 - (1 - T.lamp.shieldSpeed) * this.lamp.shield);
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
    let k = 0;                      // место в цепочке
    for (const n of this.companions) {
      if (n.state === 'exit') { walkTo(n, gp.x + 1.2, gp.z + 1.2, T.player.speed * 0.7); continue; }
      if (n.state === 'stay') { walkTo(n, this.bowl.x + 1.0, this.bowl.z + 0.4, T.player.speed * 0.6); continue; }
      if ((n.state === 'camp' || n.state === 'crawl') && n.goal) { walkTo(n, n.goal.x, n.goal.z, T.player.speed * 0.9); continue; }
      if (n.state !== 'follow') continue;
      k++;
      if (n.grab > 0.03 && n.out > 0) { n.speed01 = 0; continue; }          // тьма держит: сам не выйдет
      const kind = this.grid.kindAt(n.x, n.z);
      const slow = n.pace * (kind === 'water' ? T.party.wade : kind === 'fissure' ? T.party.squeeze : 1);
      const [tx, tz] = this.trail(T.party.spacing * k);
      if (this.dist(n.x, n.z) > 1.25 * k) walkTo(n, tx, tz, T.player.speed * 1.06 * slow); else n.speed01 = 0;
    }
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

  /** Сквозняк: сначала слышно и видно, что он идёт, потом порыв. Не прикрыл лампу ладонью — гаснет, и тьма бьёт сразу. */
  private runGust(dt: number, on: boolean): void {
    const W = this.wind, G = T.gust, lamp = this.lamp;
    if (!on) { W.snuff = damp(W.snuff, 0, 6, dt); return; }
    if (W.phase === 'idle') {
      W.snuff = damp(W.snuff, 0, 6, dt);
      if ((W.t -= dt) > 0 || !lamp.lit || lamp.oil <= 0 || this.wave.on) return;
      const first = !this.flags.has('gustHint');
      W.phase = 'warn'; W.t = first ? G.firstWarn : G.warn; W.exposed = 0; W.kept = false;
      this.sfx.gustWarn();
      this.flags.add('gustHint');
      this.hud.hint(first ? (this.hud.touch ? TX.gustHintTouch : TX.gustHintKb) : (this.hud.touch ? TX.gustTouch : TX.gustKb), first ? 7 : W.t + G.blow);
    } else if (W.phase === 'warn') {
      W.snuff = damp(W.snuff, 0.18 + 0.12 * Math.sin(performance.now() / 60), 8, dt);     // пламя заранее мечется
      if ((W.t -= dt) <= 0) { W.phase = 'blow'; W.t = G.blow; this.sfx.gust(); this.stage.shake = Math.max(this.stage.shake, 0.3); }
    } else {
      const byFire = this.safeLights.some((s) => Math.hypot(s.x - this.pos.x, s.z - this.pos.z) < s.r * 0.6);
      const covered = lamp.shield > 0.6 || byFire;
      if (lamp.shield > 0.6 && !byFire) W.kept = true;
      W.snuff = damp(W.snuff, covered ? 0.25 : 0.85, 10, dt);
      if (!covered && lamp.lit && (W.exposed += dt) > G.exposed) {
        lamp.lit = false; lamp.pour = 0; W.kept = false;
        this.sfx.snuff(); this.chroma = 0.8; this.stage.shake = Math.max(this.stage.shake, 0.5);
        // в темноте она не ждёт: бросок идёт сразу и пьёт почти вдвое
        for (const h of this.dark.hunters) h.cool = Math.min(h.cool, 0.25 + this.rng() * 0.5);
        const outs = this.count('outs');
        this.hud.hint(outs === 1 ? (this.hud.touch ? TX.outHintTouch : TX.outHintKb) : (this.hud.touch ? TX.outTouch : TX.outKb), outs === 1 ? 9 : 5);
      }
      if ((W.t -= dt) <= 0) {
        W.phase = 'idle';
        if (W.kept && lamp.lit) { const n = this.count('kept'); if (n <= 3) this.hud.hint(n === 1 ? TX.keptFirst : TX.kept, n === 1 ? 6 : 2.5); }
        const kind = this.grid.kindAt(this.pos.x, this.pos.z), [lo, hi] = G.every[kind] ?? G.every.rubble;
        W.t = (lo + this.rng() * (hi - lo)) * (1.15 - 0.4 * this.dread);
      }
    }
  }
  /** С какой стороны экрана стоит говорящий (для панорамы голоса). */
  panOf(h: Human | null): number {
    if (!h || h === this.hero) return 0;
    const p = h.root.position;
    return clamp(((p.x - this.pos.x) * this.stage.right.x + (p.z - this.pos.z) * this.stage.right.z) / 5, -0.8, 0.8);
  }
  private counts = new Map<string, number>();
  /** Сколько раз это уже случалось (для подсказок, которые со временем короче). */
  private count(key: string): number { const n = (this.counts.get(key) ?? 0) + 1; this.counts.set(key, n); return n; }
  /** Срежиссированный первый порыв (учит прикрывать лампу). */
  forceGust(): void { if (this.wind.phase === 'idle') this.wind.t = 0; }

  /** Вал: в конце тьма идёт по твоему следу. Остановишься — накроет; отставших накрывает первыми. */
  private runWave(dt: number): void {
    const W = this.wave, moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
    this.lastPos.x = this.pos.x; this.lastPos.z = this.pos.z;
    if (!W.on) return;
    const gp = this.gate.group.position;
    if (this.dist(gp.x, gp.z) < 11) { W.on = false; W.s = 99; this.story.waveEnd(); return; }
    W.s = clamp(W.s + moved - T.wave.speed * dt, 0, 30);
    const [wx, wz] = this.trail(W.s);
    this.dark.extra.push({ x: wx, z: wz, w: 3.6, s: 1 });
    if (W.s < T.wave.reach) {
      this.lamp.oil = Math.max(0, this.lamp.oil - T.wave.drain * dt);
      this.stage.shake = Math.max(this.stage.shake, 0.35); this.chroma = Math.max(this.chroma, 0.5);
    }
    let k = 0;
    for (const n of this.companions) {
      if (n.state !== 'follow') continue;
      k++;
      if (T.party.spacing * k > W.s - 0.6) { n.out = Math.max(n.out, T.party.grace + 0.01); n.grab += dt / 1.3; }
    }
  }

  /** Отряд и свет: кто выпал из круга дольше грейса — того тьма тащит; вернул свет — отпускает. */
  private party(dt: number): void {
    for (const n of this.companions) {
      if (n.state !== 'follow') { n.out = 0; n.grab = 0; continue; }
      const lit = this.dist(n.x, n.z) < this.radius * 0.95 || this.safeLights.some((s) => Math.hypot(s.x - n.x, s.z - n.z) < s.r);
      if (lit) {
        if (n.grab > 0.25 && n.out > 0) this.story.freed(n);
        n.out = 0; n.grab = Math.max(0, n.grab - dt * 0.8);
        continue;
      }
      n.out += dt;
      if (n.out < T.party.grace) continue;
      if (n.grab === 0) this.story.grabbed(n);
      n.grab += dt / T.party.grabTime;
      this.dark.extra.push({ x: n.x, z: n.z, w: 1.5, s: Math.min(1, 0.45 + n.grab) });
      this.hud.marker(`grab-${n.id}`, n.x, n.z, `${this.story.who(n)}: ${TX.grab[n.id]}`, 0.4, true);
      if (n.grab >= 1) this.story.taken(n);
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
      if (this.lamp.lit && this.lamp.oil > 0) this.cairns.forEach((c, i) => { if (!c.lit) near(c.x, c.z, T.cairn.reach, TX.promptCairn, () => this.lightCairn(i)); });
      if (n.efim.state === 'wait' || n.efim.state === 'left') near(n.efim.x, n.efim.z, 2.1, TX.promptTalk, () => s.talkEfim());
      if (n.vera.state === 'wait') near(n.vera.x, n.vera.z, 2.1, TX.promptTalk, () => s.talkVera());
      if (this.family.state === 'wait') near(this.family.x, this.family.z, 2.6, TX.promptTalk, () => s.talkFamily());
      if (this.mila.state === 'wait') near(this.mila.x, this.mila.z, 1.9, TX.promptTalk, () => s.talkMila());
      if (this.mila.state === 'down') near(this.mila.x, this.mila.z, 1.6, TX.mila.promptUp, () => s.liftMila());
      if (this.shade.state === 'wait') near(this.shade.x, this.shade.z, 3.4, TX.promptTalk, () => s.talkShade());
      if (!this.toy.taken) near(this.toy.x, this.toy.z, 1.3, TX.promptToy, () => s.pickToy());
      near(this.bowl.x, this.bowl.z, 1.9, TX.bowl.prompt, () => s.bowl());
      const followers = this.companions.some((c) => c.state === 'follow');
      const fires: [Fire, number, number][] = [[this.family.fire, this.family.x, this.family.z], ...this.braziers.map((b): [Fire, number, number] => [b.f, b.x, b.z])];
      for (const [fr, fx, fz] of fires) {
        if (!fr.lit) continue;
        if (followers) near(fx, fz, 2.7, TX.camp.leave, () => s.camp(fx, fz));
        else if (this.companions.some((c) => c.state === 'camp' && c.goal && Math.hypot(c.goal.x - fx, c.goal.z - fz) < 3)) near(fx, fz, 2.7, TX.camp.call, () => s.uncamp(fx, fz));
      }
      for (const h of this.holes) if (!h.done && !h.busy) near(h.x, h.z, 1.7, n.boy.state === 'follow' ? TX.hole.send : TX.hole.look, () => s.hole(h));
      if (this.carrying && !list.length) list.push({ text: TX.mila.promptDown, d: 9, x: this.pos.x + this.face.x, z: this.pos.z + this.face.z, act: () => s.dropMila() });
    }
    list.sort((p, q) => p.d - q.d);
    this.hud.prompt(list[0]?.text ?? null);
    // сразу после разговора действие не срабатывает: иначе, пролистывая реплики, жмёшь следующую кнопку вслепую
    if (hit && list[0] && this.actLock <= 0) { this.lookAt = { x: list[0].x, z: list[0].z }; list[0].act(); }
    // масло подбирается само: в панике не до кнопок
    for (const f of this.flasks) {
      if (f.taken || !this.lamp.held || this.dist(f.x, f.z) > 0.95) continue;
      if (!f.own && this.lamp.flasks >= T.lamp.maxFlasks) { if (!this.flags.has('fullHint')) { this.flags.add('fullHint'); this.hud.hint(TX.flaskFull, 5); } continue; }
      f.taken = true; f.g.visible = false;
      this.sfx.pickup();
      if (f.own) { addOil(this.lamp, T.lamp.ownLamp); this.hud.hint(TX.ownLamp, 3); continue; }
      this.lamp.flasks++;
      if (!this.flags.has('flaskHint')) { this.flags.add('flaskHint'); this.hud.hint(this.hud.touch ? TX.flaskHintTouch : TX.flaskHintKb, 9); } else this.hud.hint(TX.flask, 2);
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
    this.input.blockStick = talking;
    this.actLock = talking ? 0.7 : Math.max(0, this.actLock - dt);
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
    // руки: прикрыть лампу ладонью (держать) и долить/разжечь (держать, стоя на месте)
    const hands = live && lamp.held;
    lamp.shield = damp(lamp.shield, hands && this.input.down('ShiftLeft', 'ShiftRight', 'KeyC') ? 1 : 0, 9, dt);
    const pouring = hands && this.input.down('KeyR') && this.speed01 < 0.05 && lamp.shield < 0.3;
    const wasPour = lamp.pour;
    const did = pourStep(lamp, dt, pouring);
    if (pouring && wasPour === 0 && lamp.pour > 0) this.sfx.pour();
    if (did === 'poured') { this.sfx.pickup(); this.sfx.relight(); this.chroma = 0.3; }
    if (did === 'relit') { this.sfx.relight(); this.dark.scatter(); hud.hint(TX.relit, 3); }
    this.hero.shield = lamp.shield; this.hero.pour = lamp.pour > 0 ? 1 : 0;
    this.runGust(dt, live && lamp.held && this.flags.has('firstDark') && !this.calm);
    lamp.snuff = Math.max(this.gust, this.wind.snuff);
    const wasOil = lamp.oil;
    let load = 0;
    for (const n of this.companions) if (n.state === 'follow') load += n.load;
    // страх: глубина + потери; до первой встречи с тьмой его нет
    const steps = this.grid.flowAt(this.pos.x, this.pos.z);
    const depth = steps < 65535 ? clamp(1 - steps / this.flowStart, 0, 1) : 0.5;
    const wantDread = !lamp.held || !this.flags.has('firstDark') ? 0 : clamp(lerp(T.dread.start, T.dread.deep, depth) + this.story.tally().lost * T.dread.perLost + (this.wave.on ? 0.15 : 0), 0, 1);
    this.dread = damp(this.dread, wantDread, 0.6, dt);
    if (live && lamp.held && this.flags.has('firstDark')) this.dark.setCount(1 + Math.round(this.dread * 4));
    if (live) stepLamp(lamp, dt, load, 1 + T.dread.burnBonus * this.dread);
    if (live) this.runWave(dt);
    if (lamp.held && wasOil > T.lamp.lowOil && lamp.oil <= T.lamp.lowOil) hud.hint(TX.oilLow, 4);
    if (lamp.held && wasOil > 0 && lamp.oil <= 0) { hud.hint(TX.ember, 4); this.sfx.snuff(); }
    const rTarget = lamp.held ? lightRadius(lamp) : 2.3;
    this.radius = damp(this.radius, rTarget, rTarget < this.radius ? 3 : 6, dt);
    const power = lamp.held ? flamePower(lamp) : 0.16;
    this.lantern.update(t, power, this.radius, this.style.lampGain);
    this.lantern.group.getWorldPosition(this.lampWorld);

    if (live) { this.interact(); this.party(dt); this.story.zones(); this.story.wisps(); this.story.drama(dt); this.forsaken.update(dt, t); } else hud.prompt(null);

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
    for (const c of this.cairns) {
      if (!c.lit) continue;
      c.k = damp(c.k, 1, 2.2, dt);
      const fl = 0.9 + 0.1 * Math.sin(t * 9 + c.x * 3.1) * Math.sin(t * 5.3 + c.z);
      c.glow.visible = true; c.glow.scale.setScalar(0.75 * (0.5 + 0.5 * c.k) * fl);
      if (this.dist(c.x, c.z) > 30) continue;
      const r = T.cairn.radius * c.k;
      c.emitter.intensity = 9 * c.k * fl;
      addDarkLight(c.x, 1, c.z, r); this.pool.add(c.emitter); safe.push({ x: c.x, z: c.z, r: r * 0.85 });
      if (c.old && !this.flags.has('cairnOld') && this.dist(c.x, c.z) < 3.2) { this.flags.add('cairnOld'); hud.hint(TX.cairnRemember, 6); }
    }
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
    for (const f of this.flasks) if (!f.taken && this.dist(f.x, f.z) < 22) addDarkLight(f.x, 0.2, f.z, 0.75);
    if (!this.toy.taken && this.dist(this.toy.x, this.toy.z) < 22) addDarkLight(this.toy.x, 0.2, this.toy.z, 0.6);
    if (this.mila.state === 'wait' || this.mila.state === 'left') addDarkLight(this.mila.x + 0.45, 0.2, this.mila.z + 0.3, 0.9);
    if (this.family.fire.k < 0.5 && this.dist(this.family.x, this.family.z) < 22) addDarkLight(this.family.x, 0.3, this.family.z, 0.8);
    this.safeLights = safe;
    commitDarkLights(this.pos.x, this.pos.z);
    this.pool.commit(this.pos.x, this.pos.z);
    // свет на дыме: лампа и ближайшие живые огни
    const V = S.volume;
    V.glowPos[0].copy(this.lampWorld); V.glowCol[0].set(_c.set(this.style.lamp).r, _c.g, _c.b).multiplyScalar(this.lantern.light.intensity * 0.5); V.glowDist[0] = this.lantern.light.distance;
    for (let i = 0; i < 3; i++) {
      const e = this.pool.active[i];
      if (e) { V.glowPos[i + 1].set(e.x, e.y, e.z); _c.set(e.color); V.glowCol[i + 1].set(_c.r, _c.g, _c.b).multiplyScalar(e.intensity * 0.5); V.glowDist[i + 1] = e.distance; }
      else V.glowDist[i + 1] = 0;
    }

    // стоишь — тьма подползает: языки растут, пока не двинешься
    const inSafe = safe.some((s) => Math.hypot(s.x - this.pos.x, s.z - this.pos.z) < s.r);
    const creep = live && lamp.held && !inSafe ? smooth(T.still.wait, T.still.wait + T.still.grow, this.still) : 0;
    if (creep > 0.7 && !this.stillHinted && this.flags.has('firstDark')) { this.stillHinted = true; hud.hint(TX.still, 5); }
    darkU.uLobe.value = damp(darkU.uLobe.value, 0.24 + 0.4 * creep + 0.2 * this.pressure, 1.5, dt);
    darkU.uEdgeNoise.value = this.style.edgeNoise * (1 + 0.5 * creep);

    // тьма
    const w = this.world(lamp.held && this.mode === 'play' && !talking && this.dist(gp.x, gp.z) > 9 && this.dist(this.shade.x, this.shade.z) > (this.shade.state === 'wait' ? 7 : 0));
    w.ember = this.ember || this.gust > 0.5 || !lamp.lit; w.safe = safe;
    if (lamp.pour > 0) for (const h of this.dark.hunters) h.cool -= dt;          // пока льёшь, она торопится
    if (inSafe) w.repel = true;
    const touched = this.dark.update(dt, w);
    if (this.dark.blocked && live) { this.chroma = Math.max(this.chroma, 0.35); S.shake = Math.max(S.shake, 0.25); const n = this.count('block'); if (n <= 2) hud.hint(n === 1 ? TX.blockFirst : TX.block, n === 1 ? 6 : 2.5); }
    if (touched && live && this.gust < 0.1) {
      if (this.ember) this.die();
      else {
        lamp.oil = Math.max(0, lamp.oil - (lamp.lit ? T.lamp.touchDrain : T.lamp.outDrain) * (touched.kind === 'shade' ? 1 : 1.6));
        this.sfx.touch(); S.shake = 0.8; this.chroma = 1;
        if (!this.flags.has('biteHint')) { this.flags.add('biteHint'); hud.hint(TX.biteHint, 8); }
        this.dark.dismiss(touched);
        hud.whisper(TX.whispers[Math.floor(this.rng() * TX.whispers.length)]);
      }
    }
    if (live && isDead(lamp)) this.die();
    // те, кого нет: глаза за краем света и идущий по его границе
    const plights = darkU.uLights.value.slice(0, darkU.uLightCount.value).map((v) => ({ x: v.x, z: v.z, r: v.w }));
    this.phantoms.update(dt, t, { px: this.pos.x, pz: this.pos.z, radius: this.radius, lit: lamp.lit && lamp.oil > 0, dread: this.dread, active: w.active || (live && lamp.held && !lamp.lit && this.flags.has('firstDark')), lights: plights, rx: S.right.x, rz: S.right.z });

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
    S.dread = this.dread;
    // разговор: камера подходит ближе — видно, кто говорит и как
    S.viewHTarget = this.mode === 'end' ? 17 : talking && hud.speakerName ? 9.4 : 14 - 3.2 * this.pressure;
    this.chroma = Math.max(0, this.chroma - dt * 1.6);
    S.chroma = this.chroma * 0.02 + (this.ember ? 0.003 : 0);
    const side = Math.cos(this.dark.nearestAngle) * S.right.x + Math.sin(this.dark.nearestAngle) * S.right.z;
    this.sfx.update(dt, {
      pressure: this.pressure, power, near: this.dark.nearness, pan: side, fire: fireNear,
      dawn: Math.max(this.gate.open, 1 - smooth(4, 26, this.dist(gp.x, gp.z))) * (this.mode === 'menu' ? 0 : 1),
      quiet: this.mode === 'menu' || this.mode === 'dead',
      zone: this.grid.kindAt(this.pos.x, this.pos.z), dread: this.dread, oil: lamp.held ? lamp.oil / 100 : 1, wave: this.wave.on ? 1 - smooth(1.5, 16, this.wave.s) : 0,
    });

    // сквозняк: пыль сносит к выходу
    this.grid.flowDir(this.pos.x, this.pos.z, this.flow);
    this.drift.dx = damp(this.drift.dx, this.flow[0], 1.2, dt); this.drift.dz = damp(this.drift.dz, this.flow[1], 1.2, dt);
    this.drift.x += this.drift.dx * 0.55 * dt; this.drift.z += this.drift.dz * 0.55 * dt;
    this.dust.update(t, this.lampWorld, this.radius, power, S.mobile ? 2.2 : 2.4 * S.renderer.getPixelRatio(), this.drift.x, this.drift.z);
    if (this.flags.has('goal') && this.mode === 'play') {
      const c = this.story.tally(), steps = this.grid.flowAt(this.pos.x, this.pos.z);
      const sx = this.drift.dx * S.right.x + this.drift.dz * S.right.z, sy = this.drift.dx * S.up.x + this.drift.dz * S.up.z;
      hud.setGoal(`${TX.goal.with} <b>${c.with}</b> · ${TX.goal.found} <b>${c.found}/7</b>${c.lost ? ` · ${TX.goal.lost} <u>${c.lost}</u>` : ''} · ${TX.goal.gate} <b>${steps < 65535 ? Math.round(steps / 5) * 5 : '?'}</b>`, Math.hypot(sx, sy) > 0.2 ? Math.atan2(sx, sy) : null);
    }
    hud.updateMarkers((x, z) => { _v.set(x, 1, z).project(S.camera); return [(_v.x * 0.5 + 0.5) * innerWidth, (1 - (_v.y * 0.5 + 0.5)) * innerHeight]; });
    hud.setOil(lamp.oil, lamp.oil <= T.lamp.lowOil);
    hud.setHands(lamp.flasks, lamp.pour, lamp.lit || lamp.oil <= 0, lamp.shield > 0.5, this.wind.phase !== 'idle');
    // видно, кто говорит: у говорящего двигаются голова и руки
    const bk = this.story.barker;
    const sp = talking ? this.story.speakerOf(hud.speakerName) : bk && performance.now() < bk.until ? bk.h : null;
    this.hero.talk = sp === this.hero ? 1 : 0;
    for (const n of Object.values(this.npcs)) n.h.talk = sp === n.h ? 1 : 0;
    this.family.father.talk = sp === this.family.father ? 1 : 0; this.family.mother.talk = sp === this.family.mother ? 1 : 0;
    this.mila.h.talk = sp === this.mila.h ? 1 : 0;
    if (sp) { sp.head.getWorldPosition(_v); _v.y += 0.42; _v.project(S.camera); hud.setSpeak((_v.x * 0.5 + 0.5) * innerWidth, (1 - (_v.y * 0.5 + 0.5)) * innerHeight); } else hud.setSpeak(null);
    hud.setWick((lamp.wick - T.lamp.wickMin) / (T.lamp.wickMax - T.lamp.wickMin), this.carrying);
    window.__metrics = { mode: this.mode, oil: Math.round(lamp.oil), wick: +lamp.wick.toFixed(2), x: +this.pos.x.toFixed(1), z: +this.pos.z.toFixed(1), companions: this.companions.length, flags: [...this.flags] };
    this.input.endFrame();
    _focus.set(this.pos.x, 0, this.pos.z);
    if (talking && hud.speakerName && this.lookAt) { _focus.x += clamp((this.lookAt.x - this.pos.x) * 0.5, -1.6, 1.6); _focus.z += clamp((this.lookAt.z - this.pos.z) * 0.5, -1.6, 1.6); }
    S.render(dt, _focus, this.lampWorld);
  }
}

const _v = new Vector3(), _focus = new Vector3(), _c = new Color();
