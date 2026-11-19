# Матрица официального API MusicGPT

Проверено 15.11.2026 (Europe/Moscow). Официальный сервис: `musicgpt.com` + документация `docs.musicgpt.com` + OpenAPI `https://docs.musicgpt.com/api-documentation/openapi.json`. Платные методы **не вызывались**. Недокументированные веб-эндпоинты не запрашивались, UI не обходился.

Ссылка из постановки задачи `https://docs.musicgpt.com/api-documentation/conversions/musicaistreaming` 15.11.2026 отвечает **404**. Актуальная генерация: **Music AI V2**, `POST https://api.musicgpt.com/api/public/v2/MusicAI`. Music AI V1 в changelog июня 2026 помечен как deprecated, с просьбой переходить на V2. Эндпоинты `v2/MusicAI/stream` и `v2/MusicAI/batch` в changelog августа 2026 помечены как deprecated.

Базовый URL: `https://api.musicgpt.com/api/public`. Ключ передаётся заголовком `Authorization` (в документации без слова Bearer). Ключи в git не класть: только секреты сервера или защищённый локальный конфиг.

## Статусы в таблице

- **подтверждено** – есть описание в официальной документации или OpenAPI;
- **не найдено** – в публичных docs и OpenAPI операции нет;
- **частично** – операция есть, но важный аспект не описан;
- **устарело** – в документации прямо сказано, что больше не следует использовать.

## Матрица операций

| Операция | Статус | Где подтверждено | Что важно |
|---|---|---|---|
| Создать музыку по промпту (V2) | подтверждено | [Music AI V2](https://docs.musicgpt.com/api-documentation/conversions/musicaiv2) | `POST /v2/MusicAI`. Параметры: `prompt` (до 1000 символов), `lyrics` (до 5000), `title`, `music_style`, `negative_tags`, `make_instrumental`, `vocal_only`, `voice_id`, `gender`, `model` (`v6`, `v6-pro`, `v7`, `v7-pro`, по умолчанию в таблице параметров – `v6`), `webhook_url`, `generate_album_cover` (по умолчанию false), `lyrics_timestamps`. Имена исполнителей в промпт документация просит не ставить. |
| Два выхода на один вызов | подтверждено | Music AI V2, Pricing | «Every request returns two distinct versions». Ответ сразу даёт `task_id`, `conversion_id_1`, `conversion_id_2`, `eta`, `credit_estimate`. |
| Оплата за два выхода | подтверждено | Pricing: «cost is based on per each song» | Один вызов = **две песни** в тарифе. Оценка в смете считается как 2 × ставка модели. |
| Выбор модели v7 / v7-pro | подтверждено | Music AI V2, Pricing | `v7` и `v7-pro` доступны только на плане API Pro, не на Plus и не на Pay as you go. Если передан `voice_id` или `vocal_only=true`, запрос всегда идёт на `v6`, независимо от `model`. |
| Длина трека (`output_length` и аналоги) | не найдено в текущем V2 | OpenAPI V2 не содержит такого поля. Changelog января 2026 упоминал «Song length control» для Music AI | В постановке фигурировало поле `output_length` у старого V1 / в блоге. В актуальном публичном V2 его нет. Как задать длину официально – не подтверждено. В примерах webhook длительности около 156–247 секунд. |
| Переименовать уже созданный `conversion_id` | не найдено | Нет такого пути в OpenAPI | `title` можно передать **только при создании**. Канонические 10 названий после отбора назначаются у нас, в манифесте, а не через API. |
| Скачать MP3 | подтверждено | webhook и `GET /v1/byId`: `conversion_path` / `conversion_path_1` | Пример: `cdn1.musicgpt.com/conversions/api/standard/<id>/<id>.mp3`. Хранение MP3 – 90 дней (changelog, март 2026). |
| Скачать WAV | подтверждено | FAQ «Which Endpoints send WAV Files?»: Music AI, Remix, Extend, Inpaint, Sing Over Instrumental. Поля `conversion_path_wav` / `conversion_path_wav_1`. Changelog: WAV в webhook с 24.03.2026; хранение WAV – **7 дней** | Скачивать сразу в свой архив. Перекодировать исходник нельзя: класть файл как есть и считать SHA-256. |
| Получить статус / метаданные по ID | подтверждено | [Get Conversion Details By ID](https://docs.musicgpt.com/api-documentation/endpoint/getById), [Status Check](https://docs.musicgpt.com/api-documentation/index/statuscheck) | `GET /v1/byId?conversionType=MUSIC_AI` и либо `task_id`, либо `conversion_id` (не оба). Статусы: `IN_QUEUE`, `ERROR`, `COMPLETED`, `FAILED`. Есть `title_1/2`, длительности, пути WAV/MP3, `generation_completed_at`. |
| Webhook | подтверждено | [Webhook](https://docs.musicgpt.com/api-documentation/index/webhook), Music AI V2 | Для обычного (не инструментального) запроса – до нескольких webhook: по каждому варианту трека, lyrics timestamps, streaming URL, при включённой обложке – ещё обложка. Для конвейера обложку не заказываем (`generate_album_cover: false`). Если webhook нельзя принять, допустим опрос `byId`. |
| Ownership License PDF через API | не найдено | В OpenAPI нет путей license / ownership. Во всём индексе `llms.txt` таких страниц нет | На вебе кнопка Download license есть (Plus и выше). Автоматическая выгрузка PDF «если официально поддерживается» – **не поддерживается публичным API**. Нужен ручной fallback. |
| Приватность / запрет публикации в Discover через API | не найдено | Нет параметров и нет раздела в docs | См. [01-prava-i-usloviya.md](01-prava-i-usloviya.md). |
| Коммерческое использование API | подтверждено как заявление docs | Pricing: все платные планы включают commercial use | Распространяется ли это на Pay as you go так же, как на Plus/Pro, в ToS прямо не разделено. Безопаснее считать «оплаченный Plus или Pro». Свободный API-тариф для коммерции не подходит. |
| Проверка, что API и веб-лицензия – один режим прав | не найдено | Документация этого не говорит | Открытый вопрос к поддержке и юристу. |
| Баланс / лимит кредитов отдельным методом | не найдено | В OpenAPI нет | Перед вызовом в ответе есть `credit_estimate`; при нехватке – HTTP 402 `INSUFFICIENT_CREDITS`. Как заранее прочитать баланс – не подтверждено (возможно, только дашборд). |
| Конвертация формата | подтверждено | `POST /v1/file_convert` | В том числе в WAV/FLAC, с выбором частоты и разрядности. Для исходника конвейера **не нужно**, если WAV уже пришёл из Music AI: исходник не перекодируем. Платно (небольшие ставки на Pricing). |
| Автомастеринг, обложка, публикация | подтверждено как отдельные опции; для этого этапа **не используем** | `generate_album_cover`; Audio Mastering – другой метод | Постановка задачи: первый сегмент без автомастеринга, обложек и публикации. Обложку не запрашивать. Мастеринг – вручную в BandLab, вне этого конвейера. |
| Параллельность и лимиты | подтверждено | [Ratelimits](https://docs.musicgpt.com/api-documentation/utilities/ratelimits) | Audio Generations: Free 1, Plus 3, Pro 10 параллельных запросов. `byId`: Free 20, Plus 200, Pro 500 вызовов в минуту. Максимальная длина входного аудио для «прочих» функций – 8 минут (для Remix/Extend/Inpaint/Sing over – 4). |
| Бесплатные пробные генерации API | подтверждено как заявление docs | Pricing: «Get upto 10 free song generations» после активации API-аккаунта и ключа | Страница создания аккаунта требует ввести платёжные данные. В этой задаче аккаунт не создавался и бесплатные генерации не использовались. |
| Прямой коннектор ChatGPT → MusicGPT API | не найдено | – | ChatGPT может быть только интерфейсом управления. Генератор – официальный API MusicGPT. Утверждать готовую интеграцию нельзя. |

## Что оркестратор может делать на подтверждённом API

1. Принять план альбома (10 названий, 2 промпта, параметры).
2. Сделать 5 вызовов `POST /v2/MusicAI` (3 с промптом A, 2 с промптом B), с лимитом параллельности.
3. Сохранить `task_id`, оба `conversion_id`, `credit_estimate`, промпт, модель, время.
4. Дождаться webhook или опросить `byId`.
5. Скачать оригинальные WAV (и для архива – MP3), не перекодируя, посчитать SHA-256, уложиться в 7 дней для WAV.
6. Вести журнал состояния, не создавать повторный платный вызов, если `task_id` уже есть.
7. Не публиковать ничего автоматически.

Чего оркестратор **не должен** делать, пока нет официальной поддержки: вызывать скрытые URL лицензии, переименовывать трек на стороне MusicGPT, считать любую пару из двух выходов двумя готовыми треками без приёмки Сергея.
