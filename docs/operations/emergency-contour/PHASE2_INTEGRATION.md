# Phase 2: точка интеграции, без UI и без GPU

Phase 2 этим PR не строится. Ниже контракт, к которому потом крепится
`company.audiolad.ru/emergency`. Маршрута в репозитории сейчас нет.
Чат-интерфейс не делается, пока нет хоста и модели. GPU не покупается.

## Куда встаёт страница

`company.audiolad.ru/emergency` — тонкая операторская страница компании.
Она не деплоит сама и не открывает shell. Она вызывает только перечисленные
ниже инструменты. Пока домена company нет, страница не создаётся: DNS этого
имени — не часть Phase 1 и не часть Human Gate на Gitea.

## Инструменты, они же руки

Стабильные имена. Модель их не подменяет произвольной командой.
Реализация поверх скриптов Phase 1:

| Инструмент | Что вызывает | Чего не делает |
|---|---|---|
| `emergency.git.status` | `audiolad-emergency-git-source status` | не меняет origin |
| `emergency.git.activate_mirror` | `activate-mirror`, только с confirm-токеном человека | не принимает URL |
| `emergency.git.restore_github` | `restore-github` после успешного resync | не делает force |
| `emergency.deploy.preflight` | `emergency-deploy.sh preflight <sha>` | не ходит на сервер |
| `emergency.deploy.execute` | `emergency-deploy.sh execute <sha>` при confirm `DEPLOY` | только `audiolad-deploy` |
| `emergency.rollback.execute` | `emergency-rollback.sh execute` при confirm `ROLLBACK` | без текста причины |
| `emergency.build.ready` | `emergency-build-ready.sh --sha` | без сети |
| `emergency.health.read` | GET `https://audiolad.ru/api/health/build` и `/api/health/dependencies` | без SSH |

Инструментов `shell`, `bash`, `ssh` и `eval` нет. SSH-ключ в контекст модели
не попадает.

## Сменные модели

Модель только советует: текст, предлагаемый SHA, предупреждения.
Исполняет человек или policy gate через инструменты выше.

```text
EmergencyAdvisor
  id: western-api | russian-api | local-open-weight
  advise(context) -> { summary, suggestedSha, warnings }
```

Порядок, когда западные API лежат:

1. `western-api` — ChatGPT, Cursor, Grok. Основной, пока сеть пускает.
2. `russian-api` — промежуточный. База URL задаётся позже переменной
   `EMERGENCY_RU_MODEL_BASE_URL`. Хост не выбирается и не оплачивается в Phase 1.
3. `local-open-weight` — последний резерв. Переменная
   `EMERGENCY_LOCAL_MODEL_ENDPOINT` пустая, пока нет своей машины.
   Видеокарта этим документом не заказывается.

Контекст советника: статус git, результат preflight, health JSON.
Не `.env`, не ключи, не содержимое писем.
