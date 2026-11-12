# Радио по альбому – план и аудит

Задание владельца task-455be80c разрешает реализацию и локальный коммит.

## Аудит до реализации

- `GlobalAudioPlayerProvider` держит постоянный audio, очередь, предзагрузку подписанного URL и переход play-before-state для iOS. `useSequentialPlayer` вызывает onTracksExhausted после последнего трека, также при ручном Next. Эти причины надо различать.
- `resolvePlaylistQueueEntrySession` умеет точный audio_item; обычная очередь допускает preview fallback. Радио должно запретить preview.
- `getPublishedCatalogProducts` применяет обычную видимость каталога и фильтр фикстур. `loadListenSessionPayload` повторно проверяет доступ и активную delivery музыки.
- Авторские метаданные: format, subtitle, description; признаки Music Passport Basic: genre_class, mood, bpm, energy, vocal_role. Album Passport / Analyzer уже реализованы, включая withholding; новый анализатор не нужен. Отсутствующий паспорт не означает нулевые признаки.
- Реальное media-time уже пишется через listen-stats в playback_usage_facts; listening_key связывает эти факты с platform analytics. Радио требует атрибуции этого ключа, а не второго счётчика времени.
- Business имеет отдельные плееры и правила; они вне задачи.
- Рабочая ветка ai-company/task-455be80c, исходный git status чистый. node_modules отсутствует, локальная Next-документация пока недоступна.

## Минимальный план

1. Добавить серверный подбор только опубликованной музыки обычного каталога. Использовать авторские метаданные для первого этапа и необязательный Music Passport Basic как источник уточняющих признаков. Звуковое сходство важнее разнообразия авторов; при отсутствии доказанного сходства завершать очередь.
2. Расширить существующую очередь режимом album_radio, готовить продолжение заранее, запускать лишь по естественному окончанию всего альбома. Сохранять постоянный audio, предзагрузку и проверку доступа. Пополнять очередь с историей исключений.
3. Добавить общий русский переключатель автопродолжения с localStorage и метку режима в мобильном, настольном и полном плеере.
4. Атрибутировать штатные события playback через listening_key; реальные дополнительные минуты брать исключительно из playback_usage_facts. Зафиксировать определения переходов, пропусков и открытий авторов.
5. Добавить исполняемые проверки ранжирования и жизненного цикла, выполнить lint/typecheck/build и связанные player tests, провести браузерную проверку с настоящим audio на изолированных фикстурах.

Предполагаемые файлы: новые `src/lib/listen/album-radio*`, `src/app/api/listen/album-radio/route.ts`, общий UI переключатель, существующий GlobalAudioPlayerProvider, useSequentialPlayer, типы очереди, компоненты player UI/analytics, тесты scripts, package.json, этот документ.

## Зависимости и риски

- Качество метаданных ограничивает подбор. Без близкого кандидата – остановка с объяснением, без случайной музыки.
- Подписанный URL может устареть, доступ – измениться: штатная проверка выдачи аудио остаётся обязательной.
- Смена материала, закрытие, отключение и поздние ответы не должны запускать устаревшее радио.
- iOS PWA требует проверки на физическом устройстве; эмуляция браузера этого не доказывает.
- Миграции не планируются. Не трогаем инфраструктуру, Business, main, issues 639–641. Не выполняем push.

## Реализованное поведение

- Новая серверная ручка `POST /api/listen/album-radio` сначала проверяет тип исходного материала. Подбор использует перечисленный обычный каталог, доступ слушателя, опубликованные audio_items и существующую проверку delivery. Исходный альбом и вся история предложений исключаются. Preview fallback для radio entries запрещён. При повторной загрузке session сервер также подтверждает, что материал остаётся опубликованной доступной музыкой обычного каталога (`albumRadioEligible`). Legacy synthetic tracks в рекомендации не включаются.
- `album-radio-ranking.mjs` нормализует известные жанры, стили, настроения, BPM и вокал из метаданных. Неоднозначный профиль автора не заполняет пропуски. Необязательное обогащение читает Music Passport Basic через существующий service-role RPC; ошибка/отсутствие паспорта оставляет метаданные. Анализатор не запускается.
- Исходный альбом и соседний трек оба ограничивают подбор. Известный конфликт вокала, настроения или разница BPM >25 запрещают переход. Другие авторы получают небольшой приоритет при близком звуке. Неизвестные признаки не считаются совпадением.
- Радио начинается лишь по natural ended полного списка треков альбома, при выключенном повторе и без пользовательской playlist queue. Отдельно выбранный трек многотрекового альбома радио не запускает. Чужие виды публикаций отсеиваются сервером.
- Очередь пополняется при остатке ≤3, максимум 8 рекомендаций за ответ и 512 предложений за один запуск. Повторы внутри запуска не допускаются. При исчерпании/ошибке – штатное завершение. Между запусками история рекомендаций не сохраняется.
- Отключение действует сразу на будущие переходы; текущий альбом/радиотрек доигрывает. Значение хранится в localStorage, при блокировке storage – в памяти вкладки; синхронизация вкладок через storage event. Повтор one/all сохраняет существующую семантику.
- Используется один persistent audio. Первое продолжение готовится заранее; URL обновляется каждые 45 секунд во время альбома, radio prefetch старше 60 секунд перепроверяется при переходе. Смена/закрытие материала и выключение автопродолжения инвалидируют поздний handoff.
- На `/listen` переход следует существующей навигации между материалами, чтобы fullscreen показывал текущего исполнителя; на других экранах радио остаётся в global player. Снимки progress restore и Business не изменялись.

Ограничение первого этапа: до 24 альбомов и 72 кандидатов за подбор, до 12 ещё не предложенных треков на альбом; бюджет цикла 8 секунд, timeout отдельного Passport RPC 1,2 секунды. При большом каталоге потребуется пагинация/индекс признаков вместо расширения этих лимитов. Авторский профиль первого этапа – согласованные метаданные опубликованных работ автора, не отдельная новая модель профиля. Это может ограничивать покрытие и разнообразие при неполных метаданных.

## Метрики без миграции

Атрибуция добавляется к существующим `audio_play_started`, progress и `audio_completed` в `analytics_events`. Имена событий и механизм подсчёта времени не меняются. Поля: `playback_mode=album_radio`, `radio_run_id`, `radio_source_album_id`, `radio_source_author_slug`, `radio_index`, `radio_transition`, `radio_previous_outcome`, `radio_previous_audio_id`, штатный `listening_key`. Отложенный play-start сохраняет эти поля при отсутствии analytics session и смене engine.

- Переходы album→radio: число уникальных `radio_run_id` среди подтверждённых `audio_play_started`, где `radio_transition=true`. Не считать запросы рекомендаций/намерение play.
- Дополнительные реальные минуты: сумма `playback_usage_facts.listened_ms / 60000` по уникальным `listening_key` подтверждённых радио-контекстов, только consumer facts (`business_account_id IS NULL`). Сначала дедуплицировать ключи событий, затем соединять facts, иначе несколько progress-событий умножат минуты. Seek и wall-clock не заменяют accepted media-time. Это атрибутированные минуты радио; причинный прирост удержания требует контрольной группы.
- Прослушанные треки: уникальные `(radio_run_id, listening_key)` с `audio_completed`. Старты – отдельный показатель; не выдавать старт за прослушивание.
- Явные пропуски: следующий подтверждённый radio play-start с `radio_previous_outcome=skipped`; предыдущий трек указан в `radio_previous_audio_id`. `natural_end` и `previous` считаются отдельно. Если следующий трек так и не начал играть, события старта нет: это прекращённое прослушивание, не подтверждённый переход/skip. Отключение/закрытие не приравниваются к skip.
- Открытия новых авторов: существующий `author_page_view` получает радио-атрибуцию и `radio_new_artist=true`, если открыта страница текущего радиоисполнителя и он отличается от исполнителя исходного альбома. Штатный page-view dedup сохраняется.
- При отсутствии/отклонении analytics consent метрики могут не иметь атрибуции; не обходить существующий механизм согласия.

## Проверки и точка продолжения

В этой среде выполнены:

- `node scripts/album-radio-unit.mjs`: 14/14 passed (ранжирование, неизвестные признаки, соседний темп, история, профиль автора, natural end, preference/storage и проверки интеграционных границ).
- `node --test scripts/album-radio-unit.mjs`: passed; Node 18 сворачивает TAP дочернего файла, прямой запуск выше показывает все 14 случаев.
- `private-audio-global-player-unit`, `dashboard-player-hidden-unit`, `author-dashboard-stats-unit`: passed.
- `guest-player-empty-unit` и `guest-player-bootstrap-unit`: passed при подстановке текущего repo root в памяти вместо жёстко заданного `/var/www/audiolad`; сами старые скрипты не изменялись.
- `git diff --check` и `node --check` новых `.mjs`: passed.
- iOS source test доведён до существующей ошибки `schema documents no chapter/lesson tables`; та же ошибка воспроизведена на неизменённом HEAD через снимки исходников. Обновлён только ожидаемый вызов natural-end callback.

Не выполнены успешно:

- `npm run lint`, `npm run typecheck`, `npm run build`: команды вызваны, но npm отсутствует (`command not found`). `npm ci` также недоступен; DNS npm registry не разрешается. Доступный Node – 18.19.1; для Next 16 нужен поддерживаемый Node. Неполные сторонние каталоги node_modules не содержат компилятора/пакетов.
- `node --import tsx scripts/album-radio-access-unit.mts`: отсутствует tsx. Тест добавлен: проверяет реальный resolver с denied/preview/author-preview/full, неизменный fallback обычных плейлистов и сохранение attribution в pending store.
- `private-to-catalog-player-race-safety-unit`: отсутствует `@supabase/supabase-js`. Analytics-consent browser test также не запускается без Playwright; playback-analytics-canonical требует отсутствующий tsx для импорта TSX.
- Реальная браузерная проверка не выполнена: нет локально запущенного приложения/тестового музыкального каталога и Playwright. Добавлен `scripts/album-radio-browser-smoke.mjs`: только localhost, настоящее audio и natural ended, сохранение того же DOM audio, отключение до конца трека и preference после reload; Chromium и WebKit. Скрипт не пишет фикстуры в БД. Физический iPhone / iOS PWA отдельно не проверен.
- Локальная Next-документация отсутствует; соглашения route handlers сверены с официальным https://nextjs.org/docs/app/api-reference/file-conventions/route.

**Миграции: отсутствуют.** Схема, RLS, инфраструктура и production не изменялись. Выпуск пока не подтверждён полным набором проверок.

Следующая сессия: на поддерживаемом Node с зависимостями выполнить `npm run lint`, `npm run typecheck`, `npm run test:album-radio`, связанные playback/repeat/progress suites и `npm run build`; затем запустить локальное приложение с изолированным каталогом как минимум двух близких музыкальных альбомов разных авторов и выполнить:

```sh
ALBUM_RADIO_TEST_LISTEN_PATH=/listen/test-artist/test-album npm run test:album-radio:browser
```

После браузерной проверки проверить полный альбом, refill >8 треков, sparse/offline/revoked access, pause/close во время handoff и locked-screen playback на физическом iPhone PWA. До этих проверок не считать acceptance 6/9 подтверждёнными.

## Файлы сессии

- `docs/album-radio.md`
- `package.json`
- `scripts/album-radio-access-unit.mts`
- `scripts/album-radio-browser-smoke.mjs`
- `scripts/album-radio-unit.mjs`
- `scripts/ios-lock-screen-auto-advance-unit.mjs`
- `src/app/api/listen/album-radio/route.ts`
- `src/components/analytics/AuthorPageViewTracker.tsx`
- `src/components/analytics/GlobalPlaybackAnalytics.tsx`
- `src/components/analytics/ListenAnalyticsTracker.tsx`
- `src/components/audio/AlbumRadioControl.tsx`
- `src/components/audio/GlobalAudioPlayerProvider.tsx`
- `src/components/audio/GlobalMiniPlayer.tsx`
- `src/components/audio/ListenPlayerDesktop.tsx`
- `src/components/audio/ListenPlayerMobile.tsx`
- `src/components/audio/listen-player-shared.tsx`
- `src/components/audio/useSequentialPlayer.ts`
- `src/components/listener/DesktopPlayerBar.tsx`
- `src/lib/analytics/listen-tracker-context.ts`
- `src/lib/analytics/pending-confirmed-plays-store.ts`
- `src/lib/listen/album-radio-preference.mjs`
- `src/lib/listen/album-radio-ranking.mjs`
- `src/lib/listen/album-radio.server.ts`
- `src/lib/listen/global-player-types.ts`
- `src/lib/listen/load-session-payload.ts`
- `src/lib/playlists/player-queue-types.ts`
- `src/lib/playlists/queue-entry-session.ts`

Локальный коммит **не создан**: попытка `git add` завершилась ошибкой `Unable to create .git/index.lock: Read-only file system`. `.git` в этой среде доступен только для чтения. Рабочая ветка сохранена, main и история не менялись, push не выполнялся. Diff: `git diff` для отслеживаемых файлов; полный patch новых и изменённых файлов сохранён в `/tmp/t455be80c-album-radio.patch`. После разблокировки записи в `.git` и обязательных проверок выполнить обычные `git add` и `git commit` в этой же ветке.
