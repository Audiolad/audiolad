# PANNs для новых загрузок

Детектор `panns-voice:2` включается только у воркера и только для первичного анализа новой загрузки MP3/WAV. Повторный анализ, массовый разбор паспортов и уже записанные паспорта этот переключатель не трогает. Выключение: смена переменной и `pm2 reload`, без отката кода и без отката чекаута анализатора.

Пока режим `off` (значение по умолчанию), воркер передаёт `--voice-detector legacy`. Это текущее поведение CLAP.

## Порядок

Пин приложения: `cc5b2828` (полный коммит `cc5b2828a3dbb81e16e23808dab1520a4cb1a7d0` в ветке `cursor/benchmark-harness-v01`). Содержание анализатора остаётся `3750f3b` и должно быть предком HEAD.

1. Миграция `supabase/migrations/20270128120000_music_analyzer_seal_head_prefixes.sql` обычным деплоем. Не применять её вручную с ноутбука. Файл меняет только CHECK `music_analyzer_runs_phase_check` и функцию `complete_music_analyzer_run`: успешный git-коммит начинается с `932c4ce` или `cc5b2828`. Перед заменой ограничения идёт чтение строк. Если хоть одна не проходит новую формулу, миграция останавливается и старое ограничение остаётся. Иначе ограничение добавляется как `NOT VALID` и подтверждается `VALIDATE CONSTRAINT`. Строки не переписываются и не удаляются. Старые успешные коммиты `932c4ce` проходят новую проверку, потому что она шире прежней.

2. Деплой приложения с пином `cc5b2828`. Пока чекаут на хосте ещё `932c4ce`, `assertFrozenHead` принимает оба префикса. Анализы в этом окне продолжают печататься со старым HEAD, а база уже принимает и его, и новый.

3. Перевод чекаута, только после пунктов 1 и 2:

```bash
git -C /var/lib/audiolad/music-analyzer fetch origin cursor/benchmark-harness-v01
git -C /var/lib/audiolad/music-analyzer checkout cc5b2828a3dbb81e16e23808dab1520a4cb1a7d0
git -C /var/lib/audiolad/music-analyzer rev-parse HEAD
git -C /var/lib/audiolad/music-analyzer merge-base --is-ancestor 3750f3b HEAD
```

`rev-parse` должен начинаться с `cc5b2828`. `merge-base --is-ancestor` должен завершиться с кодом 0.

4. Сборка prod-venv и чекпойнт, переменные детектора. Режим оставить `off`, пока окружение не проверено.

5. Canary, затем при необходимости `on`.

Если бы приложение после деплоя принимало только `cc5b2828`, каждый анализ между деплоем и переводом чекаута падал бы с `analyzer_commit_mismatch`. Поэтому старый HEAD остаётся допустимым, пока чекаут не переведён. Убирать `932c4ce` из `assertFrozenHead` можно отдельным изменением уже после того, как прод смотрит на `cc5b2828`.

## Окружение PANNs

Отдельное prod-окружение, не eval-каталог и не `.venv-v03-clap`:

```bash
python3 -m venv /var/lib/audiolad/music-analyzer/.venv-v03-panns
/var/lib/audiolad/music-analyzer/.venv-v03-panns/bin/pip install -r /var/lib/audiolad/music-analyzer/requirements-voice.txt
/var/lib/audiolad/music-analyzer/.venv-v03-panns/bin/pip install pyyaml jsonschema pyloudnorm
```

Чекпойнт (единственный проверенный файл Cnn14, 327428481 байт) положить в путь воркера:

```text
/var/lib/audiolad/music-analyzer/panns/Cnn14_mAP=0.431.pth
```

Карта классов для процесса PM2 (HOME=/root) уже лежит в `/root/panns_data/class_labels_indices.csv`. Eval-окружение `/var/lib/audiolad/voice-eval-99ceea5e/.venv-panns` не использовать: каталог только для root и не является prod-путём.

В окружении PM2 `audiolad-music-analyzer-worker` (файл окружения релиза, затем reload):

```text
MUSIC_ANALYZER_VOICE_PYTHON=/var/lib/audiolad/music-analyzer/.venv-v03-panns/bin/python
MUSIC_ANALYZER_PANNS_CHECKPOINT=/var/lib/audiolad/music-analyzer/panns/Cnn14_mAP=0.431.pth
MUSIC_ANALYZER_VOICE_DETECTOR=off
```

Пока любая из двух первых переменных пустая, режим `canary` или `on` не вызывает PANNs и не откатывается на CLAP: `vocal_role` остаётся пустым, на экране «Не определено». Слот canary при этом не расходуется. Сначала собрать venv и положить чекпойнт, потом менять режим.

Диск на момент инвентаризации был занят на 84% (свободно около 33 ГБ). Venv около 1,5 ГБ и чекпойнт 0,33 ГБ помещаются, место стоит проверить до установки.

## Canary и полное включение

```text
MUSIC_ANALYZER_VOICE_DETECTOR=canary
MUSIC_ANALYZER_VOICE_CANARY_MAX=5
```

`canary` вызывает PANNs только для первых N новых загрузок. По умолчанию N=5. Счётчик: число уже успешных прогонов, у которых в provenance `voice.invoked` истинно. Новая таблица и миграция для счётчика не нужны. В счётчик попадает запуск PANNs, в том числе если детектор потом не дал метку и прогон допечатался через legacy. Ошибочный запрос счётчика не включает PANNs.

`on` вызывает PANNs для каждой новой первичной загрузки MP3/WAV (`version_number` = 1 и нет строки в `music_passport_analysis_links`). Повтор того же файла получает `version_number` > 1 и остаётся на legacy. Разбор паспорта Jazz Relax связан с прогоном и тоже остаётся на legacy.

После смены переменных:

```bash
pm2 reload audiolad-music-analyzer-worker
```

## Сбой детектора

Если детектор завершился с ошибкой или исчерпал свой предел, анализ трека всё равно печатается. `vocal_role` пустой («Не определено»), CLAP для этой роли не подставляется.

Замер: около 9 с на трёхминутный трек, пик около 1,2 ГБ, 2 потока. Приложение на попытке PANNs передаёт `MUSIC_ANALYZER_VOICE_TIMEOUT_SECONDS=120` и ограничивает потоки значением 2. Общий предел процесса анализа остаётся 25 минут: в том же процессе считается CLAP, и отдельный прерванный детектор не должен обрывать весь трек. Если скрипт чекаута не читает эту переменную, внутренний предел yaml остаётся 600 с. Ненулевой код PANNs приводит к одному повторному запуску с `--voice-detector legacy` и пустой роли, без метки CLAP.

В логе воркера на каждый анализ одна строка JSON `music_analyzer_voice`: режим, статус, reason, `analysis_seconds`, `voice_seconds`, ошибка. Без путей, секретов и имени файла.

## Выключение и откат

Выключение детектора:

```text
MUSIC_ANALYZER_VOICE_DETECTOR=off
```

```bash
pm2 reload audiolad-music-analyzer-worker
```

Код приложения и чекаут `cc5b2828` для выключения детектора не откатывать. Уже записанные прогоны не пересчитываются. Флаг `vocal.detector.enabled` в yaml чекаута не является выключателем: им остаётся переменная приложения.

Вернуть чекаут на `932c4ce` можно, пока приложение принимает оба HEAD. Печать при этом остаётся на старом префиксе.

Откат самой схемы печати: `docs/music-analyzer/ROLLBACK_music_analyzer_seal_head_prefixes.sql`. Это не миграция, деплой его не применяет. Скрипт в одной транзакции возвращает префикс только `932c4ce`. Если успешная строка уже хранит `cc5b2828`, `VALIDATE CONSTRAINT` останавливает откат и расширенная проверка остаётся. Такие строки не удалять и не переписывать.
