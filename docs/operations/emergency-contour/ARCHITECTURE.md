# Аварийный контур Phase 1

Основной путь не меняется:

```text
GitHub main
  -> GitHub Actions workflow production-deploy.yml
  -> SSH пользователь deploy
  -> sudo -n /usr/local/sbin/audiolad-deploy <40-char-sha>
  -> deploy/scripts/github-actions-deploy-wrapper.sh
  -> git show <sha>:deploy/scripts/run-from-target-sha.sh | bash -s -- <sha>
  -> pinned deploy.sh этого SHA
       ancestry, flock, npm ci, lint, build,
       readiness, smoke, nginx cutover
```

Аварийный путь вызывает ту же последнюю команду. Второй `deploy.sh` нет.
`AUDIOLAD_DEPLOY_OVERRIDE` аварийный путь не ставит и при наличии в окружении отказывается.

```text
Зеркало Gitea (пока GitHub жив, оно только реплика)
  -> emergency-deploy.sh preflight <sha>
       SHA ровно 40 hex
       коммит достижим из emergency main
       текущий production SHA — предок кандидата
       в дереве коммита на месте канонические скрипты
  -> при необходимости audiolad-emergency-git-source activate-mirror
       origin object store смотрит на зеркало, не на произвольный URL из argv
  -> sudo -n /usr/local/sbin/audiolad-deploy <sha>
  -> post-check current/.deploy-commit
```

Откат: `sudo -n /usr/local/sbin/audiolad-rollback` без аргументов.
Wrapper запускает `rollback.sh` текущего релиза с фиксированной причиной.
Смысл отката тот же, что в `docs/rollback.md`: previous, readiness, smoke, без пересборки.

## Git-зеркало

Членство: `deploy/emergency/repos.list`. Сейчас включён только `Audiolad/audiolad`.
`Audiolad/music-analyzer` не добавлен: репозиторий агенту недоступен.
Новый репозиторий Audiolad добавляется одной строкой, без правки скрипта.

Пока файл состояния `primary=github`:

- `sync-from-github.sh` забирает heads и tags и пушит их на зеркало без force-push истории;
- удалённая на GitHub ветка удаляется и на зеркале;
- скрипт пишет manifest с SHA `main`.

`promote-to-primary.sh PROMOTE_MIRROR_TO_PRIMARY` ставит `primary=gitea`.
После этого sync отказывается работать, чтобы не затереть аварийные коммиты.
Зеркало должно содержать последний успешный sync.

`resync-to-github.sh RESTORE_GITHUB_PRIMARY` пушит зеркало на GitHub только fast-forward.
Расхождение веток — отказ. Force нет.

Эти три скрипта не ходят на production и не меняют `origin` сервера приложения.

Переключение object store `/var/www/audiolad-clean` делает только
`deploy/emergency/git-source.sh` (установка в `/usr/local/sbin/audiolad-emergency-git-source`
этим PR не выполняется):

- `status` — без fetch;
- `activate-mirror` — URL только из `/etc/audiolad/emergency-git.env`, production SHA обязан быть предком `main` зеркала;
- `restore-github` — только если GitHub уже содержит все коммиты текущего `origin/main`.

Черновик sudoers: `deploy/emergency/sudoers/audiolad-emergency`.
Там нет `ALL`, нет wildcard, нет `SETENV`. Файл не установлен.

Таймер зеркала: `deploy/emergency/systemd/audiolad-git-mirror.*`.
Его место — будущий хост Gitea, не production VPS.

## Проверка сборки без западных endpoint

`deploy/emergency/build/emergency-build-ready.sh --git-dir . --sha <sha>`
читает lockfile и локальный npm cache. Сеть не открывает.
`emergency_build_ready=yes` только если Node ≥ 22, в `deploy.sh` этого SHA
есть `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, и каждый tarball lockfile уже лежит в cache.
Пустой cache честно даёт `no`.

`seed-npm-cache.sh` наполняет cache, пока реестр доступен, и отказывается при
`AUDIOLAD_EMERGENCY_OFFLINE=1`.

## Что этот PR не делает

Не ставит wrapper на сервер, не меняет `origin` production, не вызывает
`audiolad-deploy`, не трогает DNS, не покупает VDS, не ротирует ключи.
Единственный оставшийся внешний блокер: `HUMAN_GATE.md`.
