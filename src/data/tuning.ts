// Все числа, которые крутятся при настройке. Меняются вживую через ?debug=1.
export const T = {
  player: { speed: 2.9, radius: 0.32 },
  lamp: {
    wickMin: 0.15, wickMax: 1, wickDefault: 0.55, wickRate: 0.7,   // доля в секунду при удержании
    radiusMin: 2.0, radiusMax: 7.2,
    burnBase: 0.09, burnWick: 0.44, burnPow: 1.6,                   // масло/с = base + wick^pow * burnWick
    startOil: 44, flask: 24, ownLamp: 16,
    lowOil: 14,                 // ниже — пламя чахнет независимо от фитиля
    emberRadius: 1.15, emberTime: 10,                               // масло кончилось: столько секунд до конца
    companionBurn: 0.35, giveCost: 18, touchDrain: 9, brazierCost: 5,
  },
  spirits: {
    count: 4, margin: 1.1,       // держатся за границей света на таком расстоянии
    boldRadius: 3.4,             // круг меньше — начинают заходить в свет
    boldDepth: 1.0,              // на сколько метров заходят на каждый метр ниже boldRadius
    speed: 1.5, backSpeed: 2.6,  // крадутся быстрее, когда ты к ним спиной
    fleeSpeed: 5, touch: 0.75, burnRate: 1.6, respawn: 5,
  },
  fire: { radius: 4.6 },
  candle: { radius: 1.7 },
  wisp: { snuff: 2.7, glow: 1.5 },
};
export type Tuning = typeof T;
