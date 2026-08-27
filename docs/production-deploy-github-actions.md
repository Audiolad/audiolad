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
| `PRODUCTION_SSH_PRIVATE_KEY` | Приватный ключ этой пары. Не коммитить. |
| `PRODUCTION_SSH_KNOWN_HOSTS` | Вывод `ssh-keyscan` (см. ниже). |

Права workflow: только `contents: read`. Третьих SSH marketplace-action нет:
используется системный `ssh` на `ubuntu-latest`.

## Как запустить

1. Actions → **Production Deploy** → **Run workflow**.
2. Branch: `main`.
3. `commit_sha` — пусто (тогда `origin/main` / `HEAD` checkout `main`) либо
   полный 40-символьный lowercase hex SHA, который есть в этом checkout.
4. `confirm` = **DEPLOY**. Любое другое значение валит job до SSH.
5. Run workflow.

Concurrency: группа `production-deploy`, `cancel-in-progress: false`.
Параллельный второй запуск ждёт, а не отменяет первый.

## Семантика ошибок

- Невалидный SHA, `confirm != DEPLOY`, нет секретов, нет wrapper на сервере —
  красный workflow, production не трогается.
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

## Одноразовый bootstrap на сервере

Выполнять **вручную на production** (`72.56.232.160`), не из CI и не из
этого workflow. Реальный деплой в bootstrap не запускать.

Публичный ключ ниже — плейсхолдер. Хост в `ssh-keyscan` — уже
задокументированный Timeweb VPS.

```bash
set -euo pipefail

# 1) Пользователь deploy + SSH-каталог
if ! id -u deploy >/dev/null 2>&1; then
  useradd --create-home --home-dir /home/deploy --shell /bin/bash deploy
fi
install -d -o deploy -g deploy -m 0700 /home/deploy/.ssh
# Вставить публичную половину ключа GitHub Actions:
# printf '%s\n' 'ssh-ed25519 AAAA... audiolad-gha-deploy' \
#   > /home/deploy/.ssh/authorized_keys
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

# 4) Dry-run: usage/reject, без SHA и без деплоя
if sudo -n -u deploy sudo -n /usr/local/sbin/audiolad-deploy; then
  echo "ERROR: wrapper accepted a missing SHA" >&2
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

### known_hosts для секрета

На машине, с которой удобно снять отпечаток (не обязательно с runner).
Хост — задокументированный Timeweb VPS; порт обычно 22:

```bash
ssh-keyscan -t ed25519,ecdsa -p 22 72.56.232.160
```

Весь вывод кладётся в `PRODUCTION_SSH_KNOWN_HOSTS`. Workflow пишет его в
временный файл `0600` и вызывает ssh с `UserKnownHostsFile` +
`IdentitiesOnly=yes`. `StrictHostKeyChecking=no` запрещён.
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
