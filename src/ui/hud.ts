// Интерфейс поверх canvas: текст и явные кнопки. Стик появляется под пальцем в любом месте,
// действие и выбор — кнопки, фитиль — ползунок у правого края, реплики идут сами.
import { Input } from '../core/input';
import { TX } from '../data/texts';
import { faceCanvas } from '../view/faces';

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
  private oil = el('div', 'oil', 'fade hidden');
  private oilFill = el('i');
  private hintEl = el('div', 'hint', 'fade hidden');
  private act = el('button', 'act', 'hidden');
  private dialog = el('div', 'dialog', 'hidden');
  private who = el('div', '', 'who');
  private txt = el('div', '', 'txt');
  private opts = el('div', '', 'opts');
  private wick = el('div', 'wick', 'fade hidden');
  private wickKnob = el('i');
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
    this.oil.append(this.oilFill);
    this.dialog.append(this.who, this.txt, this.opts);
    const sun = el('span'); sun.textContent = '☀';
    const moon = el('span'); moon.textContent = '☾';
    this.wick.append(sun, this.wickKnob, moon);
    const pauseBtn = el('button', 'pauseBtn');
    pauseBtn.textContent = '‖';
    pauseBtn.setAttribute('aria-label', TX.paused);
    pauseBtn.addEventListener('click', () => this.onPause?.());
    root.append(this.area, this.mark, this.oil, this.hintEl, this.wick, this.dialog, this.act, pauseBtn);
    this.act.addEventListener('click', () => this.input.press('Space'));
    this.dialog.addEventListener('pointerdown', (e) => { if (!(e.target as HTMLElement).closest('button')) this.input.press('Space'); });
    // ползунок фитиля: тянуть вверх — ярче
    const drag = (e: PointerEvent) => {
      const r = this.wick.getBoundingClientRect();
      this.input.wickSet = Math.min(1, Math.max(0, 1 - (e.clientY - r.top - 26) / (r.height - 52)));
    };
    this.wick.addEventListener('pointerdown', (e) => { this.wick.setPointerCapture(e.pointerId); drag(e); });
    this.wick.addEventListener('pointermove', (e) => { if (this.wick.hasPointerCapture(e.pointerId)) drag(e); });
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') document.body.classList.add('touch'); });
    if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
  }

  get touch(): boolean { return document.body.classList.contains('touch'); }
  /** Открыт ли диалог или выбор. */
  get busy(): boolean { return this.onDone !== null || this.onChoice !== null; }

  showHud(on: boolean): void { this.oil.classList.toggle('hidden', !on); this.wick.classList.toggle('hidden', !on); }
  setOil(oil: number, low: boolean): void {
    this.oilFill.style.height = `${Math.max(0, Math.min(100, oil)) * 0.96}%`;
    this.oil.classList.toggle('low', low);
  }
  /** v — 0..1; locked — руки заняты, фитиль не тронуть. */
  setWick(v: number, locked: boolean): void {
    this.wickKnob.style.bottom = `calc(26px + (100% - 52px) * ${v.toFixed(3)} - 13px)`;
    this.wick.classList.toggle('locked', locked);
  }

  hint(text: string, secs = 6): void {
    this.hintEl.textContent = text;
    this.hintEl.classList.remove('hidden');
    this.hintTimer = secs;
  }
  /** Кнопка действия: видна, пока действие доступно. */
  prompt(text: string | null): void {
    if (!text) { this.act.classList.add('hidden'); this.actText = ''; return; }
    if (this.actText !== text) { this.actText = text; this.act.innerHTML = `<kbd>Пробел</kbd>${text}`; }
    this.act.classList.remove('hidden');
  }

  /** Реплики идут сами; Пробел/тап — быстрее. */
  say(name: string, lines: string[], done: () => void): void {
    this.queue = lines.slice();
    this.onDone = done;
    this.who.textContent = name;
    this.opts.replaceChildren();
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
    this.txt.classList.remove('in'); void this.txt.offsetWidth; this.txt.classList.add('in');
    this.lineT = Math.min(6.5, Math.max(2.3, 1.3 + line.length * 0.055));
    this.shownAt = performance.now();
  }

  choose(name: string, text: string, choices: Choice[], cb: (i: number) => void): void {
    this.who.textContent = name;
    this.txt.textContent = text;
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
    this.dialog.classList.add('hidden');
    this.opts.replaceChildren();
    cb?.(i);
  }

  whisper(text: string, sideX = Math.random()): void {
    const w = el('div', '', 'whisper');
    w.textContent = text;
    const left = sideX < 0.5 ? 6 + Math.random() * 22 : 58 + Math.random() * 20;
    w.style.left = `${left}%`; w.style.top = `${18 + Math.random() * 50}%`;
    this.root.append(w);
    setTimeout(() => w.remove(), 5200);
  }

  /** Скример: лицо во весь экран на долю секунды. */
  scream(variant = Math.floor(Math.random() * 7)): void {
    const s = el('div', '', 'scream');
    s.style.backgroundImage = `url(${faceCanvas(variant).toDataURL()})`;
    this.root.append(s);
    setTimeout(() => s.remove(), 900);
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
      if (this.lineT <= 0 || skip) this.next();
    }
  }

  controlsHint(): string { return this.touch ? TX.controlsTouch : TX.controlsKb; }
}
