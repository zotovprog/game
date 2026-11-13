// Направления стиля (фаза 2). После выбора остаётся одно — оно же арт-библия в цифрах.
export interface Style {
  id: string;
  name: string;
  lamp: number;          // цвет пламени лампы
  lampGain: number;      // множитель силы света
  fire: number;          // цвет «настоящего» огня (жаровни, костёр)
  wisp: number;          // цвет ложного огня
  rock: number; rockAlt: number; floor: number; floorAlt: number;
  ambient: number; ambientI: number;
  darkTint: number;      // цвет «живой» тьмы (прожилки)
  veins: number;         // сила прожилок 0..1
  edgeNoise: number;     // насколько тьма въедается в границу света
  sat: number; contrast: number; tint: [number, number, number];
  poster: number;        // 0 — нет, иначе число ступеней
  grain: number; bloom: number; vignette: number;
  spiritRim: number; spiritFace: number; spiritRimI: number;
  cloakPlayer: number; cloakOld: number; cloakWoman: number; skin: number;
}

export const STYLES: Record<string, Style> = {
  a: {
    id: 'a', name: 'Масляная тьма',
    lamp: 0xffa040, lampGain: 1.0, fire: 0xff7a22, wisp: 0xcfe8a0,
    rock: 0x5a5148, rockAlt: 0x443c36, floor: 0x4a423a, floorAlt: 0x2e2925,
    ambient: 0x201810, ambientI: 0.0, darkTint: 0x120c08, veins: 0.0, edgeNoise: 0.55,
    sat: 0.92, contrast: 1.08, tint: [1.0, 0.97, 0.92], poster: 0,
    grain: 0.075, bloom: 0.55, vignette: 0.55,
    spiritRim: 0x8a8478, spiritFace: 0xb8b0a0, spiritRimI: 0.3,
    cloakPlayer: 0x4a3a2c, cloakOld: 0x3c3a34, cloakWoman: 0x4a2f2c, skin: 0xb08a6a,
  },
  b: {
    id: 'b', name: 'Уголь и янтарь',
    lamp: 0xfff1dc, lampGain: 1.15, fire: 0xff8a1e, wisp: 0xffffff,
    rock: 0x6a6a6a, rockAlt: 0x3a3a3a, floor: 0x585858, floorAlt: 0x2a2a2a,
    ambient: 0x000000, ambientI: 0.0, darkTint: 0x000000, veins: 0.0, edgeNoise: 0.85,
    sat: 1.0, contrast: 1.35, tint: [1, 1, 1], poster: 5,
    grain: 0.11, bloom: 0.35, vignette: 0.4,
    spiritRim: 0xffffff, spiritFace: 0xffffff, spiritRimI: 0.65,
    cloakPlayer: 0x303030, cloakOld: 0x505050, cloakWoman: 0x1c1c1c, skin: 0xa0a0a0,
  },
  c: {
    id: 'c', name: 'Караваджо под землёй',
    lamp: 0xffb85a, lampGain: 1.1, fire: 0xff8c30, wisp: 0xe8dcb0,
    rock: 0x6b4a34, rockAlt: 0x4a2f22, floor: 0x5c4130, floorAlt: 0x35231a,
    ambient: 0x2a1408, ambientI: 0.05, darkTint: 0x1a0c05, veins: 0.25, edgeNoise: 0.35,
    sat: 1.2, contrast: 1.12, tint: [1.03, 0.98, 0.9], poster: 0,
    grain: 0.05, bloom: 0.8, vignette: 0.7,
    spiritRim: 0xc9b89a, spiritFace: 0xe6d8bc, spiritRimI: 0.32,
    cloakPlayer: 0x6e2a1c, cloakOld: 0x4f4526, cloakWoman: 0x26394a, skin: 0xc79a74,
  },
  d: {
    id: 'd', name: 'Холодная бездна',
    lamp: 0xff9a3c, lampGain: 0.95, fire: 0xff7a22, wisp: 0x9fe8ff,
    rock: 0x45525c, rockAlt: 0x2c3a44, floor: 0x3a454d, floorAlt: 0x1f2a31,
    ambient: 0x0c2a3a, ambientI: 0.09, darkTint: 0x0a3344, veins: 0.3, edgeNoise: 0.6,
    sat: 1.05, contrast: 1.1, tint: [0.95, 1.0, 1.05], poster: 0,
    grain: 0.06, bloom: 0.7, vignette: 0.6,
    spiritRim: 0x6fd0e8, spiritFace: 0xbfeaf2, spiritRimI: 0.42,
    cloakPlayer: 0x4a3324, cloakOld: 0x39404a, cloakWoman: 0x4a2a33, skin: 0xb08a6a,
  },
};

// R2: «как A, но холодные тона, свет тоже» — три варианта холодного пламени
const coldBase = {
  lampGain: 1.05, fire: 0xff8a3a,
  rock: 0x556270, rockAlt: 0x36414c, floor: 0x46515b, floorAlt: 0x262e35,
  ambient: 0x000000, ambientI: 0.0, darkTint: 0x000000, veins: 0.0, edgeNoise: 0.6,
  contrast: 1.1, poster: 0, grain: 0.07, bloom: 0.6, vignette: 0.55,
  cloakPlayer: 0x5c4a3c, cloakOld: 0x4a4a48, cloakWoman: 0x553a3c, skin: 0xb9a090,
};
STYLES.k1 = { ...coldBase, id: 'k1', name: 'Лунный лёд', lamp: 0x9fc4ff, wisp: 0xd9ff9a, sat: 1.0, tint: [0.96, 1.0, 1.06],
  spiritRim: 0xa9b6c8, spiritFace: 0xdfe6ee, spiritRimI: 0.34 };
STYLES.k2 = { ...coldBase, id: 'k2', name: 'Карбидное пламя', lamp: 0xb4ffe4, wisp: 0xfff0a0, sat: 0.95, tint: [0.97, 1.03, 1.0],
  spiritRim: 0xb0c4bc, spiritFace: 0xe4efe9, spiritRimI: 0.34 };
STYLES.k3 = { ...coldBase, id: 'k3', name: 'Стальной свет', lamp: 0xdfe9ff, wisp: 0xd9ff9a, sat: 0.7, tint: [0.97, 1.0, 1.04], contrast: 1.16,
  spiritRim: 0xb8bcc4, spiritFace: 0xeceef2, spiritRimI: 0.36 };
