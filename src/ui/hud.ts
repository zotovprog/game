// Интерфейс поверх canvas: текст и явные кнопки. Стик появляется под пальцем в любом месте,
// действие и выбор — кнопки, фитиль — ползунок у правого края, реплики идут сами.
import { Input } from '../core/input';
import { TX } from '../data/texts';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, id = '', cls = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (id) e.id = id;
  if (cls) e.className = cls;
  return e;
};
export interface Choice { label: string; note?: string }

export class Hud {
  readonly area = el('div', 'area');
  readonly mark = el('div', 'mark');
  private hintEl = el('div', 'hint', 'fade hidden');
  private act = el('button', 'act', 'hidden');
  private dialog = el('div', 'dialog', 'hidden');
  private who = el('div', '', 'who');
  private txt = el('div', '', 'txt');
  private opts = el('div', '', 'opts');
  private hands = el('div', 'hands', 'fade hidden');
  private draft = el('div', 'draft', 'hidden');
  private speak = el('div', 'speak');
  private bPour = el('button', 'bPour');
  private bShield = el('button', 'bShield');
  private nextBtn = el('button', '', 'next');
  private marks = new Map<string, { el: HTMLElement; x: number; z: number; until: number }>();
  private overlay: HTMLElement | null = null;
  private hintTimer = 0;
  private queue: string[] = [];
  private lineT = 0;
  private onDone: (() => void) | null = null;
  private onChoice: ((i: number) => void) | null = null;
  private nChoices = 0;
  private shownAt = 0;
  private actText = '';
  input!: Input;
  onPause: (() => void) | null = null;

  constructor(private root: HTMLElement) {
    this.nextBtn.textContent = TX.next;
    this.nextBtn.addEventListener('click', () => this.input.press('Space'));
    this.dialog.append(this.who, this.txt, this.nextBtn, this.opts);
    // руки: раздуть сбитое пламя (кнопка есть, только когда надо) и ладонь (держать — прикрыть огонь)
    this.bPour.innerHTML = '<i></i><kbd>R</kbd><span></span>';
    this.bShield.innerHTML = '<i></i><kbd>Shift</kbd><span></span>';
    this.bPour.setAttribute('aria-label', TX.btnFan); this.bShield.setAttribute('aria-label', TX.btnShield);
    this.hands.append(this.bPour, this.bShield);
    const holdBtn = (b: HTMLElement, code: string) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* палец уже отпущен */ } this.input.hold(code, true); });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => this.input.hold(code, false));
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    holdBtn(this.bPour, 'KeyR'); holdBtn(this.bShield, 'ShiftLeft');
    const pauseBtn = el('button', 'pauseBtn');
    pauseBtn.textContent = '‖';
    pauseBtn.setAttribute('aria-label', TX.paused);
    pauseBtn.addEventListener('click', () => this.onPause?.());
    this.speak.innerHTML = '<i></i><i></i><i></i>';
    this.draft.innerHTML = `<div class="zone"></div><div class="cur"></div><div class="life"><i></i></div><span>${TX.fanLabel}</span>`;
    root.append(this.area, this.mark, this.speak, this.hintEl, this.hands, this.draft, this.dialog, this.act, pauseBtn);
    // во время разговора тап в любое место экрана — следующая реплика
    this.area.addEventListener('pointerdown', () => { if (this.onDone) this.input.press('Space'); });
    this.act.addEventListener('click', () => this.input.press('Space'));
    this.dialog.addEventListener('pointerdown', (e) => { if (!(e.target as HTMLElement).closest('button')) this.input.press('Space'); });
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') document.body.classList.add('touch'); });
    if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
  }

  get touch(): boolean { return document.body.classList.contains('touch'); }
  /** Кто сейчас говорит (подпись над репликой). */
  /** Значок голоса над тем, кто сейчас говорит (x, y — пиксели экрана; null — никто). */
  setSpeak(x: number | null, y = 0): void {
    this.speak.classList.toggle('on', x !== null);
    if (x !== null) this.speak.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
  }
  /** Озвучка: игра возвращает длительность записи в секундах (0 — голоса нет). kind: line — реплика, pre — скоро понадобится, hint, whisper, screen. */
  onVoice: (kind: 'line' | 'pre' | 'hint' | 'whisper' | 'screen' | 'end', who: string, text: string) => number = () => 0;
  private lastLine = '';
  /** Журнал темпа: что показано игроку (подсказка, реплика, шёпот). */
  onEvent: (kind: 'hint' | 'say' | 'whisper', text: string) => void = () => {};
  /** Голос реплики ещё грузится или звучит — текст его ждёт. */
  voiceHold: () => boolean = () => false;
  get speakerName(): string { return this.busy ? this.who.textContent ?? '' : ''; }
  /** Открыт ли диалог или выбор. */
  get busy(): boolean { return this.onDone !== null || this.onChoice !== null; }

  showHud(on: boolean): void { this.hands.classList.toggle('hidden', !on); }
  /** Кнопки рук: сколько склянок, ход долива, горит ли лампа, прикрыта ли, идёт ли сквозняк. */
  /**
   * Раздувание: шкала тяги с живой полосой и огоньком. draft — где огонёк, c/w — центр и полуширина полосы (0..1),
   * life — сколько осталось сбитому пламени (0 — лампа уже погасла, спешить некуда, кроме тьмы).
   */
  setFan(on: boolean, draft: number, c: number, w: number, life: number): void {
    const d = this.draft;
    d.classList.toggle('hidden', !on || this.busy);
    if (!on) return;
    const z = d.children[0] as HTMLElement, cur = d.children[1] as HTMLElement, lf = (d.children[2] as HTMLElement).firstChild as HTMLElement;
    z.style.left = `${((c - w) * 100).toFixed(1)}%`; z.style.width = `${(w * 200).toFixed(1)}%`;
    cur.style.left = `${(draft * 100).toFixed(1)}%`;
    const inside = Math.abs(draft - c) <= w;
    d.classList.toggle('in', inside);
    d.classList.toggle('dying', life > 0 && life < 0.4);
    (d.children[2] as HTMLElement).style.visibility = life > 0 ? 'visible' : 'hidden';
    lf.style.width = `${(life * 100).toFixed(1)}%`;
  }
  /** fan — пламя надо раздувать: появляется кнопка «раздуть», кольцо на ней показывает, насколько раздул. busy — ладонь занята (несёшь ребёнка). */
  setHands(progress: number, fan: boolean, shielding: boolean, windy: boolean, busy: boolean): void {
    const p = this.bPour;
    p.hidden = !fan;
    (p.lastChild as HTMLElement).textContent = TX.btnFan;
    p.style.setProperty('--p', progress.toFixed(3));
    p.classList.toggle('alert', fan);
    this.bShield.classList.toggle('empty', busy);
    (this.bShield.lastChild as HTMLElement).textContent = TX.btnShield;
    this.bShield.classList.toggle('on', shielding);
    this.bShield.classList.toggle('alert', windy && !shielding);
    this.hands.classList.toggle('away', this.busy);           // в разговоре руки заняты словами: кнопки не мешают тексту
  }
  /** Цель и прогресс: всегда на экране. angle — куда тянет сквозняк (рад, 0 — вверх экрана), null — нет стрелки. */
  /** Метка на краю экрана (или над целью, если она в кадре): «голос», «масло», имя того, кого тащит тьма. */
  marker(id: string, x: number, z: number, label: string, secs: number, urgent = false): void {
    let m = this.marks.get(id);
    if (!m) {
      const e = el('div', '', 'mark');
      e.innerHTML = '<i></i><b></b>';
      this.root.append(e);
      m = { el: e, x, z, until: 0 };
      this.marks.set(id, m);
    }
    m.x = x; m.z = z; m.until = performance.now() + secs * 1000;
    m.el.classList.toggle('urgent', urgent);
    (m.el.lastChild as HTMLElement).textContent = label;
  }
  dropMarker(id: string): void { const m = this.marks.get(id); if (m) { m.el.remove(); this.marks.delete(id); } }
  /** project: мир → экран в пикселях. */
  updateMarkers(project: (x: number, z: number) => [number, number]): void {
    const now = performance.now(), W = innerWidth, H = innerHeight, pad = 54;
    for (const [id, m] of this.marks) {
      if (now > m.until) { this.dropMarker(id); continue; }
      const [sx, sy] = project(m.x, m.z);
      const cx = Math.min(W - pad, Math.max(pad, sx)), cy = Math.min(H - pad - 30, Math.max(pad + 40, sy - 70));
      const off = sx < 0 || sx > W || sy < 0 || sy > H;
      m.el.style.left = `${cx}px`; m.el.style.top = `${cy}px`;
      m.el.classList.toggle('off', off);
      (m.el.firstChild as HTMLElement).style.transform = `rotate(${Math.atan2(sx - cx, -(sy - cy)).toFixed(2)}rad)`;
    }
  }
  hint(text: string, secs = 6): void {
    this.onEvent('hint', text);
    this.hintEl.textContent = text;
    this.hintEl.classList.remove('hidden');
    this.hintTimer = Math.max(secs, this.onVoice('hint', '', text) + 0.6);
  }
  /** Кнопка действия: видна, пока действие доступно. */
  prompt(text: string | null): void {
    if (!text) { this.act.classList.add('hidden'); this.actText = ''; return; }
    if (this.actText !== text) { this.actText = text; this.act.innerHTML = `<kbd>Пробел</kbd>${text}`; }
    this.act.classList.remove('hidden');
  }

  /** Реплики идут сами; Пробел/тап — быстрее. */
  say(name: string, lines: string[], done: () => void, centered = false): void {
    this.queue = lines.slice();
    this.onDone = done;
    this.who.textContent = name;
    for (const l of lines.slice(1)) this.onVoice('pre', name, l);
    this.dialog.classList.toggle('centered', centered);
    this.nextBtn.style.display = '';
    this.opts.replaceChildren();
    this.dialog.classList.remove('hidden');
    this.next();
  }
  private next(): void {
    const line = this.queue.shift();
    if (line === undefined) {
      this.onVoice('end', '', '');                                       // разговор кончился или его пролистали — голос обрывается
      const d = this.onDone; this.onDone = null;
      if (!this.onChoice) this.dialog.classList.add('hidden');
      d?.();
      return;
    }
    this.txt.textContent = line;
    this.txt.classList.remove('in'); void this.txt.offsetWidth; this.txt.classList.add('in');
    this.lineT = Math.min(6.5, Math.max(2.3, 1.3 + line.length * 0.055));
    this.lastLine = line;
    this.onEvent('say', `${this.who.textContent ?? ''}: ${line}`);
    const spoken = this.onVoice('line', this.who.textContent ?? '', line);
    if (spoken) this.lineT = Math.max(this.lineT, spoken + 0.7);         // реплика не уходит, пока не отзвучала
    this.shownAt = performance.now();
  }

  choose(name: string, text: string, choices: Choice[], cb: (i: number) => void): void {
    this.who.textContent = name;
    this.txt.textContent = text;
    if (text && text !== this.lastLine) this.onVoice('line', name, text);          // вопрос, который только что прозвучал, не повторяем
    this.dialog.classList.remove('centered');
    this.nextBtn.style.display = 'none';
    this.opts.replaceChildren();
    this.nChoices = choices.length;
    this.shownAt = performance.now();
    choices.forEach((c, i) => {
      const b = el('button');
      b.innerHTML = `<kbd>${i + 1}</kbd><span>${c.label}${c.note ? `<small>${c.note}</small>` : ''}</span>`;
      b.addEventListener('click', () => this.pick(i));
      this.opts.append(b);
    });
    this.onChoice = cb;
    this.dialog.classList.remove('hidden');
  }
  private pick(i: number): void {
    if (performance.now() - this.shownAt < 450) return;
    const cb = this.onChoice; this.onChoice = null;
    this.onVoice('end', '', '');
    this.dialog.classList.add('hidden');
    this.opts.replaceChildren();
    cb?.(i);
  }

  /** who — чей это голос (роль записи); пусто — тьма или тот, чья это фраза. */
  whisper(text: string, sideX = Math.random(), who = ''): void {
    const w = el('div', '', 'whisper');
    w.textContent = text;
    this.onEvent('whisper', text);
    this.onVoice('whisper', sideX < 0.5 ? `<${who}` : `>${who}`, text);
    const left = sideX < 0.5 ? 6 + Math.random() * 22 : 58 + Math.random() * 20;
    w.style.left = `${left}%`; w.style.top = `${30 + Math.random() * 40}%`;
    this.root.append(w);
    setTimeout(() => w.remove(), 5200);
  }

  screen(opts: { title?: string; sub?: string; lines?: string[]; mem?: string; small?: string; button?: string; black?: boolean; onButton?: () => void } | null): void {
    this.overlay?.remove(); this.overlay = null;
    if (!opts) return;
    const o = el('div', '', `overlay${opts.black ? ' black' : ''}`);
    const ps: HTMLElement[] = [];
    if (opts.title) { const h = el('h1'); h.textContent = opts.title; o.append(h); }
    if (opts.sub !== undefined) { const h = el('h2'); h.textContent = opts.sub; o.append(h); }
    for (const l of opts.lines ?? []) { const p = el('p'); p.textContent = l; o.append(p); ps.push(p); this.onVoice('screen', '', l); }
    if (opts.mem) { const p = el('p', '', 'mem'); p.textContent = opts.mem; o.append(p); ps.push(p); this.onVoice('screen', '', opts.mem); }
    let btn: HTMLElement | null = null;
    if (opts.button) {
      btn = el('button'); btn.textContent = opts.button;
      btn.addEventListener('click', () => opts.onButton?.());
      if (ps.length) { btn.style.opacity = '0'; btn.style.transition = 'opacity 1.5s'; }
      o.append(btn);
    }
    if (opts.small) { const s = el('div', '', 'small'); s.innerHTML = opts.small; o.append(s); }
    this.root.append(o);
    this.overlay = o;
    const step = ps.length > 7 ? 1500 : 2100;
    ps.forEach((p, i) => setTimeout(() => p.classList.add('on'), 600 + i * step));
    if (btn && ps.length) setTimeout(() => { btn!.style.opacity = '1'; }, 600 + ps.length * step);
  }
  get hasScreen(): boolean { return this.overlay !== null; }

  update(dt: number): void {
    if (this.hintTimer > 0) { this.hintTimer -= dt; if (this.hintTimer <= 0) this.hintEl.classList.add('hidden'); }
    const inp = this.input;
    if (this.onChoice) {
      for (let i = 0; i < this.nChoices; i++) if (inp.hit(`Digit${i + 1}`, `Numpad${i + 1}`)) { this.pick(i); break; }
    } else if (this.onDone) {
      this.lineT -= dt;
      const skip = inp.hit('Space', 'Enter', 'KeyF') && performance.now() - this.shownAt > 300;
      if ((this.lineT <= 0 && (!this.voiceHold() || this.lineT < -14)) || skip) this.next();
    }
  }

  controlsHint(): string { return this.touch ? TX.controlsTouch : TX.controlsKb; }
}
