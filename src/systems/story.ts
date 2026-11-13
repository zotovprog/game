// Сюжет глубины: вступление, встречи и выборы, ловушки, удары, Врата, финалы и «след» прошлых попыток.
import { Group } from 'three';
import { Voice } from '../audio/sfx';
import { saveTrace } from '../core/save';
import { TX } from '../data/texts';
import { T } from '../data/tuning';
import type { Game, Npc } from '../scenes/game';
import { Human } from '../view/human';
import { Candle, Fire } from '../view/props';
import { Choice } from '../ui/hud';

type Stayed = 'self' | 'efim' | 'vera' | 'trace' | null;

export class Story {
  private ownGhost: { x: number; z: number } | null = null;
  private keeper: { x: number; z: number } | null = null;
  private holder: Group | null = null;       // на чьих руках Мила
  private shadeT = 0;                        // сколько тень уже идёт за тобой

  constructor(private g: Game) {}

  private name(id: 'efim' | 'vera' | 'mila' | 'family'): string {
    return this.g.flags.has(`${id}Name`) ? TX[id].realName : TX[id].name;
  }
  private line(who: string, text: string, voice: Voice, secs = 4.5): void {
    this.g.hud.hint(`${who}: «${text}»`, secs);
    this.g.sfx.voice(voice);
  }

  // ---------- память пещеры
  applyTrace(): void {
    const g = this.g, tr = g.trace;
    if (tr.lastDeath && g.grid.isFloor(tr.lastDeath.x, tr.lastDeath.z)) {
      const [x, z] = g.grid.snap(tr.lastDeath.x, tr.lastDeath.z, 0.5);
      g.dark.placeStill('self', x, z);
      g.addFlask(...g.grid.snap(x + 0.9, z + 0.6, 0.4), true);
      this.ownGhost = { x, z };
    }
    if (tr.beacon) {
      g.lightBowl(g.style.lamp);
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
    const seen = g.trace.endings.length ? `Финалы: ${g.trace.endings.length} из 4` : '';
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
    g.setStood();
    g.takeLamp();
    g.flags.add('firstDark');
    g.dark.setCount(T.spirits.count);
  }

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
    if (g.lamp.oil <= T.lamp.brazierCost + 1) { g.hud.hint(TX.noOil, 3); return; }
    g.lamp.oil -= T.lamp.brazierCost;
    f.lit = true;
    g.sfx.ignite();
    g.dark.scatter();
    if (!g.flags.has('brazier')) { g.flags.add('brazier'); g.after(1.5, () => g.hud.hint(TX.brazier, 8)); }
  }

  pickToy(): void {
    const g = this.g;
    g.toy.taken = true; g.toy.g.visible = false;
    g.flags.add('toy');
    g.sfx.pickup();
    g.hud.say('', TX.toy, () => {});
  }

  // ---------- те, кому можно дать огня
  private giveCandle(n: Npc, cost: number): void {
    const g = this.g;
    g.lamp.oil -= cost;
    g.chroma = 0.5;
    n.candle = new Candle(g.style);
    n.h.attach(n.candle.group);
    n.candle.group.position.set(0, -0.02, 0);
    n.h.setPose('stand');
    n.state = 'follow';
    g.companions.push(n);
    g.sfx.ignite();
  }

  talkEfim(): void {
    const g = this.g, n = g.npcs.efim, tx = TX.efim;
    n.dir = Math.atan2(g.pos.x - n.x, g.pos.z - n.z);
    g.sfx.voice('efim');
    const ask = () => g.hud.choose(this.name('efim'), tx.talk[2], [{ label: tx.yes, note: tx.yesNote }, { label: tx.no, note: tx.noNote }], (i) => {
      g.sfx.voice('efim');
      if (i === 0) {
        if (g.lamp.oil < T.lamp.giveCost + 4) { g.hud.say(this.name('efim'), [tx.poor], () => {}); return; }
        this.giveCandle(n, T.lamp.giveCost);
        g.flags.add('efimName'); g.flags.add('efimSaved');
        g.hud.say(tx.realName, tx.accepted, () => {});
      } else {
        n.state = 'left'; g.flags.add('efimLeft'); g.flags.add('efimName');
        g.hud.say(tx.name, tx.refused, () => {});
      }
    });
    if (g.flags.has('efimMet')) ask(); else g.hud.say(tx.name, tx.talk.slice(0, 2), ask);
    g.flags.add('efimMet');
  }

  talkVera(): void {
    const g = this.g, n = g.npcs.vera, tx = TX.vera;
    n.dir = Math.atan2(g.pos.x - n.x, g.pos.z - n.z);
    g.sfx.voice('vera');
    g.flags.add('veraMet');
    // ты пришёл с её дочерью на руках
    if (g.carrying) {
      g.flags.add('veraName'); g.flags.add('milaName');
      g.hud.say(tx.realName, tx.reunionAsk, () => g.hud.choose(tx.realName, '', [{ label: tx.yes, note: tx.yesNote }, { label: TX.efim.no, note: 'нести девочку самому' }], (i) => {
        g.sfx.voice('vera');
        if (i === 0 && g.lamp.oil >= T.lamp.giveCost + 4) {
          this.giveCandle(n, T.lamp.giveCost);
          this.carryMila(n.h, 'vera');
          g.flags.add('veraSaved');
          g.hud.say(tx.realName, [tx.reunion[1]], () => {});
        } else {
          n.state = 'left'; g.flags.add('veraWait');
          g.hud.say(tx.realName, [i === 0 ? tx.poor : tx.reunionNo], () => {});
        }
      }));
      return;
    }
    const ask = () => g.hud.choose(this.name('vera'), tx.talk[2], [{ label: tx.yes, note: tx.yesNote }, { label: tx.no, note: tx.noNote }], (i) => {
      g.sfx.voice('vera');
      if (i === 0 && g.lamp.oil >= T.lamp.giveCost + 4) {
        this.giveCandle(n, T.lamp.giveCost);
        g.flags.add('veraName'); g.flags.add('veraSaved');
        g.hud.say(tx.realName, tx.accepted, () => {});
      } else {
        g.flags.add('veraLeft');
        g.hud.say(tx.name, i === 0 ? [tx.poor, tx.refused[1]] : tx.refused, () => { n.state = 'walkoff'; });
      }
    });
    g.hud.say(tx.name, tx.talk.slice(0, 2), ask);
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

  // ---------- костёр для многих
  talkFamily(): void {
    const g = this.g, f = g.family, tx = TX.family;
    g.sfx.voice('father');
    const share = Math.max(12, Math.round(g.lamp.oil * T.lamp.familyShare));
    const ask = () => g.hud.choose(tx.mother, tx.motherLine, [
      { label: tx.fire, note: tx.fireNote }, { label: tx.boyOpt, note: tx.boyNote }, { label: tx.no, note: tx.noNote },
    ], (i) => {
      if (i === 0) {
        if (g.lamp.oil < share + 4) { g.sfx.voice('father'); g.hud.say(tx.realName, [tx.poor], () => {}); return; }
        g.lamp.oil -= share;
        f.fire.lit = true; f.state = 'fire';
        g.flags.add('familyFire');
        g.sfx.ignite(); g.dark.scatter(); g.sfx.voice('father');
        g.hud.say(tx.realName, tx.fireDone, () => { g.after(0.4, () => this.line(tx.boy, tx.barks[0], 'boy')); });
      } else if (i === 1) {
        if (g.lamp.oil < T.lamp.boyCost + 4) { g.sfx.voice('father'); g.hud.say(tx.realName, [tx.poor], () => {}); return; }
        f.state = 'boy';
        this.giveCandle(g.npcs.boy, T.lamp.boyCost);
        g.flags.add('familyBoy');
        g.sfx.voice('mother');
        g.hud.say(tx.mother, tx.boyDone, () => {});
      } else {
        f.state = 'left'; g.flags.add('familyLeft');
        g.sfx.voice('father');
        g.hud.say(tx.realName, [tx.refused[0]], () => { g.after(0.3, () => this.line(tx.mother, tx.refused[1], 'mother')); });
      }
    });
    g.flags.add('familyMet'); g.flags.add('familyName');
    g.hud.say(tx.name, tx.talk, () => { g.sfx.voice('mother'); ask(); });
  }

  // ---------- ребёнок на руках
  private carryMila(by: Human, who: 'carried' | 'vera'): void {
    const g = this.g, m = g.mila;
    this.holder?.removeFromParent();
    this.holder = new Group();
    this.holder.position.set(-0.14, 0.55, 0.26);
    this.holder.rotation.y = 0.5;
    this.holder.scale.setScalar(1 / by.root.scale.x);
    m.h.root.position.set(0, 0, 0); m.h.root.rotation.y = 0;
    this.holder.add(m.h.root);
    by.body.add(this.holder);
    m.state = who; m.alone = 0;
    m.ember.visible = false;
  }

  talkMila(): void {
    const g = this.g, tx = TX.mila;
    g.sfx.voice('mila');
    g.flags.add('milaMet');
    g.hud.say(tx.name, tx.talk, () => g.hud.choose(tx.name, tx.talk[1], [{ label: tx.lie }, { label: tx.truth }], (a) => {
      g.sfx.voice('mila');
      g.flags.add(a === 0 ? 'milaLie' : 'milaTruth');
      g.hud.say(tx.name, [a === 0 ? tx.afterLie : tx.afterTruth], () => g.hud.choose(tx.name, '', [
        { label: tx.carry, note: tx.carryNote }, { label: tx.leave, note: tx.leaveNote },
      ], (i) => {
        g.sfx.voice('mila');
        if (i === 0) {
          this.carryMila(g.hero, 'carried');
          g.flags.add('milaName'); g.flags.add('milaSaved');
          g.hud.hint(tx.carried, 5);
        } else {
          g.mila.state = 'left'; g.flags.add('milaLeft');
          g.hud.say(tx.name, tx.left, () => {});
        }
      }));
    }));
  }

  /** Мать нашла дочь: Вера идёт с тобой и видит Милу. */
  private reunion(): void {
    const g = this.g, tx = TX.vera;
    g.flags.add('reunion'); g.flags.add('milaMet'); g.flags.add('milaName'); g.flags.add('milaSaved');
    g.sfx.voice('vera');
    g.hud.say(tx.realName, [tx.reunion[0]], () => {
      g.sfx.voice('mila');
      this.carryMila(g.npcs.vera.h, 'vera');
      g.hud.say(tx.realName, [tx.reunion[1]], () => {});
    });
  }

  dropMila(): void {
    const g = this.g, m = g.mila;
    this.holder?.removeFromParent(); this.holder = null;
    [m.x, m.z] = g.grid.snap(g.pos.x + g.face.x * 0.7, g.pos.z + g.face.z * 0.7, 0.4);
    m.h.root.position.set(m.x, 0, m.z);
    g.stage.scene.add(m.h.root);
    m.state = 'down'; m.alone = 0;
    this.line(TX.mila.realName, TX.mila.down, 'mila', 3);
  }
  liftMila(): void { this.carryMila(this.g.hero, 'carried'); this.g.sfx.voice('mila'); }

  // ---------- тень просит вывести её
  talkShade(): void {
    const g = this.g, tx = TX.shade;
    g.sfx.voice('shade');
    g.flags.add('shadeMet');
    g.hud.say(tx.name, tx.talk, () => this.shadeChoice(false));
  }
  private shadeChoice(asked: boolean): void {
    const g = this.g, sh = g.shade, tx = TX.shade;
    const opts: Choice[] = [{ label: tx.yes, note: tx.yesNote }];
    if (g.flags.has('toy') && !asked) opts.push({ label: tx.ask, note: tx.askNote });
    opts.push({ label: tx.no, note: tx.noNote });
    g.hud.choose(tx.name, '', opts, (i) => {
      const pick = opts[i].label;
      g.sfx.voice('shade');
      if (pick === tx.ask) {
        g.hud.say(tx.name, sh.isTrue ? tx.nameTrue : tx.nameFalse, () => { if (!sh.isTrue) g.hud.hint(tx.nameFalseHint, 5); this.shadeChoice(true); });
      } else if (pick === tx.yes) {
        sh.state = 'follow'; g.flags.add('shadeTaken');
        g.hud.say(tx.name, [tx.accepted], () => {});
      } else if (sh.isTrue) {
        sh.state = 'left'; g.flags.add('shadeLeft');
        g.hud.say(tx.name, tx.refusedTrue, () => { g.sfx.dark('cry', 0, 1); });
      } else {
        g.hud.say(tx.name, [tx.refusedFalse], () => {
          g.flags.add('shadeDodged');
          this.screamer(sh.x, sh.z);
          sh.state = 'gone'; sh.v.alpha = 0; sh.v.update(0);
          g.lamp.oil = Math.max(2, g.lamp.oil - 6);
        });
      }
    });
  }
  /** Ложная тень дождалась своего. */
  private betray(): void {
    const g = this.g, sh = g.shade;
    if (sh.state !== 'follow' || sh.isTrue) return;
    sh.state = 'left';                           // чтобы не сработало дважды
    this.line(TX.shade.name, TX.shade.betray, 'shade', 3);
    for (let i = 0; i <= 6; i++) g.after(0.9 + i * 0.05, () => { g.gust = i / 6; });
    g.after(1.5, () => {
      this.screamer(sh.x, sh.z);
      sh.state = 'gone'; sh.v.alpha = 0; sh.v.update(0);
      g.flags.add('shadeLiar');
      g.lamp.oil = Math.max(3, g.lamp.oil * 0.5);
      g.dark.setCount(g.dark.count + 1);
    });
    g.after(3, () => { g.gust = 0; g.sfx.relight(); });
  }

  /** Скример: визг, лицо во весь экран и бросок из темноты. */
  private screamer(x: number, z: number): void {
    const g = this.g;
    g.sfx.scream(); g.hud.scream();
    g.stage.shake = 1; g.chroma = 1;
    g.dark.lunge(x, z);
  }

  /** То, что происходит само, пока ты идёшь. */
  drama(dt: number): void {
    const g = this.g, m = g.mila, sh = g.shade;
    // Мила на земле: без света она долго не выдержит
    if (m.state === 'down') {
      const lit = g.dist(m.x, m.z) < g.radius * 0.95 || g.braziers.some((b) => b.f.lit && Math.hypot(b.x - m.x, b.z - m.z) < T.fire.radius);
      const was = m.alone;
      m.alone = lit ? Math.max(0, m.alone - dt * 2) : m.alone + dt;
      if (was < 0.8 && m.alone >= 0.8) { this.line(TX.mila.realName, TX.mila.alone, 'mila', 4); g.sfx.dark('cry', 0, 1); }
      if (m.alone >= T.mila.alone) {
        m.state = 'lost'; m.h.root.visible = false;
        g.flags.add('milaLost');
        g.sfx.snuff(); g.sfx.touch(); g.chroma = 0.8;
        g.after(1.5, () => g.hud.hint(TX.mila.lost, 6));
      }
    }
    // мать, идущая с тобой, узнаёт дочь издалека
    if (m.state === 'wait' && g.npcs.vera.state === 'follow' && !g.flags.has('reunion') && g.dist(m.x, m.z) < 4.2) this.reunion();
    // тень: яркий свет жжёт её
    if (sh.state === 'follow') {
      this.shadeT += dt;
      sh.hurt = g.lamp.wick > T.shade.hurtWick ? sh.hurt + dt : Math.max(0, sh.hurt - dt * 0.6);
      if (sh.hurt > T.shade.warn && !sh.warned) { sh.warned = true; this.line(TX.shade.name, TX.shade.hurt, 'shade', 3.5); }
      if (sh.hurt < 0.5) sh.warned = false;
      if (sh.hurt > T.shade.burn) {
        sh.state = 'gone'; sh.v.alpha = 0; sh.v.update(0);
        g.flags.add(sh.isTrue ? 'shadeBurned' : 'shadeDodged');
        g.sfx.snuff();
        g.hud.hint(TX.shade.burned, 6);
      } else if (!sh.isTrue && this.shadeT > 75) this.betray();
    }
  }

  /** Спутники подают голос. */
  bark(r: number): void {
    const g = this.g;
    const who: [string, string[], Voice][] = [];
    for (const n of g.companions) {
      if (n.state !== 'follow') continue;
      if (n.id === 'boy') who.push([TX.family.boy, TX.family.barks, 'boy']);
      else who.push([TX[n.id].realName, TX[n.id].barks, n.id]);
    }
    if (g.mila.state === 'carried' || g.mila.state === 'vera') who.push([TX.mila.realName, TX.mila.barks, 'mila']);
    if (!who.length) return;
    const [name, lines, voice] = who[Math.floor(r * who.length)];
    this.line(name, lines[Math.floor(((r * 97) % 1) * lines.length)], voice, 5);
  }

  // ---------- зоны
  zones(): void {
    const g = this.g;
    for (const z of g.def.zones) {
      if (g.flags.has(z.id) || g.dist(z.at[0], z.at[1]) > z.r) continue;
      g.flags.add(z.id);
      this.zone(z.id);
    }
    if (this.ownGhost && !g.flags.has('ownGhost') && g.dist(this.ownGhost.x, this.ownGhost.z) < g.radius + 0.5) {
      g.flags.add('ownGhost');
      g.sfx.whisper(0, 0.1);
      g.hud.say('', TX.ownGhost, () => {});
    }
    if (this.keeper && !g.flags.has('keeper') && g.dist(this.keeper.x, this.keeper.z) < 2.2) {
      g.flags.add('keeper');
      g.hud.hint(TX.keeper, 5);
    }
    const want = !g.lamp.held || !g.flags.has('firstDark') ? 0 : T.spirits.count + (g.flags.has('longDark') ? 2 : 0);
    if (g.dark.count < want) g.dark.setCount(want);
  }

  private zone(id: string): void {
    const g = this.g;
    if (id === 'firstDark') {
      g.after(2.5, () => g.hud.hint(TX.firstDark[0], 4.5));
      g.after(8, () => g.hud.hint(TX.firstDark[1], 5));
    } else if (id === 'draft') {
      g.hud.hint(TX.draft, 8);
    } else if (id === 'seeWisp') {
      g.hud.hint(TX.seeWisp, 5);
    } else if (id === 'peek') {
      // из-за колонны: лицо бросается и сгорает у самого света
      const ax = g.pos.x - g.face.z * 2 + g.face.x * (g.radius + 3), az = g.pos.z + g.face.x * 2 + g.face.z * (g.radius + 3);
      g.dark.lunge(ax, az); g.sfx.stinger(); g.stage.shake = 0.6; g.chroma = 0.8;
    } else if (id === 'water') {
      g.hud.hint(TX.water, 5);
    } else if (id === 'longDark') {
      g.hud.hint(TX.longDark, 5);
      const v = g.npcs.vera;
      if (v.state === 'wait' && g.flags.has('veraMet')) { g.flags.add('veraLeft'); v.state = 'walkoff'; }
    } else if (id === 'gust') {
      if (g.shade.state === 'follow' && !g.shade.isTrue) this.betray(); else this.gustScare();
    } else if (id === 'named') {
      this.returned();
    } else if (id === 'gateHall') {
      g.hud.hint(TX.gateHall, 4);
      if (g.shade.state === 'follow' && !g.shade.isTrue) { this.betray(); return; }
      let k = 0;
      for (const n of g.companions) {
        const [who, text, voice]: [string, string, Voice] = n.id === 'boy' ? [TX.family.boy, TX.family.gate, 'boy'] : [TX[n.id].realName, TX[n.id].gate, n.id];
        g.after(3 + k++ * 4, () => this.line(who, text, voice));
      }
      if (g.shade.state === 'follow') g.after(3 + k * 4, () => this.line(TX.shade.name, TX.shade.gate, 'shade'));
    }
  }

  /** Удар: сквозняк задувает лампу, лица смыкаются, пламя возвращается. */
  private gustScare(): void {
    const g = this.g;
    g.sfx.gust();
    g.hud.hint(TX.gust, 2.5);
    for (let i = 0; i <= 6; i++) g.after(0.25 + i * 0.05, () => { g.gust = i / 6; });
    g.after(1.3, () => {
      g.sfx.stinger(); g.stage.shake = 0.8; g.chroma = 1;
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + 0.7; g.dark.lunge(g.pos.x + Math.cos(a) * 5, g.pos.z + Math.sin(a) * 5); }
    });
    g.after(2.6, () => { g.gust = 0; g.sfx.relight(); g.dark.scatter(); g.lamp.oil = Math.max(3, g.lamp.oil - 3); });
  }

  /** Расплата: те, мимо кого ты прошёл, возвращаются. Обычный свет их не держит. */
  private returned(): void {
    const g = this.g;
    let delay = 0.5;
    const come = (kind: 'efim' | 'vera' | 'family', lines: string[]) => {
      const at = delay; delay += 13;
      g.after(at, () => {
        if (g.mode !== 'play') return;
        g.dark.spawnNamed(kind, g.world());
        g.sfx.whisper(-g.face.x > 0 ? 0.8 : -0.8, 0.2); g.sfx.touch();
        g.chroma = 0.8; g.stage.shake = 0.35;
        lines.forEach((l, i) => g.after(0.4 + i * 2.6, () => g.hud.whisper(l)));
      });
    };
    if (g.flags.has('efimLeft')) come('efim', TX.efim.ghost);
    if (g.flags.has('veraLeft')) come('vera', TX.vera.ghost);
    if (g.flags.has('familyLeft')) come('family', TX.family.ghost);
    if (g.flags.has('familyBoy')) come('family', TX.family.ghostBoy);
    if (g.flags.has('milaLeft')) g.after(delay, () => { g.hud.whisper(TX.mila.waited); g.sfx.dark('cry', 0.5, 1); });
  }

  /** Ложные огни гаснут, когда подходишь; первый — со скримером. */
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
        if (first) this.screamer(ax, az);
        else { g.dark.lunge(ax, az); g.sfx.stinger(); g.stage.shake = 0.6; g.chroma = 0.8; }
      });
      g.dark.setCount(g.dark.count + 1);
      if (first) g.after(4, () => g.hud.hint(TX.wispTrap, 8));
    }
  }

  // ---------- Врата: кому остаться
  bowl(): void {
    const g = this.g, tx = TX.bowl, lit = g.beacon !== null;
    const vera = g.npcs.vera, efim = g.npcs.efim;
    g.hud.say('', lit ? tx.lit : tx.empty, () => {
      const opts: Choice[] = [];
      if (lit) opts.push({ label: tx.leaveLit });
      else {
        opts.push({ label: tx.self, note: tx.selfNote });
        if (efim.state === 'follow') opts.push({ label: tx.efim, note: tx.askNote });
        if (vera.state === 'follow' && g.mila.state !== 'vera') opts.push({ label: tx.vera, note: tx.askNote });
        opts.push({ label: tx.leave, note: tx.leaveNote });
      }
      opts.push({ label: tx.back });
      g.hud.choose('', '', opts, (i) => {
        const pick = opts[i].label;
        if (pick === tx.self) this.endStay();
        else if (pick === tx.efim) g.hud.say(TX.efim.realName, TX.efim.stay, () => this.endLeave('efim'));
        else if (pick === tx.vera) g.hud.say(TX.vera.realName, TX.vera.stay, () => this.endLeave('vera'));
        else if (pick === tx.leave) this.endLeave(null);
        else if (pick === tx.leaveLit) this.endLeave('trace');
      });
    });
  }

  private fadeOut(from: number, secs: number): void {
    const g = this.g;
    for (let i = 0; i <= 40; i++) g.after(from + (secs * i) / 40, () => { g.stage.fade = i / 40; });
  }

  /** Герой уходит в щель. stayed — кто держит свет в чаше (если кто-то держит). */
  private endLeave(stayed: Stayed): void {
    const g = this.g, gp = g.gate.group.position;
    g.mode = 'end'; g.frozen = true;
    g.gateOpen = 1;
    g.sfx.ignite();
    if (stayed === 'efim' || stayed === 'vera') {
      g.sfx.voice(stayed);
      g.npcs[stayed].state = 'stay';
      g.after(1.2, () => g.lightBowl(g.style.fire));
    }
    for (const c of g.companions) if (c.state === 'follow') c.state = 'exit';
    g.after(1.5, () => { g.autoWalk = { x: gp.x + 1.0, z: gp.z + 1.0 }; });
    this.fadeOut(5.5, 4);
    g.after(10, () => this.finish(stayed));
  }

  /** Герой остаётся маяком. */
  private endStay(): void {
    const g = this.g;
    g.mode = 'end'; g.frozen = true;
    g.stage.scene.attach(g.lantern.group);
    g.lantern.group.position.set(g.bowl.x, 1.02, g.bowl.z);
    g.lantern.group.rotation.set(0, 0, 0);
    g.hero.carrying = false;
    g.lamp.wick = 1; g.lamp.oil = Math.max(g.lamp.oil, 30);
    g.gateOpen = 1;
    g.sfx.ignite();
    g.dark.scatter();
    for (const c of g.companions) if (c.state === 'follow') c.state = 'exit';
    g.after(6.5, () => g.companions.forEach((c) => { c.h.root.visible = false; }));
    this.fadeOut(8, 4);
    g.after(12.5, () => this.finish('self'));
  }

  /** Итог: кто вышел, кто остался. Пещера считает всех — и тех, кого ты не нашёл. */
  private finish(stayed: Stayed): void {
    const g = this.g, tr = g.trace, E = TX.endings, W = E.who, f = g.flags;
    const lines: string[] = [];
    let out = 0, below = 0;
    const heroOut = stayed !== 'self';
    const beacon = stayed !== null;
    if (heroOut) out++; else below++;
    const efim = g.npcs.efim, vera = g.npcs.vera, boy = g.npcs.boy, m = g.mila, sh = g.shade;
    // Ефим
    if (stayed === 'efim') { lines.push(W.efimStay); below++; }
    else if (efim.state === 'exit') { lines.push(W.efimOut); out++; }
    else { below++; if (f.has('efimLeft')) lines.push(W.efimLeft); }
    // Вера
    if (stayed === 'vera') { lines.push(W.veraStay); below++; }
    else if (vera.state === 'exit') { lines.push(W.veraOut); out++; }
    else { below++; if (f.has('veraWait')) lines.push(W.veraWait); else if (f.has('veraLeft')) lines.push(W.veraLeft); }
    // Мила
    const adultOut = efim.state === 'exit' || vera.state === 'exit';
    if (m.state === 'vera') { lines.push(W.milaOutVera); out++; }
    else if (m.state === 'carried' && (heroOut || adultOut)) { lines.push(heroOut ? W.milaOut : W.milaOutVera.replace('у матери', 'у чужих людей')); out++; }
    else if (m.state === 'carried') { lines.push(W.milaStay); below++; }
    else { below++; if (m.state === 'lost' || m.state === 'down') lines.push(W.milaLost); else if (f.has('milaLeft')) lines.push(W.milaLeft); }
    // семья
    if (g.family.state === 'fire') { if (beacon) { lines.push(W.familyOut); out += 4; } else { lines.push(W.familyFire); below += 4; } }
    else if (g.family.state === 'boy') {
      if (boy.state === 'exit') { lines.push(W.boyOut); out++; } else below++;
      lines.push(W.familyLeftBoy); below += 3;
    } else { below += 4; if (f.has('familyLeft')) lines.push(W.familyLeft); }
    // тень
    if (sh.state === 'follow' && sh.isTrue) { lines.push(W.shadeOut); out++; }
    else if (f.has('shadeLiar')) lines.push(W.shadeLiar);
    else if (f.has('shadeDodged')) lines.push(W.shadeDodged);
    else if (sh.isTrue) { below++; if (f.has('shadeBurned')) lines.push(W.shadeBurned); else if (f.has('shadeLeft')) lines.push(W.shadeLeft); }

    const kind = stayed === 'self' ? 'beacon' : stayed === 'efim' || stayed === 'vera' ? 'price' : out > 1 ? 'together' : 'alone';
    g.sfx.chord(kind === 'alone' ? 'alone' : kind === 'together' ? 'together' : 'beacon');
    if (!tr.endings.includes(kind)) tr.endings.push(kind);
    tr.runs++; tr.lastDeath = null; tr.beacon = beacon;
    saveTrace(tr);
    g.hud.showHud(false);
    g.hud.screen({ title: E[kind].title, sub: '', lines: [...E[kind].open, ...lines, E.tally(out, below)], mem: E.memory, button: TX.again, black: true, onButton: () => restart() });
  }

  death(): void {
    const g = this.g, tr = g.trace, E = TX.endings.dead;
    g.sfx.death(); g.sfx.scream(); g.hud.scream();
    g.stage.shake = 0.8; g.chroma = 1;
    this.fadeOut(0.9, 2.2);
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
