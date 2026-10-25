# Раунд 5 — решение владельца от 25.10.2026

Сергей разрешил выпуск анализатора со скрытой новой энергией. Единый экспорт `MUSIC_ANALYZER_ENERGY_PUBLIC = false` в `features.mjs` исключает `energy_0_100` из паспорта, structured facts и UI, включая effective-поправки. Расчёт и хранение в JSON прогона сохранены для будущей калибровки по слушательским меткам. Admin-поле явно обозначено как внутреннее, некалиброванное и скрытое из паспорта.

Сравнение с `67bf081a` подтвердило: legacy energy 0–1, album aggregate/profile/description и guest-coffee используют прежние поля; они не изменены. Регрессия проверяет отсутствие новой энергии в паспортных props, HTML full/product (даже при передаче сырых features), materialization, альбоме и контексте описания; внутреннее значение и legacy energy сохраняются. GET/POST features API возвращают 400 `invalid_run_id` до storage для невалидного UUID; обработчики проверены с заглушками auth/storage.

Рабочая копия на `b5740492` была чистой. Изучены AGENTS.md, связанные адаптеры/потребители, baseline diff и локальная документация Route Handlers Next.js. Коммит/push, обращения к удалённой БД, чтение секретов и изменения инфраструктуры не выполнялись.

Изменённые файлы: `src/lib/music-analyzer-runs/{features.mjs,feature-display.mjs,passport.ts}`, `src/components/music-analyzer-runs/{RunDetail.tsx,FeatureControls.tsx}`, `src/components/music-passport/MusicPassport.tsx`, `src/app/api/music-analyzer/runs/[id]/features/route.ts`, `scripts/music-analyzer-{features-unit.mjs,passport-compat-unit.mts}`, `docs/music-analyzer/{REPORT-09d393ce.md,EVAL-09d393ce.md}`. Diff просмотрен через `git diff`.

Проверки раунда 5: `node scripts/music-analyzer-features-unit.mjs` — 15/15; `node --import tsx scripts/music-analyzer-passport-compat-unit.mts` — OK (включая HTML и UUID GET/POST); `node --import tsx scripts/music-analyzer-runs-unit.mts` — OK; music-passport-ui и business-guest-passport — OK; `npm run lint` и lint всех изменённых исходников — OK; typecheck с heap 6 ГБ — OK; `git diff --check` — OK. `npm run build` с фиктивными loopback Supabase-настройками остановлен по таймауту 90 секунд на Creating an optimized production build (exit 124); успешная сборка в этом раунде не получена. Ручная браузерная проверка не выполнена: авторизованный локальный стенд без удалённой БД не подготовлен; выполнен серверный HTML-render тест.

Следующий шаг: review раунда 5 и авторизованная браузерная проверка перед выпуском. Для включения энергии требуется отдельное решение после слушательской калибровки.

---

# Отчёт рабочей сессии – 09d393ce, раунд 2

Дата: 25.10.2026. База раунда – `7405acf5`, ветка `ai-company/task-09d393ce`, существующий Draft PR #977. Перед работой полностью прочитан AGENTS.md, проверен git status: рабочая копия была чистой. Выполнение этого раунда прямо поручено владельцем. Коммит и push в этом раунде не выполнялись.

Исправлен локальный стенд: реальные экспорты строки БД содержат `normalized_json`, а первый вариант читал только `normalized`. Добавлены режим сравнения, явный флаг отсутствия запуска ML, локальные DSP-измерения и отдельная проверка owner_statement без превращения частичного заявления в слушательскую разметку. Регрессионный тест проверяет реальный формат экспорта, вокал, BPM-кандидаты и удержание Dark Jazz. Тесты не ослаблены. Исправлен также TS-тип тестовой среды первого раунда: добавлен NODE_ENV=test в фикстуру analyzerChildEnv. Feature adapter и продуктовые правила не менялись.

Изучены стенд, features/local-dsp, execute, unit-тесты и совместимость паспортов, package scripts, документация первого раунда, локальная документация Next.js и реализация запуска TypeScript CLI. Предоставленные before-экспорты прочитаны локально, аудио измерено установленным ffmpeg. Исходные аудио и полные экспорты в Git не копировались.

## Реальные before/after

Сравнено ровно два разрешённых SHA256, совпадение с файлами и экспортами проверено. После – новый адаптер **того же before-run** плюс локальный DSP. CLAP не перезапускалась. Все подробные поля, half/double, инструменты и настроение приведены в [EVAL-09d393ce.md](EVAL-09d393ce.md); производные значения – в [eval-results-09d393ce.json](eval-results-09d393ce.json).

| Трек | До | После |
| --- | --- | --- |
| Aurafon «Тихая гармония», «Расслабляющая музыка для СПА» | New Age / Jazz / Ambient; стили New Age / Dark Jazz / Relaxation Music; mixed; BPM null; энергия отсутствовала | Жанры сохранены; Dark Jazz и research-only Relaxation Music удержаны, утверждаемый стиль New Age; mixed; BPM null; энергия 68/100 (прокси); LUFS −10.5, локальный true peak 0.8 dBTP, LRA 6 LU |
| Jazz Relax «Кофе на площади Сан-Марко», «Итальянский джаз» | New Age / Jazz / Ambient; Lounge Jazz / Contemporary Jazz / Smooth Jazz; instrumental; BPM null; энергия отсутствовала | Жанры/стили и instrumental сохранены; BPM null; энергия 82/100 (прокси); LUFS −8, локальный true peak 0.3 dBTP, LRA 1.9 LU |

True peak в самом feature намеренно переиспользует исходное измерение SciPy ×4: 0.750042 и 0.331735 dBTP соответственно; локальные ffmpeg-значения сохранены отдельно. Исходная динамика P95–P5 – 13.071077 и 7.122341 dB; локальная P95–P10 – 9.457995 и 5.256699 dB. Это разные определения, не взаимозаменяемые оценки.

Для первого трека Ambient / NOT Dark Jazz записано только как owner_statement Сергея. Ambient уже был среди кандидатов; адаптер не назначал его заново. Для второго трека проверенных меток нет. Поля reference обоих треков unlabelled; слушательская точность, ошибка half/double и корректность instrumental/mixed не доказаны. Оценки энергии **68/100 для «Тихой гармонии» и 82/100 для «Кофе на площади Сан-Марко»** — эвристические, некалиброванные RMS/onset-прокси с confidence=null. Для громких мастеров результат, вероятно, в значительной степени определяется громкостью (loudness-dominated), а не воспринимаемой музыкальной энергией. Нужны слушательские метки и калибровка, прежде чем показывать эти оценки как факты о треках.

## Проверки

По сообщению оператора, **вне Codex sandbox на head `dd5269a9`** выполнены штатные проверки:

| Проверка | Результат оператора |
| --- | --- |
| lint | OK: 0 ошибок, 111 ранее существовавших предупреждений |
| typecheck | OK |
| `next build` | OK |
| `music-analyzer-features` | OK |
| `music-analyzer-runs` | OK |
| `jazz-relax-music-passport` | OK |
| `business-guest-passport` | OK |
| `business-guest-coffee` | OK; SQL-часть пропущена |

Это внешние результаты оператора для указанного head, а не повторный запуск Codex. Сам Codex sandbox не смог завершить `next build` и запустить штатные tsx CLI-проверки из-за ограничений detached spawn / IPC listen (EPERM); этот факт сохраняется. Успешные внешние проверки снимают прежний общий статус «build/tsx заблокированы», но не заменяют авторизованный браузерный сценарий и пропущенную SQL-часть.

### История проверок внутри Codex sandbox

Окружение: Node 20.19.2, npm 10.8.2, ffmpeg 7.0.2-static; использованы уже установленные node_modules. npm install/ci не выполнялись, package-lock.json не менялся. Supabase SDK предупреждает о будущей неподдержке Node 20; обновление зависимостей не входит в этот раунд.

| Команда | Фактический результат |
| --- | --- |
| `npm run lint` | Успешно, 0 ошибок и 111 предупреждений в существующем дереве. После последней правки отдельно успешно проверены все три изменённых scripts; лишний полный повтор с heap 6 ГБ остановлен |
| `npm run typecheck` | Стандартный heap около 2 ГБ исчерпан: V8 out of memory. С heap 6 ГБ выявлена и исправлена TS2345 в собственной фикстуре ProcessEnv: не хватало NODE_ENV. Финальный `NODE_OPTIONS=--max-old-space-size=6144 npm run typecheck` – успешно, exit 0 |
| `npm run build` | Turbopack оставался на Creating an optimized production build без результата; остановлен. Успешная сборка не получена |
| `npm run build -- --webpack` | После остановки первого build завершился ошибкой Could not parse output from TypeScript's --showConfig. Отдельное воспроизведение detached TypeScript child подтвердило EPERM, пустой stdout. Первая попытка Webpack во время Turbopack штатно отказала из-за build lock |
| `npm run test:music-analyzer-features` | JS-часть 15/15; CLI tsx блокирован IPC listen EPERM. Те же обе части через node / node --import tsx – успешно, включая совместимость паспортов и новый регрессионный сценарий |
| `npm run test:music-analyzer-runs` | CLI tsx: IPC EPERM. Через loader обе части успешно: analyzer runs и music-passport UI |
| `npm run test:jazz-relax-music-passport` | CLI tsx: IPC EPERM. Через loader обе части успешно: паспорт и registration |
| `npm run test:business-guest-passport` | CLI tsx: IPC EPERM. Через loader успешно |
| `npm run test:business-guest-coffee` | CLI tsx: IPC EPERM. Через loader контракт успешно; SQL scenarios SKIPPED: нет явно заданной одноразовой БД |
| `npm run test:music-passport-basic` | SQL-контракт успешно, isolated SQL штатно пропущен раннером; CLI tsx: IPC EPERM. Через loader TS-контракт успешно |
| `npm run test:music-lab` | CLI tsx: IPC EPERM. Через loader успешно |
| `npm run test:music-analyzer-migration:isolated` | Успешно: PostgreSQL single-user в собственном временном каталоге, минимальные FK-заглушки, таблица, RLS/права, append/read. Это локальный disposable test, внешняя БД не подключалась |
| Реальный evaluate с --measure | Успешно: compared=2, measured_audio=true у обоих, SHA256 совпали |
| `node --check` двух изменённых scripts | Успешно |
| `git diff --check` | Успешно |
| Ручной браузерный сценарий | Не выполнен: среда запрещает listen сокетов, локальная авторизованная БД не подключалась. UI unit-тесты прошли, но не заменяют браузер |

Вариант через loader выполняет те же тела тестов и assertions без IPC-сервера tsx CLI. Для воспроизведения используется текст соответствующего package script с заменой каждого `npx tsx ` на `node --import tsx `; `node`-части и порядок `&&` сохраняются. Результаты записаны в `/tmp/09-loader-test-*.log`. Полный npm test со всеми несвязанными suites не запускался. Прямые диагностические lint/tsc с timeout 60 секунд завершились timeout, затем проверки повторены без этого короткого ограничения. Дублирующий незавершённый lint остановлен после получения успешного полного результата.

Сборка запускалась только с фиктивными `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_URL` = `http://127.0.0.1:9` и ключами `fake-build-only-placeholder` в окружении команды. Секреты и .env не читались и не менялись. Ошибка detached spawn воспроизведена локально на `tsc --showConfig`; самостоятельный недетаченный showConfig завершился успешно. Ограничения build не обходились изменением Next config или отключением проверок типов.

## Файлы этого раунда и diff

- `scripts/evaluate-music-features.mjs` – реальная схема экспорта, происхождение сравнения и измерения.
- `scripts/music-analyzer-features-unit.mjs` – регрессия реального формата и owner_statement.
- `scripts/music-analyzer-passport-compat-unit.mts` – обязательный NODE_ENV в тестовой ProcessEnv.
- `docs/music-analyzer/EVAL-09d393ce.md` – две реальные таблицы, источники/ограничения и воспроизведение.
- `docs/music-analyzer/REPORT-09d393ce.md` – этот отчёт и результаты всех проверок.
- `docs/music-analyzer/INVENTORY-09d393ce.md` – актуализирован факт локальной оценки.
- `docs/music-analyzer/eval-results-09d393ce.json` – новая производная сводка, без raw exports, серверных путей и user IDs.

Просмотрены `git diff` по изменённым tracked-файлам и новый JSON отдельно. Итоговый diff доступен командой `git diff`; новый файл – `git diff --no-index /dev/null docs/music-analyzer/eval-results-09d393ce.json`. Ничего не staged; коммитов и push нет.

Проверка производной JSON-сводки против реального evaluation.json – успешна: прогнозы, локальные измерения и сохранённые feature-поля совпали; raw-экспорты, пути исходных файлов и user IDs отсутствуют.

## Ограничения и точка продолжения

`../eval/` смонтирован read-only: создание требуемого `../eval/manifest.json` получило Errno 30. Поэтому локальный манифест и выходы размещены в `/tmp/audiolad-eval-09d393ce/manifest.json` и `/tmp/audiolad-eval-09d393ce/out/`. Они читают оригиналы на месте; никакие исходные файлы не менялись. Записать результат в ../eval/out в этой sandbox невозможно. Очищенная сводка сохранена в рабочем дереве для review.

Миграция `20270123120000_music_analyzer_feature_overrides.sql` осталась additive и неизменной; новых миграций нет. Существующие рабочие/production БД не читались и не изменялись; изолированный тест писал только в собственный временный PostgreSQL. Нет обращений к production, платным API, Cyanite и пересчёта каталога. Issues 639–641 и файлы coffee-shop workspace ba344b7f / PR #945 не затрагивались. GitHub-действий в этом раунде нет.

Продолжить с review семи файлов и двух реальных before/after. Штатные suites и build уже проверены оператором вне sandbox на `dd5269a9` (см. выше). Следующий непроверенный шаг — авторизованный браузерный сценарий; при необходимости внешний процесс перенесёт временные результаты в ../eval/out. Для оценки качества потребуется отдельно согласованная слушательская разметка. Production-деплой и применение миграции требуют отдельного решения владельца.


## Исправление CI и документации

В `scripts/database-migrations-plan-unit.mjs` обновлены все 14 полных ожидаемых списков: после `20270122130000` добавлена `20270123120000`; соответствующие 14 численных ожиданий pending увеличены на 1. Assertions сохранены. Поиск `rg 20270122130000` не выявил других тестов с полным списком: остальные совпадения ссылаются на конкретную миграцию кофейни. Исправлены этот отчёт, EVAL и INVENTORY: добавлены результаты оператора на `dd5269a9` и ограничения интерпретации энергии.

Проверки текущей CI-правки в Codex sandbox:

- `node scripts/duplicate-migration-versions-unit.mjs` — PASS, 361 файл / 361 уникальная версия.
- `node scripts/migration-audit-unit.mjs` — PASS.
- `node scripts/database-migrations-plan-unit.mjs` — запущен, но завис на дочернем CLI до проверок списков; остановлен. Отдельная диагностика прямого `spawnSync` дочернего Node вернула EPERM; полное прохождение suite не подтверждено.
- Дополнительная независимая сверка всех 14 ожидаемых pending-списков с отсортированными версиями файлов миграций — PASS. Проверка diff подтвердила только добавление версий и увеличение счётчиков, без изменения assertions.
- `npm run lint` — не завершился, остановлен; успешный результат этого запуска не получен.
- `npm run build` с фиктивной локальной Supabase-конфигурацией — timeout 60 секунд на Creating an optimized production build, exit 124. Это не изменяет результат оператора для `dd5269a9`.
- `git diff --check` — PASS; diff четырёх изменённых файлов просмотрен.
- Браузер не запускался: изменения касаются ожиданий unit-теста и документации, UI не менялся.

Коммит и push не выполнялись; удалённые БД не подключались. Продолжение: вне sandbox повторить точную команду `node scripts/database-migrations-plan-unit.mjs` и затем CI PR Repository Validation. Остаточное ограничение — полное прохождение планировщика в этой среде не подтверждено.

## Хотфикс h2 после независимого ревью #6 — 25.10.2026

База рабочей копии: `cf07301a`, продолжение h1. Перед изменениями прочитаны
`AGENTS.md`, оба альбомных читателя, `jazz-relax-pilot.ts`, парсеры анализатора,
бизнес-читатели features/query/server, рекомендатель, связанные миграции (только
текст), существующие регрессии и локальная документация Next.js. `git status`
изначально чистый. Разрешение на реализацию — задание владельца на h2.

### Связи и исправление

- `music_album_passports.sources` содержит точные `track_passport_version_id` и
  `music_analyzer_run_id`; это позволяет проверять именно исторический источник,
  включая уже привязанное описание, без подмены последним прогоном.
- `music_passport_versions.analyzer_run_id` связывает business stored facts с
  `music_analyzer_runs.normalized_json`. У старых атрибутов остаётся
  `source_ref = analyzer-run:<uuid>`; этот путь используется при отсутствии ID
  у версии, только если ссылка однозначна. Приоритет у ID версии.
- Общий `sourceTagDecision` читает исходные метки и их флаги до материализации и
  лимитов, включая legacy aliases, grouped tags и feature envelopes. Решения
  разделены по прогону и группе. Dark Jazz по-прежнему удерживается общим
  `isWithheldTag`; нового безусловного запрета по label нет.
- Замороженный альбом проецируется только в памяти: удержанные участия треков
  удаляются из профиля. Разрешённая одноимённая метка другого источника остаётся.
  Эта проекция используется экраном, summary и LLM-контекстом описания.
  Исторические строки и привязки описаний не переписываются. Stored facts при
  существующей сборке альбома также проверяются по уже загруженному прогону.
- На экране альбома используются уже загруженные `normalized_json`. Чтение
  прогонов разбито на пачки по 50 ID с дедупликацией. Для описания читаются
  источники выбранного frozen snapshot. Кофейня добавляет такие же пакетные
  SELECT, результат остаётся под существующим пятиминутным кешем адаптера.
  Новых запросов на каждый трек/альбом в цикле нет.
- Кофейня фильтрует stored facts, sound character и attribute fallback **до**
  нормализации, дедупликации, top-6 и присвоения ранговых весов. Удержанные теги
  не меняют features, affinities и recommendation plan. Веса в `recommend.ts`
  оставлены: это минимальное изменение; разрешённая Relaxation Music сохраняет
  прежнюю интерпретацию, удержанная до весов не доходит.

### Недоступный источник и предел восстановления

В приложении нет полной `taxonomy.yaml` закреплённого внешнего Python-репозитория.
Без сети восстановить её нельзя. Единственный точный research-only label в
сохранённых фактических eval-данных репозитория — `Relaxation Music`.
`research-only-labels.json` — отсортированная нормализованная выборка label всех
объектов с `research_only === true` из
`docs/music-analyzer/eval-results-09d393ce.json`; регрессия проверяет точное
совпадение, поэтому список не расширяется по догадкам или синтетическим тестам.

Если прогон отсутствует, чтение завершилось ошибкой или нужной метки в источнике
нет, эта известная research-only метка скрывается. Если конкретный исходный
прогон явно содержит разрешённую одноимённую метку, она сохраняется. Dark Jazz
скрывается всегда. При конфликте разрешения/удержания внутри одной группы одного
прогона выбирается удержание. Остальные метки без известных признаков удержания
сохраняют прежнее поведение.

**Ограничение:** утраченные `research_only/status` для других неизвестных меток
невозможно доказательно восстановить, если исходный прогон недоступен и этих
меток нет в фактических данных репозитория. Упоминание Meditation/Spa/Sleep в
inventory не даёт точных label/id для расширения списка. Новые предполагаемые
label не добавлялись. При доступном исходном прогоне фильтр работает по флагу для
любой метки, а не только Relaxation Music. Изменения схемы и backfill не нужны.

### Файлы и проверки

Изменены:

- `src/lib/music-passport/tag-withholding.ts` (новый общий фильтр);
- `src/lib/music-passport/research-only-labels.json` (новая выборка из eval);
- `src/lib/music-passport/album-aggregate.ts`;
- `src/lib/music-passport/album-passport-display.ts`;
- `src/lib/music-passport/jazz-relax-pilot.ts`;
- `src/lib/business-app/guest-coffee/passport-features.ts`;
- `src/lib/business-app/guest-coffee/passport-query.ts`;
- `scripts/music-analyzer-withheld-legacy-unit.mts`;
- `scripts/business-guest-passport-unit.mts`;
- этот отчёт.

Регрессии добавлены в существующие `test:music-analyzer-features` и
`test:business-guest-passport` через уже подключённые скрипты, без изменения
`package.json`. Проверяется реальная форма `{label, score}` без метаданных,
альбомный профиль и его HTML, description prompt context, сохранение разрешённой
одноимённой метки из другого прогона, attribute fallback, отсутствие влияния на
все 64 настройки рекомендаций, missing/error source, source_ref и пакетное чтение
101 прогона тремя запросами (50/50/1). Исходные объекты не мутируются.

Штатный `npm run test:music-analyzer-features` упирается в запрет IPC-сокета tsx
(`listen EPERM`). Те же скрипты выполнены напрямую через `node --import tsx`:
`music-analyzer-features` (16/16), `music-analyzer-passport-compat`,
`music-analyzer-withheld-legacy`, `music-analyzer-runs`, `music-passport-ui`,
`jazz-relax-music-passport`, `jazz-relax-passport-registration`,
`business-guest-coffee`, `business-guest-atmosphere`, `business-guest-passport`,
`business-guest-shell` — успешно. SQL-сценарии business-guest-coffee штатно
пропущены: disposable БД не предоставлена, обращения к БД запрещены заданием.

`npm run lint` — успешно: 0 ошибок, 111 существующих предупреждений.
Отдельный ESLint всех изменённых TS/MTS-файлов — успешно, без предупреждений.
Штатный typecheck исчерпал стандартный heap Node (около 2 ГБ). После уточнения
типа разнородных fixtures повтор
`NODE_OPTIONS=--max-old-space-size=4096 npm run typecheck` прошёл успешно.
Отдельная проверка изменённых модулей и их зависимостей временным tsconfig
в `/tmp` также прошла. `git diff --check` — успешно; новые файлы дополнительно
проверены через `git diff --no-index --check`. Полный diff — в PR #980.

`npm run build` заблокирован Turbopack: `node_modules` — symlink за пределы
filesystem root worktree. Это ограничение окружения до компиляции приложения.
Браузерный сценарий с реальными данными не выполнялся: БД/сеть исключены заданием;
HTML проверен серверным рендерингом в регрессиях. Коммитов/push, изменений БД,
миграций, энергии, HTTP API-контрактов и инфраструктуры нет.

Точка продолжения: независимое ревью diff h2 и повтор штатной сборки/браузерного
сценария в окружении с доступными зависимостями и разрешёнными тестовыми данными.
