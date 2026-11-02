# Аудит Business: 7 дней полного бесплатного доступа + 3 дня grace

Задача: `39ef47c4-3df8-457a-b6a7-1cac464d471b`. Проверка 02.11.2026, основа `db8a9d8a`. Аудит включает наработки этого коммита и исправления рабочей копии поверх него. Номера строк относятся к итоговым файлам этой задачи. Production не проверялся и не изменялся.

## Правило срока и сохранность данных

- Для нового подтверждённого адреса при первом входе в существующий Business workspace выдаётся единственный `business_new_client` grant на **7 полных суток**. Подтверждение без входа само по себе grant не создаёт. Карта не требуется.
- С момента `ends_at` требуется оплата **799 ₽ за следующие 30 дней**, режим становится `grace`; полный плеер продолжает работать ещё **3 полных суток**. Grace не переносит `ends_at` и не добавляется к оплачиваемому периоду.
- Ровно в `ends_at + 3 суток` без оплаты режим становится `offer`, воспроизведение приостанавливается. Grant, настройки, атмосфера, состояние плеера, история, документы и кабинет не удаляются. Повторный вход не выдаёт новый trial.
- Оплата в grace включает обычный платный период от момента подтверждения платежа, без повторного onboarding. SQL использует максимум из момента оплаты, ещё действующего trial и `paid_until`, затем добавляет 30 дней; обработка одного платежа идемпотентна. Сброса данных в этом пути нет.
- **Ранее выданные 30-дневные trial не сокращаются:** существующие `starts_at`/`ends_at` не пересчитываются; после сохранённого окончания остаётся тот же grace 3 суток. Новый срок применяется только к вновь выдаваемым grant, а не к существующим данным.

## Часовой пояс и границы

Сохраняется действующее правило полного периода: 7 × 24 часа от активации, затем 3 × 24 часа grace. Для пользовательских дат и календарных индексов используется `Europe/Moscow` (UTC+3); дата сервера/браузера не задаёт дату окончания. В современных датах Москвы нет перехода на летнее время, поэтому прибавление суток сохраняет местное время. Нет округления к полуночи UTC или сокращения первого дня.

Пример: активация 01.03.2026 в 23:30 МСК → trial до 08.03.2026 23:30 МСК (граница исключительная) → grace до 11.03.2026 23:30 МСК (тоже исключительная). В 00:00 календарной даты 08.03 ещё остаются часы полных семи суток; оплату требуют после окончания этих суток. «С 8-го дня» означает после полных семи суток доступа, а не обрезание срока в полночь восьмой календарной даты.

Источник расчёта: `src/lib/access-grants/policy.ts:52` (`addGiftPeriod`), `:62` (`trialDaysLeft`), `:68` (`moscowYmd`), `:79` (индекс календарного дня), `:84` (дата и время с МСК), `:131` (grace), `:140` (`resolveCustomerAccess`). Даты в БД – `timestamptz`, приложение передаёт ISO UTC.

## Реестр изменённых обещаний и источников

| Место (путь:строка) | Было | Стало |
| --- | --- | --- |
| `src/lib/business/plan.ts:15` | `BUSINESS_GIFT_DAYS = 30` | 7; `BUSINESS_GIFT_MS` автоматически 7 суток |
| `src/lib/business/plan.ts:18` | Платные 30 дней в текстах смешивались с числом подарочных | Отдельная константа `BUSINESS_PAID_PERIOD_DAYS = 30`; цена и grace прежние |
| `src/lib/access-grants/copy.ts:4` | «30 дней в подарок» | Заголовок из `BUSINESS_GIFT_DAYS`: «7 дней в подарок» |
| `src/lib/access-grants/copy.ts:7` | «Получить 30 дней бесплатно» | CTA из той же константы: «Получить 7 дней бесплатно» |
| `src/lib/access-grants/copy.ts:9`, `:12`, `:18`, `:46` | Введение регистрации/входа, подтверждение и ожидание письма обещали 30 дней | Все читают общий заголовок на 7 дней |
| `src/lib/access-grants/copy.ts:22` | «После срока плеер закрыт до оплаты» скрывало grace | После trial требуется оплата; музыка играет ещё 3 дня, затем закрывается до оплаты |
| `src/lib/access-grants/copy.ts:26` | Права и лицензия на 30 подарочных дней | На 7 подарочных дней из константы |
| `src/lib/access-grants/copy.ts:30`, `:42` | Число платных дней в строках оплаты | Константа платных 30 дней, цена 799 ₽, без автосписания сохранены |
| `src/lib/business-app/guest-coffee/copy.ts:17`, `:30`, `:43` | Гостевое предложение, исчерпание демо и подключение обещали 30 дней | Общий заголовок на 7 дней; 30-минутное демо сохранено |
| `src/lib/business/landing.ts:35`, `:37`, `:305` | Лендинг, trust-строка и FAQ обещали 30 дней | Единый заголовок на 7 дней; карта не нужна |
| `src/components/business-app/BusinessGuestStatus.tsx:65`, `:97` | Отдельный aria-label и CTA на 30 дней | Общие константы на 7 дней |
| `docs/business/access-grants.md:7`, `:16` | Описание 30 × 24 часов и событий старого trial | 7 суток, grace 3 суток, сохранение старых grant, события 14/30 только для старых сроков |
| `docs/runbooks/coffee-audiolad-rollout.md:4`, `:93` | Предложение и ручная проверка регистрации на 30 дней | 7 дней и следующие 3 дня grace; платные 30 дней сохранены |

Также в основе `db8a9d8a` обновлены только комментарии о сроке в `src/components/business-app/BusinessAccessLine.tsx:18`, `BusinessAppShell.tsx`, `BusinessOnboardingWizardPage.tsx:42`, `business-app.css`, `sound/BusinessSoundStudio.tsx`, `src/lib/access-grants/access-line.ts:3`, `src/lib/business-app/access.ts:46`, `src/lib/business-app/venue-licence/present.ts:10`. Исполняемой логики с отдельным сроком там нет.

## Связанные потребители и backend: проверено, отдельной замены не требуется

| Место | Что проверено / результат |
| --- | --- |
| `src/components/business/BusinessLandingView.tsx:158`, `:593`, `:601` | Лендинг читает общие trust, заголовок и CTA; получает 7 автоматически |
| `src/app/(platform)/auth/sign-up/page.tsx:272` | Business-регистрация читает общий intro; другие сценарии регистрации не меняются |
| `src/lib/auth/buy-sign-in.ts:61`, `src/app/(platform)/auth/sign-in/page.tsx:109`, `:117` | Вход и сообщение после регистрации читают Business copy |
| `src/app/(platform)/auth/business-return/page.tsx:82`, `:85`, `:86` | Подтверждение показывает общий заголовок, правило закрытия и лицензию |
| `src/components/business-app/BusinessOnboardingWizardPage.tsx:87`, `:221` | Onboarding читает `GUEST_COFFEE_TERMS`, отдельного 30-дневного срока нет |
| `src/components/business-app/sound/GuestCoffeeGiftCta.tsx:29`, `workspace/BusinessWorkspace.tsx:246`, `venue-licence/VenueLicencePage.tsx:99` | CTA воронки, workspace и лицензия читают общий заголовок/CTA |
| `src/components/business-app/BusinessHomeAccessCard.tsx:117`, `:146` | Кабинет показывает grace и обратный отсчёт по сохранённой дате; строка оплаты уже 799 ₽ / 30 дней |
| `src/lib/access-grants/apply.ts:21`, `:124` | Единственная выдача через `decideTrialActivation`; renewal сохраняет grant и состояние |
| `src/lib/access-grants/supabase-store.ts:62` | RPC получает рассчитанные приложением `p_starts_at`/`p_ends_at`; срок не захардкожен |
| `src/lib/access-grants/peek-closure.ts:82` | Чтение доступа для chrome использует ту же policy и grace |
| `src/lib/business-workspace/model.ts:66`, `:69` | Плеер открыт в trial/paid/grace, deadline берётся из `playbackUntil` |
| `src/app/api/business/workspace/state/route.ts`, `src/app/api/business/player/track-url/route.ts:23` | API используют существующую модель доступа; после grace `offer` закрывает полное воспроизведение |
| `src/lib/business-app/venue-licence/present.ts:119`, `:126` | Лицензия отражает trial/paid/grace и дату остановки из общей policy |
| `supabase/migrations/20270120120000_access_grants_and_workspace.sql:25`, `:164`, `:175` | У `ends_at` нет default; RPC принимает срок извне, CHECK только `ends_at > starts_at` |
| `supabase/migrations/20270205130000_business_subscription_payment.sql:669`, `:679`, `:687` | Оплата читает сохранённый конец grant; добавляет оплаченные 30 дней к максимуму дат |
| `src/lib/email/templates/business-catalog-approved.ts:1`, каталоги `src/lib/email`, `src/lib/max`, `deploy`, `config` | Business-письмо об одобрении каталога не обещает срок trial. Писем, ботов и cron-напоминаний о завершении Business trial не найдено |
| `public/business/12-free-trial.webp` | Иллюстрация проверена визуально: числа дней и текстового обещания нет |

## Напоминания, уведомления и аналитика: шкала 7 + 3

Используется существующее уведомление в кабинете при посещении, без новой рассылки, cron, бота или автоплатежа. Источники: `src/components/business-app/BusinessHomeAccessCard.tsx:117`, `:146`, `src/lib/access-grants/access-line.ts:59`, `src/lib/access-grants/events.ts:31`, `:71`.

| Момент | Доступ / сообщение | Аналитика |
| --- | --- | --- |
| Активация, день 1 | Полный доступ, осталось 7 дней; точная дата и время МСК, цена следующего периода | `trial_started` один раз; `first_useful_action` при первом play |
| Дни 2–6 | Обратный отсчёт из `ends_at`, дата окончания и строка о следующих 3 днях | Новых событий-напоминаний нет |
| Календарный день 7 МСК (индекс 6) | Полный trial; оставшееся время, без прежних обещаний 30 дней | `activity_day_7` один раз при визите в живой trial, не отправка письма |
| Конец полных 7 суток / начало суток доступа 8 | `grace`: «Срок закончился», требуется оплата; 799 ₽ за 30 дней; музыка ещё 3 дня | Платёжный CTA доступен; клик `subscription_go_to_payment` |
| Вторые сутки grace | Музыка доступна, осталось 2 дня; та же оплата | Без отдельной рассылки |
| Третьи сутки grace | Музыка доступна, остался 1 день; та же оплата | Без отдельной рассылки |
| Конец grace (через 10 полных суток) | `offer`: музыка остановлена, кабинет и настройки сохранены, предложение оплаты | `subscription_offer_shown` при визите, один раз |
| Оплата в grace или после остановки | `paid`, сохранённые настройки и обычный кабинет без нового onboarding | `subscription_renewed` |

Индексы аналитики считаются по московским календарным датам; доступ определяется точными моментами. Поэтому для поздней активации остаток полных 7 суток может заходить на восьмую календарную дату. События `activity_day_14` и `activity_day_30` для новых 7-дневных grant недостижимы; оставлены для ранее выданных grant и совместимости CHECK `access_grant_events_name_check` (`supabase/migrations/20270120120000_access_grants_and_workspace.sql:56`). Переименование потребовало бы отдельной миграции и изменения аналитического контракта; здесь не выполняется. Нет запланированных уведомлений дня 14/30, которые нужно переносить.

## Найденные «30», которые оставлены

| Место | Причина оставить |
| --- | --- |
| `src/lib/business/plan.ts:18`, `src/lib/access-grants/copy.ts:31`, `:43`, `src/components/business-app/BusinessHomeAccessCard.tsx:137` | **Платный период Business**, 799 ₽ за 30 дней; не бесплатный trial |
| `src/lib/payments/checkout-result-cta.ts:77`, `:88`, `supabase/migrations/20270205130000_business_subscription_payment.sql:543`, `:687` | Описание покупки и расчёт платного периода |
| `supabase/tests/business_subscription_payment_smoke.sql:160`, `:190`, `:248`, `:282`, `scripts/business-subscription-payment-unit.tsx:24` | Тесты покупки 30 дней, а также допустимый ранее выданный grant |
| `src/lib/business-app/guest-coffee/limit.ts:14`, `:24`, `supabase/migrations/20270108120000_business_guest_listening.sql:22`, `:168` | Скользящее антиабуз-окно 30 дней для сети; само гостевое демо 30 минут. Это отдельный гостевой лимит, не trial |
| `src/lib/business-app/guest-coffee/copy.ts:30`, `:34`, `src/components/business-app/BusinessGuestStatus.tsx:55`, runbook `:87` | 30 **минут** гостевого прослушивания; не 30 дней |
| `supabase/migrations/20270120120000_access_grants_and_workspace.sql:5` | Исторический комментарий о первоначальных 30 × 24 часах; исполняемого default нет. Старую миграцию не переписываем |
| `src/lib/access-grants/events.ts:11`, `:12`, `:33`, `:34`, SQL CHECK `:61`–`:62` | Имена старых аналитических событий, не обещания и не рассылки |
| `docs/business/public/music-rights-declaration.md:66`, `program-terms.md:25`, `claims-procedure.md:83`, `:98` и их архивы/копии в `src/lib/business-app/client-document-content.ts`, `src/lib/business-rightsholder/legal-drafts/content.ts` | Юридические сроки снятия трека и возмещения, не срок trial |
| `src/lib/business/vertical-guides/articles/biznes-plan-kofeyni.ts:118`, `:216` | Учебный расчёт месячной выручки кофейни за 30 дней |
| `src/lib/author-stats/dates.ts:50`, `src/lib/promotion/dates.ts:36`, `src/lib/admin/analytics-period.ts:15`, `src/lib/seo/wordstat/types.ts:27` | **Не Business trial**: периоды статистики автора, продвижения, администратора и Wordstat |
| `scripts/business-trial-7-days-unit.mts:44` и блок legacy, `docs/business/access-grants.md:7` | Отрицательные проверки старого обещания и документация сохранения старых grant; не пользовательский оффер |

Юридические тексты проверены в `docs/business/public`, архиве, копиях кабинета и условиях правообладателей: числового обещания 30-дневного trial не найдено. В `docs/business/public/program-terms.md:13` пробный/пилотный период указан без количества дней. Правки юридических документов не потребовались. Сроки снятия треков и возмещения оставлены без изменений.

## Автотесты и фактические проверки

- `scripts/business-trial-7-days-unit.mts` подключён в `package.json:28` к `npm run test:business-workspace-trial`. Покрывает дни 1/7, начало grace после семи полных суток, каждые сутки grace, миллисекунды до и ровно на обеих границах, оплату в grace, вход после остановки, сохранение playback, отсутствие повторного grant, сохранение старого 30-дневного grant.
- Поверх основы добавлены проверки полуночи МСК относительно UTC, поздней активации, смены месяца/года и високосного февраля; события дня 7 и отсутствие событий дня 14/30 в новом периоде; текст о grace без em dash.
- `scripts/business-workspace-trial-unit.tsx:905`, `scripts/business-app-owner-home-render-unit.tsx:122` обновлены под точное описание grace. В основе также обновлены ожидания 7 дней в тестах landing, coffee-atlas, guest-coffee, guest-shell, venue-licence.
- Повторный `rg` по frontend/backend, API, scripts, config, deploy, SQL и Business-документам не выявил действующих обещаний 30 бесплатных дней. Проверены также «30 days», «30*24», упоминания бесплатного месяца и подарка. Оставленные совпадения перечислены выше; многострочные формулировки проверены чтением файлов. Изображение trial просмотрено отдельно.
- `git diff --check` проходит. `node scripts/business-venue-licence-isolation-unit.mjs` проходит.
- Итоговые правки (основа `db8a9d8a` + исправления поверх неё) проверены оркестратором 02.11.2026 на Node 22 с `npm ci` и `nice -n 10`: `npm run test:business-workspace-trial` (включая `business-trial-7-days-unit.mts`), весь блок «Validate Audiolad Business» из `.github/workflows/business-pr-validation.yml` без шагов, которым нужен Docker/SQL, `business-app-owner-home-render-unit.tsx`, `tsc --noEmit`, `eslint` по изменённым TS/TSX/MTS – всё зелёное. SQL-шаги и сборка проверяются в CI PR.
- Браузерный сценарий и live-платёж не выполнялись; production не использовался.

## Миграции, вопросы Сергею и точка продолжения

**Новая миграция не нужна.** Срок grant вычисляет приложение, БД хранит абсолютный `ends_at` без 30-дневного default; существующие строки и SQL не изменены. Новые автоплатежи, привязка карты, тарифы и параллельная модель подписок не вводились.

Вопрос Сергею: подтвердить для релизного сообщения сохранение ранее выданных 30-дневных trial до их первоначального `ends_at` с последующими 3 сутками grace. Это уже безопасное поведение реализации и прямое ограничение задания; сокращения существующих сроков не выполнено. Дополнительных юридических правок, требующих OK Сергея, не найдено.

Перед merge: зелёный CI PR (включая SQL-шаги в изолированной тестовой БД), независимое ревью и OK Сергея (логика подписки). Действия на production не выполнялись; issues #639–#641 не затронуты.
