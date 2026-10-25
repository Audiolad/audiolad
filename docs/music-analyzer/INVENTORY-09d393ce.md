# Ревизия анализатора и Музыкального паспорта – 09d393ce

Дата проверки: 24.10.2026. Основание: чистая рабочая копия `ai-company/task-09d393ce`, исходный код Audiolad и чтение закреплённого Python-репозитория через GitHub. Production, аудиохранилище и БД не опрашивались. Наличие поля в миграции не доказывает наличие значения у конкретного трека.

## Где находится реализация

| Слой | Файлы и назначение |
| --- | --- |
| Исполнение | `src/lib/music-analyzer-runs/execute.ts`, `python-plan.ts`, `constants.ts`, `worker.ts`, `worker-runtime.ts`; `scripts/run-music-analyzer-worker.mts` |
| Очередь и исходные результаты | `repository.ts`, `analyze-output.ts`, `contract.ts`, `compare.ts`, `export-run.ts` в том же каталоге; `src/app/api/music-analyzer/runs/` |
| UI трека | `src/components/music-passport/MusicPassport.tsx`, `src/components/music-analyzer-runs/RunDetail.tsx`; парсеры `passport.ts`, `passport-display.ts` |
| Продуктовый паспорт | `src/lib/music-passport/contract.ts`, `jazz-relax-pilot.ts`, `jazz-relax-status.ts`, `album-aggregate.ts`, `album-passport-display.ts`, `pilot-authors.ts`; `src/app/api/author/products/[id]/music-passport/route.ts` |
| Альбом | `src/components/music-passport/AlbumMusicPassport.tsx`; неизменяемые версии альбомов и привязка описания к версии |
| Человеческая лаборатория | `src/lib/music-lab/`, `src/components/music-lab/`, `data/music-lab/listening-v05/` |
| Читатели кофейни, только изучены | `src/lib/business-app/guest-coffee/passport-features.ts`, `passport.server.ts`, `passport-query.ts`; `src/lib/business/coffee-atlas/music.ts` |
| Миграции | `20261204120000_music_analyzer_lab_v01.sql`, `20261214120000_music_passport_basic.sql`, `20261217120000_music_analyzer_runs_v01.sql`, `20261218120000_jazz_relax_album_passport.sql`, `20261228120000_music_passport_registrations.sql` в `supabase/migrations/` |

Python находится в отдельном `Audiolad/music-analyzer`, штатный путь `/var/lib/audiolad/music-analyzer`. Приложение проверяет freeze `932c4ce`, наличие content-коммита `3750f3b` в его истории, запускает `analyze_track.py --device cpu`. Эти файлы не скопированы в рабочее дерево и не менялись.

Первичные источники на проверенном ref:

- [Конвейер и точная схема выходного JSON](https://github.com/Audiolad/music-analyzer/blob/932c4ce/music_analyzer/pipeline.py).
- [DSP, измерения и ограничения BPM](https://github.com/Audiolad/music-analyzer/blob/932c4ce/music_analyzer/dsp.py).
- [CLAP backend](https://github.com/Audiolad/music-analyzer/blob/932c4ce/music_analyzer/backends.py), [поиск весов](https://github.com/Audiolad/music-analyzer/blob/932c4ce/benchmarks/clap_native.py).
- [Настройки](https://github.com/Audiolad/music-analyzer/blob/932c4ce/config/analyzer.yaml), [таксономия](https://github.com/Audiolad/music-analyzer/blob/932c4ce/config/taxonomy.yaml), [агрегация](https://github.com/Audiolad/music-analyzer/blob/932c4ce/music_analyzer/aggregate.py).
- [Зависимости native CLAP](https://github.com/Audiolad/music-analyzer/blob/932c4ce/requirements-v03-clap.txt), [общие зависимости](https://github.com/Audiolad/music-analyzer/blob/932c4ce/requirements-v03-common.txt).

Названные в контракте «три первичных документа» не имеют названий или содержимого в задании. Их согласованные продуктовые решения не реконструировались по предположениям.

## Что действительно вычисляет закреплённый код до изменений

| Признак | Реальный расчёт и место хранения | Видимость до задачи |
| --- | --- | --- |
| Длительность, формат, каналы, sample rate, codec, bitrate | ffprobe и декодирование; `file.*`, `technical.duration_seconds` | Основные технические строки UI; codec/bitrate только JSON |
| BPM | librosa onset strength и beat tracking, равномерный prior 40–220; gate: onset CV ≥2 и ≥4 beats | Опубликованный BPM отдельно от кандидата и raw |
| Half/double tempo | Автокорреляция onset, сравнение основного/половинного/двойного периода, пороги 0.92/1.15 | Кандидат/raw видимы; оценки трёх периодов и выбранный factor находятся в `technical.diagnostics` |
| Стабильность темпа | 1 − коэффициент вариации интервалов beats; эвристические low/medium/high | `technical.tempo_stability`, строковая `bpm_confidence`; не калиброванные вероятности |
| Тональность и лад | Chroma + Krumhansl–Schmuckler; correlation ≥0.75 и margin ≥0.05 | Опубликованное значение и кандидат разделены |
| Метр | Сравнение автокорреляции 3/4 и 4/4, ratio 1.5 | `technical.meter`, confidence и diagnostics; не основной UI |
| Громкость | pyloudnorm integrated loudness исходных каналов | `technical.lufs`, показывалась |
| Истинные пики | SciPy `resample_poly`, oversampling ×4 | `technical.true_peak_dbtp`, скрыты в JSON |
| RMS и динамика | RMS моно; P95–P5 RMS-окон выше −60 dBFS | `technical.rms_db`, `dynamics_db`, скрыты в JSON. Это не LRA |
| Спектр | Centroid, rolloff 85%, flatness; активные окна выше −50 dBFS | `technical.spectral_*`, `chroma`, скрыты в JSON |
| Жанры, стили, инструменты, настроения | Zero-shot CLAP cosine по промптам; average/max, segment range/consistency, scores по сегментам | Top 3 жанра/стиля, top 5 настроений, top 10 инструментов в лаборатории, top 5 в продукте; остальное остаётся в JSON |
| Вокал | `vocal.type` из instrumental/vocal/mixed; разрыв ≤0.02 приводит к mixed | Был в JSON, не показан отдельной карточкой. `spoken_word`, choir, vocalise имеют scores, но не участвуют в выборе primary type |
| Атмосфера, контексты | Такие же zero-shot группы, не продуктовые правила | `atmosphere`, `inferred_contexts`, только JSON |
| Энергия | В данном Python DSP расчёта энергии нет | Читатель умеет читать `energy`; БД принимает 0–1. Это наличие слота, а не доказательство расчёта |
| LRA, отдельная salience и perceived speed | В просмотренном Python-коде отсутствуют | Не путать со стабильностью BPM или RMS-динамикой |

CLAP анализирует три области примерно по 25 секунд на позициях 18%, 50%, 78%, окна по 10 секунд, не более трёх на сегмент и шести для whole-track embedding. Поэтому редкий короткий вокальный фрагмент может быть пропущен. Segment consistency описывает разброс cosine, а не вероятность наличия инструмента. `high` при average ≥0.30 и `medium` ≥0.20 прямо названы в конфиге некалиброванными.

Dark Jazz находится в группе `styles`, не в coarse `genres`. Исправление только жанровой карточки пропустило бы исходный случай. Meditation/Relaxation/Spa/Sleep имеют `research_only`; их нельзя считать подтверждёнными жанрами.

## Что есть в БД и API

`music_analyzer_runs` хранит полные `raw_json`, `normalized_json`, provenance, SHA256 аудио, номера версий, git/content commit, checkpoint и версии. Успешные и неуспешные строки закрыты от UPDATE/DELETE. Выгрузка и сравнение уже существовали. Top-level hints раньше не извлекали версии из реального `analysis.*`; адаптер исправлен в задаче.

`music_passport_versions` и `music_passport_attributes` поддерживают версии, measured/interpreted, provenance analyzer/manual, confidence и source_ref. Допустимы `bpm`, `musical_key`, `mode`, `energy` 0–1, `loudness_lufs`, `vocal_role`, `genre_class`, `mood`, `instrument`. `model_version` на каждый атрибут старой таблицы отсутствует; есть версия анализа паспорта и source_ref.

`album-aggregate.ts::attributesFromStructuredFacts` до задачи переносил BPM с численной confidence и теги; энергию, вокал и LUFS в атрибуты не записывал. Строковая confidence BPM из freeze не становится численной сама собой. Полные скрытые характеристики доступны через связанный прогон, но не гарантированы в `get_music_passport_basic`. В `structured_fields` сохранялся сокращённый набор, лимит 20 000 байт. Новый большой блок туда не дублируется.

Кофейня уже читает опубликованный measured BPM с confidence ≥0.6, энергию только при measured confidence ≥0.6 и ранжированные метки. Новая RMS-энергия не выдаётся этому читателю как достоверная measured energy. Его файлы и правила не изменены. Старые паспортные версии не перепечатываются.

Актуальный `pilot-authors.ts` разрешает Jazz Relax и Aurafon. Старые абзацы общих документов, утверждающие «только Jazz Relax», отстают от кода; уточнение внесено отдельной датированной записью.

## Модели, версии, затраты и пределы

Штатный backend – native `laion_clap.CLAP_Module`, HTSAT-base, `enable_fusion=False`, `music_audioset_epoch_15_esc_90.14.pt`; JSON model ID после загрузки – `laion_clap:<имя checkpoint>`. `music_analyzer/__init__.py` задаёт `music-analyzer-0.1`, Python-пакет `0.1.0`, taxonomy/config `0.1`. Legacy HF backend есть для диагностики, но штатный allowlist окружения приложения его не выбирает. OpenL3 встречается в лаборатории похожести, а не в вызываемом анализе трека. Essentia/LLM/Cyanite в данном пути нет.

В requirements заданы диапазоны, а не точные установленные версии: native laion-clap ≥1.1.7, torch ≥2.6, numpy ≥1.26,<2; общие scipy ≥1.11,<2, librosa ≥0.10.2,<1, pyloudnorm ≥0.1.1,<0.2. Фактический freeze окружения VPS, SHA256 весов и время анализа реальных файлов здесь не проверялись. Прогон сохраняет hash проверенного checkpoint; теперь его каталог явно передаётся Python, чтобы проверенный файл совпадал с загружаемым. Раньше Node проверял файл в корне, а Python искал cache-каталог независимо.

Новый дочерний процесс получает `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`: отсутствующий модельный cache должен дать ошибку, а не загрузку из сети. Необходимые существующие ресурсы должны быть заранее доступны на сервере. Веса и пакеты в этой сессии не скачивались и не устанавливались.

Счёт за новые коммерческие API – отсутствует, вызовов не было. CPU/RAM/диск и лицензии уже используемых ресурсов не бесплатны автоматически; денежная стоимость одного трека не измерена. Ограничения приложения: файл ≤100 MiB, анализ CPU до 25 минут, lease 30 минут, heartbeat, обычно максимум две попытки. Добавленный локальный проход ограничен 120 секундами и 72 000 окнами по 50 мс; выход за пределы даёт unavailable, без выдуманных нулей.

## Что добавлено и что ещё не доказано

Новый блок `normalized_json.analysis_features_v1`: структурированные значения, origin/status, nullable confidence, source, model_version и версия калибровки. Исходные поля и raw остаются. Реальные DSP true peak/динамика/вокал переиспользуются. Локально добавлены RMS/onset-прокси энергии 0–100, автокорреляционная salience, плотность атак, независимая от BPM скорость, ebur128 LRA; P95–P10 локальных окон хранится отдельно от исходного P95–P5.

Гипотеза речи использует уже существующий `vocal.scores.spoken_word`: перевес над лучшим primary >0.02 даёт candidate spoken; близость к instrumental оставляет роль неизвестной. Это не ASR и не доказанная точность. Dark Jazz и research_only удерживаются; остальные метки тоже остаются гипотезами. Никакой автоматической подмены жанра по имени автора/файла нет.

Для будущих правил технически доступны длительность, LUFS, true peak, LRA/динамика с источником. Энергия, salience, скорость, речь, настроение и жанр требуют выборочной проверки; назначать им выдуманную confidence ≥0.6 нельзя. Современная точность на репрезентативной музыке и особенно на «Тихой гармонии» пока не измерена; порядок продолжения – в `EVAL-09d393ce.md`.
