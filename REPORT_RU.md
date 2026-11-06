# Пилот Александра – отчёт по ветке 84e4bc65

Дата: 06.11.2026. Ветка `ai-company/task-84e4bc65` уже существовала, исходная рабочая копия чистая, база ветки – `origin/main`. Код подготовлен для Draft PR. Production-ready и запуск двух физических точек **не подтверждены**. Deploy, merge, push, production SQL, оплата и изменение GitHub issues не выполнялись.

## Аудит: что уже было и чего не хватало

Изучены AGENTS.md целиком; Business layout/domain/actions/settings/profile/documents,
workspace player/queue/state/track signing, pairing/session/commands, owner health,
отчёты и публичная лицензия; миграции A1/A2/A3, location sound settings,
rights context initializer, subscription/payment/trial и их тесты. Документация
Next 16.4.3 cookies/Server Actions прочитана из доступного дерева зависимостей.

Уже были Organization → Location → Zone, player assignments, pairing без логина,
изолированные по location команды с claim/ack, сохранённая атмосфера Location,
heartbeat/live-state и A3 ledger. Данные о текущей production-схеме не запрашивались.

Пробелы: domain и отчёты всегда выбирали первую Location; часть fallback-поиска
трека шла по всей организации; неизвестный location heartbeat мог считаться своим;
позиция предпрослушивания сохранялась по account/space; платный период действовал
на аккаунт целиком. Привязанный кабинетный плеер отправлял live-state, но не
передавал медиавремя в A3. Не было активации следующих физических точек.

## Что изменено

| Критерий | Реализация и предел доказательства |
|---|---|
| Один владелец, 3 слота | Opt-in `pilot_location_limit=3` у одной Organization. Первая существующая Location, ещё два виртуальных слота. Owner-only RPC создаёт Location + одну default Zone. Повтор идемпотентен, организация блокируется на время активации. Закрытые Location тоже занимают слот. Четвёртая запрещена RPC и триггером. Организация с >3 Location не может включить пилот. |
| Два независимых устройства | Переиспользованы отдельные pairing/session/Player/assignment каждой Location. Переключение владельца не меняет `al-point` на устройствах. SQL-тест доказывает изоляцию heartbeat/live-state, паузы, команды, revoke и stale assignment. Реальный звук требует двух физических устройств. |
| Одна понравившаяся музыка | Новая точка копирует только сохранённую атмосферу первой; затем настройки независимы. Новый каталог, треки, паспорта и AI не создаются. Вызывается прежний initializer прав, все треки проходят действующий eligibility resolver. Копирование атмосферы не выдаёт права. |
| Кабинет и удалённое управление | Панель трёх точек на стороне владельца. Выбор обновляет кабинет целиком, disposing локальный preview/формы. Статус и трек выбранной точки обновляются отдельным запросом раз в 15 секунд в видимой вкладке; ошибка сети убирает подтверждение. Команды/привязка/звук доступны на `/preferences`, локальные команды остаются в `/music` устройства. |
| Без владельческого логина у сотрудника | Существующий одноразовый 4-значный код, 20 минут, hash в БД, host-only HttpOnly cookie устройства, действующие rate limits и revoke. Код – секрет на время привязки; не публиковать его. Один браузерный профиль привязан к одной точке. |
| Права, триал, статистика, оплата | Права проверяются отдельно по Location. Триал имеет прежний общий срок владельца; активация точки не выдаёт новый триал. Учёт активности получает location_id. A3 принимает media position с device token и получает атрибуцию по текущему assignment. Платные периоды пилота требуют явной service-only связи order→Location; один период не может оплачивать две точки. |
| Резерв и регрессия | Третий слот до активации не имеет Player/Zone/оплаты. Старые организации без opt-in сохраняют сценарий первой Location, account checkout и прежний playback storage key. Старый credential A3 RPC вызывает общий приватный алгоритм. |

Выбор `al-business-location` – предпочтение в host-only HttpOnly cookie, не право.
Domain разрешает только активную Location из RLS-видимых строк первой организации
пользователя; action выбора проверяет ту же организацию. Устройство выбирается
исключительно из `al-point`. Заголовки документов/отчётов, heartbeat, fallback
названия трека и доказательства ограничены соответствующей Location.
Пилотный preview не пишет общий account/space playback; локальный ключ и ключ
контроллера включают Location. Сохранённая атмосфера загружается выбранной точке.

Суммы: 799 / 1598 / 2397 ₽ для 1 / 2 / 3 точек. Период существующего кода и
оферты – «за 30 дней»; его не заменяли календарным месяцем. Правила срока и одобренные тексты не менялись. Пилотные кнопки оплаты и выдача
старого pending account-order закрыты до отдельного решения. Это подготовка
привязки, а не новый checkout/автосписание; коммерческий выпуск требует Human Gate.

A3 переиспользует прежний алгоритм baseline, seq, idempotency и wall/media caps,
одни `playback_usage_contexts/facts`. Позиция передаётся только при подтверждённом
advance audio. Нет consumer user_id, искусственного начисления за heartbeat,
нового ledger или начисления royalties. При потере сети отсутствующие интервалы
могут быть недоучтены; это online evidence, не гарантированная поминутная отчётность
и не доказательство слышимости колонки.

## Миграции и безопасное применение – только после отдельного разрешения

Подготовлены:

- `supabase/migrations/20270226120000_business_pilot_three_locations.sql`.
- `supabase/migrations/20270226130000_business_point_playback_attribution.sql`.

Обе **не применялись** ни на production, ни на staging. Изолированный тест применяет
их только к новому временному локальному PostgreSQL и удаляет только свой fixture
каталог по завершении. Старые миграции не редактировались.

Порядок оператора: сверить полную историю миграций и функции со staging; сделать
резервную копию БД/определений A3 и report RPC; применить миграции на staging;
проверить HTTP/RLS под разными пользователями и двумя устройствами; запросить
Human Gate на production apply/release. Миграции должны предшествовать новому
клиенту: он читает новый столбец организации и использует новый A3 RPC.
Миграции сами никого не включают и не создают клиентские Location.

Ниже только **шаблон для ревью**, здесь не исполнялся. UUID подставляет оператор
после проверки аккаунта Александра, без угадывания по имени. Сначала SELECT,
затем отдельное подтверждение UPDATE. Если у аккаунта несколько организаций,
сначала согласовать выбор существующей организации; этот PR не переносит membership.

```sql
-- psql variables organization_id and owner_id задаются оператором.
SELECT o.id, o.name, o.pilot_location_limit, m.user_id, m.role,
       (SELECT count(*) FROM public.business_locations l WHERE l.organization_id=o.id) AS locations
FROM public.business_organizations o
JOIN public.business_organization_members m ON m.organization_id=o.id
WHERE o.id=:'organization_id'::uuid AND m.user_id=:'owner_id'::uuid;
-- Проверить: owner; одна нужная организация; 1–3 существующих Location;
-- источник музыки и сохранённая атмосфера; срок триала; старые paid/pending orders.
-- Только после Human Gate, под транзакцией:
BEGIN;
UPDATE public.business_organizations o SET pilot_location_limit=3
WHERE o.id=:'organization_id'::uuid AND o.status='active'
  AND EXISTS (SELECT 1 FROM public.business_organization_members m
              WHERE m.organization_id=o.id AND m.user_id=:'owner_id'::uuid AND m.role='owner')
RETURNING o.id, o.pilot_location_limit;
-- Проверить ровно одну строку; иначе ROLLBACK.
COMMIT;
```

Для будущего оплаченного периода предусмотрена таблица
`business_location_subscription_bindings(order_id, location_id)`. Не создавать
фиктивные paid periods, не править суммы и не запускать списания. Перед связыванием
реального существующего периода оператор проверяет его user_id, opens_access,
сумму 79900 и точку; триггер проверяет владельца, сумма/статус обязательны,
PRIMARY KEY order_id запрещает оплатить тем же периодом другую точку, UPDATE
переноса связи запрещён. Переход с оплаченного account-периода в пилот требует
согласованной привязки первой точки до включения флага. Старые pending ссылки
платёжного провайдера сами по себе не аннулируются этим PR – сверить их отдельно.

Откат: после решения владельца сначала вернуть клиент, затем при необходимости
вернуть исходное тело legacy A3 и report RPC из прежних миграций, снять EXECUTE
с нового point sample/private helper. Location, assignments, bindings и facts
сохранять. **Не выключать opt-in вслепую**: возврат account-level paid gate может
распространить старую оплату на несколько Location. Перед этим остановить устройства
пилота/согласовать доступ и сверить оплату. DROP/массовый cleanup не требуются.

## Проверки

Результаты этой рабочей копии:

- `npm run test:business-pilot`: unit-проверки переключения владельца/резерва/health/local playback keys/стоимости/срока триала; React SSR панели (3 кнопки, резерв, выбранная точка и её трек, отсутствие панели у устройства и legacy); изолированный PostgreSQL с реальными A1/A2/pairing/commands/live-state/A3 и новыми миграциями.
- SQL: повтор активации; третий резерв и активация; четвёртая точка запрещена, включая прямую вставку; разные Player/assignment/heartbeat; pause одной оставляет playing у другой; другая точка не забирает команду; независимые media-time facts; UNKNOWN rights/revoked/stale assignment отклоняются; чужой владелец не активирует; одна оплата не привязывается к двум точкам/не переносится; account-order пилота закрыт, legacy разрешён; прежний credential RPC работает.
- Регрессии: `business-app-owner-home-signals-unit`, `business-point-device-player-unit`, `business-point-commands-unit`, `business-access-deadline-unit`, `business-point-commands-isolated`; source contracts domain/player foundation/playback attribution/pairing/venue place.
- `git diff --check`: без ошибок. Итоговый lint/TypeScript и ограничения сборки указаны ниже после финального запуска.

Граница автоматизации: внешний каталог/rights resolver/paid periods в SQL harness
используют минимальные fixtures. Алгоритм A3 и доменные/плеерные функции реальные;
полные права/все миграции нужны на staging. Single-user PG обходит RLS даже при
SET ROLE: проверены реальные membership-предикаты и EXECUTE/табличные privileges,
но **не заявляется проверка видимости строк через PostgREST**. Параллельные
транзакции и гонка двух одновременных активаций требуют серверного PostgreSQL;
повтор/idempotency проверены локально, блокировка есть в реализации.

Окружение: node_modules исходно отсутствовал. Для проверок использована локальная
символическая ссылка на уже имеющийся `/tmp/p17-deps/node_modules`, без установки
зависимостей/изменения lock-файла; Node 20.19.2 из имеющегося локального runtime.
В доступном дереве зависимостей отсутствуют `mmdb-lib` и native Next SWC.
`npm run build` остановился при попытке загрузить SWC: sandbox не разрешил создать
`/home/audiolad/.cache/next-swc`; успешная сборка не заявляется. TypeScript требует
`mmdb-lib`, уже объявленный в package.json; фиктивные типы не добавлялись.
Первый TypeScript на системном Node 18 исчерпал heap; повтор выполнен на Node 20
с увеличенным heap. Первый lint нашёл запись ref во время render в промежуточной
версии – она удалена, регрессия device test по порядку server-only import исправлена.

## Ручная приёмка двух устройств – пока не выполнена

Оператор записывает дату, commit, URL staging/релиза, модели/версии устройств и ОС,
браузер/PWA, тип вывода/модель колонки, сеть и результат каждого шага. Токены и
pairing-коды в отчёт/скриншоты не включать.

- [ ] Один владелец видит одну организацию и ровно 3 слота, 2 активных + 1 резерв.
- [ ] На двух отдельных устройствах/профилях привязать разные коды без owner login; оба показывают своё название/адрес и играют один понравившийся каталог.
- [ ] 30–60 минут одновременно, минимум три смены трека; звук слышен на двух колонках. Зафиксировать видео/лог времени без секретов.
- [ ] С телефона выбрать 1→2→1, сверить связь/название трека; pause/resume/next только адресной точки. Повторить локально на каждом устройстве. Устройства не требуют нового pairing при смене точки владельцем.
- [ ] Изменить атмосферу только второй; первая сохраняет настройки/очередь. Изменение на устройстве применяется по существующему polling со следующего трека.
- [ ] Проверить две серии A3 facts с разными location_id/player_id и текущими assignments; при паузе media-time не растёт. Повтор event/seq не удваивает факт.
- [ ] Отозвать первую: её API/stream renewal/команды прекращаются, вторая играет. Старый токен не пишет heartbeat/PoP. Повторно привязать первую. Уже выданный аудио URL/буфер не исчезает мгновенно – это не дистанционное отключение колонки.
- [ ] Убрать сеть на 1–3 минуты, вернуть; не выполнить просроченную команду (TTL 2 минуты). Не путать отсутствие связи с подтверждённой тишиной. Зафиксировать восстановление и необходимость ручного запуска.
- [ ] Перезагрузить/обесточить одно устройство; другое продолжает играть. После открытия восстановить свою позицию/громкость и нажать запуск при требовании autoplay policy. Не обещать самозапуск после питания.
- [ ] Android Chrome, iPhone Safari и отдельно установленная iOS PWA: запуск касанием, 15 минут блокировки экрана, переходы треков, возврат, звонок/уведомление, энергосбережение; проверить каждую реально используемую конфигурацию.
- [ ] Провод и Bluetooth: отключение/возврат соединения, правильный выход ОС, слышимость; Web API не доказывает, что колонка включена.
- [ ] Чужой owner/anon: запросы Location/state/commands/docs/pairing/активации отклонены через HTTP; device 1 не видит/не меняет device 2; переключение cookie на чужую Location не выдаёт данные. Проверить RLS на полном staging.
- [ ] Третья Location не создаётся до активации; в отдельной тестовой организации активировать третий слот, проверить отказ четвёртому и два одновременных запроса активации (только 1 новая Location).
- [ ] Организация без opt-in: старый одноплощадочный onboarding/pairing/play/pause/отчёт и checkout без регрессии; реальные платежи не выполнять.
- [ ] До платного запуска: подтверждённая схема связывания существующих paid periods с каждой точкой, 799 ₽ на одну, 1598 ₽ на две, резерв не списывается; работающий конец триала и платного срока без выдачи доступа чужой точке.

Ограничения платформ: нельзя гарантировать непрерывный Web Audio/таймеры на
заблокированном iPhone или в фоновой PWA, фон Android также зависит от браузера/ОС.
Официальные ориентиры: [WebKit: background Web Audio restriction](https://bugs.webkit.org/show_bug.cgi?id=220879),
[Chrome Page Lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api).
Это основание для проверки, не доказательство совместимости конкретного телефона.
Нет гарантированного offline-каталога. Практический резерв на запуск – проверенное
устройство с питанием и открытым плеером, проводной выход. Инструкция подключения:
`CONNECT_ALEXANDER_RU.md`; материалы Draft PR: `DRAFT_PR_RU.md`.

## Точка продолжения

Parent: проверить diff/коммит и открыть Draft PR из ветки без merge. Затем собрать
проект с полным lock-resolved деревом зависимостей и staging-конфигурацией,
применить миграции на staging после ревью, выполнить HTTP/RLS и физический E2E
выше. Перед production apply/release и перед оплатой – отдельные решения Сергея.

## Итог проверок и передача

Полный `npm run lint`: PASS, exit 0, 0 ошибок / 113 предупреждений.
`tsc --noEmit --incremental false` на Node 20: exit 2, единственная диагностика
`src/lib/business-trial-attribution/geo.server.ts(6,24): Cannot find module 'mmdb-lib'`.
Build: не пройден по описанной выше причине SWC. Ручной браузерный сценарий и
реальные устройства не проверялись: нет работающей локальной сборки, staging
с клиентскими данными и двух физических устройств. Скриншоты/звук не имитировались.

## Изменённые файлы

- `CONNECT_ALEXANDER_RU.md`
- `DRAFT_PR_RU.md`
- `REPORT_RU.md`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/PROJECT_STATE.md`
- `docs/SESSION_LOG.md`
- `package.json`
- `scripts/business-pilot-isolated.py`
- `scripts/business-pilot-ui-unit.tsx`
- `scripts/business-pilot-unit.mts`
- `src/app/api/business/point/route.ts`
- `src/app/api/business/subscription/checkout/route.ts`
- `src/app/api/business/workspace/state/route.ts`
- `src/app/business-app/actions.ts`
- `src/app/business-app/layout.tsx`
- `src/app/business-app/settings/page.tsx`
- `src/components/business-app/BusinessHomeAccessCard.tsx`
- `src/components/business-app/BusinessPointSlots.tsx`
- `src/components/business-app/workspace/BusinessCabinetPlayer.tsx`
- `src/components/business-app/workspace/BusinessWorkspace.tsx`
- `src/lib/business-app/cabinet-player-client.ts`
- `src/lib/business-app/domain.ts`
- `src/lib/business-app/load-owner-home-signals.ts`
- `src/lib/business-app/load-playback-report.ts`
- `src/lib/business-app/load-support-diagnostics.ts`
- `src/lib/business-app/location-access.server.ts`
- `src/lib/business-app/location-selection.ts`
- `src/lib/business-app/owner-home-signals.ts`
- `src/lib/business-app/point-device.server.ts`
- `src/lib/business-app/point-device.ts`
- `src/lib/business-app/venue-licence/load.server.ts`
- `src/lib/business-workspace/access-deadline.ts`
- `src/lib/business-workspace/load.server.ts`
- `src/lib/business-workspace/model.ts`
- `src/lib/business-workspace/playback.ts`
- `supabase/migrations/20270226120000_business_pilot_three_locations.sql`
- `supabase/migrations/20270226130000_business_point_playback_attribution.sql`
- `supabase/tests/business_pilot_three_locations_smoke.sql`

Локальный коммит не создан: `git add` получил `Unable to create .git/index.lock:
Read-only file system`. Метаданные Git в этом sandbox доступны только для чтения.
Ветка уже называется `ai-company/task-84e4bc65`; файлы сохранены в рабочем дереве.
Полный patch для передачи parent подготовлен вне репозитория:
`/tmp/audiolad-84e4bc65.patch`. Parent может проверить patch/рабочую копию и создать
коммит; push не выполнялся. Обход ограничения файловой системы не предпринимался.

Финальная повторная проверка: `npm run test:business-pilot` PASS (unit + React SSR +
реальный локальный SQL, включая повтор event/seq без двойного учёта), полный lint
exit 0 / 113 предупреждений. После добавления сетевого таймаута панели отдельно
SSR и ESLint изменённой панели/новых TS-тестов – PASS без ошибок и предупреждений.
Повтор TypeScript показал только ту же отсутствующую зависимость `mmdb-lib`.
Дополнительно прошли `business-venue-licence-isolation-unit`, pairing unit,
Business theme и owner point UI. Полный diff доступен в patch; коммита нет по
описанному ограничению `.git`.
