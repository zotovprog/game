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
Облачная сессия: редактора и MCP нет, игра — код. Агент видит игру через Playwright: tools/shot.mjs (кадр), tools/places.mjs (все места уровня), tools/tour.mjs (сюжет и выборы до финала), tools/tour2.mjs (вступление, гибель, след, телефон), tools/party.mjs (пустой верх экрана, захват, спасение, привал, потеря), tools/dark.mjs (тьма при разном свете), tools/check.mjs (точка возврата, бросок, вал), tools/hands.mjs (огонёк у жаровни, ветер, раздувание, диалоги, память огней, тьма за спиной), tools/forsaken.mjs (глаза, идущий, крик, кости, тени зовут Тёму), tools/voicecheck.mjs (записанные голоса грузятся и звучат; нужен http, не file://), tools/pace.mjs (бот проходит первые минуты и печатает журнал темпа: что и когда свалилось на игрока, плотность слов и угроз по 30 с), tools/perf.mjs (вызовы отрисовки, треугольники, время кадра — сравнивать «до/после»), tools/capture.mjs. Сборку удобнее проверять без сервера: `node tools/artifact.mjs <файл>` и открыть его как file://. Пользователь играет по ссылке-артефакту (tools/artifact.mjs склеивает dist/ в один HTML).

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
- Параметры URL: `?skip=1` без вступления, `?reset=1` забыть след, `?debug=1` панель настройки и телепорты ко всем сценам (заменяет отдельные gym-сцены).
- Headless-рендер программный и медленный: игровое время в съёмке идёт в разы медленнее реального.

- Озвучка: `node tools/voice.mjs --dry` (посчитать) / `node tools/voice.mjs` (дозаписать недостающее через ElevenLabs и переупаковать). Ключ — сетевой секрет окружения `game` для api.elevenlabs.io, в скрипт не передаётся. Пакеты лежат в public/voice, оглавление — src/data/voice.json. При публикации артефакта пакеты идут отдельными файлами (`files`, корень `public`, пути `voice/*.mp3`); по file:// голосов нет — игра сама возвращается к синтезированному бормотанию.
