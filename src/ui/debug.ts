// Панель живой настройки (?debug=1): ползунки по всем числам из data/tuning.ts.
import { T } from '../data/tuning';

export function mountDebug(root: HTMLElement, actions: Record<string, () => void>, info: () => string): () => void {
  const box = document.createElement('div');
  box.id = 'debug';
  const stat = document.createElement('div');
  box.append(stat);
  for (const [name, fn] of Object.entries(actions)) {
    const b = document.createElement('button'); b.textContent = name; b.addEventListener('click', fn); box.append(b);
  }
  for (const [group, obj] of Object.entries(T) as [string, Record<string, number>][]) {
    const h = document.createElement('div'); h.textContent = `— ${group}`; box.append(h);
    for (const key of Object.keys(obj)) {
      const v0 = obj[key];
      const label = document.createElement('label');
      const inp = document.createElement('input'); inp.type = 'range';
      inp.min = '0'; inp.max = String(Math.max(1, v0 * 3)); inp.step = String(Math.max(0.01, v0 / 50)); inp.value = String(v0);
      const out = document.createElement('span'); out.textContent = String(v0);
      inp.addEventListener('input', () => { obj[key] = Number(inp.value); out.textContent = inp.value; });
      label.append(key, inp, out); box.append(label);
    }
  }
  root.append(box);
  return () => { stat.textContent = info(); };
}
