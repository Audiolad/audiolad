# Deployment Bridge

Узкий вызов `deploy(commit_sha)` для уже слитого в `main` коммита.
Слияние этого файла **не деплоит** production и **не устанавливает**
ничего на сервер.

Ручной workflow `Production Deploy` не заменяется. У него остаются
диагностические и ops-режимы. Мост их не вызывает и не расширяет.

## Границы полномочий

Вызывающий (Орий, GitHub-токен с правом писать в репозиторий) может
только поставить в очередь деплой одного SHA. Он не получает shell,
SSH-ключ, sudo и не может передать команду.

| Можно | Нельзя |
| --- | --- |
| `deploy(commit_sha)` для SHA, который уже в истории свежего `origin/main` и чей tree прошёл требуемый CI | Деплой головы PR или ветки, которой нет в `main` |
| Прочитать машинный статус этого SHA | Передать аргумент, кроме одного SHA |
| Дождаться окончания уже идущего деплоя | Запустить второй production-деплой параллельно |

Мост выполняет на сервере ровно одну команду, ту же, что и штатный
workflow:

```text
sudo -n /usr/local/sbin/audiolad-deploy <40-char-lowercase-hex-sha>
```

Wrapper на сервере сам проверяет, что аргумент — один SHA и предок
`origin/main`, затем запускает `run-from-target-sha.sh` этого SHA.
`AUDIOLAD_DEPLOY_OVERRIDE` не передаётся. `bash -s` с произвольным
скриптом нет. Checkout репозитория на runner нет: policy-файл
читается через `git show` из свежего `origin/main`, не из целевого SHA
и не из PR.

Секреты SSH остаются в GitHub Environment `production`. В workflow
их нет. `GITHUB_TOKEN` этого workflow имеет только `contents: read`,
`checks: write`, `statuses: write`. Писать статусы он может лишь в
контекст `Deployment Bridge`. Контексты `PR Repository Validation` и
`Production / PR Safety` он не выставляет.

Environment `production` на момент реализации пускает только ветку
`main` и не требует reviewer. Это и есть граница, которая не даёт
запустить job с секретами с другой ветки. Её нельзя расширять.

Откат мост сам не изобретает. Если после cutover падает штатный
`deploy.sh`, тот уже вызывает `rollback.sh`. Мост только читает
маркеры `rollback_succeeded` / `rollback_failed` из stdout этой
команды.

## Контракт

Вход — ровно один 40-символьный lowercase hex SHA.

Два GitHub-native способа, оба без shell:

### workflow_dispatch

Нужен токен с **Actions: Read and write**. Ref только `main`.

```text
POST /repos/Audiolad/audiolad/actions/workflows/deployment-bridge.yml/dispatches
```

```json
{
  "ref": "main",
  "inputs": {
    "commit_sha": "<40-char-lowercase-hex-sha>"
  }
}
```

### repository_dispatch

Если Actions write недоступен, а Contents write уже есть (тем же
классом права, что и merge):

```text
POST /repos/Audiolad/audiolad/dispatches
```

```json
{
  "event_type": "deployment-bridge",
  "client_payload": {
    "commit_sha": "<40-char-lowercase-hex-sha>"
  }
}
```

Любой другой ключ в `client_payload` отклоняется. Другие
`event_type` этот workflow не слушает. Ответ GitHub на оба вызова —
`204` без id прогона.

## Кто допускается

1. SHA есть среди объектов свежего `origin/main` (`git fetch` только
   `refs/heads/main`) и является его предком.
2. У коммита не больше двух родителей. Octopus-merge отклоняется.
3. Требуемый CI зелёный на том SHA, чей **tree совпадает** с tree
   деплоя:
   - check run `PR Repository Validation` = `success`;
   - commit status `Production / PR Safety` = `success`.
4. На этом же SHA нет незавершённых и нет красных check run / commit
   status. Для одного имени check берётся последний прогон
   (`completed_at`), поэтому успешный rerun не блокируется старым
   падением. Игнорируются собственный статус и check `Deployment Bridge`,
   check run'ы job'ов этого workflow (`Refuse dispatch outside main`,
   `Gate commit`, `Deploy pinned SHA`) и check
   `Production / PR Safety Runner`. Эти имена не заменяют требуемый CI
   из пункта 3: без успешного `PR Repository Validation` и успешного
   статуса `Production / PR Safety` деплой не допускается. Так повторный
   деплой не блокируется прошлым результатом моста и повторным прогоном
   Runner на уже закрытом PR.
5. Для обычного merge-коммита GitHub CI висит на втором родителе
   (голове PR), а не на самом merge-коммите. Мост принимает этот CI
   только если tree второго родителя **равен** tree деплоя. Если main
   уехал и tree разошёлся, нужен зелёный CI уже на самом деплойном
   SHA; иначе отказ `tree_mismatch`.
6. Squash/rebase-коммит без CI на самом себе отклоняется: в истории
   `main` нет второго родителя с тем же tree.

Пустой SHA не означает «взять tip main». Tip тоже нужно передать явно.

## Состояния

`queued`, `running`, `succeeded`, `failed`, `rolled_back`.

Они пишутся в commit status контекста `Deployment Bridge` на целевом
SHA. Поле `description` ровно одно из:

```text
state=queued
state=running
state=succeeded
state=failed
state=rolled_back
```

`target_url` — страница прогона Actions. Полный JSON
(`schema=audiolad.deployment_bridge.v1`) лежит в `output.summary`
check run с именем `Deployment Bridge` на том же SHA. Туда входят
commit, SHA `origin/main`, SHA субъекта CI, инициатор
(`github.actor`), событие, id и URL прогона, время начала и конца,
health-check, rollback (`not_invoked` / `detected` / `not_detected`)
и короткий код ошибки. Сырой deploy-log и секреты в JSON не кладутся.

Как читать результат:

1. Прогон Actions со `status=queued` или `in_progress` — деплой ещё
   не закончен. Пока слот concurrency занят, commit status может ещё
   не появиться: это тоже `queued`.
2. `conclusion=success` принимается только вместе со
   `state=succeeded`. Иначе это не успех.
3. `conclusion=failure` плюс `state=rolled_back` — штатный откат
   `rollback.sh` прошёл, production не на целевом SHA.
4. `conclusion=failure` и любой другой status (`failed`, пропавший,
   застрявший `queued`/`running`) — **не успех**. Новый rollback мост
   не запускает.

GitHub по умолчанию держит в группе concurrency только один pending
прогон: третий отменяет ждущий второй. Уже идущий деплой не
отменяется (`cancel-in-progress: false`). Группа `production-deploy`
общая с workflow `Production Deploy`, поэтому ручной и мостовой
деплой не идут одновременно. На сервере остаётся `flock`.

## Health-check

После команды деплоя runner читает три уже существующих публичных
адреса, без нового endpoint и без SSH:

| Проверка | Условие успеха |
| --- | --- |
| `https://audiolad.ru/` | HTTP 200 |
| `https://audiolad.ru/api/health/build` | HTTP 200, `status=ok`, `deployCommit` равен целевому SHA |
| `https://audiolad.ru/api/health/dependencies` | HTTP 200, `status=ok`, `database=ok` |

До трёх попыток с паузой 2 секунды. Несовпадение — `failed` /
`health_failed`, даже если `deploy.sh` вернул 0. В этом случае мост
**не** вызывает `rollback.sh`: штатный скрипт уже сделал свой
health-watch и откат, если они у него упали. Повторный откат отсюда
был бы новым механизмом.

`state=succeeded` ставится только когда exit code деплоя равен 0,
маркеров rollback нет и все три проверки зелёные.

## Одноразовая настройка

Новых секретов нет. Боевые прогоны `Production Deploy` уже ходят в
environment `production` и вызывают тот же wrapper, значит секреты
SSH и `/usr/local/sbin/audiolad-deploy` на сервере уже стоят. Повторный
bootstrap из `docs/production-deploy-github-actions.md` не нужен,
пока эти прогоны зелёные.

Человеку один раз, после review этого PR:

1. Слить PR в `main`. До этого workflow на `main` нет, dispatch
   невозможен. Это ожидаемо.
2. Не менять deployment branch policy environment `production`:
   сейчас там только ветка `main`, без required reviewers. Не
   добавлять другие ветки и не ослаблять branch protection.
3. Проверить, что токен Ория может либо
   `POST .../actions/workflows/deployment-bridge.yml/dispatches`
   (Actions: Read and write), либо
   `POST .../dispatches` с `event_type=deployment-bridge`
   (Contents: Read and write). Не выдавать ему Administration,
   secrets, SSH и shell.
4. Первый боевой `deploy(commit_sha)` сделать отдельно, уже после
   merge, на SHA, который сам прошёл гейт. Этот PR его не запускает.

Если секреты environment когда-нибудь пропадут, восстанавливать их
нужно существующей инструкцией
`docs/production-deploy-github-actions.md` (разделы A и B), а не новым
ключом для моста.

## Что этот PR не делает

- не вызывает dispatch и не деплоит production;
- не ставит wrapper и sudoers заново;
- не меняет `deploy.sh`, Nginx, PM2, Docker;
- не ослабляет CI и branch protection;
- не добавляет произвольный webhook на сервер АудиоЛада.

## Проверка без деплоя

```bash
npm run test:deployment-bridge
```

## Ограничения, которые нельзя принять за дыру

- API branch protection из этого окружения отвечает 403, поэтому
  список required checks зафиксирован по `docs/ci-production-pr-safety.md`:
  `PR Repository Validation` и `Production / PR Safety`, плюс отказ на
  любом другом красном или незавершённом check того же SHA.
- Токен Ория отсюда не виден. Если у него нет ни Actions write, ни
  Contents write, dispatch не заработает, пока человек не даст одно
  из этих двух прав. Обход через серверный shell не предлагается.
