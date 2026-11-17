// Геометрия моделей → один JSON (страница-артефакт не раздаёт .glb): node bake.mjs <папка с <id>.glb> <оглавление art.json> <out models.json>
// На модель: tex — [цвет, нормаль, прозрачность] по материалам; parts — сетки: k (материал), pos/uv (Float32), nor (Int8), idx (Uint16/32) в base64.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'node:fs';
const [dir, manifest, out] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const man = JSON.parse(fs.readFileSync(manifest, 'utf8')), res = {};
let bytes = 0;
for (const id of Object.keys(man)) {
  const doc = await io.read(`${dir}/${id}.glb`), parts = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), U = prim.getAttribute('TEXCOORD_0'), I = prim.getIndices(), n = P.getCount();
      const pos = new Float32Array(n * 3), nor = new Int8Array(n * 3), uv = new Float32Array(n * 2), v = [0, 0, 0], w = [0, 0];
      for (let i = 0; i < n; i++) {
        P.getElement(i, v);
        pos[i * 3] = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12]; pos[i * 3 + 1] = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13]; pos[i * 3 + 2] = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
        if (N) { N.getElement(i, v); const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2], y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2], z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2], l = Math.hypot(x, y, z) || 1; nor[i * 3] = Math.round((x / l) * 127); nor[i * 3 + 1] = Math.round((y / l) * 127); nor[i * 3 + 2] = Math.round((z / l) * 127); }
        if (U) { U.getElement(i, w); uv[i * 2] = w[0]; uv[i * 2 + 1] = w[1]; }
      }
      const cnt = I ? I.getCount() : n, big = n > 65535, idx = big ? new Uint32Array(cnt) : new Uint16Array(cnt);
      for (let i = 0; i < cnt; i++) idx[i] = I ? I.getScalar(i) : i;
      bytes += pos.byteLength + nor.byteLength + uv.byteLength + idx.byteLength;
      parts.push({ k: +(prim.getMaterial()?.getName() ?? 'm0').slice(1) || 0, pos: b64(pos), nor: b64(nor), uv: b64(uv), idx: b64(idx), big: big ? 1 : 0 });
    }
  }
  res[id] = { tex: man[id], parts };
}
fs.writeFileSync(out, JSON.stringify(res));
console.log(Object.keys(res).length, 'моделей ·', (bytes / 1024).toFixed(0), 'КБ геометрии ·', (fs.statSync(out).size / 1024).toFixed(0), 'КБ файл');
