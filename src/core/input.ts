// Ввод: клавиатура по event.code, колёсико, тач-джойстик и кнопки. Игра читает действия, не клавиши.
export class Input {
  moveX = 0; moveY = 0;          // -1..1 в экранных осях (вправо, вверх)
  wickDelta = 0;                 // накопленное изменение фитиля от колёсика (сбрасывает игра)
  wickHold = 0;                  // -1 / 0 / 1 пока держат клавишу или кнопку
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  touchUsed = false;
  anyInput = false;

  constructor(joyEl?: HTMLElement, private knobEl?: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code); this.anyInput = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('wheel', (e) => { this.wickDelta += -Math.sign(e.deltaY) * 0.08; }, { passive: true });
    if (joyEl) this.bindJoystick(joyEl);
  }

  private bindJoystick(el: HTMLElement): void {
    const max = 46;
    el.addEventListener('pointerdown', (e) => {
      this.touchUsed = true; this.anyInput = true;
      this.joy.id = e.pointerId; this.joy.ox = e.clientX; this.joy.oy = e.clientY; this.joy.x = this.joy.y = 0;
      el.setPointerCapture(e.pointerId);
      if (this.knobEl) { this.knobEl.style.left = `${e.clientX}px`; this.knobEl.style.top = `${e.clientY}px`; this.knobEl.style.opacity = '1'; this.knobEl.style.setProperty('--dx', '0px'); this.knobEl.style.setProperty('--dy', '0px'); }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joy.id) return;
      let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
      const l = Math.hypot(dx, dy);
      if (l > max) { dx = (dx / l) * max; dy = (dy / l) * max; }
      this.joy.x = dx / max; this.joy.y = -dy / max;
      if (this.knobEl) { this.knobEl.style.setProperty('--dx', `${dx}px`); this.knobEl.style.setProperty('--dy', `${dy}px`); }
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joy.id) return;
      this.joy.id = -1; this.joy.x = this.joy.y = 0;
      if (this.knobEl) this.knobEl.style.opacity = '0';
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }

  /** Виртуальное нажатие (кнопки на экране). */
  press(code: string): void { this.pressed.add(code); this.anyInput = true; }
  hold(code: string, on: boolean): void { if (on) this.keys.add(code); else this.keys.delete(code); }

  /** Было ли нажатие с прошлого кадра. */
  hit(...codes: string[]): boolean { return codes.some((c) => this.pressed.has(c)); }
  down(...codes: string[]): boolean { return codes.some((c) => this.keys.has(c)); }

  update(): void {
    let x = 0, y = 0;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.down('KeyW', 'ArrowUp')) y += 1;
    if (this.down('KeyS', 'ArrowDown')) y -= 1;
    if (this.joy.id !== -1) { x = this.joy.x; y = this.joy.y; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.moveX = l < 0.12 ? 0 : x; this.moveY = l < 0.12 ? 0 : y;
    this.wickHold = (this.down('KeyE') ? 1 : 0) - (this.down('KeyQ') ? 1 : 0);
  }
  endFrame(): void { this.pressed.clear(); }
}
