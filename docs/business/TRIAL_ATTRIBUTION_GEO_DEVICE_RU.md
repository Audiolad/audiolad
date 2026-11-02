# Подарочная неделя: канал, город и устройство (задача 253821e0, PR 3)

Что видно в админке «АудиоЛад Бизнес → Подарочная неделя»:

- у каждого гостевого старта – откуда пришёл (бот МАКС или Телеграм по `ch`, `utm_source/medium/campaign`, домен сайта, с которого перешли), примерный город и тип устройства (телефон, планшет, компьютер, ОС и браузер);
- блок «Воронка по каналам»: подписались на бота → нажали ссылку на подарок → начали 7 дней → оплатили, МАКС и Телеграм рядом. Все шаги считаются за один период – последние 30 дней, так что подписка и нажатие до первого старта тоже видны.

## Что храним и чего не храним

Храним в `business_guest_starts` (миграция `20270214120000_business_trial_attribution.sql`, все поля необязательные, пишутся один раз):
`entry_channel` (`max`/`tg`), `referrer_domain` (только домен), `utm_source`, `utm_medium`, `utm_campaign` (до 100 символов), `geo_country` (код страны), `geo_region`, `geo_city`, `device_class`, `os_family`, `browser_family`, `attributed_at`.

Не храним и не пишем в логи: IP-адрес (используется только в памяти для поиска города), полный User-Agent, полный адрес страницы-источника, координаты, отпечатки браузера, cookie для отслеживания. В браузере метка живёт только в `sessionStorage` вкладки и уходит на сервер один раз – вместе с нажатием «Начать 7 дней».

Открытый вопрос для юриста: нужно ли дописать в /privacy строку о примерном городе и типе устройства. Текст политики в этом PR не меняется.

## Как переносится канал

1. Бот МАКС Поток ведёт по кнопке на `https://audiolad.ru/b/atlas-kofeen`. После PR в Audiolad/max-potok (`MAX_POTOK_CHANNEL_PARAM_HOSTS`) переход через `/c/{token}` добавляет `ch=max` или `ch=tg` по тому, из какого бота нажата кнопка. Без этой переменной поведение МАКС Поток не меняется.
2. Атлас (`/b/atlas-kofeen`) запоминает `ch` и `utm_*` во вкладке и при нажатии на ссылку в coffee.audiolad.ru или business.audiolad.ru добавляет их к ссылке.
3. На coffee/business первая страница вкладки запоминается (`BusinessAttributionCapture`), гостевой старт отправляет её вместе с запросом.
4. Ссылку можно вести и сразу на `https://coffee.audiolad.ru/?ch=max` (или `?ch=tg`) – тоже будет учтено.

## База городов DB-IP Lite

- Источник: https://db-ip.com/db/download/ip-to-city-lite, лицензия CC BY 4.0, обновление раз в месяц.
- Условие лицензии: ссылка «IP Geolocation by DB-IP» на странице, где показываются города. Она есть только в админке, с `rel="nofollow"`.
- Файл в репозиторий не коммитится (`*.mmdb` в `.gitignore`). На сервере его скачивает `scripts/business-geoip-refresh.sh` в `/var/www/audiolad-deploy/shared/geoip/dbip-city-lite.mmdb` (около 121 МБ, рядом остаётся `.prev`). Скрипт ограничивает загрузку 200 МБ и распаковку 400 МБ, проверяет архив и свободное место, держит блокировку от двойного запуска.
- Путь задаётся в `/var/www/audiolad-deploy/shared/.env.production`: `AUDIOLAD_GEOIP_CITY_DB=/var/www/audiolad-deploy/shared/geoip/dbip-city-lite.mmdb`. Нет файла – город пустой, всё остальное работает.
- Приложение перечитывает файл, когда меняется его время изменения (проверка не чаще раза в 10 минут), перезапуск не нужен.
- Ежемесячное обновление (cron пользователя деплоя):
  `17 4 3 * * /var/www/audiolad-deploy/current/scripts/business-geoip-refresh.sh >> /var/www/audiolad-deploy/shared/geoip/refresh.log 2>&1`
- В DB-IP Lite названия городов и регионов на английском, страны – с кодом.

## Включение (после бэкапа и OK Сергея)

1. Бэкап env: `cp -p shared/.env.production shared/.env.production.bak-pre-trial-attribution-<время>`.
2. `scripts/business-geoip-refresh.sh` на сервере.
3. Мерж и деплой (deploy.sh применит миграцию `20270214120000`).
4. В env: `AUDIOLAD_GEOIP_CITY_DB=...`, `AUDIOLAD_MAX_POTOK_FUNNEL_URL=https://<МАКС Поток>/api/v1/audiolad/channel-funnel`, `AUDIOLAD_MAX_POTOK_FUNNEL_TOKEN=<тот же токен, что в МАКС Поток>`, затем `AUDIOLAD_BUSINESS_TRIAL_ATTRIBUTION_ENABLED=1` и `pm2 reload`.
5. Если что-то не так – сначала убрать флаг и `pm2 reload`, потом думать об откате (`supabase/rollbacks/20270214120000_business_trial_attribution.rollback.sql`).
