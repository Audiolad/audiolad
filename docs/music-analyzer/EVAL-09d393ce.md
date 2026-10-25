# Проверка до/после – 09d393ce, раунд 2

Дата: 25.10.2026. Сравнено **ровно 2 реальных трека**. Источник чисел – локальный `evaluation.json`; производная сводка без raw-экспортов, серверных путей и user IDs: [eval-results-09d393ce.json](eval-results-09d393ce.json).

**После** означает новый feature adapter того же before-run плюс DSP реального аудио. ML-модель CLAP не перезапускалась, веса не загружались. Сохранённые жанры, инструменты, настроение, vocal и кандидаты BPM взяты из исходных normalized_json. Исходные raw_json / normalized_json не изменялись.

## Права, идентичность и разметка

Оба файла – собственный каталог владельца. В локальном манифесте `permission_confirmed=true`, `verified_by="owner approval 24.10.2026 (Sergey)"`, `verified_at="2026-10-24"`. SHA256 проверен чтением файлов; совпадает с переданным значением и before-экспортом.

| ID | Трек и альбом | SHA256 |
| --- | --- | --- |
| aurafon-quiet-harmony | Aurafon – Тихая гармония; «Расслабляющая музыка для СПА» | `adda7e8735f90686ed52516cd979b875ba7f955d15aee8faf412d018e20c291c` |
| jazz-relax | Jazz Relax – Кофе на площади Сан-Марко; «Итальянский джаз» | `d7dcece23bcbd07d2c845e8eaca1b0082b802d3352e7a7b44ecdcf502511f533` |

Jazz Relax – последний предоставленный альбом «Итальянский джаз», опубликован 15.10.2026. Другие треки не анализировались.

Для «Тихой гармонии» единственный референс – **owner_statement: Ambient, NOT Dark Jazz**, а не подтверждённая слушательская панель. Он сохранён отдельно как required/excluded labels. Все восемь полей `reference` оставлены null, чтобы частичное заявление владельца не превратилось в полную разметку жанров. Для джазового трека все поля также unlabelled. Счётчики match/error/abstained по каждому полю равны 0, unlabelled – 2 на каждой стадии. Это отсутствие проверенных меток, а не доказательство точности.

## Реальные результаты

Названия ниже – кандидаты модели, а не установленные свойства треков. Числа без округления доступны в JSON; в таблицах локальные дробные DSP округлены до шести знаков.

### Aurafon – Тихая гармония

| Поле | До | После |
| --- | --- | --- |
| Жанры (top 3) | new age, jazz, ambient | new age, jazz, ambient |
| Стили (top 3 до удержания) | new age, dark jazz, relaxation music | new age |
| Dark Jazz / удержанные стили | Dark Jazz присутствует в top 3 | Удержаны: Dark Jazz, Relaxation Music |
| Темп и ритм | BPM не определено; uncertain; pulse_accepted=false | BPM не определено; uncertain; salience 0.389671; скорость не определена |
| Half/double | Кандидат 59.840426; raw 119.680851; factor 0.5 | Альтернативы 29.920213 / 59.840426 / 119.680852; ни одна не выбрана |
| Octave scores (half / raw / double) | 0.80471 / 0.764348 / null | Сохранены; это оценки автокорреляции, не слушательская ошибка half/double |
| Вокал | mixed | mixed; confidence=null |
| Речь | Исходный spoken_word cosine 0.134156 | speech_leads=false, ambiguous=false; нового детектора/ASR нет |
| Инструменты (top 10) | strings, double bass, saxophone, woodwinds, harp, synth pad, organ, flute, cello, bass guitar | strings, double bass, saxophone, woodwinds, harp, synth pad, organ, flute, cello, bass guitar |
| Энергия 0–100 | не определено | 68; interpreted candidate, confidence=null |
| Настроение (top 5) | warm, melancholic, romantic, meditative, relaxing | warm, melancholic, romantic, meditative, relaxing |
| Громкость LUFS | -10.500565 (исходный pyloudnorm) | -10.5 (локальный ebur128) |
| True peak dBTP | 0.750042 | 0.750042 (в feature переиспользован исходный SciPy ×4); локальный ebur128 отдельно 0.8 |
| Динамика P95–P5, dB | 13.071077 | 13.071077 (исходное измерение сохранено) |
| Динамика P95–P10, dB | Нет | 9.457995 (локальные RMS-окна 50 мс) |
| LRA, LU | Нет | 6 (локальный ebur128) |
| RMS dB / локальный mono RMS dBFS | -13.55848 | Исходный сохранён; локальный -10.579760 |
| Плотность атак, 1/с | Нет | 0.442647 |
| Длительность, с | 241.727664 | 241.72775 (декодированное аудио) |

Dark Jazz: исходный cosine 0.400336, segment_consistency 0.057675; после status=withheld. Relaxation Music удержан из-за research_only. Ambient уже был в top 3 и не назначен по имени/заявлению владельца. Owner statement: Ambient присутствует до и после; Dark Jazz утверждался до, после удержан. Это устранение спорного утверждения на уровне адаптера, а не исправленная классификация ML. Другие кандидаты New Age/Jazz не подтверждены владельцем.

Исходное решение вокала: top two of instrumental/vocal/mixed differ by 0.0079, within tie_margin 0.0200; type set to mixed. Оно сохранено без подстановки «инструментал».

### Jazz Relax – Кофе на площади Сан-Марко

| Поле | До | После |
| --- | --- | --- |
| Жанры (top 3) | new age, jazz, ambient | new age, jazz, ambient |
| Стили (top 3 до удержания) | lounge jazz, contemporary jazz, smooth jazz | lounge jazz, contemporary jazz, smooth jazz |
| Dark Jazz / удержанные стили | Dark Jazz отсутствует в top 3 | Удержания среди top 3 нет |
| Темп и ритм | BPM не определено; uncertain; pulse_accepted=false | BPM не определено; uncertain; salience 0.370674; скорость не определена |
| Half/double | Кандидат 80.357143; raw 160.714286; factor 0.5 | Альтернативы 40.1785715 / 80.357143 / 160.714286; ни одна не выбрана |
| Octave scores (half / raw / double) | 0.863856 / 0.877324 / null | Сохранены; это оценки автокорреляции, не слушательская ошибка half/double |
| Вокал | instrumental | instrumental; confidence=null |
| Речь | Исходный spoken_word cosine 0.052751 | speech_leads=false, ambiguous=false; нового детектора/ASR нет |
| Инструменты (top 10) | organ, brushes, strings, flute, electric piano, harp, piano, saxophone, percussion, grand piano | organ, brushes, strings, flute, electric piano, harp, piano, saxophone, percussion, grand piano |
| Энергия 0–100 | не определено | 82; interpreted candidate, confidence=null |
| Настроение (top 5) | dreamy, warm, happy, melancholic, relaxing | dreamy, warm, happy, melancholic, relaxing |
| Громкость LUFS | -8.084578 (исходный pyloudnorm) | -8 (локальный ebur128) |
| True peak dBTP | 0.331735 | 0.331735 (в feature переиспользован исходный SciPy ×4); локальный ebur128 отдельно 0.3 |
| Динамика P95–P5, dB | 7.122341 | 7.122341 (исходное измерение сохранено) |
| Динамика P95–P10, dB | Нет | 5.256699 (локальные RMS-окна 50 мс) |
| LRA, LU | Нет | 1.9 (локальный ebur128) |
| RMS dB / локальный mono RMS dBFS | -10.059029 | Исходный сохранён; локальный -7.086192 |
| Плотность атак, 1/с | Нет | 2.283597 |
| Длительность, с | 182.606576 | 182.606625 (декодированное аудио) |

Все поля unlabelled. Нет оснований объявлять музыкальную классификацию или инструментал верными; сравнение фиксирует сохранение прогнозов. Отсутствие Dark Jazz относится только к отображаемому top 3.

## Измерено и интерпретировано

Локальный `ffmpeg 7.0.2-static` декодировал MP3 и WAV, измерил ebur128 integrated LUFS, true peak и LRA на исходных каналах; RMS, sample peak, P95–P10 spread, onset density и salience вычислены на mono downmix 8 kHz. Mono RMS/sample peak не равны исходному стерео true peak: downmix и передискретизация меняют амплитуды. Локальный true peak сохранён отдельно, feature предпочитает исходный SciPy ×4. Разница LUFS включает разные реализации и округление ffmpeg summary; она не доказывает изменение аудио.

Энергия – RMS/onset-прокси `audiolad-dsp:1`, интерпретация, не измеренная воспринимаемая энергия. Salience – измеренная автокорреляция огибающей, но порог ритма 0.35 эвристический. У обоих файлов исходный pulse gate отверг BPM: локальная salience выше порога не снимает этот запрет. Half/double error относительно слушателя не вычисляется без согласованного BPM. Речь – гипотеза исходного spoken_word cosine; отсутствие speech_leads не доказывает отсутствия речи во всём файле. Жанр, стили, инструменты, настроение и vocal – гипотезы прежней CLAP-модели.

Версии: `audiolad-features:1`, `conservative:1`, `audiolad-dsp:1`; исходная ML `music-analyzer-0.1`, checkpoint `music_audioset_epoch_15_esc_90.14.pt`. Версии исходных экспортов сохранены в сводке; точное ML-окружение заново не проверялось.

## Воспроизведение и ограничение путей

Попытка создать `../eval/manifest.json` завершилась `OSError: [Errno 30] Read-only file system`. Sandbox разрешает запись только в рабочее дерево и /tmp; запросить расширение прав в этой сессии невозможно. Поэтому локальный манифест и рабочие выходы находятся в `/tmp/audiolad-eval-09d393ce/`, а не в запрошенном `../eval/out/`. Аудио и полные before-JSON остались вне репозитория, читались на месте.

Выполненная команда:

```bash
export PATH=$HOME/.local/node20/bin:$HOME/.local/bin:$PATH
node scripts/evaluate-music-features.mjs /tmp/audiolad-eval-09d393ce/manifest.json /tmp/audiolad-eval-09d393ce/out --ids=aurafon-quiet-harmony,jazz-relax --measure
```

Результат: compared=2, measured_audio=true для обоих. Стенд теперь читает реальные `normalized_json`, сохраняет режим same_before_run_new_adapter, ml_model_rerun=false, локальные измерения и отдельный owner_statement. Регрессионный тест проверяет чтение реального формата, сохранение вокала/темпа и удержание Dark Jazz. Локальный манифест содержит только две записи с абсолютными путями к предоставленным файлам. После предоставления записи в ../eval можно перенести манифест/выходы туда внешним процессом; повторное измерение не требуется для review.

## Проверки

Результаты каждой команды и ограничения среды приведены в [отчёте раунда 2](REPORT-09d393ce.md). Автотесты существуют. Браузерный сценарий лаборатории не проверен: в среде запрещено прослушивание сокетов, авторизованная локальная БД не подключалась. Synthetic HTML первого раунда не является реальным паспортом и не использован как доказательство оценки.

## Версии, поправки и повтор анализа

`analysis_features_v1` содержит `schema_version=audiolad-features:1`, `calibration_version=conservative:1`; локальные формулы – `audiolad-dsp:1`. Старая энергия 0–1 не масштабируется на месте. Model version включает commit, checkpoint и его SHA256; численные scores и строковые confidence исходного анализатора не заменяются выдуманными вероятностями. Полные метаданные ML-признаков доступны в JSON; поля карточек показывают неизвестную confidence явно.

Owner/admin API:

- `GET /api/music-analyzer/runs/<id>/features` – automatic, effective и журнал поправок с автором, временем и причиной;
- `POST` на тот же путь – `{patch: {energy_0_100: 40}, reason: "..."}`; null для выбранного ключа возвращает его автоматическое значение;
- `POST /api/music-analyzer/runs/reanalyze` – `{requestId: <UUID>, runIds: [<UUID>, ...]}`. Максимум 10, список проверяется до постановки. Повтор того же requestId для тех же source IDs использует те же новые run IDs. Частичные ошибки возвращаются по каждому файлу; повторять безопасно с тем же requestId.

POST требует сессионную роль owner/admin и совпадающий Origin. UI лаборатории даёт ручную поправку, основание и повтор одного файла. Новый прогон получает новую версию, старые sealed строки не меняются. Поправки привязаны к конкретному прогону, не переносятся автоматически в новый; независимые ключи складываются по журналу, для одного ключа действует последняя записанная поправка. Журнал читается постранично, после 10 000 строк отказывает явно, не обрезает историю молча.

Поправка не переписывает базовый sealed паспорт, существующий альбом, описание или кофейные рекомендации. Для потребителя, которому нужны поправки, предназначен ответ effective. Старые экспорты намеренно содержат автоматику, журнал выгружается через features API. В новом `music_passport_attributes` CLAP-теги остаются interpreted с confidence=null; старые версии читаются как прежде. Полный блок хранится в прогоне, доступном по analyzer_run_id, без увеличения `structured_fields` сверх существующего лимита.

## Следующий шаг

Review рабочих изменений и полученных двух таблиц; затем независимо согласовать слушательскую разметку, если требуется измерять точность. Расширение набора и повтор ML требуют отдельной задачи. Миграция остаётся единственной, additive и в этом раунде не меняется; production-применения не было.
