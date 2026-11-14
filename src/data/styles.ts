// Стиль игры в цифрах — см. .studioigor/ART_BIBLE.md («Стальной свет в абсолютной тьме»).
export interface Style {
  lamp: number;          // пламя лампы: холодно-белое с каплей тепла
  lampGain: number;
  fire: number;          // зарезервированный тёплый акцент: живое, человеческое, выход
  wisp: number;          // ложный огонь: мёртвенно-бледный
  rock: number; rockAlt: number; floor: number; floorAlt: number;
  edgeNoise: number;     // насколько тьма въедается в границу света
  sat: number; contrast: number; tint: [number, number, number];
  grain: number; bloom: number; vignette: number;
  spiritRim: number; spiritFace: number; spiritRimI: number;
  cloakPlayer: number; cloakOld: number; cloakWoman: number; cloakDead: number; skin: number;
}

export const STYLE: Style = {
  lamp: 0xf3ead6, lampGain: 1.05, fire: 0xff8a3a, wisp: 0xd6ecd0,
  rock: 0x556270, rockAlt: 0x36414c, floor: 0x3d464e, floorAlt: 0x1e252b,
  edgeNoise: 0.6,
  sat: 0.78, contrast: 1.14, tint: [1.0, 0.995, 0.985],
  grain: 0.07, bloom: 0.55, vignette: 0.55,
  spiritRim: 0xb8bcc4, spiritFace: 0xe6e8ec, spiritRimI: 0.02,
  cloakPlayer: 0x3b3129, cloakOld: 0x34363a, cloakWoman: 0x452c30, cloakDead: 0x1c1e21, skin: 0x9c8778,
};
