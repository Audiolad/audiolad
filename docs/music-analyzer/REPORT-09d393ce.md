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

Для первого трека Ambient / NOT Dark Jazz записано только как owner_statement Сергея. Ambient уже был среди кандидатов; адаптер не назначал его заново. Для второго трека проверенных меток нет. Поля reference обоих треков unlabelled; слушательская точность, ошибка half/double и корректность instrumental/mixed не доказаны. Энергия 68/82 – интерпретация RMS/атак с confidence=null, не измеренная воспринимаемая энергия.

## Проверки

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

Продолжить с review семи файлов и двух реальных before/after. В окружении с разрешённым detached spawn/listen повторить штатные npm suites, build и авторизованный браузерный сценарий; при необходимости внешний процесс перенесёт временные результаты в ../eval/out. Для оценки качества потребуется отдельно согласованная слушательская разметка. Production-деплой и применение миграции требуют отдельного решения владельца.
