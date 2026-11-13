// Интерфейс поверх canvas: только текст. Никаких панелей — см. арт-библию.
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
  readonly joy = el('div', 'joy');
  readonly knob = el('div', 'knob');
  private oil = el('div', 'oil', 'fade hidden');
  private oilFill = el('i');
  private oilWick = el('b');
  private hintEl = el('div', 'hint', 'fade hidden');
  private promptEl = el('div', 'prompt', 'hidden');
  private dialog = el('div', 'dialog', 'hidden');
  private who = el('div', '', 'who');
  private txt = el('div', '', 'txt');
  private more = el('div', '', 'more');
  private opts = el('div', '', 'opts');
  private pad = el('div', 'pad');
  private overlay: HTMLElement | null = null;
  private hintTimer = 0;
  private queue: string[] = [];
  private onDone: (() => void) | null = null;
  private onChoice: ((i: number) => void) | null = null;
  private nChoices = 0;
  private shownAt = 0;
  input!: Input;
  onPause: (() => void) | null = null;

  constructor(private root: HTMLElement) {
    this.oil.append(this.oilFill, this.oilWick);
    this.dialog.append(this.who, this.txt, this.more, this.opts);
    this.more.textContent = '▾';
    const mk = (id: string, label: string) => { const b = el('button', id); b.textContent = label; this.pad.append(b); return b; };
    const up = mk('bUp', '☀'), act = mk('bAct', '✦'), dn = mk('bDn', '☾');
    const pauseBtn = el('button', 'pauseBtn');
    pauseBtn.textContent = '‖';
    pauseBtn.addEventListener('click', () => this.onPause?.());
    root.append(this.joy, this.knob, this.oil, this.hintEl, this.promptEl, this.dialog, this.pad, pauseBtn);
    const holdBtn = (b: HTMLElement, code: string) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.hold(code, true); });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => this.input.hold(code, false));
    };
    holdBtn(up, 'KeyE'); holdBtn(dn, 'KeyQ');
    act.addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.press('Space'); });
    this.promptEl.addEventListener('pointerdown', () => this.input.press('Space'));
    this.dialog.addEventListener('pointerdown', (e) => { if (!(e.target as HTMLElement).closest('button')) this.input.press('Space'); });
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') document.body.classList.add('touch'); }, { once: false });
  }

  get touch(): boolean { return document.body.classList.contains('touch'); }
  /** Открыт ли диалог или выбор. */
  get busy(): boolean { return this.onDone !== null || this.onChoice !== null; }

  showHud(on: boolean): void { this.oil.classList.toggle('hidden', !on); }
  setOil(oil: number, wick: number, low: boolean): void {
    this.oilFill.style.height = `${Math.max(0, Math.min(100, oil)) * 0.96}%`;
    this.oilWick.style.bottom = `${wick * 100}%`;
    this.oil.classList.toggle('low', low);
  }

  hint(text: string, secs = 6): void {
    this.hintEl.textContent = text;
    this.hintEl.classList.remove('hidden');
    this.hintTimer = secs;
  }
  prompt(text: string | null): void {
    if (!text) { this.promptEl.classList.add('hidden'); return; }
    const html = `<kbd>Пробел</kbd>${text}`;
    if (this.promptEl.innerHTML !== html) this.promptEl.innerHTML = html;
    this.promptEl.classList.remove('hidden');
  }

  /** Реплики по очереди; Пробел/тап — дальше. */
  say(name: string, lines: string[], done: () => void): void {
    this.queue = lines.slice();
    this.onDone = done;
    this.who.textContent = name;
    this.opts.replaceChildren();
    this.more.style.display = '';
    this.dialog.classList.remove('hidden');
    this.next();
  }
  private next(): void {
    const line = this.queue.shift();
    if (line === undefined) {
      const d = this.onDone; this.onDone = null;
      if (!this.onChoice) this.dialog.classList.add('hidden');
      d?.();
      return;
    }
    this.txt.textContent = line;
    this.shownAt = performance.now();
  }

  choose(name: string, text: string, choices: Choice[], cb: (i: number) => void): void {
    this.who.textContent = name;
    this.txt.textContent = text;
    this.more.style.display = 'none';
    this.opts.replaceChildren();
    this.nChoices = choices.length;
    this.shownAt = performance.now();
    choices.forEach((c, i) => {
      const b = el('button');
      b.innerHTML = `<kbd>${i + 1}</kbd>${c.label}${c.note ? `<small>${c.note}</small>` : ''}`;
      b.addEventListener('click', () => this.pick(i));
      this.opts.append(b);
    });
    this.onChoice = cb;
    this.dialog.classList.remove('hidden');
  }
  private pick(i: number): void {
    if (performance.now() - this.shownAt < 350) return;
    const cb = this.onChoice; this.onChoice = null;
    this.dialog.classList.add('hidden');
    this.opts.replaceChildren();
    cb?.(i);
  }

  whisper(text: string, sideX = Math.random()): void {
    const w = el('div', '', 'whisper');
    w.textContent = text;
    const left = sideX < 0.5 ? 6 + Math.random() * 22 : 62 + Math.random() * 20;
    w.style.left = `${left}%`; w.style.top = `${18 + Math.random() * 55}%`;
    this.root.append(w);
    setTimeout(() => w.remove(), 5200);
  }

  /** Полноэкранный слой: меню, пауза, финал. */
  screen(opts: { title?: string; sub?: string; lines?: string[]; mem?: string; small?: string; button?: string; black?: boolean; onButton?: () => void } | null): void {
    this.overlay?.remove(); this.overlay = null;
    if (!opts) return;
    const o = el('div', '', `overlay${opts.black ? ' black' : ''}`);
    const ps: HTMLElement[] = [];
    if (opts.title) { const h = el('h1'); h.textContent = opts.title; o.append(h); }
    if (opts.sub !== undefined) { const h = el('h2'); h.textContent = opts.sub; o.append(h); }
    for (const l of opts.lines ?? []) { const p = el('p'); p.textContent = l; o.append(p); ps.push(p); }
    if (opts.mem) { const p = el('p', '', 'mem'); p.textContent = opts.mem; o.append(p); ps.push(p); }
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
    ps.forEach((p, i) => setTimeout(() => p.classList.add('on'), 600 + i * 2300));
    if (btn && ps.length) setTimeout(() => { btn!.style.opacity = '1'; }, 600 + ps.length * 2300);
  }
  get hasScreen(): boolean { return this.overlay !== null; }

  update(dt: number): void {
    if (this.hintTimer > 0) { this.hintTimer -= dt; if (this.hintTimer <= 0) this.hintEl.classList.add('hidden'); }
    const inp = this.input;
    if (this.onChoice) {
      for (let i = 0; i < this.nChoices; i++) if (inp.hit(`Digit${i + 1}`, `Numpad${i + 1}`)) { this.pick(i); break; }
    } else if (this.onDone && inp.hit('Space', 'Enter', 'KeyF') && performance.now() - this.shownAt > 250) this.next();
  }

  controlsHint(): string { return this.touch ? TX.controlsTouch : TX.controlsKb; }
}
