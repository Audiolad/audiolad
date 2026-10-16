# 03 · Конкурентный UX и голос клиента (VoC)

Источники проверены 2026-10-14. **Факт** = цитата/утверждение из источника; **Вывод** = наша интерпретация для AudioLad.

## Что обещают лидеры (первичные сайты)

| Сервис | Ключевые workflows (факт) | Источник |
|---|---|---|
| Soundtrack (бывш. Spotify Business) | расписание; «see what's playing in all locations from one dashboard»; уровни доступа персонала; импорт плейлистов Spotify; 2 500+ курируемых плейлистов; mobile+desktop приложения, свой hardware-плеер | https://www.soundtrack.io/spotify-business/ |
| Rockbot | dashboard + Remote app (skip, смена плейлиста, громкость с телефона); smart scheduling по daypart/праздникам; роли; «Small Business: start with one location and add tools as your business grows»; media player продолжает играть при падении интернета | https://rockbot.com/music-for-business , https://www.featuredcustomers.com/vendor/rockbot/reviews |
| Soundsuit | 1 200+ станций, календари-расписания, offline playback, история воспроизведения, мультизона, центральный dashboard для сетей, пауза подписки | https://support.soundsuit.fm/hc/en-us/articles/25922808694161-The-Soundsuit-app |
| Soundsuit Offline | загрузка 50–200 треков (2,5–10 ч), автообновление каждые 8 ч | https://support.soundsuit.fm/hc/en-us/articles/44902301803537-Using-Offline-Mode-in-the-Soundsuit-App |

Не проверены в этом раунде (нет первичного источника под рукой — не выдумываем): Mood Media, QSIC, CloudCover, SoundMachine, Tunify, Storeplay. Добавить во 2-м проходе.

## Голос клиента — повторяющиеся боли (факт, цитаты из отзывов)

1. **Повторы.** «stations have at max 2 hrs of songs … workers have to deal with repeats all day» (Soundtrack, Google Play); «Why do I hear the same song every hour?!» (Soundtrack, App Store); «I'm hearing same songs over and over again» (Soundsuit, Trustpilot).
2. **Музыка останавливается.** «always stops playing in the middle of the song» (Soundtrack, chrome-stats); «The app stops randomly … exit the app and relaunch» (Soundsuit, Trustpilot / App Store); инцидент Soundtrack 2023 «playback is unstable and intermittently pauses … press play again» (isdown.app).
3. **Перелогин персонала.** «the app constantly logs out between uses, so our employees have to re-enter the login» (Soundsuit, App Store).
4. **Неуместная музыка в салоне.** «at my salon … we need to block about four out of five songs … no one has time for that» (Soundtrack, App Store).
5. **Сложность/тормоза UI.** «bloated with AI … extremely slow», «UX is generally clunky» (Soundtrack, Google Play); трудно понять настройки explicit-фильтра (Soundsuit, Trustpilot).

Ссылки: https://play.google.com/store/apps/details?id=com.soundtrackyourbrand.soundtrack.player · https://apps.apple.com/us/app/soundtrack-music-for-business/id1114799709 · https://chrome-stats.com/d/com.soundtrackyourbrand.soundtrack.player/reviews · https://www.trustpilot.com/review/soundsuit.fm · https://apps.apple.com/us/app/soundsuit-music-for-business/id1526687751 · https://isdown.app/status/soundtrack-your-brand/incidents/229898-music-playback-is-unstable-and-intermittently-pauses

## Выводы для кабинета владельца SPA (интерпретация)

- **Главный экран = честный ответ «играет ли музыка у меня сейчас»**, а не каталог. У конкурентов «see what's playing» — ключевое обещание; при этом жалобы — что музыка молча останавливается. У нас: статус только из реального сигнала; нет сигнала → «Нет данных о воспроизведении», не «Всё хорошо».
- **Минимум решений.** Владельцу салона некогда блокировать треки; ценность — готовая атмосфера SPA. Не копируем 100M-каталог/поиск/импорт Spotify: это личный музыкальный сервис, а не кабинет точки.
- **Без перелогинов.** Общий логин .audiolad.ru уже живой — держать сессию, не плодить отдельные входы для плеера точки.
- **Телефон — главный пульт** (Rockbot Remote): mobile-first, крупная кнопка, но управление только тем, что реально работает.
- **Повторы и offline — будущие технические этапы** (антиповтор, offline-буфер как у Soundsuit), в макете — пометка «Концепт · позже».
- **Прогрессивное раскрытие** (Rockbot «add tools as your business grows»): расписание, роли, сети — в Enterprise Console, не в кабинете одной точки.

## Раунд 2 (2026-10-14): Tunify, Mood Media, CloudCover, SoundMachine, storePlay

| Сервис | Факт (первичный источник) | Источник |
|---|---|---|
| Tunify | Приложения iOS/Android/web, Sonos/Bluesound; смартфон как пульт; расписания песен/каналов/плейлистов; аудиосообщения можно ставить по часам, на фикс. время или вокруг открытия/закрытия; MyTunify: точки и зоны, отчёты. Help Center: при слабом/прерванном интернете «a few more songs are played»; при долгом сбое советуют временно использовать смартфон/планшет с 4G (офлайн-загрузок в статье не описано) | https://www.tunify.com/en/product/apps-integrations · https://www.tunify.com/en/product/schedule-playlists · https://www.tunify.com/en/product/mytunify · https://help.tunify.com/en/articles/6104335-does-tunify-work-without-internet-connection |
| Mood Media (Mood:Mix / Mood Media App) | Mix до 5 программ, like/block, лимит 5 пропусков в час (по странице дилера MOOD Appleton; не подтверждено первичным сайтом Mood), расписание; веб: логины сотрудников, смена точки (admin). SMB-тарифы $15.30–36.50/мес при годовой оплате (на странице помечено «Yearly»); «Less repetition – no looping of playlists» | https://apps.apple.com/us/app/mood-mix/id847536656 · http://moodappleton.com/products/mix/ · https://us.moodmedia.com/shop/solutions/audio/music-for-business-engage · https://us.moodmedia.com/sound/business-music-solutions/ |
| Pandora CloudCover | Пульт: станции, пауза, skip, удалить трек навсегда; расписание drag-and-drop; dashboard точек/зон, «real-time monitoring», мульти-доступ; сообщения и signage в старших тарифах; от $16.95/мес | https://cloudcovermusic.com/ · https://play.google.com/store/apps/details?id=com.cloudcovermusic.player |
| SoundMachine | Станции по отраслям, импорт из Spotify/Apple Music, расписания, мульти-точки, PRO-лицензии (ASCAP/BMI/SESAC/GMR) — по собственному блогу вендора | https://sound-machine.com/blog/2025/09/01/the-best-music-services-for-business/ |
| storePlay (AU) | 24-часовые каналы, favourite/skip персоналом (favourite играет вдвое чаще), выравнивание громкости, crossfade 10 с, device dashboard | https://support.sonos.com/en-au/services/storeplay |
| Qsic | Первичный источник в этом раунде не найден — не описываем | — |

### VoC раунда 2 (факт)
- Mood:Mix Android снят с Google Play 27.08.2024, рейтинг 2.69/5 (58 оценок); жалобы (даты отзывов не указаны, исторические): «Plays 2 songs at once», не принимает длинный email при входе, бедные плейлисты — https://www.appbrain.com/app/mood-mix/com.kazumlabs.moodmix . iPad: просьба об offline для йоги, отзыв 2016 — «streaming can be very unreliable» (App Store).
- CloudCover: «You cannot see what track will play next … no progress bar … only play/pause, dislike, skip»; «more and more issues with stations not working» (Google Play, отзыв 2021).

### Выводы (интерпретация)
- Минимальный пульт CloudCover раздражает тех, кто ждёт «плеер», — но для SPA-владельца наша цель другая: **статус и уверенность**, а не DJ-пульт. Важно объяснить это в UI (карточка «Воспроизведение — на устройстве точки»).
- Вывод: полноценный offline есть не у всех (у Tunify в справке описан лишь короткий буфер и совет перейти на 4G) — поэтому честный текст «В онлайн-пилоте автономного воспроизведения нет» допустим; паритета с конкурентами это не означает.
- Привязка к открытию/закрытию (у Tunify — для аудиосообщений) — хорошая идея для будущего концепта «Атмосфера и время суток» у SPA.
- Лёгкое влияние персонала (favourite/skip, лимиты пропусков у Mood) — кандидат в P2, не в Owner MVP.
