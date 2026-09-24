# Защита от заполнения диска

Этот документ описывает изменения в репозитории и отдельный production rollout.
Сам PR не меняет Docker, Supabase, PGDATA и не пересоздаёт контейнеры.

## Что уже в коде

| Слой | Где | Когда действует |
|---|---|---|
| Deploy guard | `DEPLOY_MIN_FREE_MB=12288` в `deploy/scripts/lib/common.sh` | После deploy этого SHA, до создания candidate release |
| Dependency health | `GET /api/health/dependencies` | После deploy этого SHA |
| Disk watcher | `deploy/scripts/audiolad-disk-health.sh` и systemd templates | Только после отдельной установки timer |
| Log rotation | `deploy/supabase/docker-compose.override.yml` | Только после отдельной установки override и recreate |

`/api/health/build` остаётся проверкой процесса и build id. Недоступность Postgres его не роняет, чтобы deploy readiness не зависел от базы.

Rollback semantics не меняются: `rollback.sh` этот порог диска не вызывает.

## Dependency health

`GET /api/health/dependencies` делает один дешёвый read-only запрос через существующий service-role клиент и выбрасывает строку. В ответе нет пользовательских данных, credentials и текста ошибки драйвера.

Здоровая база, HTTP 200:

```json
{ "status": "ok", "database": "ok" }
```

База недоступна, HTTP 503:

```json
{ "status": "degraded", "database": "unavailable" }
```

`Cache-Control: no-store`.

Для Uptime Kuma это отдельный HTTP-монитор, не замена `/api/health/build`.

## Disk watcher

Пороги по `df` для `/`:

| used | state | warning push | critical push |
|---|---|---|---|
| <= 84% | ok | up | up |
| 85–89% | warning | down | up |
| >= 90% | critical | down | down |

Скрипт ничего не удаляет. Каждые 5 минут пишет `state=` в journal.

Две независимые Push-проверки Kuma (Telegram уже подключён к Kuma, не к этому скрипту):

1. Disk warning. Push URL в `AUDIOLAD_DISK_WARNING_PUSH_URL`.
2. Disk critical. Push URL в `AUDIOLAD_DISK_CRITICAL_PUSH_URL`.

URL не коммитятся. Их кладут в root-only файл:

```text
/etc/audiolad/disk-health.env
```

Права `0600`, владелец root. Unit читает его через `EnvironmentFile=-/etc/audiolad/disk-health.env`. Если переменной нет, скрипт только пишет `notification config missing` и не меняет сервер. Сам URL в journal не попадает.

Установка timer — отдельная команда после merge/deploy, не часть этого PR:

```bash
install -d -m 755 /usr/local/lib/audiolad
install -m 755 deploy/scripts/audiolad-disk-health.sh /usr/local/lib/audiolad/audiolad-disk-health.sh
install -m 644 deploy/systemd/audiolad-disk-health.service /etc/systemd/system/
install -m 644 deploy/systemd/audiolad-disk-health.timer /etc/systemd/system/
install -d -m 755 /etc/audiolad
install -m 600 /dev/null /etc/audiolad/disk-health.env
systemctl daemon-reload
systemctl enable --now audiolad-disk-health.timer
```

Перед `enable` вписать два push URL в env-файл.

## Docker log rotation

Канонический шаблон: `deploy/supabase/docker-compose.override.yml`.

Service keys совпадают с production compose `/opt/supabase/docker/docker-compose.yml`:

`studio`, `kong`, `auth`, `rest`, `realtime`, `storage`, `imgproxy`, `meta`, `functions`, `db`, `supavisor`, `templates-server`.

На каждый сервис только:

```yaml
logging:
  driver: json-file
  options:
    max-size: "20m"
    max-file: "5"
```

Потолок: 20m × 5 = **100 MB на контейнер**, 12 × 100 MB = **около 1.2 GB** на весь проект. Volumes, ports, env, restart и depends_on шаблон не задаёт.

Существующие контейнеры не получат новый `LogConfig`, пока их не пересоздадут. `docker update` политику логов не меняет.

## Production rollout логов

Выполнять только отдельным maintenance после merge. Этот PR rollout не запускает.

Не использовать `docker compose down`.

1. Сохранить текущие файлы:

```bash
cp -a /opt/supabase/docker/docker-compose.yml /opt/supabase/docker/docker-compose.yml.bak-disk-logs
if [[ -f /opt/supabase/docker/docker-compose.override.yml ]]; then
  cp -a /opt/supabase/docker/docker-compose.override.yml /opt/supabase/docker/docker-compose.override.yml.bak-disk-logs
fi
```

2. Установить шаблон как `/opt/supabase/docker/docker-compose.override.yml`.
3. Из `/opt/supabase/docker` снять effective config и убедиться, что относительно текущего compose изменился только `logging`:

```bash
cd /opt/supabase/docker
docker compose config > /tmp/supabase-effective-config.yml
```

4. Первым пересоздать только Kong, после отдельного разрешения:

```bash
docker compose up -d --no-deps --force-recreate kong
```

5. Проверить:

- контейнер `supabase-kong` healthy;
- `docker inspect supabase-kong` показывает `max-size=20m` и `max-file=5`;
- сайт, `/catalog` и auth отвечают.

6. Затем по одному, с той же проверкой после каждого:

```bash
docker compose up -d --no-deps --force-recreate auth
docker compose up -d --no-deps --force-recreate storage
docker compose up -d --no-deps --force-recreate rest
docker compose up -d --no-deps --force-recreate supavisor
```

`supavisor` — compose service key контейнера `supabase-pooler`.

7. `db` и малошумные сервисы (`studio`, `realtime`, `imgproxy`, `meta`, `functions`, `templates-server`) не входят в первую волну. Их recreate — отдельное окно.

## Rollback логов

- Вернуть предыдущий override из `.bak-disk-logs` или удалить новый override, если файла раньше не было.
- Пересоздать только тот service, который уже пересоздали: `docker compose up -d --no-deps --force-recreate <service>`.
- PGDATA (`/opt/supabase/docker/volumes/db/data`) и Storage (`/opt/supabase/docker/volumes/storage`) не откатывать и не удалять.

## Follow-up, не в этом PR

Пока база недоступна, пользователь видит ложное состояние:

- `/catalog` превращает ошибку выборки в пустой список и текст, что продуктов нет;
- `/auth/sign-in` любую ошибку Supabase заменяет на сообщение про email и пароль.

Это отдельные продуктовые правки. В infrastructure PR их не смешивать.
