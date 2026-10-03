# Аудит зависимостей и единых точек отказа

Дата среза: 2026-10-03. Источник: текущий репозиторий `Audiolad/audiolad`,
канонический путь `production-deploy.yml` → `sudo -n /usr/local/sbin/audiolad-deploy <sha>`
→ `deploy/scripts/run-from-target-sha.sh` → `deploy/scripts/deploy.sh`.
Секреты здесь не приводятся, только имена и места.

Класс у каждой строки — один или несколько:

1. REQUIRED FOR SITE TO KEEP RUNNING
2. REQUIRED FOR NEW DEPLOY
3. REQUIRED ONLY FOR OPTIONAL FEATURE
4. CAN BE CACHED/MIRRORED
5. MUST HAVE RUSSIAN/OFFLINE FALLBACK

| Зависимость | Класс | Факт в этом репозитории |
|---|---|---|
| Timeweb VPS `72.56.232.160`, диск, сеть | 1 | На нём живёт сайт, Nginx, PM2, self-hosted Supabase. Панель Timeweb для уже запущенного сайта не нужна. |
| DNS `audiolad.ru` и действующий TLS-сертификат на Nginx | 1 | Репозиторий не выпускает сертификат и не меняет DNS. Пока сертификат не истёк, сайт открывается без Let's Encrypt. Продление сертификата считать внешней зависимостью, пока оператор не подтвердит издателя. |
| Self-hosted Supabase на том же VPS: `db`, `auth`, `rest`, `storage`, `kong` | 1, 2 | Сайт читает свою базу. `deploy.sh` гоняет миграции через docker exec в `supabase-db`. Облако supabase.com не используется. |
| Supabase Studio, realtime, imgproxy, functions, supavisor, templates-server | 3 | Есть в `deploy/supabase/docker-compose.override.yml` как соседние контейнеры. Падение Studio не гасит сайт. |
| Node.js 22 на VPS | 1, 2, 4 | CI и приложение на Node 22. Бинарник уже на сервере. Новый деплой не скачивает Node. Офлайн-копия tarball — запас, не шаг деплоя. |
| PM2-процесс `audiolad`, Nginx upstream | 1, 2 | Канонический деплой сам переключает upstream после readiness и smoke. Ручной `pm2 restart` не заменяет деплой. |
| `npm ci` и `registry.npmjs.org` | 2, 4, 5 | Lockfile этого коммита: 504 HTTPS-артефакта, все с `registry.npmjs.org`, других хостов в lockfile нет. Сайту, который уже собран, реестр не нужен. Новый деплой нужен реестр только при промахе кеша. Проверка: `deploy/emergency/build/emergency-build-ready.sh`. |
| Playwright CDN | 2, 4 | `playwright` — devDependency. Его postinstall качает браузеры. Smoke деплоя — HTTP (`smoke-test.sh`). `deploy.sh` выставляет `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`. |
| `sharp`, `pdfjs-dist`, `@supabase/*`, Next 16.3.4, React 19.2.4 | 2, 4 | Входят в те же 504 пакета npm. Отдельного скачивания нет. |
| ffmpeg / ffprobe | 3, 4 | Нужны Studio render, music transcode и music analyzer. В `deploy.sh` не скачиваются. Для `next build` не требуются. |
| GitHub репозиторий `Audiolad/audiolad` | 2, 5 | Сайт без GitHub работает. Новый деплой по основному пути делает `git fetch origin main` в `/var/www/audiolad-clean`. Аварийная замена — Gitea, тот же wrapper. |
| GitHub Actions и hosted runners | 2, 5 | Нужны только чтобы нажать основной путь. На исполнение канонического деплоя не нужны: команда та же `audiolad-deploy <sha>`. |
| GitHub Environment `production` secrets | 2, 5 | SSH-секрет лежит в GitHub. При падении GitHub он недоступен. Копия ключа должна лежать вне GitHub. Это пункт Human Gate, не ротация ключа. |
| Контейнерные registry | 2 | В репозитории нет Dockerfile и `docker pull` в `deploy.sh`. Образы Supabase уже запущены. Новый деплой приложения их не тянет. |
| `Audiolad/music-analyzer` и checkpoint `.pt` | 3, 5 | Воркер на том же VPS, путь описан в `deploy/docs/MUSIC_ANALYZER_WORKER.md`. Репозиторий этому агенту недоступен (`gh repo view` не нашёл его). В зеркало не добавлен. Сайт без него работает. |
| Tochka (`TOCHKA_*`) | 3 | Оплата. Деплой и отдача уже собранного сайта от API Точки не зависят. |
| GetCourse | 3 | Школа и сверка благодарностей. Не блокер деплоя. |
| SMTP (`AUDIOLAD_SMTP_*`) | 3 | Письма. Сайт без SMTP открывается. |
| Яндекс Метрика, IndexNow, Wordstat | 3 | Аналитика и SEO. Не блокер деплоя и не блокер отдачи страниц. |
| MAX (`MAX_BOT_TOKEN`) | 3 | Мессенджер. Не блокер деплоя. |
| CDN `NEXT_PUBLIC_CDN_ASSET_PREFIX` | 1, если переменная задана в production env | Код подставляет префикс только когда он задан. Значение в git не хранится. |
| Webhook `DEPLOY_ALERT_WEBHOOK_URL` | 3 | Необязательное уведомление из `deploy/scripts/lib/common.sh`. Пустой URL деплой не останавливает. |

## Где лежат секреты

В git их нет и быть не должно.

| Место | Что там нужно аварийному контуру |
|---|---|
| GitHub Environment `production` | `PRODUCTION_SSH_HOST`, `PRODUCTION_SSH_PORT`, `PRODUCTION_SSH_USER`, `PRODUCTION_SSH_PRIVATE_KEY`, `PRODUCTION_SSH_KNOWN_HOSTS`. При живом GitHub этого достаточно для Actions. |
| Сервер `/var/www/audiolad-deploy/shared/.env.production` | Рабочие секреты приложения. Уже на VPS. Новый контур их не копирует и не печатает. |
| Будущий хост Gitea, `/etc/audiolad/emergency-mirror.env` и `/etc/audiolad/emergency-git.env` | URL зеркала, токен Gitea, прежний GitHub remote. Файлы создаются только после Human Gate. Шаблоны без секретов: `deploy/emergency/config/*.example`. |
| Менеджер паролей Сергея | Единственная копия deploy SSH private key на случай, когда GitHub Secrets недоступны. Ключ не ротировать этим изменением. |

## Что не является зависимостью нового деплоя

Чат ChatGPT, Cursor, Grok и любой западный LLM. Они пишут код, пока доступны. Исполнение деплоя и работа сайта от них не зависят.
