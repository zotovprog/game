// Детальные текстуры и модели (Poly Haven, CC0) лежат рядом со страницей в art/.
// Грузятся до начала игры; чего не хватило — рисуется прежними заготовками из примитивов.
import {
  Box3, BufferAttribute, BufferGeometry, DoubleSide, LinearSRGBColorSpace, MeshStandardMaterial, RepeatWrapping,
  SRGBColorSpace, Texture, TextureLoader, Vector3,
} from 'three';

export interface Part { geo: BufferGeometry; mat: MeshStandardMaterial }
/** Модель: части по материалам, основание в нуле по высоте, размер в метрах. */
export interface Model { parts: Part[]; size: Vector3 }
export interface TexSet { c: Texture; n: Texture }

const TEX = ['cliff_side', 'rock_face_03', 'brown_mud_rocks_01', 'wood_planks_dirt', 'old_linoleum_flooring_01', 'decrepit_wallpaper', 'peeling_painted_wall', 'worn_planks', 'rock_wall_10'] as const;
const MODELS = [
  'namaqualand_boulder_02', 'namaqualand_boulder_03', 'namaqualand_boulder_05', 'namaqualand_boulder_06',
  'wooden_crate_01', 'wooden_crate_02', 'wine_barrel_01', 'wooden_ladder', 'picke_dirty_01', 'wooden_bucket_01',
  'WoodenTable_01', 'painted_wooden_chair_01', 'painted_wooden_cabinet', 'vintage_grandfather_clock_01', 'scandinavian_masonry_heater',
  'hanging_picture_frame_01', 'pot_enamel_01', 'vintage_crutches_01', 'vintage_oil_lamp', 'gothic_statue',
] as const;
export type TexId = (typeof TEX)[number];
export type ModelId = (typeof MODELS)[number];

export const ART: { tex: Partial<Record<TexId, TexSet>>; models: Partial<Record<ModelId, Model>>; loaded: number; total: number; failed: string[] } = { tex: {}, models: {}, loaded: 0, total: TEX.length + MODELS.length, failed: [] };

/** Загрузить всё, что есть. onStep — для строки загрузки. Ошибки не роняют игру. */
export async function loadArt(base = 'art/', onStep?: (done: number, total: number) => void): Promise<void> {
  const tl = new TextureLoader();
  const step = () => { ART.loaded++; onStep?.(ART.loaded, ART.total); };
  const tex = async (id: TexId) => {
    const load = async (suffix: string, srgb: boolean) => {
      const t = await tl.loadAsync(`${base}tex/${id}_${suffix}.webp`);
      t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = srgb ? SRGBColorSpace : LinearSRGBColorSpace; t.anisotropy = 4;
      return t;
    };
    const [c, n] = await Promise.all([load('c', true), load('n', false)]);
    ART.tex[id] = { c, n };
  };
  // геометрия всех моделей — одним файлом; картинки — отдельными: [цвет, нормаль, прозрачность] на материал
  type Baked = Record<string, { tex: [string | null, string | null, number][]; parts: { k: number; pos: string; nor: string; uv: string; idx: string; big: number }[] }>;
  const baked: Baked = await fetch(`${base}models.json`).then((r) => (r.ok ? r.json() : {}), () => ({}));
  const bytes = (s: string): ArrayBuffer => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  const model = async (id: ModelId) => {
    const src = baked[id];
    if (!src) throw new Error('нет в models.json');
    const mats = await Promise.all(src.tex.map(async ([c, n, alpha]) => {
      const load = async (file: string | null, srgb: boolean) => {
        if (!file) return null;
        const t = await tl.loadAsync(`${base}models/${file}`);
        t.flipY = false; t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = srgb ? SRGBColorSpace : LinearSRGBColorSpace; t.anisotropy = 2;
        return t;
      };
      const [map, normalMap] = await Promise.all([load(c, true), load(n, false)]);
      return new MeshStandardMaterial({ map, normalMap, roughness: 0.85, metalness: 0, transparent: !!alpha, opacity: alpha ? 0.35 : 1, side: DoubleSide });
    }));
    const parts: Part[] = [], box = new Box3();
    for (const p of src.parts) {
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(new Float32Array(bytes(p.pos)), 3));
      geo.setAttribute('normal', new BufferAttribute(new Int8Array(bytes(p.nor)), 3, true));
      geo.setAttribute('uv', new BufferAttribute(new Float32Array(bytes(p.uv)), 2));
      geo.setIndex(new BufferAttribute(p.big ? new Uint32Array(bytes(p.idx)) : new Uint16Array(bytes(p.idx)), 1));
      geo.computeBoundingBox();
      box.union(geo.boundingBox!);
      parts.push({ geo, mat: mats[p.k] ?? mats[0] ?? new MeshStandardMaterial({ color: 0x777777 }) });
    }
    if (!parts.length) return;
    // основание — на полу, середина — в нуле
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    for (const p of parts) { p.geo.translate(-cx, -box.min.y, -cz); p.geo.computeBoundingBox(); p.geo.computeBoundingSphere(); }
    ART.models[id] = { parts, size: box.getSize(new Vector3()) };
  };
  const safe = (id: string, p: Promise<void>) => p.then(step, (e) => { ART.failed.push(`${id}: ${String(e).slice(0, 80)}`); step(); });
  await Promise.all([...TEX.map((id) => safe(id, tex(id))), ...MODELS.map((id) => safe(id, model(id)))]);
}

/** Текстура загружена? Тогда новый вид; нет — прежний. */
export const hasTex = (id: TexId): boolean => !!ART.tex[id];
export type { Texture };
