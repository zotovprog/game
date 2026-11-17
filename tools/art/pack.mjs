// Сжимает модель Poly Haven под игру: node pack.mjs <in.gltf> <outDir> <id> <треугольников> <размер текстур> [ошибка упрощения]
// На выходе: <id>.glb (только сетка) и картинки <id>_<k>_c.webp / _n.webp отдельными файлами; строка оглавления — в stdout (JSON).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, weld, simplify, prune, textureCompress, getBounds } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
const [src, outDir, id, trisArg = '2000', texArg = '512', errArg = '0.02'] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const root = doc.getRoot();
const count = () => root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const before = count();
for (const m of root.listMaterials()) { m.setMetallicRoughnessTexture(null); m.setOcclusionTexture(null); m.setEmissiveTexture(null); m.setRoughnessFactor(0.85); m.setMetallicFactor(0); }
await MeshoptSimplifier.ready;
await doc.transform(dedup(), flatten(), join(), weld());
const ratio = Math.min(1, +trisArg / before);
if (ratio < 0.95) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: +errArg, lockBorder: false }));
await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [+texArg, +texArg], quality: 82 }));
// картинки — отдельными файлами; в модели остаются только имена материалов по порядку
const mats = root.listMaterials().map((m, k) => {
  const c = m.getBaseColorTexture(), n = m.getNormalTexture(), e = { name: `m${k}`, c: null, n: null, alpha: m.getAlphaMode() !== 'OPAQUE' };
  if (c?.getImage()) { e.c = `${id}_${k}_c.webp`; fs.writeFileSync(`${outDir}/${e.c}`, c.getImage()); }
  if (n?.getImage()) { e.n = `${id}_${k}_n.webp`; fs.writeFileSync(`${outDir}/${e.n}`, n.getImage()); }
  m.setName(e.name); m.setBaseColorTexture(null); m.setNormalTexture(null);
  return e;
});
await doc.transform(prune({ keepAttributes: true }));
const b = getBounds(root.getDefaultScene() ?? root.listScenes()[0]);
await io.write(`${outDir}/${id}.glb`, doc);
console.error(id, 'tris', Math.round(before), '→', Math.round(count()), 'mats', mats.length, 'size', b.max.map((v, i) => (v - b.min[i]).toFixed(2)).join(' x '));
console.log(JSON.stringify({ id, mats }));
