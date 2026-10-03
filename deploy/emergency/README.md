# Emergency contour

Инженерные скрипты фазы 1. Операторская инструкция: `docs/disaster-recovery/RUNBOOK.md`.

| Скрипт | Назначение |
|--------|------------|
| `mirror-sync.sh` | Полное зеркало веток и тегов на не-GitHub цель |
| `mirror-validate.sh` | Сравнение refs и достижимых коммитов |
| `promote-mirror.sh` | Сделать зеркало записываемым primary |
| `resync-to-github.sh` | Fast-forward обратно на GitHub |
| `retarget-origin.sh` | Сменить `origin` у workdir, кроме production-путей |
| `ci-runner.sh` | Проверки и вызов канонического `audiolad-deploy` |
| `emergency-rollback.sh` | Вызов существующего `rollback.sh` |
| `emergency-build-ready.mjs` | Офлайн-проверка npm-кэша для SHA |
| `seed-npm-cache.mjs` | Скачать tarball из lockfile, пока сеть есть |
| `inventory-build-deps.mjs` | Пересобрать `build-dependency-inventory.json` |

Проверка:

```bash
node scripts/emergency-contour-unit.mjs
AUDIOLAD_GITEA_BIN=/path/to/gitea node scripts/emergency-contour-unit.mjs
```

Цель зеркала не может быть `github.com`. Токены читаются из окружения и в отчёт не пишутся.
