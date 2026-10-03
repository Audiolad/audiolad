# Human Gate: один VDS под Gitea

Всё, что можно было сделать в репозитории без новой машины, уже сделано и
покрыто тестами. Единственный внешний блокер — новая платная машина.
Этот файл — один gate. DNS `audiolad.ru` не меняется. Ключи не ротируются.
Production origin не переключается.

Сергей в панели Timeweb Cloud создаёт VDS и больше ничего не покупает.

| Поле | Значение |
|---|---|
| Регион | Россия, Москва, ближайший российский регион Timeweb |
| Имя | `audiolad-git-emergency` |
| ОС | Ubuntu 24.04 LTS |
| vCPU | 2 |
| RAM | 4 GB |
| Диск | 40 GB NVMe |
| Публичный IPv4 | да |
| Снимки диска | включить, если в форме есть галочка weekly snapshot |
| Не делать | не присоединять диск и сеть к production VPS `72.56.232.160` |
| Не делать | не создавать и не менять DNS-записи `audiolad.ru`, `www`, `cdn`, `company` |
| Не делать | не открывать эту машину как сайт |

Репозиторий сейчас около 94 МБ pack. Сборка Next.js на этой машине не нужна:
собирает по-прежнему production VPS каноническим `audiolad-deploy`.
40 ГБ хватает на Gitea, несколько репозиториев Audiolad и npm-cache.

После создания Сергей передаёт инженеру только IPv4 и факт, что SSH root для
одноразовой установки Gitea есть. В git это не пишется.

Инженер после этого, отдельным заходом, не в этом PR:

1. Ставит Gitea, приватную организацию `Audiolad`, репозиторий `audiolad`.
2. Кладёт токен и SSH host key в `/etc/audiolad/emergency-mirror.env`, режим `0600`, root. Образец имён: `deploy/emergency/config/emergency-mirror.env.example`.
3. Копирует уже существующий deploy SSH private key из менеджера паролей на эту машину, потому что GitHub Secrets при падении GitHub не открыть. Ключ не менять и не удалять из GitHub.
4. Включает timer `deploy/emergency/systemd/audiolad-git-mirror.timer` на этом VDS, не на production.
5. Установку `/usr/local/sbin/audiolad-emergency-git-source` и `/usr/local/sbin/audiolad-rollback` на production VPS делает только после отдельного подтверждения. Черновик sudoers: `deploy/emergency/sudoers/audiolad-emergency`.

Пока gate не закрыт, аварийный git-primary физически негде поднять.
Скрипты, тесты и runbook от этого не зависят: они прогнаны на disposable Gitea.
