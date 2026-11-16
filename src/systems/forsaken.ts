// Брошенные: тех, кому ты отказал, тьма забирает, когда ты уходишь.
// Издалека слышен крик. Вернёшься — людей нет: кости на их месте, над костями стоят тени и зовут.
// Родители зовут Тёму: идёт с тобой — он оглядывается и отстаёт от света.
import { Group } from 'three';
import { Voice } from '../audio/sfx';
import { damp } from '../core/rng';
import { TX } from '../data/texts';
import { T } from '../data/tuning';
import type { Game } from '../scenes/game';
import { Human } from '../view/human';
import { makeBones } from '../view/props';
import { Spirit } from '../view/spirit';

type Who = 'efim' | 'family' | 'mila';
interface Ghost { v: Spirit; x: number; z: number; burn: number; gone: boolean; voice: Voice }
interface Case {
  id: Who; x: number; z: number;
  state: 'none' | 'taken' | 'quiet';          // quiet — тени выжжены светом, остались кости
  alone: number;                               // сколько секунд они уже одни в темноте
  ghosts: Ghost[]; bones: Group[];
  callT: number; seen: boolean; calls: number; warned: boolean;
}

export class Forsaken {
  readonly cases: Case[];
  constructor(private g: Game) {
    const mk = (id: Who, x: number, z: number): Case => ({ id, x, z, state: 'none', alone: 0, ghosts: [], bones: [], callT: 2, seen: false, calls: 0, warned: false });
    this.cases = [mk('efim', g.npcs.efim.x, g.npcs.efim.z), mk('family', g.family.x, g.family.z), mk('mila', g.mila.x, g.mila.z)];
  }

  /** Их бросили, и они всё ещё сидят там. */
  private left(c: Case): boolean {
    const g = this.g;
    if (c.id === 'efim') return g.npcs.efim.state === 'left';
    if (c.id === 'family') return g.family.state === 'left' || g.family.state === 'boy';
    return g.mila.state === 'left';
  }
  /** Тёма идёт с тобой и слышит. */
  private boyHears(): boolean { const b = this.g.npcs.boy; return b.state === 'follow' || b.state === 'camp'; }

  update(dt: number, t: number): void {
    const g = this.g, F = T.forsaken;
    for (const c of this.cases) {
      const d = g.dist(c.x, c.z);
      if (c.state === 'none') {
        if (!this.left(c)) { c.alone = 0; continue; }
        // уходишь — и видно, что без тебя здесь не выживут
        if (!c.warned && d > 6.5) { c.warned = true; g.hud.hint(TX.forsaken.warn[c.id], 6); }
        c.alone = d > F.away ? c.alone + dt : Math.max(0, c.alone - dt);
        if (c.alone >= F.wait) this.take(c);
        continue;
      }
      // вернулся: тени проступают, поворачиваются к тебе и зовут; свет лампы их выжигает
      const near = d < F.near;
      let alive = 0;
      for (const gh of c.ghosts) {
        if (gh.gone) continue;
        const gd = g.dist(gh.x, gh.z);
        const lit = g.lamp.lit && g.lamp.oil > 0 && gd < g.radius * 0.72;
        gh.burn = lit ? gh.burn + dt * F.burn : Math.max(0, gh.burn - dt * 0.3);
        gh.v.alpha = damp(gh.v.alpha, near ? 0.62 : 0, 1.6, dt);
        gh.v.burn = Math.min(1, gh.burn); gh.v.agitation = Math.min(1, gh.burn * 1.5); gh.v.face = 0.07;
        gh.v.group.rotation.y = Math.atan2(g.pos.x - gh.x, g.pos.z - gh.z);
        gh.v.update(t);
        if (gh.burn >= 1) {
          gh.gone = true; gh.v.alpha = 0; gh.v.update(t); g.phantoms.unpin(gh.x, gh.z);
          g.sfx.dark('sizzle', 0, 0.8); g.hud.whisper(TX.forsaken.last[c.id], Math.random(), `${gh.voice}-ghost`);
          continue;
        }
        alive++;
      }
      if (c.state === 'taken' && !alive) {
        c.state = 'quiet'; g.flags.add(`${c.id}Quiet`);
        g.hud.hint(TX.forsaken.quiet, 6);
        continue;
      }
      if (c.state !== 'taken' || !near) continue;
      if (!c.seen && d < 7.5) { c.seen = true; g.hud.hint(TX.forsaken.found[c.id](this.name(c)), 8); g.sfx.dark('moan', 0, 0.7); g.stage.shake = Math.max(g.stage.shake, 0.25); }
      if ((c.callT -= dt) > 0) continue;
      c.callT = 4.2 + Math.random() * 2.6;
      this.call(c);
    }
  }

  private name(c: Case): string {
    const f = this.g.flags;
    if (c.id === 'efim') return f.has('efimName') ? TX.efim.realName : TX.efim.name;
    if (c.id === 'mila') return f.has('milaName') ? TX.mila.realName : TX.mila.name;
    return '';
  }

  /** Тени зовут: шёпот на экране, голос из темноты. Тёма идёт на голос матери. */
  private call(c: Case): void {
    const g = this.g, live = c.ghosts.filter((gh) => !gh.gone);
    if (!live.length) return;
    const gh = live[c.calls % live.length];
    const boy = c.id === 'family' && this.boyHears();
    const lines = c.id === 'family' ? (boy ? TX.forsaken.callBoy : TX.forsaken.calls.family) : TX.forsaken.calls[c.id];
    const side = (gh.x - g.pos.x) * g.stage.right.x + (gh.z - g.pos.z) * g.stage.right.z;
    g.hud.whisper(lines[c.calls % lines.length], side > 0 ? 0.8 : 0.2, `${gh.voice}-ghost`);
    g.sfx.whisper(Math.max(-1, Math.min(1, side / 5)), 0.2);
    g.sfx.voice(gh.voice);
    c.calls++;
    if (boy) this.lure();
  }

  /** Тёма слышит своих: оглядывается и отстаёт. Удержать его можно только светом. */
  private lure(): void {
    const g = this.g, b = g.npcs.boy;
    if (b.state !== 'follow') return;
    b.pace = T.forsaken.lurePace;
    if (!g.flags.has('lureHint')) {
      g.flags.add('lureHint');
      g.story.line(TX.family.boy, TX.forsaken.boyHears, 'boy', 4);
      g.after(4.5, () => g.hud.hint(TX.forsaken.lureHint, 8));
    } else if (Math.random() < 0.5) g.story.line(TX.family.boy, TX.forsaken.boyAgain[Math.floor(Math.random() * TX.forsaken.boyAgain.length)], 'boy', 3);
    g.after(T.forsaken.lure, () => { b.pace = 1; });
  }

  /** Тьма пришла за ними. Ты далеко — слышен только крик. */
  private take(c: Case, silent = false): void {
    const g = this.g, st = g.style;
    c.state = 'taken';
    const bodies: [Human, Voice, number][] = [];
    if (c.id === 'efim') {
      bodies.push([g.npcs.efim.h, 'efim', 0.74]);
      g.npcs.efim.state = 'gone';
      g.campfire.lit = false;
    } else if (c.id === 'family') {
      bodies.push([g.family.father, 'father', 0.78], [g.family.mother, 'mother', 0.7]);
      const b = g.npcs.boy;
      if (b.state === 'wait' || (silent && g.flags.has('boyTaken'))) { bodies.push([b.h, 'boy', 0.5]); b.state = 'gone'; g.flags.add('boyTaken'); }
      g.family.fire.lit = false;
    } else {
      bodies.push([g.mila.h, 'mila', 0.44]);
      g.mila.state = 'lost'; g.mila.ember.visible = false;
      g.flags.add('milaLost');
    }
    bodies.forEach(([h, voice, tall], i) => {
      const x = h.root.position.x, z = h.root.position.z;
      h.root.visible = false;
      const bones = makeBones(i * 7 + c.x, tall < 0.6);
      bones.position.set(x, 0, z); bones.rotation.y = i * 2.1 + c.z;
      g.stage.scene.add(bones);
      c.bones.push(bones);
      const v = new Spirit(st, (i * 0.37 + c.x * 0.013) % 1, tall, 0.05);
      v.group.position.set(x, 0, z);
      v.alpha = 0; v.update(0);
      g.stage.scene.add(v.group);
      c.ghosts.push({ v, x, z, burn: 0, gone: false, voice });
      g.phantoms.pin(x, z, 2.42 * tall * 0.97);                 // глаза над костями видны из темноты
    });
    g.flags.add(`${c.id}Taken`);
    if (silent) return;
    // крик издалека, с той стороны
    const side = (c.x - g.pos.x) * g.stage.right.x + (c.z - g.pos.z) * g.stage.right.z;
    const pan = Math.max(-0.9, Math.min(0.9, side / 12));
    bodies.forEach(([, voice], i) => g.after(i * 0.55, () => g.sfx.farScream(voice, pan)));
    g.stage.shake = Math.max(g.stage.shake, 0.2); g.chroma = Math.max(g.chroma, 0.5);
    g.hud.marker(`scream-${c.id}`, c.x, c.z, TX.mark.scream, 7);
    g.after(0.9, () => g.hud.hint(TX.forsaken.scream[c.id](this.name(c)), 7));
    g.after(0.6 + bodies.length * 0.55 + 1.6, () => g.hud.whisper(TX.forsaken.cut));
    // Тёма слышит, как кричат его родные
    if (c.id === 'family' && this.boyHears()) {
      g.after(2.8, () => g.story.line(TX.family.boy, TX.forsaken.boyScream, 'boy', 5));
      const b = g.npcs.boy;
      if (b.state === 'follow') { b.pace = T.forsaken.lurePace; g.after(T.forsaken.lure, () => { b.pace = 1; }); }
    } else {
      const rest = g.companions.filter((n) => n.state === 'follow');
      if (rest.length) g.after(3.4, () => { const r = rest[0]; if (r.state === 'follow') g.story.line(g.story.who(r), TX.forsaken.react, r.id, 4); });
    }
  }

  /** Сколько людей тьма забрала из брошенных (для счёта и страха). */
  count(): number {
    const f = this.g.flags;
    return (f.has('efimTaken') ? 1 : 0) + (f.has('familyTaken') ? (f.has('boyTaken') ? 4 : 3) : 0);
  }
  /** Для точки возврата: кого уже забрали. */
  takenIds(): Who[] { return this.cases.filter((c) => c.state !== 'none').map((c) => c.id); }
  /** Восстановить после возврата к огню: людей нет, кости и тени на месте — без крика. */
  restore(ids: Who[]): void {
    for (const c of this.cases) if (ids.includes(c.id) && c.state === 'none') this.take(c, true);
  }
}
