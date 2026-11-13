// Сюжет глубины: вступление, встречи, ловушки, удары, Врата, финалы и «след» прошлых попыток.
import { saveTrace } from '../core/save';
import { TX } from '../data/texts';
import { T } from '../data/tuning';
import type { Game, Npc } from '../scenes/game';
import { makeGlow } from '../view/glow';
import { Human } from '../view/human';
import { Candle, Fire } from '../view/props';

export class Story {
  private ownGhost: { x: number; z: number } | null = null;
  private keeper: { x: number; z: number } | null = null;

  constructor(private g: Game) {}

  // ---------- память пещеры
  applyTrace(): void {
    const g = this.g, tr = g.trace;
    if (tr.lastDeath && g.grid.isFloor(tr.lastDeath.x, tr.lastDeath.z)) {
      const [x, z] = g.grid.snap(tr.lastDeath.x, tr.lastDeath.z, 0.5);
      g.spirits.placeStill('self', x, z);
      g.addFlask(...g.grid.snap(x + 0.9, z + 0.6, 0.4), true);
      this.ownGhost = { x, z };
    }
    if (tr.beacon) {
      const glow = makeGlow(g.style.lamp, 2.4, 0.9);
      glow.position.set(g.bowl.x, 1.25, g.bowl.z);
      g.stage.scene.add(glow);
      g.beaconGlow = glow;
      g.gateOpen = 0.32;
      const k = new Human({ cloak: g.style.cloakPlayer, skin: 0x8c8a86 });
      const [kx, kz] = g.grid.snap(g.bowl.x + 1.3, g.bowl.z + 0.2, 0.5);
      k.root.position.set(kx, 0, kz);
      k.root.rotation.y = Math.atan2(g.bowl.x - kx, g.bowl.z - kz);
      k.update(0.016, 0, 0);
      g.stage.scene.add(k.root);
      this.keeper = { x: kx, z: kz };
    }
  }

  // ---------- начало
  menu(): void {
    const g = this.g;
    g.mode = 'menu';
    g.stage.fade = 0.25;
    const seen = g.trace.endings.length ? `Финалы: ${g.trace.endings.length} из 3` : '';
    g.hud.screen({
      title: TX.title, sub: TX.subtitle, button: TX.start,
      small: `${g.hud.controlsHint()}<br>${TX.headphones}${seen ? `<br>${seen}` : ''}`,
      onButton: () => this.begin(),
    });
  }

  begin(): void {
    const g = this.g;
    g.sfx.init(); g.sfx.restore();
    g.hud.screen(null);
    g.mode = 'intro';
    g.stage.fade = 1;
    TX.intro.forEach((line, i) => g.after(0.8 + i * 3.2, () => g.hud.hint(line, 2.6)));
    const t0 = 0.8 + TX.intro.length * 3.2 - 2.4;
    for (let i = 0; i <= 30; i++) g.after(t0 + i * 0.1, () => { g.stage.fade = 1 - i / 30; });
    g.after(t0 + 3.2, () => { g.mode = 'play'; g.hud.hint(g.hud.touch ? TX.hintMoveTouch : TX.hintMoveKb, 7); });
  }

  /** Для съёмки и отладки: сразу с лампой в руке. */
  skipIntro(): void {
    const g = this.g;
    g.stage.fade = 0; g.mode = 'play';
    g.hero.setPose('stand', true);
    (g as unknown as { stood: boolean }).stood = true;
    g.takeLamp();
    g.spirits.setCount(T.spirits.count);
  }

  onStand(): void { /* встал — дальше ведут подсказки */ }

  pickLamp(): void {
    const g = this.g;
    g.takeLamp();
    g.hud.hint(TX.afterLamp, 5);
    g.after(1.6, () => { g.hud.whisper(TX.whispers[0], 0.8); g.sfx.whisper(0.6, 0.1); });
    g.after(6, () => g.hud.hint(g.hud.touch ? TX.hintWickTouch : TX.hintWickKb, 9));
  }

  examineDead(): void {
    this.g.flags.add('dead');
    this.g.hud.say('', TX.dead, () => {});
  }

  lightBrazier(f: Fire): void {
    const g = this.g;
    if (g.lamp.oil <= T.lamp.brazierCost + 1) { g.hud.hint(TX.noOilBrazier, 3); return; }
    g.lamp.oil -= T.lamp.brazierCost;
    f.lit = true;
    g.sfx.ignite();
    g.spirits.scatter();
    if (!g.flags.has('brazier')) { g.flags.add('brazier'); g.after(1.5, () => g.hud.hint(TX.brazier, 8)); }
  }

  // ---------- встречи
  talk(id: 'efim' | 'vera'): void {
    const g = this.g, n = g.npcs[id], tx = TX[id];
    const known = g.flags.has(`${id}Name`);
    const name = () => (g.flags.has(`${id}Name`) ? tx.realName : tx.name);
    n.dir = Math.atan2(g.pos.x - n.x, g.pos.z - n.z);
    g.sfx.voice(id);
    const ask = () => g.hud.choose(name(), tx.talk[tx.talk.length - 1], [{ label: tx.yes, note: tx.yesNote }, { label: tx.no, note: tx.noNote }], (i) => {
      if (i === 0) {
        if (g.lamp.oil < T.lamp.giveCost + 4) { g.sfx.voice(id); g.hud.say(name(), [tx.poor], () => { if (id === 'vera') this.refuse(n); }); return; }
        this.accept(n);
      } else this.refuse(n);
    });
    if (known) ask(); else g.hud.say(name(), tx.talk.slice(0, -1), ask);
    g.flags.add(`${id}Met`);
  }

  private accept(n: Npc): void {
    const g = this.g, tx = TX[n.id];
    g.lamp.oil -= T.lamp.giveCost;
    g.chroma = 0.5;
    n.candle = new Candle(g.style);
    n.h.attach(n.candle.group);
    n.candle.group.position.set(0, -0.02, 0);
    n.h.setPose('stand');
    n.state = 'follow';
    g.companions.push(n);
    g.flags.add(`${n.id}Name`); g.flags.add(`${n.id}Saved`);
    g.sfx.ignite(); g.sfx.voice(n.id);
    g.hud.say(tx.realName, tx.accepted, () => {});
  }

  private refuse(n: Npc): void {
    const g = this.g, tx = TX[n.id];
    g.flags.add(`${n.id}Left`);
    g.sfx.voice(n.id);
    if (n.id === 'efim') { n.state = 'left'; g.flags.add('efimName'); g.hud.say(tx.name, tx.refused, () => {}); }
    else g.hud.say(tx.name, tx.refused, () => { n.state = 'walkoff'; });
  }

  /** Вера дошла до ложного огня. */
  veraTaken(): void {
    const g = this.g, v = g.npcs.vera;
    v.state = 'gone';
    v.h.root.visible = false;
    const w = g.wisps.find((x) => x.id === g.def.vera.wisp);
    if (w) w.w.out = true;
    g.sfx.snuff(-0.6);
    g.after(1.2, () => { g.hud.hint(TX.vera.taken, 5); g.sfx.whisper(-0.7, 0.08); });
  }

  // ---------- зоны
  zones(): void {
    const g = this.g;
    for (const z of g.def.zones) {
      if (g.flags.has(z.id) || g.dist(z.at[0], z.at[1]) > z.r) continue;
      g.flags.add(z.id);
      this.zone(z.id);
    }
    // след прошлой попытки
    if (this.ownGhost && !g.flags.has('ownGhost') && g.dist(this.ownGhost.x, this.ownGhost.z) < g.radius + 0.5) {
      g.flags.add('ownGhost');
      g.sfx.whisper(0, 0.1);
      g.hud.say('', TX.ownGhost, () => {});
    }
    if (this.keeper && !g.flags.has('keeper') && g.dist(this.keeper.x, this.keeper.z) < 2.2) {
      g.flags.add('keeper');
      g.hud.hint(TX.keeper, 5);
    }
    // спутники удерживают от бродячих духов меньше, чем кажется: чем их больше, тем больше теней
    const want = !g.lamp.held ? 0 : g.flags.has('longDark') ? T.spirits.count + 2 : g.flags.has('firstSpirit') ? T.spirits.count : 0;
    if (g.spirits.list.filter((s) => s.kind === 'shade').length < want) g.spirits.setCount(want);
  }

  private zone(id: string): void {
    const g = this.g;
    if (id === 'firstSpirit') {
      g.after(2.5, () => g.hud.hint(TX.firstSpirit[0], 4.5));
      g.after(8, () => g.hud.hint(TX.firstSpirit[1], 5));
    } else if (id === 'seeWisp') {
      g.hud.hint(TX.seeWisp, 5);
    } else if (id === 'longDark') {
      g.hud.hint(TX.longDark, 5);
      const v = g.npcs.vera;
      if (v.state === 'wait') { g.flags.add('veraLeft'); v.state = 'walkoff'; }
      if (g.npcs.efim.state === 'wait') g.flags.add('efimLeft');
    } else if (id === 'gust') {
      this.gustScare();
    } else if (id === 'named') {
      this.returned();
    } else if (id === 'gateHall') {
      g.hud.hint(TX.gateHall, 4);
      g.companions.forEach((n, i) => g.after(3 + i * 4, () => { g.hud.hint(`${TX[n.id].realName}: «${TX[n.id].gate}»`, 4.5); g.sfx.voice(n.id); }));
    }
  }

  /** Удар: сквозняк задувает лампу, лица смыкаются, пламя возвращается. */
  private gustScare(): void {
    const g = this.g;
    g.sfx.gust();
    g.hud.hint(TX.gust, 2.5);
    for (let i = 0; i <= 6; i++) g.after(0.25 + i * 0.05, () => { g.gust = i / 6; });
    g.after(1.3, () => { g.sfx.stinger(); g.stage.shake = 0.8; g.chroma = 1; });
    g.after(2.6, () => { g.gust = 0; g.sfx.relight(); g.spirits.scatter(); g.lamp.oil = Math.max(3, g.lamp.oil - 3); });
  }

  /** Расплата: те, мимо кого ты прошёл, возвращаются. Обычный свет их не держит. */
  private returned(): void {
    const g = this.g;
    const world = () => ({ px: g.pos.x, pz: g.pos.z, fx: g.face.x, fz: g.face.z, radius: g.radius, wick: g.lamp.wick, ember: false, active: true, safe: [] });
    const come = (id: 'efim' | 'vera', delay: number) => {
      g.after(delay, () => {
        if (g.mode !== 'play') return;
        g.spirits.spawnNamed(id, world());
        g.sfx.whisper(-g.face.x > 0 ? 0.8 : -0.8, 0.2); g.sfx.touch();
        g.chroma = 0.8; g.stage.shake = 0.35;
        TX[id].ghost.forEach((l, i) => g.after(0.4 + i * 2.6, () => g.hud.whisper(l)));
      });
    };
    if (g.flags.has('efimLeft')) come('efim', 0.5);
    if (g.flags.has('veraLeft')) come('vera', g.flags.has('efimLeft') ? 14 : 0.5);
  }

  /** Ложные огни гаснут, когда подходишь; первый — с броском из темноты. */
  wisps(): void {
    const g = this.g;
    if (!g.lamp.held) return;
    for (const w of g.wisps) {
      if (w.w.out || g.dist(w.x, w.z) > T.wisp.snuff) continue;
      w.w.out = true;
      g.sfx.snuff();
      const first = !g.flags.has('wispTrap');
      g.flags.add('wispTrap');
      const ax = w.x + (w.x - g.pos.x) * 1.4, az = w.z + (w.z - g.pos.z) * 1.4;
      g.after(first ? 0.9 : 0.4, () => {
        g.spirits.lunge(ax, az);
        if (first) { g.sfx.stinger(); g.stage.shake = 0.9; g.chroma = 1; } else g.sfx.touch();
      });
      g.spirits.setCount(g.spirits.list.filter((s) => s.kind === 'shade').length + 1);
      if (first) g.after(4, () => g.hud.hint(TX.wispTrap, 7));
    }
  }

  // ---------- Врата
  bowl(): void {
    const g = this.g, beacon = g.trace.beacon;
    g.hud.say('', beacon ? TX.bowlBeacon : TX.bowl, () => {
      const opts = beacon
        ? [{ label: TX.choiceLeaveBeacon }, { label: TX.choiceBack }]
        : [{ label: TX.choiceStay }, { label: TX.choiceLeave }, { label: TX.choiceBack }];
      g.hud.choose('', '', opts, (i) => {
        const pick = opts[i].label;
        if (pick === TX.choiceStay) this.endBeacon();
        else if (pick === TX.choiceLeave || pick === TX.choiceLeaveBeacon) this.endLeave();
      });
    });
  }

  private fadeOut(from: number, secs: number): void {
    const g = this.g;
    for (let i = 0; i <= 40; i++) g.after(from + (secs * i) / 40, () => { g.stage.fade = i / 40; });
  }

  private endLeave(): void {
    const g = this.g, gp = g.gate.group.position;
    g.mode = 'end'; g.frozen = true;
    g.gateOpen = 1;
    g.sfx.ignite();
    const n = g.companions.length;
    g.sfx.chord(n ? 'together' : 'alone');
    g.companions.forEach((c) => { c.state = 'exit'; });
    g.after(1.5, () => { g.autoWalk = { x: gp.x + 1.0, z: gp.z + 1.0 }; });
    this.fadeOut(5, 4);
    const E = TX.endings;
    const notAll = g.flags.has('efimLeft') || g.flags.has('veraLeft');
    const lines = n ? [...E.together.lines, ...(notAll ? [E.together.notAll] : []), ...E.together.tail] : E.alone.lines;
    g.after(9.5, () => this.finish(n ? 'together' : 'alone', n ? E.together.title : E.alone.title, lines));
  }

  private endBeacon(): void {
    const g = this.g;
    g.mode = 'end'; g.frozen = true;
    g.stage.scene.attach(g.lantern.group);
    g.lantern.group.position.set(g.bowl.x, 1.02, g.bowl.z);
    g.lantern.group.rotation.set(0, 0, 0);
    g.hero.carrying = false;
    g.lamp.wick = 1; g.lamp.oil = Math.max(g.lamp.oil, 30);
    g.gateOpen = 1;
    g.sfx.ignite(); g.sfx.chord('beacon');
    g.spirits.scatter();
    g.companions.forEach((c) => { c.state = 'exit'; });
    g.after(6, () => g.companions.forEach((c) => { c.h.root.visible = false; c.state = 'gone'; }));
    this.fadeOut(8, 4);
    const E = TX.endings.beacon;
    g.trace.beacon = true;
    g.after(12.5, () => this.finish('beacon', E.title, [...E.lines, g.companions.length ? E.withPeople : E.nobody, ...E.tail]));
  }

  private finish(id: string, title: string, lines: string[]): void {
    const g = this.g, tr = g.trace;
    if (!tr.endings.includes(id)) tr.endings.push(id);
    tr.runs++; tr.lastDeath = null;
    saveTrace(tr);
    g.hud.showHud(false);
    g.hud.screen({ title, sub: '', lines, mem: TX.endings.memory, button: TX.again, black: true, onButton: () => restart() });
  }

  death(): void {
    const g = this.g, tr = g.trace, E = TX.endings.dead;
    g.sfx.death();
    g.stage.shake = 0.5; g.chroma = 1;
    this.fadeOut(1.2, 2.2);
    tr.runs++; tr.lastDeath = { x: g.pos.x, z: g.pos.z };
    saveTrace(tr);
    g.after(4, () => {
      g.hud.showHud(false);
      g.hud.screen({ title: E.title, sub: '', lines: E.lines, button: TX.again, black: true, onButton: () => restart() });
    });
  }
}

/** Начать заново: main.ts пересобирает игру на месте и сразу запускает вступление. */
export function restart(): void { restartHook(); }
let restartHook: () => void = () => {};
export function onRestart(fn: () => void): void { restartHook = fn; }
