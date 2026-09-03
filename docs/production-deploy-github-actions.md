# Ручной production-деплой через GitHub Actions

Этот документ описывает **однократный** серверный bootstrap и ручной
workflow `Production Deploy`. Слияние этого файла в `main` **не деплоит**
production и **не устанавливает** wrapper на сервер.

Канонический путь деплоя не меняется. Actions только запускает уже
существующий launcher.

## Архитектура

```text
GitHub Actions (workflow_dispatch, environment: production)
  -> системный ssh (github-hosted runner)
  -> пользователь deploy (SSH, без root-shell)
  -> sudo -n /usr/local/sbin/audiolad-deploy <40-char-sha>
  -> root-owned wrapper (копия deploy/scripts/github-actions-deploy-wrapper.sh)
  -> git show <sha>:deploy/scripts/run-from-target-sha.sh | bash -s -- <sha>
  -> pinned deploy.sh этого SHA
       fetch origin/main, ancestry, flock /run/audiolad-deploy.lock,
       git archive + npm ci + lint + build,
       DB preflight/apply,
       standby readiness + smoke-test.sh,
       cutover current/previous + nginx,
       public smoke + health-watch
```

Пользователь `deploy` **не запускает** `deploy.sh` сам: release-каталоги,
PM2 и lock сегодня работают от запускающего пользователя (staff one-liner
идёт через `sudo` и фактически от root). Поэтому SSH-пользователь вызывает
только root-owned wrapper.

`GIT_WORKDIR` в wrapper жёстко `/var/www/audiolad-clean`.
`DEPLOY_ROOT` жёстко `/var/www/audiolad-deploy`.
`AUDIOLAD_DEPLOY_OVERRIDE` wrapper снимает (`unset`); Actions его не
выставляет и не делает `SendEnv`. SSH-переменные сессии (`SSH_CLIENT` и
др.) wrapper тоже снимает — в `deploy.sh` они не пробрасываются.
До `git show` целевого `run-from-target-sha.sh` wrapper проверяет, что
SHA — commit и предок свежего `origin/main`. Иначе выход без чтения
скриптов из orphan/PR commit. Override-флаг не используется.
Workflow резолвит SHA через fetch только объектов origin/main, без
working-tree checkout, поэтому legacy gitlink `audiolad` не может сломать launcher.

Файл `deploy/scripts/github-actions-deploy-wrapper.sh` в репозитории —
только **шаблон**. Пока bootstrap его не скопировал в
`/usr/local/sbin/audiolad-deploy`, workflow упадёт на `sudo`.
Wrapper ставит `set -euo pipefail`, как staff one-liner в
`docs/production-deployment.md`.
Прецедент root-owned wrapper на этом сервере:
`/usr/local/sbin/audiolad-maintenance.sh` (`deploy/docs/MAINTENANCE.md`).
Тот же стиль установки: `install` в `/usr/local/sbin`, owner root, mode 0755.

Smoke деплоя (не менять и не расширять в этом PR):

```text
deploy/scripts/smoke-test.sh  ->  scripts/production-smoke-http.mjs
```

Файла `deploy/scripts/production-smoke-http.mjs` нет. Playwright smoke
не добавлять. `topics_catalog_counts` **нет** в текущем smoke на `main`;
не добавлять и не чинить последний неуспешный деплой. Падение текущего
HTTP-smoke до cutover по-прежнему оставляет production на предыдущем
релизе (`cleanup_failed_candidate`). Workflow этот предохранитель не обходит.

## GitHub Environment `production`

Environment с именем **`production`** нужно создать вручную в GitHub UI
(Settings → Environments → New environment). Workflow ссылается на него,
чтобы секреты жили как environment secrets, а не как обычные repository
secrets.

Секреты environment `production`:

| Секрет | Назначение |
|--------|------------|
| `PRODUCTION_SSH_HOST` | Хост SSH. В репозитории уже задокументирован Timeweb VPS `72.56.232.160` (`docs/RUNBOOK.md`, `docs/operations/production-process-policy.md`, `AGENTS.md`). |
| `PRODUCTION_SSH_PORT` | Порт SSH. Обычно `22`; в workflow секрета обязателен, без скрытого fallback. |
| `PRODUCTION_SSH_USER` | Пользователь `deploy` после bootstrap. |
| `PRODUCTION_SSH_PRIVATE_KEY` | Полный OpenSSH private key dedicated-пары (включая строки `BEGIN`/`END`). Не ключ root. Не коммитить. Как получить — раздел B. |
| `PRODUCTION_SSH_KNOWN_HOSTS` | Строка known_hosts для `72.56.232.160`, сверенная с `/etc/ssh/ssh_host_ed25519_key.pub` на production. Раздел B. |

Права workflow: только `contents: read`. Третьих SSH marketplace-action нет:
используется системный `ssh` на `ubuntu-latest`.

## Как запустить

### Production deploy (`confirm=DEPLOY`)

1. Actions → **Production Deploy** → **Run workflow**.
2. Branch: **`main`** (обязательно — environment `production` не отдаёт секреты PR-веткам).
3. `commit_sha` — пусто (тогда tip свежего `origin/main`) либо
   полный 40-символьный lowercase hex SHA, который есть среди объектов origin/main.
4. `confirm` = **DEPLOY**.
5. Run workflow.

### Read-only diagnostics (`confirm=DO_NOT_DEPLOY`)

Тот же workflow, но `confirm=DO_NOT_DEPLOY` запускает job **Production read-only
diagnostics**: SSH read-only `systemctl` / `journalctl` / хвост reconcile-log.
**Не вызывает** `audiolad-deploy` и не меняет production.

**Ограничение GitHub Environment:** секреты `production` доступны только с ref,
разрешённого в настройках environment (обычно только `main`). Dispatch с PR-ветки
может завершиться до любых steps (`steps=[]`) — это ожидаемо; ослаблять protection
нельзя. После merge workflow в `main` повторите dispatch с branch **`main`**.

Concurrency: группа `production-deploy`, `cancel-in-progress: false`.
Параллельный второй запуск ждёт, а не отменяет первый.

## Семантика ошибок

- Невалидный SHA, нет секретов, нет wrapper на сервере —
  красный workflow, production не трогается.
- `confirm=DO_NOT_DEPLOY` с PR-ветки при environment protection — diagnose job
  не стартует (нет доступа к secrets); deploy job пропускается.
- `confirm=DEPLOY` — канонический deploy path без изменений.
- Падение `deploy.sh` до cutover (включая candidate smoke) — красный workflow,
  тот же exit code. Production остаётся на предыдущем релизе; это уже делает
  `deploy.sh` (`cleanup_failed_candidate`).
- Падение после cutover — существующий `rollback.sh`, этот workflow его
  не дублирует.
- Успешный SSH-деплой, но `.deploy-commit` ≠ target SHA — красный post-check.
- Отдельный огромный smoke suite в Actions **не** добавляется. После успеха
  job только сверяет `.deploy-commit` и опционально
  `curl -fsS https://audiolad.ru/api/health/build` (`status=ok`).

Проверка wrapper локально (без деплоя):

```bash
npm run test:production-deploy-gha
```

## Факты сервера (уже в репозитории)

| Факт | Значение | Где |
|------|----------|-----|
| Production host | Timeweb VPS `72.56.232.160` | `docs/RUNBOOK.md`, `docs/operations/production-process-policy.md`, `AGENTS.md` |
| Git remote на сервере | `git@github-audiolad:Audiolad/audiolad.git` | `GIT_REPO` в `deploy/scripts/lib/common.sh` |
| Что это за alias | Запись в **серверном** `~/.ssh/config`, не в Actions | не копировать на github-hosted runner |
| Прецедент root-owned wrapper | `/usr/local/sbin/audiolad-maintenance.sh` | `deploy/docs/MAINTENANCE.md` |

Actions ходит на VPS своим отдельным SSH-ключом. Alias `github-audiolad`
нужен только серверу, чтобы `git fetch origin` в `GIT_WORKDIR` доставал
объекты с GitHub. Runner этот alias не использует.

Это **не** полностью автоматический процесс. Ключевую пару создаёт
человек; секреты в GitHub Environment копирует человек. CI bootstrap
не выполняет.

## Ключевая пара (создать до шага A)

Нужна **новая dedicated** пара `ed25519` только для
`GitHub Actions → пользователь deploy`. Не брать ключ root. Не коммитить.
Не оставлять приватный ключ в репозитории и по возможности не оставлять
его на сервере.

Предпочтительно сгенерировать на доверенной admin-машине (не на
production и не в runner):

```bash
ssh-keygen -t ed25519 -f ./audiolad-gha-deploy -C audiolad-gha-deploy -N ""
```

Появятся два файла (не в git):

| Файл | Куда |
|------|------|
| `audiolad-gha-deploy` | полный OpenSSH private key (`-----BEGIN OPENSSH PRIVATE KEY-----` … `-----END OPENSSH PRIVATE KEY-----`) → секрет `PRODUCTION_SSH_PRIVATE_KEY` (шаг B) |
| `audiolad-gha-deploy.pub` | одна строка `ssh-ed25519 AAAA... audiolad-gha-deploy` → переменная `DEPLOY_GHA_PUBKEY` для шага A и файл `/home/deploy/.ssh/authorized_keys` |

Если генерировать на production неизбежно: писать private key только в
root-only temp (`umask 077`, например `/root/audiolad-gha-deploy`),
один раз скопировать в GitHub secret, затем `shred -u` этот private file
с сервера. Public line оставить для `DEPLOY_GHA_PUBKEY`. Предпочтительнее
генерация вне сервера.

## A. Server bootstrap (вставить на production)

Выполнять **вручную на production** (`72.56.232.160`), не из CI.
Реальный деплой не запускать. Сначала на этой shell-сессии задать
непустой `DEPLOY_GHA_PUBKEY` (публичная строка из `.pub`). Если
переменная пустая, блок падает **до** `chown` — не существует
закомментированного create + живого chown отсутствующего файла.

```bash
set -euo pipefail

: "${DEPLOY_GHA_PUBKEY:?Set DEPLOY_GHA_PUBKEY to the ssh-ed25519 public line before bootstrap}"
case "$DEPLOY_GHA_PUBKEY" in
  ssh-ed25519\ *) ;;
  *)
    echo "ERROR: DEPLOY_GHA_PUBKEY must be one ssh-ed25519 public key line" >&2
    exit 1
    ;;
esac

# 1) Пользователь deploy + SSH-каталог + authorized_keys
if ! id -u deploy >/dev/null 2>&1; then
  useradd --create-home --home-dir /home/deploy --shell /bin/bash deploy
fi
install -d -o deploy -g deploy -m 0700 /home/deploy/.ssh
printf '%s\n' "$DEPLOY_GHA_PUBKEY" > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 0600 /home/deploy/.ssh/authorized_keys

# 2) Wrapper из origin/main (не из отстающего worktree, не из /current).
# Тот же стиль, что /usr/local/sbin/audiolad-maintenance.sh:
# install в /usr/local/sbin, root:root, mode 0755
# (см. deploy/docs/MAINTENANCE.md).
GIT_WORKDIR=/var/www/audiolad-clean
git -C "$GIT_WORKDIR" fetch origin main
git -C "$GIT_WORKDIR" show origin/main:deploy/scripts/github-actions-deploy-wrapper.sh \
  > /tmp/audiolad-deploy.new
install -o root -g root -m 0755 /tmp/audiolad-deploy.new /usr/local/sbin/audiolad-deploy
rm -f /tmp/audiolad-deploy.new

# 3) sudoers без ALL=(ALL) NOPASSWD: ALL и без wildcard аргументов
cat > /etc/sudoers.d/audiolad-deploy <<'EOF'
deploy ALL=(root) NOPASSWD: /usr/local/sbin/audiolad-deploy
EOF
chmod 440 /etc/sudoers.d/audiolad-deploy
visudo -c -f /etc/sudoers.d/audiolad-deploy

# 4) Fail-closed проверки (без деплоя)
id -u deploy >/dev/null
test -f /home/deploy/.ssh/authorized_keys
[[ "$(stat -c '%U:%G %a' /home/deploy/.ssh/authorized_keys)" == "deploy:deploy 600" ]]
[[ "$(stat -c '%U:%G %a' /usr/local/sbin/audiolad-deploy)" == "root:root 755" ]]
visudo -c -f /etc/sudoers.d/audiolad-deploy >/dev/null

set +e
DRY_OUT="$(sudo -n -u deploy sudo -n /usr/local/sbin/audiolad-deploy 2>&1)"
DRY_STATUS=$?
set -e
if [[ "$DRY_STATUS" -eq 0 ]]; then
  echo "ERROR: wrapper accepted a missing SHA" >&2
  exit 1
fi
if printf '%s\n' "$DRY_OUT" | grep -Eiq 'fetch origin|run-from-target-sha|deploy\.sh'; then
  echo "ERROR: reject must happen before git fetch / deploy.sh" >&2
  printf '%s\n' "$DRY_OUT" >&2
  exit 1
fi
echo "dry-run rejected missing SHA as expected"
```

Ожидание dry-run: ненулевой код и сообщение, что нужен ровно один
40-символьный SHA. Если команда стартовала `git fetch` или `deploy.sh` —
остановить и проверить wrapper.

`sudoers` без аргументного wildcard всё равно пропускает любые argv к
этому бинарю. Настоящая защита от инъекции — отказ wrapper принять всё,
кроме `^[0-9a-f]{40}$` (ветки, короткие SHA, флаги, метасимволы).

## B. Один раз скопировать в GitHub Environment secrets

Environment `production` создаётся вручную в GitHub UI. Значения ниже
человек вставляет в secrets. Workflow их сам не создаёт.

| Секрет | Что вставить |
|--------|----------------|
| `PRODUCTION_SSH_HOST` | `72.56.232.160` |
| `PRODUCTION_SSH_PORT` | `22` (если так слушает sshd) |
| `PRODUCTION_SSH_USER` | `deploy` |
| `PRODUCTION_SSH_PRIVATE_KEY` | полный текст private key dedicated-пары, включая `BEGIN`/`END` |
| `PRODUCTION_SSH_KNOWN_HOSTS` | строка known_hosts, построенная и сверенная ниже |

`authorized_keys` на сервере — **публичная** строка той же пары, не private key.

### `PRODUCTION_SSH_KNOWN_HOSTS`: пин с самого сервера

`ssh-keyscan` с чужой машины **недостаточен** сам по себе. Bootstrap идёт
на доверенном production, поэтому эталон — локальный host key:

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
printf '72.56.232.160 %s\n' "$(awk '{print $1, $2}' /etc/ssh/ssh_host_ed25519_key.pub)"
```

Первая команда печатает fingerprint (`SHA256:...`). Вторая — строку
known_hosts для секрета. При необходимости тот же pubkey можно
экспортировать через `ssh-keygen -f /etc/ssh/ssh_host_ed25519_key.pub -e`.

Если `ssh-keyscan` всё же делают снаружи:

```bash
ssh-keyscan -t ed25519,ecdsa -p 22 72.56.232.160
ssh-keyscan -t ed25519 -p 22 72.56.232.160 | ssh-keygen -lf -
```

Этот fingerprint **обязан** совпасть с
`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` на production
**до** вставки в GitHub secret. Не совпало — не вставлять.

Workflow пишет known_hosts во временный файл `0600` и вызывает ssh с
`UserKnownHostsFile` + `IdentitiesOnly=yes`.
`StrictHostKeyChecking=yes`. `StrictHostKeyChecking=no` запрещён.
Не использовать alias `github-audiolad` — он только для git-remote на
сервере, не для SSH из Actions.

## Что этот PR не делает

- не деплоит и не меняет production;
- не добавляет реальные SSH-ключи или GitHub secrets;
- не ставит `AUDIOLAD_DEPLOY_OVERRIDE=1` и не пробрасывает SSH env в `deploy.sh`;
- не добавляет Playwright smoke и не добавляет `topics_catalog_counts`;
- не чинит последний неуспешный деплой;
- не меняет RLS/БД;
- не запускает `git reset --hard` и не exec-ит `/current`.
