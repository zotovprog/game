// Темп: тьма не вываливает всё сразу.
// Сначала — тишина и одиночество; потом она начинает шевелиться; потом приходит ветер; потом она охотится.
// И после каждого события — пауза: пока она не прошла, ничего нового не начинается.
import { T } from '../data/tuning';

export class Pace {
  /** 0 один в тишине · 1 тьма шевелится · 2 ветер · 3 охота · 4 всё: шёпот, идущий, много глаз */
  stage = 0;
  t = 0;          // секунд с лампой
  walked = 0;     // метров с лампой
  inStage = 0;    // спокойных секунд на этой ступени
  quiet = 0;      // столько секунд ещё ничего не должно начинаться
  since = 99;     // секунд с последнего события
  lungeT = 0;     // секунд до того, как тьме снова можно броситься

  get calm(): boolean { return this.quiet <= 0; }
  /** Что-то случилось: дать игроку это пережить. На глубине паузы короче. */
  hush(sec: number, dread = 0): void { this.quiet = Math.max(this.quiet, sec * (1 - T.pace.rush * dread)); this.since = 0; }
  /** Она бросилась: следующий бросок — не скоро (на глубине — скорее). */
  lunged(dread: number, r: number): void { const [a, b] = T.pace.lungeEvery; this.lungeT = (a + (b - a) * dread) * (0.8 + 0.4 * r); }
  /** Сразу на нужную ступень (автопрогоны, возврат к огню). */
  jump(stage: number): void { this.stage = stage; this.inStage = 0; }

  /** ready — игрок цел и свободен (не в разговоре, пламя в порядке). Возвращает ступень, если она только что наступила. */
  update(dt: number, moved: number, ready: boolean): number | null {
    this.t += dt; this.walked += moved; this.since += dt;
    this.quiet = Math.max(0, this.quiet - dt);
    this.lungeT = Math.max(0, this.lungeT - dt);
    if (!ready || !this.calm) return null;
    this.inStage += dt;
    if (this.stage >= 4) return null;
    const P = T.pace;
    const go = this.stage === 0 ? this.t >= P.stir.t && this.walked >= P.stir.walked : this.inStage >= [0, P.wind, P.hunt, P.full][this.stage];
    if (!go) return null;
    this.stage++; this.inStage = 0;
    return this.stage;
  }
}
