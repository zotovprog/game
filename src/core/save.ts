// «Пещера помнит»: след прошлых попыток в localStorage.
export interface Trace {
  runs: number;
  lastDeath: { x: number; z: number } | null;
  beacon: boolean;                  // в прошлый раз ты остался маяком
  endings: string[];
  cairns: number[];                 // лампы на пирамидках, которые ты уже зажёг: горят и в следующий раз
}
const KEY = 'cave-remembers.v1';
const blank = (): Trace => ({ runs: 0, lastDeath: null, beacon: false, endings: [], cairns: [] });

export function loadTrace(): Trace {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    return { ...blank(), ...(JSON.parse(raw) as Partial<Trace>) };
  } catch { return blank(); }
}
export function saveTrace(t: Trace): void {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* приватный режим — играем без памяти */ }
}
