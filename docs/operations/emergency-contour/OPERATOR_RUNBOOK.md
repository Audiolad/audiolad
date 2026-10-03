# Аварийный контур для Сергея

Это инструкция владельца, не инженера. Сайт https://audiolad.ru при падении
GitHub или ChatGPT сам не останавливается: он уже собран и крутится на сервере
Timeweb. Ниже — что нажимать. SSH нужен только если нет GitHub Actions и нет
инженера рядом; команды готовые, файлы руками не редактировать.

Проверка, что сайт жив, всегда одна и та же. Открыть в браузере:

```text
https://audiolad.ru/api/health/build
```

Нужна строка `"status":"ok"`. Вторая проверка, база:

```text
https://audiolad.ru/api/health/dependencies
```

Нужны `"status":"ok"` и `"database":"ok"`. Если так — пользователи сайт видят.
Новый деплой в этот момент не обязателен.

## GitHub работает, ChatGPT нет

Ничего на сервере не менять. Код по-прежнему в GitHub.
Можно писать задачу в Cursor. Можно задеплоить уже слитый в `main` коммит самому:

1. GitHub → Actions → **Production Deploy**.
2. Branch: **main**.
3. `confirm`: **DEPLOY**. Пустой `commit_sha` берёт вершину `main`.
4. Дождаться зелёного прогона и снова открыть `/api/health/build`.

Кнопка не деплоит от того, что кто-то смёржил файл. Нужен именно этот запуск.

## GitHub недоступен: где репозиторий

Пока Human Gate из `HUMAN_GATE.md` не закрыт, второй копии репозитория нет.
Локальные копии у разработчиков не считаются официальным зеркалом.

После того как VDS с Gitea принят и инженер один раз включил зеркало, репозиторий
лежит на этом Gitea, организация `Audiolad`, имя `audiolad`, доступ по SSH.
Адрес IP будет в карточке VDS, не в DNS `audiolad.ru`. Пока GitHub жив, в Gitea
не коммитят: это реплика. Когда GitHub лежит, инженер переводит зеркало в
основной режим командой с точным словом `PROMOTE_MIRROR_TO_PRIMARY`.

## GitHub Actions недоступен: как задеплоить

GitHub при этом может быть жив. Деплой тот же, просто кнопку Actions нажимает
не GitHub, а скрипт. Инженер из корня репозитория:

```bash
export EMERGENCY_GIT_DIR=/path/to/audiolad
export ACTIVE_PRODUCTION_SHA="$(curl -fsS https://audiolad.ru/api/health/build | python3 -c 'import json,sys; print(json.load(sys.stdin).get("deployCommit") or "")')"
```

Если health не отдаёт SHA, SHA текущего релиза смотрит инженер в
`/var/www/audiolad-deploy/current/.deploy-commit`, не Сергей.

```bash
bash deploy/emergency/ci/emergency-deploy.sh preflight <40-символьный-sha>
```

Скрипт сам откажется, если коммит не из `main` или не содержит то, что уже в
production. Потом, и только потом, с ключом deploy-пользователя, который лежит
вне GitHub:

```bash
export AUDIOLAD_EMERGENCY_DEPLOY_EXECUTE=1
export PRODUCTION_SSH_HOST=72.56.232.160
export PRODUCTION_SSH_PORT=22
export PRODUCTION_SSH_USER=deploy
export PRODUCTION_SSH_KEY_FILE=/path/to/deploy-key
export PRODUCTION_SSH_KNOWN_HOSTS_FILE=/path/to/known_hosts
bash deploy/emergency/ci/emergency-deploy.sh execute <тот-же-sha>
```

На сервер уходит ровно `sudo -n /usr/local/sbin/audiolad-deploy <sha>`.
Если GitHub как git тоже лежит, перед execute инженер один раз запускает
`audiolad-emergency-git-source activate-mirror`. URL зеркала берётся из файла
на сервере, его нельзя передать аргументом.

Пока wrapper на сервер не установлен отдельным подтверждённым шагом, execute
упадёт на `sudo`. Это ожидаемо. Ставить его в этот заход нельзя.

## Западные AI недоступны

Сайт, каталог, оплата, письма и база продолжают работать, если живы Timeweb,
DNS, сертификат и Supabase на том же сервере. Не работают только чаты, которые
пишут код. Деплой уже слитого коммита от модели не зависит.

## Откат

Если новый релиз уже переключён и сайт плохой, инженер запускает одну команду,
без текста причины с клавиатуры:

```bash
export AUDIOLAD_EMERGENCY_ROLLBACK_EXECUTE=1
bash deploy/emergency/ci/emergency-rollback.sh execute
```

Она вызывает `rollback.sh` текущего релиза. Базу назад не откатывает.
После этого снова открыть `/api/health/build`.

## Вернуться с аварийного Git на GitHub и не потерять коммиты

Когда GitHub снова открывается:

1. Инженер запускает `resync-to-github.sh RESTORE_GITHUB_PRIMARY`.
   Скрипт отправляет коммиты зеркала на GitHub только если они ложатся сверху.
   Если истории разъехались, скрипт останавливается и ничего не затирает.
2. Потом на сервере `audiolad-emergency-git-source restore-github`.
   Он откажется, если на GitHub ещё нет коммитов, которые уже стоят в origin.
3. Состояние снова `primary=github`. Таймер зеркала можно включить обратно.

## Что Сергею нельзя делать руками

- `git reset --hard` на сервере
- переставлять симлинк `current` или править Nginx
- `pm2 restart audiolad` вместо деплоя
- `AUDIOLAD_DEPLOY_OVERRIDE=1`
- force-push в `main`
- запускать `deploy.sh` из `/var/www/audiolad-deploy/current`
- давать чату или браузеру root-shell и вставлять туда ключи, `.env`, токены
- в падении GitHub покупать новый сервер или менять DNS `audiolad.ru`
- удалять каталоги `releases`

Покупка одного отдельного VDS под Gitea описана в Human Gate и делается
спокойно, не вместо отката.
