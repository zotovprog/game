// Все числа, которые крутятся при настройке. Меняются вживую через ?debug=1.
export const T = {
  player: { speed: 2.9, radius: 0.32, carry: 0.82, wade: 0.72 },
  lamp: {
    wickMin: 0.15, wickMax: 1, wickDefault: 0.55, wickRate: 0.9,   // доля в секунду при удержании
    radiusMin: 2.4, radiusMax: 7.2,                                 // радиус по фитилю при полной лампе
    oilFloor: 0.3,                                                  // доля радиуса, когда масло на нуле: круг сжимается вместе с маслом
    burnBase: 0.42, burnWick: 1.55, burnPow: 1.5,                   // масло/с = base + wick^pow * burnWick: полной лампы хватает на ~95 с
    startOil: 60, flask: 27, ownLamp: 25,
    startFlasks: 1, maxFlasks: 2,                                   // склянки носишь с собой и доливаешь сам
    pourTime: 2.0,              // столько секунд стоишь и льёшь
    relightTime: 2.2, relightCost: 2, outRadius: 0.95,              // лампу задуло: разжечь заново, стоя в темноте
    shieldRadius: 0.58, shieldSpeed: 0.55,                          // прикрыл ладонью: круг меньше, идёшь медленнее
    lowOil: 25,                 // ниже — лампа чихает, сердце стучит
    emberRadius: 1.15, emberTime: 8,                                // масло кончилось: столько секунд до конца
    companionBurn: 0.1, giveCost: 14, boyCost: 10, boyLoad: 0.7, familyShare: 0.34, touchDrain: 9, outDrain: 16, brazierCost: 6,
  },
  // сквозняк: предупреждение, потом порыв; не прикрыл лампу — гаснет
  gust: { warn: 1.4, blow: 1.5, exposed: 0.45, firstWarn: 2.6,
    every: { void: [11, 19], fissure: [15, 26], water: [22, 36], rubble: [26, 44], mine: [28, 46], columns: [22, 38], gate: [45, 70] } as Record<string, [number, number]> },
  // страх нарастает: от входа к Вратам тьма злее, броски чаще, масло горит быстрее
  dread: {
    start: 0.12, deep: 0.92,     // у места пробуждения и у Врат
    perLost: 0.06,               // каждая потеря делает тьму смелее
    lungeSlow: 17, lungeFast: 5, // пауза между бросками при страхе 0 и 1, с
    windup: 1.4,                 // столько секунд слышно, что она сейчас бросится
    lungeSpeed: 9, lungeReach: 9,
    repelWick: 0.72,             // фитиль не ниже этого — бросок сгорает
    burnBonus: 0.3,              // во сколько раз быстрее горит масло на самой глубине (1 + bonus)
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
  // те, кого нет: глаза в темноте и идущий по краю света
  phantom: { maxEyes: 7, eyesPerDread: 3, eyesOut: 6, eyeSize: 0.14, eyeGlow: 0.72, eyeLife: [2.5, 7] as [number, number], eyeGap: [4, 13] as [number, number],
    walkSpeed: 1.15, walkTime: 5.5, walkGap: [22, 48] as [number, number] },
  // голоса: сколько прямого звука, хвоста пещеры и повторного эха; скорость; двоение и глухота у мёртвых
  voice: {
    live: { dry: 1.25, rev: 0.7, echo: 0.3, rate: 1, double: false, lp: 0 },
    narrator: { dry: 1.15, rev: 0.85, echo: 0.22, rate: 1, double: false, lp: 0 },
    shade: { dry: 0.8, rev: 1.3, echo: 0.6, rate: 0.97, double: false, lp: 5200 },
    ghost: { dry: 0.45, rev: 1.8, echo: 1.1, rate: 0.93, double: true, lp: 3400 },
    dark: { dry: 0.4, rev: 1.9, echo: 1.15, rate: 0.9, double: true, lp: 3000 },
  },
  // акустика пещеры: длина хвоста, повторное эхо (задержка, сколько возвращается, насколько темнеет), доля эха у обычных звуков
  cave: { tail: 4.4, echoTime: 0.31, echoBack: 0.38, echoTone: 2100, echoTime2: 0.47, sfxEcho: 0.32 },
  // брошенных забирает тьма: когда ты отошёл на столько метров и прошло столько секунд
  forsaken: { away: 17, wait: 9, near: 11, burn: 0.75, lure: 9, lurePace: 0.45 },
  // лампы прежних носителей на пирамидках: зажёг — горит всегда, пещера это помнит
  cairn: { cost: 3, radius: 3.4, reach: 1.7 },
  wisp: { snuff: 2.7, glow: 1.5 },
  shade: { hurtWick: 0.62, warn: 2, burn: 6.5 },   // тень терпит свет не ярче hurtWick
  mila: { alone: 7 },                              // столько секунд ребёнок выдержит без света
  still: { wait: 1.5, grow: 4 },
  // отряд: кто выпал из света дольше grace секунд — того тьма тащит grabTime секунд, пока не отобьёшь светом
  party: { spacing: 1.45, grace: 0.9, grabTime: 5, efimPace: 0.9, wade: 0.62, squeeze: 0.86, holeTime: 7, holeOil: 30, callRange: 24, oilSense: 19 },                   // стоишь — тьма подползает
};
export type Tuning = typeof T;
