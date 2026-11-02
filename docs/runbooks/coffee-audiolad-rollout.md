# Витрина АудиоЛад Кофе

Код использует существующий кабинет `/business-app`, каталог, API, регистрацию,
7 дней в подарок (затем 3 дня льготного периода) и оплату 30 дней. Реальная стартовая страница – `/business-app/guest/coffee`,
публичный постоянный адрес – `https://business.audiolad.ru/guest/coffee`.
Новый адрес – `https://coffee.audiolad.ru/`. Отрасль SPA на coffee закрыта.
Coffee открывается напрямую через rewrite, без первого перехода на business.
Корень coffee остаётся гостевым кабинетом. Главная владельца с карточкой доступа
и оплатой 799 ₽ доступна по `/cabinet` (также alias на business).
Публичные страницы coffee `/`, `/help`, `/documents` и тексты документов
индексируются: index/follow, canonical и OpenGraph указывают на соответствующую
страницу coffee. Robots разрешает только эти страницы; sitemap содержит только их.
Остальные страницы кабинета coffee сохраняют noindex/nofollow.
Business сохраняет noindex/nofollow, robots disallow-all и 404 для sitemap.

## Флаг и безопасный выпуск до DNS

Единственный флаг: `NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED=1`.
Любое другое значение или отсутствие означает OFF. Это публичный build-time флаг
Next.js: задавать одинаково при сборке и запуске. Для переключения нужна новая
сборка и штатный release; изменение переменной только у запущенного процесса
недостаточно. Секретов флаг не содержит.

OFF: web CTA Атласа сохраняет `https://business.audiolad.ru/guest/coffee`,
coffee возвращает 404, общий перенос гостя/настроек отключён. Business читает
и пишет прежнее хранилище. Можно выпустить этот код до появления DNS.
ON: web CTA всех 11 страниц ведёт на coffee `/`; PDF и старый адрес работают.
Business сохраняет свои маршруты, интерфейс и продуктовую логику.

## Где состояние и как оно переносится

- Сессия Supabase уже общая по решению владельца: используется существующий
  `src/lib/supabase/cookie-domain.ts`. Механизм auth не меняется.
- Раньше гостевой токен был только в host-only HttpOnly cookie `al_biz_guest`.
  Счётчик/lease в `business_guest_listening` привязан к SHA-256 токена,
  дополнительный сетевой счётчик также остаётся прежним.
- При ON существующий токен копируется без изменения в `al_biz_guest_shared`
  с Domain=.audiolad.ru, Secure, HttpOnly, SameSite=Lax, Path=/.
  Новое имя исключает неоднозначность host-only/shared cookie с одним именем.
  Уже существующий общий токен имеет приоритет: старый токен другого origin
  не должен перезаписывать активного гостя. Старый cookie сохраняется для отката.
- Характер кофейни, тип звучания – localStorage `audiolad-business-sound-profile`;
  очередь/энергия – `audiolad-business-cafe-queue-prefs`; расписание –
  `audiolad-business-cafe-daypart-hours` (в том числе ключ по UUID точки).
  Только эти настройки получают общие cookie с префиксом `al-coffee-pref-`,
  Secure и SameSite=Lax. Клиент читает их, поэтому HttpOnly здесь неприменим.
  Запись также сохраняет локальную копию. Общие настройки имеют приоритет над
  старой локальной копией. Существующие парсеры проверяют значения.
- Принудительного handoff при первом входе нет. Миграция выполняется лениво:
  на запросах business `migrateCoffeeGuestCookie` переносит старый HttpOnly токен;
  при чтении `coffeeStorage` зеркалирует разрешённые legacy localStorage настройки
  в общие cookie. На coffee гостевой usage API уже выдаёт общий токен.
  Первый прямой вход coffee не может прочитать host-only cookie и localStorage
  business до посещения business после обновления. Старый `/coffee-handoff`
  продолжает работать для ранее выданных ссылок, включая перенос настроек и marker.
- Настройки зарегистрированной точки уже хранятся в БД; сохранённая серверная
  конфигурация по-прежнему имеет приоритет. Регистрация, подарочный доступ и
  аккаунт используют существующий путь; второго кабинета/бэкенда/регистрации нет.
- Текущая позиция проигрывания и голоса очереди в sessionStorage остаются состоянием
  вкладки. Cookie привязки устройства точки, её credentials и прочие cookie не
  расширяются. Привязанное устройство другого host не становится автоматически
  авторизованным устройством coffee.
- Domain задаётся только для audiolad.ru и его поддоменов, через существующий helper.
  На localhost/preview настройки остаются локальными, гостевой cookie – host-only.

## Инфраструктура – каждый шаг только с явным OK Сергея

1. **OK Сергея: DNS.** Сверить текущий публичный адрес приложения в панели хостинга.
   Создать A-запись `coffee` на этот адрес, проверить DNS и отсутствие конфликтующей
   AAAA-записи. Не публиковать адреса/учётные данные в репозитории. Business не менять.
2. **OK Сергея: TLS.** Выпустить сертификат coffee существующим ACME-процессом.
   При HTTP challenge сначала подготовить отдельный HTTP block и challenge location.
   Проверить SAN, цепочку и renewal. Не менять сертификат business.
3. **OK Сергея: nginx.** Снять резервную копию конфигурации. Сверить пример
   `deploy/nginx/coffee.audiolad.ru.conf.example` с реальным upstream, лимитами,
   challenge location и TLS-политикой. Оба host-заголовка nginx устанавливает сам.
   Подключить только новый server block после появления сертификата, выполнить
   `nginx -t`, затем согласованный graceful reload. Пример не является live-конфигом.
4. **OK Сергея: флаг ON и release.** Собрать candidate с флагом `1`, выполнить
   проверки ниже, выпустить штатным pipeline. Самовольный PM2 restart запрещён.
   До этого можно выпустить код с OFF. Оркестратор добавляет только согласованный
   GoTrue redirect allowlist entry `https://coffee.audiolad.ru/**`; БД, billing и secrets не менять.

## Проверка перед включением и после выпуска

На candidate проверить OFF и ON отдельными сборками. Затем desktop и mobile:

- OFF: Atlas CTA на business; business `/`, `/guest/coffee`, `/music`, auth и
  существующая сессия работают как прежде; coffee не открывает витрину.
- ON: прямой вход coffee `/`, `/help`, `/documents`, вход из Атласа с UTM
  открываются без редиректа на business. `/guest/coffee` открывает гостевой кабинет,
  `/cabinet` – главную владельца с карточкой доступа и оплатой.
- До первого входа coffee в старом business-госте выбрать характер, звучание,
  день/энергию и расписание, потратить часть 30 минут. После перехода проверить
  те же настройки и остаток лимита после ленивой миграции на business. Вернуться в business, изменить настройки
  на coffee и убедиться, что последующее чтение на business использует новое значение.
- Проверить новый чистый браузер, существующий общий токен с устаревшим host-only
  токеном, запрет localStorage, недоступность счётчика (fail closed).
- Проверить гостевое прослушивание до лимита, регистрацию на coffee, подтверждение email, восстановление пароля, доступ на
  7 дней и следующие 3 дня льготного периода, возврат в кабинет, сохранённые
  настройки точки, подборки, плеер и оплату.
  Login/logout должны отражаться на обоих host; не создавать отдельный аккаунт.
- Проверить business и coffee `/music`, `/workspace`, `/preferences`, `/profile`,
  доступ к документам и API плеера. Другие отрасли не доступны на coffee.
- Проверить все 10 страниц кофеен, их примеры, ссылку PDF и скачивание PDF.
  Старый URL из PDF продолжает работать, аналитические goal names сохранены.
- Проверить canonical/OpenGraph/index/follow публичных страниц coffee, noindex
  остальных страниц и coffee robots/sitemap. На business robots запрещает всё,
  sitemap – 404. Проверить отсутствие listener/admin/catalog на coffee
  и сертификат без отключения TLS verification.
- Не выводить cookie, токены, персональные данные и env значения в smoke-отчёт.

## Исправления по review PR #1073

- `migrateCoffeeGuestCookie` дописывает свои cookie raw-строками `Set-Cookie`, не через
  `response.cookies.set`: иначе Next пересериализует cookie и теряет raw-строки
  `updateSession` (host-only expiry + маркер `al-auth-scope`) – получался 307-цикл на
  `/coffee-handoff` у пользователей с legacy host-only cookie. При флаге OFF функция
  ответ не трогает, этот дефект OFF не затрагивал.
- На coffee 404 для `/api/business/player/manifest` и `/track-url` (/spa pilot);
  `/api/business/player/report` остаётся для cabinet-плеера, SPA-ветка на coffee – 404.
- Флаг OFF: отдельный matcher для host coffee отправляет в proxy и статику
  (`robots.txt`, `sw.js`, manifest, картинки) – 404; при ON – без изменений.
- `/music`, `/profile`, `/preferences` наследуют host-aware canonical из layout.
- Общие cookie настроек нормализуются parse → serialize при записи и чтении.
- Пример nginx повторяет боевой block business (upstream, overlay статики, буферы),
  сертификат отдельный.

## Откат – только согласованный release

После OK Сергея собрать и выпустить вариант с флагом OFF (или предыдущий release).
Atlas снова ведёт на business, coffee возвращает 404. Данные БД и cookie не удалять:
общий аккаунт, счётчик и настройки сохраняются; локальные копии записывались параллельно.
Если нужно обслуживать ранее выданные coffee ссылки, отдельно согласовать временный
nginx redirect на соответствующий business path, для `/` – `/guest/coffee`, с query.
DNS/TLS не удалять до истечения кэшей и завершения согласованного окна отката.
Не менять block business, общий upstream, Supabase, платежи или историю Git.

Точка продолжения: review diff и CI, затем получить OK Сергея на DNS/TLS/nginx,
проверить candidate в браузерах и согласовать ON release. Эта сессия инфраструктуру
не меняет, коммит/PR делает оркестратор.

## Авторизация на coffee и возврат после оплаты

Только при ON и реальном Host `coffee.audiolad.ru` auth обслуживается на coffee.
Business остаётся общим входом для всех отраслей: его href, маршруты и платежные
возвраты не меняются. На apex поведение тоже сохраняется.

Точный coffee allowlist (pass_through, без rewrite в `/business-app`):

- `/auth/sign-in`, `/auth/sign-up` – формы, включая POST server actions;
- `/auth/forgot-password`, `/auth/recovery`, `/auth/reset-password` – весь recovery-flow;
- `/auth/callback` – обмен кода подтверждения и безопасный возврат;
- `/auth/sign-out` – существующий logout action (из профиля POST идёт на текущую страницу);
- `/auth/business-return`, `/auth/business-cabinet` – возврат подарка и оплаты;
- `/auth/claim-partner-attribution`, `/auth/claim-guest-ratings` – существующие claims,
  импортируемые формой входа; обычно Next отправляет их POST на `/auth/sign-in`;
- `/api/analytics/track`, `/api/analytics/signup/complete` – условные вызовы клиентской
  формы регистрации, если имеется analytics session.

Другие platform-only пути остаются 404. Дополнительные platform providers на
coffee auth не монтируются: нет восстановления listener-плеера, его API или PWA chrome.
Навигация auth ведёт на `/`, `/cabinet`, `/documents`; юридические тексты и статья
о письме открываются по абсолютным apex URL. Auth сохраняет noindex/nofollow,
no-store и no-referrer.

Ссылки coffee ведут на coffee sign-in/sign-up с прежним validated relative `next`:
`/auth/business-return?site=coffee` для подарка,
`/auth/business-cabinet?site=coffee` для обычного входа.
Без `next` вход и регистрация на coffee ведут на `/cabinet`.
Без `site=coffee` return-страницы сохраняют прежний business target.

До выпуска ON оркестратор обязан добавить в **self-hosted GoTrue** Redirect URLs:
`https://coffee.audiolad.ru/**`. Это не настройка supabase.com.
Регистрация на coffee передаёт `emailRedirectTo` на
`https://coffee.audiolad.ru/auth/callback?next=<validated relative next>`;
recovery передаёт `redirectTo` на `https://coffee.audiolad.ru/auth/recovery?next=...`.
На business/apex параметры остаются прежними. OAuth и magic link не добавлены.

Supabase login/refresh/logout используют существующий Domain=.audiolad.ru,
Secure, Path=/; logout удаляет общую сессию, proxy также удаляет legacy host-only
двойников. Область других cookies не расширена: recovery stage и intent остаются
host-only на `/auth/recovery` и `/auth/reset-password`, attribution, guest ratings
и price visitor – host-only, Path=/. Cookies apex не переносятся на coffee:
claims/price binding используют только cookie текущего host. Это не блокирует вход.

`serverActions.allowedOrigins` не задан; Next проверяет совпадение Origin и
Host/X-Forwarded-Host. Coffee формы и actions работают same-origin; глобальные
исключения и wildcard origins не добавлены. Прокси должен выставлять оба host
заголовка одинаково, как в существующем nginx-примере. Auth actions и два
разрешённых analytics API не содержат отдельных origin/referrer allowlist.

Платёж, начатый через business subscription checkout с реальным coffee Host,
передаёт серверный `returnSite=coffee`. Клиент не задаёт returnSite.
Tochka redirectUrl и failRedirectUrl остаются на `config.siteUrl` (apex):
`order_id`, `token`, затем `status=failed` для fail URL, затем `site=coffee`.
Без returnSite строки URL идентичны прежним; остальные order kinds не меняются.
Только точный `site=coffee`, ON и подтверждённый status API `business_subscription`
выбирают цели: `https://coffee.audiolad.ru/cabinet#dostup` либо
`https://coffee.audiolad.ru/auth/sign-in?next=%2Fauth%2Fbusiness-cabinet%3Fsite%3Dcoffee`.
Это фиксированные константы, а не отражение query/Host. Остальные значения выбирают
прежние business цели. Poll/re-check сохраняет URL страницы и marker.

**Повторный платёж:** существующая валидная pending payment link используется без
изменений (reuse logic не менялась) и сохраняет marker, выбранный при её создании.
Поэтому checkout API при каждом старте ставит cookie `al_checkout_return_site`
(`coffee` или `business`, Domain=.audiolad.ru, Secure, SameSite=Lax, 24 часа, не
httpOnly, без персональных данных). checkout/result берёт сайт из cookie последнего
старта, а marker `site=coffee` в URL – только если cookie нет. Принимаются только
точные значения `coffee`/`business`; цели – те же фиксированные константы.

При откате OFF coffee снова возвращает 404, а apex checkout/result даже с
`site=coffee` выбирает прежние business цели. Ранее выданные coffee email-ссылки
без дополнительного согласованного redirect перестанут открываться: учесть их
срок действия перед откатом. GoTrue allowlist не удалять до завершения этого окна.
Платежные ссылки, общие cookies и данные не удалять.

Оставшийся отдельный gate: MAX/VK callbacks требуют отдельной проверки и настройки.

## Проверки изменений auth/payment

В этой рабочей копии нет Node/npm/node_modules. Установка, сеть, dev server,
build и коммит запрещены заданием. Unit-сценарии расширены, но не запускались.
Оркестратору выполнить tsc, ESLint и unit scripts: business-coffee-host,
business-app-proxy-routing, public-request-origin, password-recovery-navigation,
supabase-cookie-domain, business-subscription-payment, business-workspace-trial,
listener-welcome; затем существующие checkout regressions.
Проверить отдельно OFF/ON, coffee/business/apex, signup с autoconfirm и email
confirmation, recovery/reset, callback errors, login/logout общей сессии,
payment paid/processing/failed/cancelled/refunded с сессией и без неё.
Браузерная проверка и реальная GoTrue/Tochka конфигурация здесь не проверялись.

Точка продолжения этой задачи: review diff, проверки оркестратора, затем настройка
GoTrue allowlist и browser smoke на candidate. Коммит и release делает оркестратор.

## История проверок поставки до изменений auth/payment

Node 20 (для тестов с proxy – `--experimental-websocket`), флаг OFF и ON:
`tsc --noEmit` прошёл, ESLint изменённых файлов без замечаний,
unit-проверки business-coffee-host, business-app-proxy-routing,
business-coffee-atlas, business-guest-coffee, supabase-cookie-domain,
business-brand-icons, business-app-domain-bind, business-ru-copy,
business-trial-7-days, business-subscription-payment, business-guest-shell,
business-workspace-trial прошли. Business `/`, его canonical/OG, robots и sitemap
не менялись. Браузерная проверка coffee и business – после выпуска.

## История проверок предыдущей поставки

Использован Node 20.
Ничего не устанавливалось, symlink node_modules не менялся.

Typecheck прошёл: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit -p .`.
ESLint изменённых TS/JS файлов прошёл:

```bash
npx eslint $(git diff --name-only -- '*.ts' '*.tsx' '*.mts' '*.mjs') src/lib/business-app/coffee-host-proxy.ts src/lib/business-app/guest-coffee/shared-identity.ts src/lib/business-app/shared-coffee-storage.ts src/app/business-app/coffee-handoff/page.tsx src/components/business-app/CoffeeHandoff.tsx scripts/business-coffee-host-unit.mts
```

Unit-проверки выполнены напрямую через loader, поскольку `npx tsx` в sandbox
не может создать IPC socket (EPERM). В CI стандартный npm script сохранён.
Все перечисленные unit-проверки прошли:

```bash
set -e
for testfile in business-coffee-host-unit.mts business-app-proxy-routing-unit.mjs business-coffee-atlas-unit.mts business-guest-coffee-unit.mts supabase-cookie-domain-unit.mts business-brand-icons-unit.mjs business-app-domain-bind-unit.mjs business-ru-copy-unit.mts business-guest-atmosphere-unit.mts business-guest-passport-unit.mts business-location-sound-settings-unit.mts; do node --import tsx "scripts/$testfile"; done
NODE_OPTIONS='--require ./scripts/cjs-stub-server-only.cjs' node --import tsx scripts/business-guest-shell-unit.tsx
NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED=1 node --import tsx scripts/business-coffee-atlas-unit.mts
NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED=1 NODE_OPTIONS='--require ./scripts/cjs-stub-server-only.cjs' node --import tsx scripts/business-guest-shell-unit.tsx
```

`business-guest-coffee-unit` проверил контракт; SQL-сценарии пропущены без явно
заданной disposable БД. CI использует свою disposable БД и требует SQL-сценарии.
`npm run build` заблокирован предоставленным внешним symlink node_modules
(Turbopack filesystem root); `npx next build --webpack` завершился ошибкой чтения
`tsc --showConfig`. Браузерный сценарий не выполнен: `npx next dev --webpack -p 3307`
не может слушать порт в sandbox (EPERM). Требуется повторить build и браузерную
матрицу на candidate. Полный repo lint не запускался, ESLint проверял изменённые файлы.
`git diff --check` прошёл. Коммит, push, merge и deploy не выполнялись.

## Файлы предыдущей поставки

- `.github/workflows/business-pr-validation.yml`
- `deploy/nginx/coffee.audiolad.ru.conf.example`
- `docs/runbooks/coffee-audiolad-rollout.md`
- `package.json`
- `scripts/business-coffee-atlas-unit.mts`
- `scripts/business-coffee-host-unit.mts`
- `scripts/business-guest-coffee-unit.mts`
- `scripts/business-guest-shell-unit.tsx`
- `scripts/supabase-cookie-domain-unit.mts`
- `src/app/business-app/coffee-handoff/page.tsx`
- `src/app/business-app/guest/coffee/page.tsx`
- `src/app/business-app/layout.tsx`
- `src/components/business-app/BusinessPlayerSettings.tsx`
- `src/components/business-app/CoffeeHandoff.tsx`
- `src/components/business-app/sound/BusinessSoundStudio.tsx`
- `src/components/business-app/workspace/BusinessCabinetPlayer.tsx`
- `src/components/business-app/workspace/useCafeQueuePreferences.ts`
- `src/lib/business-app/coffee-host-proxy.ts`
- `src/lib/business-app/guest-coffee/shared-identity.ts`
- `src/lib/business-app/guest-coffee/usage.server.ts`
- `src/lib/business-app/host.ts`
- `src/lib/business-app/proxy-policy.ts`
- `src/lib/business-app/seo.ts`
- `src/lib/business-app/shared-coffee-storage.ts`
- `src/lib/business/coffee-atlas/constants.ts`
- `src/proxy.ts`

## Incident 02.11.2026 and production smoke

After 39ccd7e1 (PR #1111) was deployed, every coffee page that the proxy rewrites to `/business-app/*` (`/`, `/help`, `/documents`, `/cabinet`, `/guest/coffee`) returned an empty 404. Production was rolled back with `rollback.sh`, and the change was reverted in PR #1114.

Cause: Next.js runs `NextResponse.rewrite(http://localhost:<PORT>/business-app/...)` as a second HTTP request with `Host: localhost:<PORT>` and keeps `X-Forwarded-Host`. The "Host beats X-Forwarded-Host" rule for coffee therefore resolved that internal request as `localhost`, and `/business-app/*` became 404. Fix: for a loopback Host the proxy routes by `X-Forwarded-Host` (`src/lib/business-app/proxy-hostname.ts`).

Guard: `npm run test:coffee-host-production-smoke` starts `next start` on an already built `.next` and sends real requests with nginx headers (`Host` = `X-Forwarded-Host` = `$host`) to coffee, business and audiolad.ru. In CI it is the `coffee-host-production-smoke` job in `.github/workflows/business-pr-validation.yml`.
