# Design — Пещера помнит

A living document. Changes after playtests — with a line in "Changelog".

## Mechanics
<!-- Statuses: idea → spec → gym → playtest → locked, or cut. tier: mvp — needed
for the vertical slice; full — later. Before a mechanic — research research/mech-<id>.md. -->
| id | mechanic | tier | pillar | status | scene | notes |
|---|---|---|---|---|---|---|
| M01 | Лампа: ходьба, круг света, масло тает, тьма душит | mvp | Свет = жизнь | idea | — | 30-s loop |
| M02 | Фитиль: игрок сам крутит яркость (расход ↔ безопасность) | mvp | Свет = жизнь | idea | — | фишка G1 |
| M03 | Духи тьмы: кружат у границы света, заходят при тусклом, забирают в темноте | mvp | Тьма живая | idea | — | |
| M04 | Источники света: масло, жаровни-островки | mvp | Свет = жизнь | idea | — | |
| M05 | Ложные огни: приманки духов, отличимы по цвету и дрожанию | mvp | Тьма живая | idea | — | фишка G4 |
| M06 | Потерянные: выбор, спутник с огарком пьёт свет, брошенный → дух-преследователь | mvp | Доброта стоит света | idea | — | 5-min loop |
| M07 | Диалоги и катсцены (пробуждение, встречи, финалы) | mvp | Пещера помнит | idea | — | |
| M08 | Врата и 3 финала: выйти / вместе / маяк | mvp | Пещера помнит | idea | — | |
| M09 | Твой след остаётся: дух и лампа прошлой попытки, маяк | mvp | Пещера помнит | idea | — | фишка G3, localStorage |
| M10 | Резкие удары: 2–3 срежиссированных момента | mvp | Тьма живая | idea | — | |

## Game designer ideas
<!-- references/gamedesigner.md. Statuses: proposed → approved → M## | rejected (why) | deferred.
Do not propose rejected ideas again. Do not implement unapproved ones. -->
| id | idea | why it's fun | cost S/M/L | point (phase) | status |
|---|---|---|---|---|---|
| G1 | Фитиль в твоих руках | жадность и страх спорят каждую секунду | S | 1 | approved → M02 |
| G2 | Вспышка: сжечь масло разом, отбросить духов и увидеть пещеру | дорогой спасательный круг и самый страшный кадр | S | 1 | rejected (пользователь не выбрал) |
| G3 | Твой след остаётся | пещера помнит тебя лично; повод пройти иначе | M | 1 | approved → M09 |
| G4 | Ложные огни | каждый далёкий свет — вопрос «идти или нет» | S | 1 | approved → M05 |

## Content
<!-- phase 8 (references/production.md): one line per unit. Statuses: sketch → blockout → art → final. -->
| id | new | signature moment | difficulty 1–10 | axes of difference from the neighbor | story beat | status |
|---|---|---|---|---|---|---|

## Progression and meta
- Прогрессия — знание, не цифры: прорыв 1 — понял фитиль; прорыв 2 — научился отличать ложный огонь; прорыв 3 — увидел, чем аукается брошенный.
- Мета: след прошлой попытки (дух, лампа, маяк) и 3 финала.

## Economy
<!-- resource: sources → sinks, rate (a guess is fine) -->
- масло (0–100): источники — склянки (+25), жаровни (долив до 60 и безопасный островок), лампа прошлой попытки; стоки — горение (≈0.6–1.6/с по фитилю), спутник (+35% расхода каждый), зажечь огарок спутнику (−20 разом), касание духа (−10).

## Difficulty
- philosophy: давит, но честно: гибель всегда читается заранее (круг сжимается, звук глохнет, духи ближе).
- axes: расстояние между источниками, число духов, число спутников, доля ложных огней.

## Mechanic specs
<!-- ### M01 — Name
what · why (pillar) · controls · rules · parameters (in data files) ·
acceptance criteria · "feel" (targets) · research: research/mech-M01.md -->

## Changelog
| date | what | why |
|---|---|---|
