// Глубина первая. Всё содержимое уровня — данные: полости, люди, огни, склянки, сцены.
// Координаты в метрах; «вверх» на экране = в сторону убывания x и z.
// Пещера — сеть ходов с петлями и тупиками: прямой путь часто ведёт не туда.
import type { ModelId, TexId } from '../view/art';
import { Carve } from '../world/grid';

type P = [number, number];
/** Стена: axis 'x' — вдоль оси x на z = at; 'z' — вдоль оси z на x = at. Лицом к камере. solid — стоит посреди хода и не пускает. */
export interface WallDef { axis: 'x' | 'z'; at: number; from: number; to: number; tex: TexId; h?: number; solid?: boolean }
/** Вещь из чьей-то жизни: h — высота в метрах (масштаб), s — растяжение по осям, y — подъём, r — радиус препятствия. */
export interface PropDef { m: ModelId; at: P; ry?: number; h?: number; s?: [number, number, number]; y?: number; r?: number }
/** Зал памяти: кусок чужой жизни, вросший в камень. rect — пол; ragged — обрывок без ровных краёв. */
export interface RoomDef { id: string; rect: [number, number, number, number]; floor: TexId; tile: number; ragged?: boolean; walls: WallDef[]; props: PropDef[] }
/** Дверь в стене: wood — створка на петлях, slab — каменная плита, уходит в пол. lock — имя загадки, которая её держит. */
export interface DoorDef { id: string; axis: 'x' | 'z'; at: P; kind: 'wood' | 'slab'; lock?: string }
/** Теснина: squeeze — щель, боком; crawl — лаз, ползком. Идёшь сам, но медленно; огонь не прикрыть. */
export interface TightDef { id: string; kind: 'squeeze' | 'crawl'; pts: P[] }
/** Загадка «чаши и фрески»: зажечь чаши в порядке с рисунка. glyphs — знак у каждой чаши, order — индексы чаш по порядку. */
export interface BowlsDef { id: string; bowls: P[]; glyphs: number[]; order: number[]; fresco: { axis: 'x' | 'z'; at: P; y: number }; scare?: { seat: P; face: number } }
/** Загадка «тень на знаке»: встать с огнём так, чтобы тень статуи легла на знак двери door. */
export interface ShadowDef { id: string; statue: P; face: number; door: string; fresco: { axis: 'x' | 'z'; at: P; y: number } }
export interface LevelDef {
  w: number; h: number; seed: number;
  carves: Carve[];
  start: { hero: P; lamp: P; dead: P };
  flasks: P[];
  braziers: P[];
  wisps: { id: string; at: P }[];
  efim: { at: P; fire: P };
  vera: { at: P; wisp: string; path: P[] };
  mila: { at: P };
  family: { fire: P };
  shade: { at: P };
  toy: { at: P };
  gate: { at: P; bowl: P };
  holes: P[];                                   // лазы: взрослому не пролезть, внутри смола — огню на корм
  lures: P[];                                   // ложные голоса: зовут из темноты, на месте — кости
  cairns: P[];                                  // пирамидки с погасшими лампами прежних носителей
  rails: P[][];
  cart: P;
  zones: { id: string; at: P; r: number }[];
  rooms: RoomDef[];
  doors: DoorDef[];
  tights: TightDef[];
  bowls: BowlsDef[];
  shadows: ShadowDef[];
}

export const DEPTH1: LevelDef = {
  w: 200, h: 210, seed: 7,
  carves: [
    // где ты проснулся
    { pts: [[184, 198]], r: 4.4, kind: 'rubble' },
    { pts: [[184, 198], [174, 193], [166, 186]], r: 2.4, kind: 'rubble' },
    // развилка у вагонетки
    { pts: [[160, 182], [161, 183]], r: 5.2, kind: 'mine' },
    { pts: [[166, 186], [160, 182]], r: 2.5, kind: 'mine' },
    { pts: [[160, 182], [166, 170], [170, 160]], r: 2.0, kind: 'rubble' },          // обвал — тупик
    { pts: [[171, 158]], r: 3.4, kind: 'rubble' },
    { pts: [[160, 182], [157.5, 181.2]], r: 2.5, kind: 'mine' },                    // штрек с рельсами — до завала
    { pts: [[155.8, 180.7], [149.2, 178.4]], r: 0.8, kind: 'mine', rough: 0 },      // лаз под завалом
    { pts: [[147, 177.7], [140, 174]], r: 2.5, kind: 'mine' },                      // штрек за завалом
    // забой Ефима
    { pts: [[134, 172], [135, 171]], r: 7, kind: 'mine' },
    { pts: [[138, 168], [146, 160]], r: 1.9, kind: 'mine' },                         // кладовая
    { pts: [[147, 159]], r: 2.5, kind: 'mine' },
    // кухня: комната из чьей-то жизни, вросшая в камень; из неё — дверь, за дверью щель
    { pts: [[131.5, 167.5], [129.5, 161.8]], r: 0.9, kind: 'mine', rough: 0 },
    { pts: [], r: 0, rect: [123, 155, 131, 162], kind: 'room', rough: 0 },
    { pts: [[126.5, 155.4], [126.5, 151.5], [123.5, 148.5]], r: 0.8, kind: 'fissure', rough: 0 },
    { pts: [[134, 172], [124, 180], [116, 182]], r: 2.2, kind: 'water' },
    // колонный зал
    { pts: [[118, 142], [116, 144]], r: 9.5, kind: 'columns' },
    { pts: [[118, 142], [132, 136], [140, 128]], r: 2.0, kind: 'columns' },          // тупик с ложным огнём
    { pts: [[142, 126]], r: 3.1, kind: 'rubble' },
    { pts: [[118, 142], [120, 128], [124, 120]], r: 2.3, kind: 'rubble' },
    { pts: [[118, 142], [106, 150], [98, 156]], r: 2.3, kind: 'columns' },
    // затопленный грот
    { pts: [[108, 182], [106, 180]], r: 8, kind: 'water' },
    { pts: [[108, 182], [116, 190]], r: 3, kind: 'water' },
    { pts: [[108, 182], [100, 170], [96, 160]], r: 2.2, kind: 'water' },
    // перекрёсток трёх ходов
    { pts: [[94, 156]], r: 5, kind: 'rubble' },
    { pts: [[94, 156], [82, 162], [72, 166]], r: 2.0, kind: 'fissure' },             // тупик, где ждёт тень
    { pts: [[70, 167]], r: 3.3, kind: 'fissure' },
    { pts: [[94, 156], [86, 146], [80, 136]], r: 2.3, kind: 'rubble' },
    // стоянка семьи
    { pts: [[126, 116], [125, 115]], r: 6.5, kind: 'rubble' },
    { pts: [[126, 116], [114, 108], [102, 102]], r: 2.5, kind: 'void' },
    { pts: [[126, 116], [128, 100], [118, 84], [100, 72], [80, 66], [64, 66]], r: 2.2, kind: 'fissure' },  // длинный обход
    { pts: [[131, 100]], r: 2.6, kind: 'fissure' },
    // зал Веры
    { pts: [[78, 132], [77, 133]], r: 6.5, kind: 'rubble' },
    { pts: [[78, 132], [68, 140], [62, 148]], r: 2.0, kind: 'fissure' },             // её огонёк
    { pts: [[61, 149]], r: 2.8, kind: 'fissure' },
    { pts: [[78, 132], [80, 118], [84, 108]], r: 2.4, kind: 'void' },
    // пустота
    { pts: [[88, 98], [90, 96]], r: 12.5, kind: 'void' },
    { pts: [[74, 92]], r: 9.5, kind: 'void' },
    { pts: [[98, 86]], r: 8.5, kind: 'void' },
    { pts: [[70, 86], [64, 74], [60, 66]], r: 2.5, kind: 'void' },
    // глотка и Врата
    { pts: [[60, 66], [56, 62], [48, 50], [40, 44]], r: 2.2, kind: 'fissure' },
    { pts: [[40, 44], [30, 36]], r: 2.8, kind: 'gate' },
    { pts: [[30, 36], [29, 35]], r: 8, kind: 'gate' },
  ],
  start: { hero: [184.8, 198.6], lamp: [183.7, 197.5], dead: [181.6, 196.0] },
  flasks: [],                                   // масла в пещере нет: огонь живёт от жаровни до жаровни
  // жаровни: от одной до другой огонёк должен дожить; они же — точки возврата и то, что держит тьму за спиной
  braziers: [[157, 185.5], [121.4, 146.6], [91.5, 153], [80.6, 129.4], [117.5, 85], [86, 101], [63.6, 69], [49, 51.6], [138.4, 169.8]],      // последняя — в забое Ефима, перед кухней
  wisps: [{ id: 'w1', at: [142.4, 125.6] }, { id: 'w2', at: [61, 149.4] }, { id: 'w3', at: [103, 81] }, { id: 'w4', at: [117, 191] }, { id: 'w5', at: [147.2, 158.8] }, { id: 'w6', at: [131.4, 99.6] }],
  lures: [[103.5, 184], [97, 91]],
  efim: { at: [132.6, 170.4], fire: [134, 171.6] },
  vera: { at: [76.6, 133.8], wisp: 'w2', path: [[72, 137], [68, 140], [62.4, 148.2]] },
  mila: { at: [70.5, 90.5] },
  family: { fire: [126, 116] },
  shade: { at: [70.4, 167.2] },
  toy: { at: [172.4, 156.6] },
  gate: { at: [23.8, 29.8], bowl: [27.4, 33.4] },
  holes: [],                                    // прежние лазы «за маслом» убраны: масла нет
  cairns: [],                                   // пирамидки с лампами убраны: ламп больше нет
  rails: [[[168, 187.5], [160, 182.6], [156.2, 181.2]], [[148.4, 178.5], [140, 174.4], [133, 173]]],     // рельсы уходят под завал
  cart: [162.5, 180.5],
  zones: [
    { id: 'seeWisp', at: [126, 139], r: 4.5 },
    { id: 'peek', at: [115, 145], r: 3.5 },
    { id: 'water', at: [112, 181], r: 5 },
    { id: 'longDark', at: [101, 102], r: 5 },
    { id: 'longDark', at: [84, 109], r: 5 },
    { id: 'gust', at: [85, 97], r: 6 },
    { id: 'wave', at: [58.4, 64.4], r: 3.2 },
    { id: 'named', at: [52, 56], r: 4 },
    { id: 'gateHall', at: [38, 42], r: 4 },
  ],
  // ---- залы памяти и то, что в них (первый кусок; сюжет комнат — черновой, до сценария)
  rooms: [
    { // прихожая: ты просыпаешься у чужой двери
      id: 'hall', rect: [178.8, 192.6, 182.6, 198.4], floor: 'wood_planks_dirt', tile: 2.2, ragged: true,
      walls: [{ axis: 'z', at: 178.6, from: 190.6, to: 199.8, tex: 'decrepit_wallpaper', solid: true }],
      props: [
        { m: 'painted_wooden_cabinet', at: [179.25, 197.6], ry: Math.PI / 2, h: 0.95, r: 0.5 },
        { m: 'vintage_oil_lamp', at: [179.25, 197.6], y: 0.95, h: 0.42 },
        { m: 'hanging_picture_frame_01', at: [178.72, 193.5], ry: Math.PI / 2, y: 1.15, h: 0.62 },
      ],
    },
    { // кухня
      id: 'kitchen', rect: [123, 155, 131, 162], floor: 'old_linoleum_flooring_01', tile: 1.6,
      walls: [
        { axis: 'x', at: 155.02, from: 122.6, to: 131.4, tex: 'peeling_painted_wall' },
        { axis: 'z', at: 123.02, from: 154.6, to: 162.4, tex: 'peeling_painted_wall' },
      ],
      props: [
        { m: 'scandinavian_masonry_heater', at: [123.85, 155.95], h: 2.25, r: 0.8 },
        { m: 'vintage_grandfather_clock_01', at: [128.4, 155.4], h: 2.1, r: 0.4 },
        { m: 'vintage_crutches_01', at: [129.5, 155.3], ry: 0.3, h: 1.35 },
        { m: 'WoodenTable_01', at: [127.3, 159.3], s: [0.8, 1.42, 1.25], r: 0.75 },
        { m: 'painted_wooden_chair_01', at: [127.3, 158.3], h: 0.92, r: 0.3 },
        { m: 'painted_wooden_chair_01', at: [127.5, 160.35], ry: Math.PI + 0.3, h: 0.92, r: 0.3 },
        { m: 'pot_enamel_01', at: [126.9, 159.25], y: 0.78, h: 0.2 },
        { m: 'painted_wooden_cabinet', at: [123.5, 160.3], ry: Math.PI / 2, h: 1.1, r: 0.6 },
        { m: 'vintage_oil_lamp', at: [123.5, 160.6], y: 1.1, h: 0.45 },
        { m: 'hanging_picture_frame_01', at: [123.14, 158.1], ry: Math.PI / 2, y: 1.2, h: 0.7 },
      ],
    },
    { // плита в колонном зале: древняя кладка поперёк хода
      id: 'slab', rect: [105.7, 148.6, 108.6, 152], floor: 'rock_wall_10', tile: 2.4, ragged: true,
      walls: [{ axis: 'z', at: 105.6, from: 145.4, to: 155.2, tex: 'rock_wall_10', h: 3, solid: true }],
      props: [],
    },
  ],
  doors: [
    { id: 'hall', axis: 'z', at: [178.6, 195.3], kind: 'wood' },
    { id: 'kitchen', axis: 'x', at: [126.5, 155.02], kind: 'wood', lock: 'kitchen' },
    { id: 'slab', axis: 'z', at: [105.6, 150.3], kind: 'slab', lock: 'statue' },
  ],
  tights: [
    { id: 'collapse', kind: 'crawl', pts: [[155.8, 180.7], [149.2, 178.4]] },
    { id: 'crack', kind: 'squeeze', pts: [[126.5, 154.4], [126.5, 151.5], [123.5, 148.5]] },
  ],
  bowls: [
    { id: 'kitchen', bowls: [[124.7, 158.6], [129.9, 156.7], [129.6, 160.7]], glyphs: [0, 1, 2], order: [1, 2, 0], fresco: { axis: 'x', at: [125.2, 155.1], y: 1.45 }, scare: { seat: [127.3, 158.3], face: 0 } },
  ],
  shadows: [
    { id: 'statue', statue: [107.76, 148.87], face: Math.PI / 2, door: 'slab', fresco: { axis: 'z', at: [105.7, 152.3], y: 1.5 } },
  ],
};
