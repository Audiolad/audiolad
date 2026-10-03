# Аудит зависимостей и единых точек отказа

Дата среза: 2026-10-03. Источник — текущий репозиторий `Audiolad/audiolad`, не предположения о чужих панелях. Секреты здесь не приводятся.

Классы:

1. `KEEP_RUNNING` — нужно, чтобы уже запущенный сайт продолжал отвечать.
2. `NEW_DEPLOY` — нужно, чтобы выпустить новый релиз.
3. `OPTIONAL` — нужно только отдельной функции.
4. `CACHEABLE` — можно положить в российский или локальный кэш.
5. `RU_FALLBACK` — для аварийного контура нужен российский или офлайн-путь.

Одна зависимость может иметь несколько классов.

## Контур, который есть сейчас

Обычный деплой:

```text
GitHub Actions workflow_dispatch (environment production)
  -> ssh на пользователя deploy
  -> sudo -n /usr/local/sbin/audiolad-deploy <40-hex-sha>
  -> git fetch origin main в /var/www/audiolad-clean
  -> SHA обязан быть предком origin/main
  -> git show <sha>:deploy/scripts/run-from-target-sha.sh | bash
  -> deploy.sh этого SHA: ancestry, git archive, npm ci, lint, build,
     миграции, readiness, smoke, cutover
```

Это зафиксировано в `.github/workflows/production-deploy.yml` и `deploy/scripts/github-actions-deploy-wrapper.sh`. Workflow не ставит wrapper на сервер сам: на сервере лежит отдельная root-копия.

Сайт после успешного деплоя живёт на Timeweb `72.56.232.160`: PM2 `audiolad`, Nginx, self-hosted Supabase в Docker. Облачный supabase.com рабочей базой не является.

## Зависимости

| Зависимость | Классы | Факт |
|-------------|--------|------|
| Уже собранный релиз в `/var/www/audiolad-deploy/current` | `KEEP_RUNNING` | Пока процесс, Nginx и база на этом сервере живы, GitHub для ответов сайта не нужен. |
| Timeweb VPS `72.56.232.160`, PM2, Nginx | `KEEP_RUNNING` | Рабочий хост из `docs/RUNBOOK.md` и `AGENTS.md`. |
| DNS и TLS `audiolad.ru` | `KEEP_RUNNING` | Публичное имя. Этот этап DNS не меняет. Способ выпуска сертификата в репозитории не описан: уже установленный сертификат переживает недоступность издателя, продление — нет. |
| Self-hosted Supabase (Docker на том же VPS) | `KEEP_RUNNING` | Auth, каталог и данные. Образы production-compose лежат на сервере в `/opt/supabase/docker` и в git не зафиксированы. Пока контейнеры не пересоздают, registry не нужен. |
| GitHub `Audiolad/audiolad` | `NEW_DEPLOY`, `CACHEABLE`, `RU_FALLBACK` | Текущий `origin` деплоя. Для уже выложенного сайта не нужен. Аварийная копия — Gitea. |
| GitHub Actions и hosted runners | `NEW_DEPLOY` на текущем пути | Единственный автоматический пуск `audiolad-deploy` сегодня. Сайт без них работает. Аварийный пуск — `deploy/emergency/ci-runner.sh`, тот же `audiolad-deploy`. |
| `actions/setup-node` и образы CI | `OPTIONAL` | Нужны части GitHub-проверок, не production cutover. `production-deploy.yml` сторонние actions не вызывает. |
| npm `registry.npmjs.org` | `NEW_DEPLOY`, `CACHEABLE`, `RU_FALLBACK` | 504 пакета lockfile, все с этого хоста. См. `deploy/emergency/build-dependency-inventory.json`. Уже запущенному процессу registry не нужен. |
| Node.js 22 и npm | `NEW_DEPLOY` | Версия 22 зафиксирована в `studio-catalog-render-ffmpeg.yml`. На production Node уже установлен. |
| git | `NEW_DEPLOY` | `git archive` и проверка предков. |
| Docker Hub `postgres:16`, `supabase/postgres:15.14.1.171` | `NEW_DEPLOY` только для GitHub CI; `CACHEABLE` | Не скачиваются каноническим `deploy.sh`. |
| `louislam/uptime-kuma:1` | `OPTIONAL`, `CACHEABLE` | `deploy/monitoring/docker-compose.yml`. Сайт без него открывается. |
| ffmpeg | `OPTIONAL` | Studio render, music transcode, нормализация аудио. `deploy.sh` его не скачивает. |
| sharp / libvips | `NEW_DEPLOY`, `CACHEABLE` | Лежат внутри тех же npm-tarball `@img/sharp-*` на `registry.npmjs.org`. |
| Точка (`TOCHKA_*`) | `OPTIONAL` | Новые платежи. Страницы без вызова Точки живут. |
| GetCourse | `OPTIONAL` | Сверка благодарностей авторам. |
| SMTP (`AUDIOLAD_SMTP_*`) | `OPTIONAL` | Письма. Рендер сайта от SMTP не зависит. |
| Yandex Metrika, Wordstat, Webmaster, YandexGPT | `OPTIONAL` | Аналитика и SEO. |
| MAX (`MAX_BOT_TOKEN`) | `OPTIONAL` | Бот. Сайт без него открывается. |
| `NEXT_PUBLIC_CDN_ASSET_PREFIX` | `OPTIONAL` | Если пусто, статика идёт с приложения. |
| Company Core (`COMPANY_CORE_URL`, `COMPANY_API_TOKEN`) | `OPTIONAL` | Страница `/admin/ai-company`. На деплой и на публичный сайт не влияет. |
| Западные AI API (ChatGPT, Cursor, Grok, OpenAI) | `OPTIONAL` | Нужны людям и агентам, чтобы писать код. Продакшен их для ответа пользователю не вызывает как обязательный путь деплоя. |

## Секреты: где лежат и что нужно аварийному контуру

В git их нет.

| Место | Имена | Нужно аварийному Git-хосту |
|-------|--------|----------------------------|
| GitHub Environment `production` | `PRODUCTION_SSH_HOST`, `PRODUCTION_SSH_PORT`, `PRODUCTION_SSH_USER`, `PRODUCTION_SSH_PRIVATE_KEY`, `PRODUCTION_SSH_KNOWN_HOSTS` | Копия SSH-ключа пользователя `deploy` нужна только раннеру, который вызывает `audiolad-deploy`. На Git-хост с зеркалом её класть не обязательно. |
| Сервер, `/var/www/audiolad-deploy/shared/.env.production` | Публичные и серверные ключи приложения, включая Supabase и платёжные | Нет. Файл остаётся на production. |
| GitHub Actions, workflow зеркала | `EMERGENCY_GIT_TARGET_BASE`, `EMERGENCY_GIT_USERNAME`, `EMERGENCY_GIT_TOKEN` | Да, но только после Human Gate, и не в репозитории. Пока секретов нет, workflow завершается ошибкой и ничего не пушит. |

`Audiolad/music-analyzer` в манифест зеркала включён. Учётные данные этого агента репозиторий не увидели (`Could not resolve to a Repository`). Синхронизация такого источника пишется как `skipped_source_unreachable` и не роняет обязательный `audiolad`.

## Что этот аудит не делал

На production по SSH не заходили и образы `/opt/supabase/docker` не снимали. Пока контейнеры запущены, для работы сайта их повторное скачивание не требуется. Перед пересозданием Supabase нужен отдельный инвентарь образов с сервера.
