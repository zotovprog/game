# Environment — Пещера помнит

<!-- Phase 4 (references/environment.md). Commands verified by a real run.
VERIFIED is switched only by `studio.py verify`. CAPTURE writes images to
.studioigor/captures/. -->
VERIFIED: no

## Installed
| tool | version | why |
|---|---|---|
| node / npm | 22.23 / 10.9 | сборка |
| three | 0.187 | рендер |
| vite / typescript | 8.3 / 6.0 | dev-сервер и сборка |
| vitest | 5.1 | тесты чистой логики (лампа, достижимость уровня) |
| eslint + typescript-eslint, prettier | 10 / 8 | линтер |
| playwright (системный, симлинк в node_modules) | chromium 1243 | съёмка кадров |

## Agent integrations
Облачная сессия: редактора и MCP нет, игра — код. Агент видит игру через Playwright (tools/capture.mjs, tools/shot.mjs, tools/tour.mjs, tools/tour2.mjs). Пользователь играет по ссылке-артефакту (tools/artifact.mjs склеивает dist/ в один HTML).

## Commands
RUN: npm run dev
TEST: npx tsc --noEmit && npx vitest run
BUILD: npm run build
CAPTURE: npm run build && node tools/capture.mjs --dir dist --url "http://127.0.0.1:{port}/?skip=1&reset=1" --out .studioigor/captures/hello --duration 4 --every 1 --wait-for "window.__GAME__?.ready"
EDITOR: none — the code is in the repository

## Pitfalls
- Скилл studioigor лежит вне репозитория (scratchpad сессии). В новой сессии: `git clone --depth 1 https://github.com/studioigor/studioigor-skill` и запускать `scripts/studio.py` оттуда.
- Playwright не ставить через npm: в облаке он системный (`/opt/node-tools/node_modules/playwright`), в проекте — симлинк `node_modules/playwright`.
- Сеть облака отклоняет Steam/Wikimedia/Openverse: референсы через refs.py недоступны.
- Параметры URL: `?skip=1` без вступления, `?reset=1` забыть след, `?debug=1` панель настройки, `?scene=gym` тестовая пещера.
- Headless-рендер программный и медленный: игровое время в съёмке идёт в разы медленнее реального.
