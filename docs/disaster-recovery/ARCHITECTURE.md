# Аварийный контур, фаза 1

GitHub остаётся основным путём. Production workflow, wrapper и sudoers этим изменением не ослабляются и на сервер не устанавливаются.

## Два пути, один деплой

```text
Обычный путь (не менялся)
  GitHub Actions -> ssh deploy
  -> sudo -n /usr/local/sbin/audiolad-deploy <sha>
  -> run-from-target-sha.sh -> deploy.sh

Аварийный путь
  оператор -> deploy/emergency/ci-runner.sh
  -> те же проверки предка origin/main и текущего production commit
  -> та же команда sudo -n /usr/local/sbin/audiolad-deploy <sha>
```

`ci-runner.sh` не вызывает `npm ci`, не трогает Nginx и не открывает произвольный shell. Единственная удалённая команда в режиме `ssh` совпадает с шагом Deploy workflow: пользователь только `deploy`, аргументы передаются массивом, не строкой `bash -c`.

Политика берётся из `deploy/scripts/lib/canonical-deploy-policy.sh`: кандидат достижим из `origin/main`, а текущий `.deploy-commit` является его предком. Флаг `AUDIOLAD_DEPLOY_OVERRIDE` аварийный скрипт не выставляет.

Откат — существующий `/var/www/audiolad-deploy/scripts/rollback.sh`. Новый cutover не написан. Отдельное sudoers-правило для отката не добавлялось: у `deploy` сегодня в документации разрешён `audiolad-deploy`. Если `sudo -n` на `rollback.sh` на сервере не разрешён, команда падает, а не расширяет права.

## Git

Манифест `deploy/emergency/repos.manifest.json`:

- `Audiolad/audiolad` — обязательный;
- `Audiolad/music-analyzer` — необязательный, пока источник недоступен;
- новый репозиторий добавляется строкой манифеста, без нового механизма.

`mirror-sync.sh` делает `git clone --mirror` и `git push --mirror` на цель, которая не является GitHub. Пока репозиторий в режиме `mirror`, обновляются ветки и теги. `promote-mirror.sh` с подтверждением `PROMOTE_MIRROR` переводит его в `primary`: следующие sync больше не переписывают `main`. Для Gitea дополнительно уходит `PATCH /api/v1/repos/{owner}/{repo}` с `{"mirror":false}`.

Возврат на GitHub — `resync-to-github.sh` с `RESYNC_TO_GITHUB`. Только fast-forward. Расхождение историй останавливает скрипт, `--force` нет.

`retarget-origin.sh` меняет `origin` у указанного workdir и делает `git fetch origin main`. Пути `/var/www/audiolad`, `/var/www/audiolad-clean` и `/var/www/audiolad-deploy` отвергаются без `AUDIOLAD_EMERGENCY_ALLOW_PRODUCTION_PATH=1`. Этот флаг в фазе 1 не включается.

Пока production `origin` смотрит на GitHub, установленный wrapper при падении GitHub не сможет сделать `git fetch`. Переключение origin — отдельное решение после ревью, не часть этой поставки. Скрипт для него уже есть и на production-путях закрыт.

## Сборка без registry.npmjs.org

`deploy/emergency/emergency-build-ready.mjs` читает `package-lock.json` из объекта коммита и сверяет sha512 файлов в локальном каталоге. Сетевых вызовов в этом скрипте нет.

`deploy.sh` по-прежнему запускает `npm ci`, если файла `DEPLOY_ROOT/shared/npm-ci-offline.env` нет. Если файл есть, разрешены только `NPM_CI_OFFLINE=1` и абсолютный `NPM_CI_CACHE`. Любой другой ключ останавливает деплой. На production этого файла нет, поэтому текущий деплой не меняется.

## Проверки

`node scripts/emergency-contour-unit.mjs` поднимает одноразовый Gitea, если задан `AUDIOLAD_GITEA_BIN`. Без бинарника Gitea-шаг пропускается, файловые зеркала, политика деплоя, откат и офлайн-сборка выполняются всегда. В CI бинарник не скачивается.

## Чего здесь нет

Нет покупки VDS, нет DNS, нет смены production `origin`, нет второго `deploy.sh`, нет GPU и нет чата на `company.audiolad.ru`.
