// Ввод: клавиатура по event.code, колёсико, палец/мышь «ведёт» героя. Игра читает действия, не клавиши.
export class Input {
  moveX = 0; moveY = 0;          // -1..1 в экранных осях (вправо, вверх)
  wickDelta = 0;                 // накопленное изменение фитиля от колёсика (сбрасывает игра)
  wickHold = 0;                  // -1 / 0 / 1 пока держат клавишу
  wickSet: number | null = null; // 0..1 — ползунок фитиля выставлен пальцем
  heroX = 0.5; heroY = 0.5;      // где герой на экране (доли) — палец ведёт относительно него
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private ptr = { id: -1, x: 0, y: 0 };
  anyInput = false;

  constructor(area?: HTMLElement, private mark?: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code); this.anyInput = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.ptr.id = -1; });
    addEventListener('wheel', (e) => { this.wickDelta += -Math.sign(e.deltaY) * 0.08; }, { passive: true });
    if (area) this.bindPointer(area);
  }

  /** Палец (или зажатая мышь) в любом месте экрана: герой идёт в его сторону. */
  private bindPointer(el: HTMLElement): void {
    const show = (on: boolean) => {
      if (!this.mark) return;
      this.mark.style.opacity = on ? '1' : '0';
      this.mark.style.left = `${this.ptr.x}px`; this.mark.style.top = `${this.ptr.y}px`;
    };
    el.addEventListener('pointerdown', (e) => {
      this.anyInput = true;
      this.ptr.id = e.pointerId; this.ptr.x = e.clientX; this.ptr.y = e.clientY;
      el.setPointerCapture(e.pointerId);
      show(true);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.ptr.id) return;
      this.ptr.x = e.clientX; this.ptr.y = e.clientY;
      show(true);
    });
    const end = (e: PointerEvent) => { if (e.pointerId === this.ptr.id) { this.ptr.id = -1; show(false); } };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }

  /** Виртуальное нажатие (кнопки на экране). */
  press(code: string): void { this.pressed.add(code); this.anyInput = true; }
  /** Было ли нажатие с прошлого кадра. */
  hit(...codes: string[]): boolean { return codes.some((c) => this.pressed.has(c)); }
  down(...codes: string[]): boolean { return codes.some((c) => this.keys.has(c)); }

  update(): void {
    let x = 0, y = 0;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.down('KeyW', 'ArrowUp')) y += 1;
    if (this.down('KeyS', 'ArrowDown')) y -= 1;
    if (this.ptr.id !== -1) {
      const dx = this.ptr.x - this.heroX * innerWidth, dy = this.heroY * innerHeight - this.ptr.y;
      const l = Math.hypot(dx, dy), dead = 22, full = 90;
      if (l > dead) { const k = Math.min(1, (l - dead) / (full - dead)) / l; x = dx * k; y = dy * k; }
    }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.moveX = x; this.moveY = y;
    this.wickHold = (this.down('KeyE') ? 1 : 0) - (this.down('KeyQ') ? 1 : 0);
  }
  endFrame(): void { this.pressed.clear(); }
}
