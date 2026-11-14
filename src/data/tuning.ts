// Все числа, которые крутятся при настройке. Меняются вживую через ?debug=1.
export const T = {
  player: { speed: 2.9, radius: 0.32, carry: 0.82, wade: 0.72 },
  lamp: {
    wickMin: 0.15, wickMax: 1, wickDefault: 0.55, wickRate: 0.7,   // доля в секунду при удержании
    radiusMin: 2.0, radiusMax: 7.2,
    burnBase: 0.09, burnWick: 0.44, burnPow: 1.6,                   // масло/с = base + wick^pow * burnWick
    startOil: 44, flask: 24, ownLamp: 16,
    lowOil: 14,                 // ниже — пламя чахнет независимо от фитиля
    emberRadius: 1.15, emberTime: 10,                               // масло кончилось: столько секунд до конца
    companionBurn: 0.22, giveCost: 18, boyCost: 12, boyLoad: 0.7, familyShare: 0.34, touchDrain: 9, brazierCost: 5,
  },
  spirits: {
    count: 3, margin: 0.8,       // держатся за границей света на таком расстоянии
    boldRadius: 3.4,             // круг меньше — начинают заходить в свет
    boldDepth: 1.0,              // на сколько метров заходят на каждый метр ниже boldRadius
    speed: 1.6, backSpeed: 3.0,  // крадутся быстрее, когда ты к ним спиной
    fleeSpeed: 5, touch: 0.75, burnRate: 1.6, respawn: 5,
  },
  fire: { radius: 4.6 },
  candle: { radius: 1.7 },
  wisp: { snuff: 2.7, glow: 1.5 },
  shade: { hurtWick: 0.62, warn: 2, burn: 6.5 },   // тень терпит свет не ярче hurtWick
  mila: { alone: 7 },                              // столько секунд ребёнок выдержит без света
  still: { wait: 1.5, grow: 4 },
  // отряд: кто выпал из света дольше grace секунд — того тьма тащит grabTime секунд, пока не отобьёшь светом
  party: { spacing: 1.45, grace: 0.9, grabTime: 5, efimPace: 0.9, wade: 0.62, squeeze: 0.86, holeTime: 7, holeOil: 24, callRange: 24, oilSense: 19 },                   // стоишь — тьма подползает
};
export type Tuning = typeof T;
