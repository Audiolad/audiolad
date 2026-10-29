# Витрина АудиоЛад Кофе

Код использует существующий кабинет `/business-app`, каталог, API, регистрацию,
доступ на 30 дней и оплату. Реальная стартовая страница – `/business-app/guest/coffee`,
публичный постоянный адрес – `https://business.audiolad.ru/guest/coffee`.
Новый адрес – `https://coffee.audiolad.ru/`. Отрасль SPA на coffee закрыта.
Дизайн и содержимое кабинета сохранены. Оба кабинета закрыты от индексации:
noindex/nofollow и robots disallow-all, sitemap на coffee отсутствует.
Canonical coffee указывает на coffee, business остаётся прежним.

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
- Первый переход на coffee делает 307 через business `/coffee-handoff`, сохраняя
  исходные path/query, включая UTM. Business переносит HttpOnly идентификатор,
  клиент переносит allowlist настроек из старого origin и возвращается на coffee.
  Общий HttpOnly marker `al_coffee_handoff` предотвращает повторный переход.
  Это работает и для первого прямого входа на coffee без предварительного посещения
  business после обновления. При выключенном JS есть ссылка продолжения, но перенос
  localStorage требует JS, как и сам плеер. Cookie должны быть разрешены.
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
   До этого можно выпустить код с OFF. Не менять Supabase, БД, billing или secrets.

## Проверка перед включением и после выпуска

На candidate проверить OFF и ON отдельными сборками. Затем desktop и mobile:

- OFF: Atlas CTA на business; business `/`, `/guest/coffee`, `/music`, auth и
  существующая сессия работают как прежде; coffee не открывает витрину.
- ON: прямой вход coffee `/`, вход из Атласа с UTM, один переход через handoff,
  возврат в исходный path/query. `/guest/coffee` также открывает реальный кабинет.
- До первого входа coffee в старом business-госте выбрать характер, звучание,
  день/энергию и расписание, потратить часть 30 минут. После перехода проверить
  те же настройки и остаток лимита. Вернуться в business, изменить настройки
  на coffee и убедиться, что последующее чтение на business использует новое значение.
- Проверить новый чистый браузер, существующий общий токен с устаревшим host-only
  токеном, запрет localStorage, недоступность счётчика (fail closed).
- Проверить гостевое прослушивание до лимита, регистрацию на apex, доступ на
  30 дней, возврат в кабинет, сохранённые настройки точки, подборки, плеер и оплату.
  Login/logout должны отражаться на обоих host; не создавать отдельный аккаунт.
- Проверить business и coffee `/music`, `/workspace`, `/preferences`, `/profile`,
  доступ к документам и API плеера. Другие отрасли не доступны на coffee.
- Проверить все 10 страниц кофеен, их примеры, ссылку PDF и скачивание PDF.
  Старый URL из PDF продолжает работать, аналитические goal names сохранены.
- Проверить canonical/noindex/robots, 404 sitemap, отсутствие listener/admin/catalog
  на coffee. Проверить сертификат без отключения TLS verification.
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

## Локальная проверка этой поставки

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

## Файлы поставки

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
