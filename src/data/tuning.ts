// Все числа, которые крутятся при настройке. Меняются вживую через ?debug=1.
export const T = {
  player: { speed: 2.9, radius: 0.32, carry: 0.82, wade: 0.72 },
  lamp: {
    wickMin: 0.15, wickMax: 1, wickDefault: 0.55, wickRate: 0.9,   // доля в секунду при удержании
    radiusMin: 2.4, radiusMax: 7.2,                                 // радиус по фитилю при полной лампе
    oilFloor: 0.3,                                                  // доля радиуса, когда масло на нуле: круг сжимается вместе с маслом
    burnBase: 0.5, burnWick: 1.8, burnPow: 1.5,                     // масло/с = base + wick^pow * burnWick: полной лампы хватает на ~80 с
    startOil: 55, flask: 22, ownLamp: 25,
    lowOil: 25,                 // ниже — лампа чихает, сердце стучит
    emberRadius: 1.15, emberTime: 7,                                // масло кончилось: столько секунд до конца
    companionBurn: 0.1, giveCost: 14, boyCost: 10, boyLoad: 0.7, familyShare: 0.34, touchDrain: 12, brazierCost: 6,
  },
  // страх нарастает: от входа к Вратам тьма злее, броски чаще, масло горит быстрее
  dread: {
    start: 0.12, deep: 0.92,     // у места пробуждения и у Врат
    perLost: 0.06,               // каждая потеря делает тьму смелее
    lungeSlow: 17, lungeFast: 5, // пауза между бросками при страхе 0 и 1, с
    windup: 1.4,                 // столько секунд слышно, что она сейчас бросится
    lungeSpeed: 9, lungeReach: 9,
    repelWick: 0.72,             // фитиль не ниже этого — бросок сгорает
    burnBonus: 0.5,              // во сколько раз быстрее горит масло на самой глубине (1 + bonus)
  },
  // вал: в конце тьма идёт по твоему следу
  wave: { speed: 2.5, start: 16, reach: 1.7, drain: 13 },
  spirits: {
    count: 1, margin: 0.8,       // держатся за границей света на таком расстоянии
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
  party: { spacing: 1.45, grace: 0.9, grabTime: 5, efimPace: 0.9, wade: 0.62, squeeze: 0.86, holeTime: 7, holeOil: 30, callRange: 24, oilSense: 19 },                   // стоишь — тьма подползает
};
export type Tuning = typeof T;
