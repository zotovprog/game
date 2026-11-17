// Текстуры Poly Haven → 512² webp (цвет и нормаль): node tex.mjs <папка со скачанным (tex/<id>/Diffuse.jpg)> <куда> <id>...
import sharp from 'sharp';
import fs from 'node:fs';
const [SRC, OUT, ...ids] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
for (const arg of ids) {
  const [id, size = '512'] = arg.split(':');
  await sharp(`${SRC}/tex/${id}/Diffuse.jpg`).resize(+size, +size).webp({ quality: 84 }).toFile(`${OUT}/${id}_c.webp`);
  await sharp(`${SRC}/tex/${id}/nor_gl.jpg`).resize(+size, +size).webp({ quality: 88 }).toFile(`${OUT}/${id}_n.webp`);
  console.log(id, fs.statSync(`${OUT}/${id}_c.webp`).size, fs.statSync(`${OUT}/${id}_n.webp`).size);
}
