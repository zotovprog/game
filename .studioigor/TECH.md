# Technology — Пещера помнит

<!-- Phase 3 (references/stack.md). ENGINE — one of: godot, godot-mono, unity,
unreal, web, defold, bevy (read by studio.py and envcheck.py). DIMENSION — 2D or 3D
(2.5D with 3D models is 3D); envcheck.py recommends Blender for 3D. -->
ENGINE: web
ENGINE VERSION: Three.js 0.187 (r187), Vite 8, TypeScript 6
DIMENSION: 3D
LANGUAGE: TypeScript
PLATFORMS: web

## Decision
- context: 3D-изометрия, атмосферный хоррор, браузер (десктоп + телефон), демо 5–7 минут как первая глава полной игры; главное — свет и тьма
- options: Three.js — лёгкий (<1 МБ), полный контроль над светом/шейдерами, всё код / нет редактора уровней; Babylon.js — полный движок, инспектор, физика / сборка в разы тяжелее, лишнее для этой игры; Godot web — редактор, путь в Steam / ~40 МБ wasm, нестабилен на iOS Safari
- choice and why: Three.js (пользователь: «Да, Three.js») — look-dev уже работает на нём, подтверждено кадрами; подходит и для полной игры: глубины добавляются как данные
- consequences: модели, анимация и звук — процедурные, в коде (Blender не нужен); столкновения — свой код по сетке; уровни — данные в src/data; хостинг — любой статический

## Budgets
60 fps на десктопе, ≥30 fps на телефоне в худший момент (тени 1024 → 512 на телефоне); draw calls ≤ 150; сборка ≤ 1.5 МБ gzip; загрузка ≤ 3 с; без внешних ассетов.

## Project structure
- `src/main.ts` — параметры `?scene=&seed=&debug=`, запуск цикла
- `src/core/` — rng, ввод, сохранение · `src/data/` — стиль, тюнинг, уровень, тексты
- `src/world/` — сетка пещеры и столкновения · `src/systems/` — лампа, духи, спутники, сюжет
- `src/view/` — сцена, тьма, модели, пост · `src/audio/` — процедурный звук · `src/ui/` — DOM поверх canvas
- `src/scenes/` — игра и тестовые сцены (gyms) · `tools/` — capture · `tests/` — vitest
