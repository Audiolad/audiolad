# Playlists PR5 — public page UI manual checklist (`/p/[slug]`)

Ручная проверка после deploy PR5 (или локально).

## Подготовка

- Public + `published_at` playlist с slug.
- Private playlist (не должен открываться по slug).
- Public с `published_at IS NULL` (не должен открываться).
- Empty public playlist.
- Playlist с 1 / 2 / 3 / 4+ free items (mosaic).
- Playlist с custom cover.
- Playlist с drift: paid / unlisted / archived item.
- Guest и авторизованный аккаунт.

## Доступ

- [ ] Guest открывает `/p/{slug}` без редиректа на sign-in.
- [ ] Auth пользователь видит ту же публичную страницу (без owner CRUD).
- [ ] Private slug → 404.
- [ ] Deleted / wrong slug → 404.
- [ ] Public unpublished (`published_at` null) → 404.
- [ ] `/playlists/{uuid}` остаётся приватным.

## Контент

- [ ] Title, «Публичный плейлист», owner label.
- [ ] Count материалов.
- [ ] Duration (если есть).
- [ ] Custom cover или mosaic / gradient.
- [ ] Mosaic: 0 gradient, 1/2/3/4+ layouts; только public-compatible covers.
- [ ] Empty: CTA в каталог.
- [ ] Partial unavailable: мягкое уведомление.
- [ ] All unavailable: отдельное сообщение.
- [ ] Unavailable item: disabled «Сейчас недоступно».
- [ ] Available item: «Слушать» ведёт на listen/product.

## CTA

- [ ] Guest: Войти / Создать аккаунт.
- [ ] Auth: Перейти в Аудиотеку.
- [ ] Нет «Сохранить плейлист» / Play All / owner edit.

## Owner copy link

- [ ] Public detail: «Скопировать ссылку» → toast.
- [ ] Public list menu: «Скопировать ссылку».
- [ ] Private: действие отсутствует.
- [ ] URL `/p/{slug}` (canonical origin).

## Metadata

- [ ] Title `{name} — АудиоЛад`.
- [ ] Description с количеством / fallback.
- [ ] Canonical `https://audiolad.ru/p/{slug}`.
- [ ] robots index,follow для public published.
- [ ] 404 metadata не раскрывает private title.

## Mobile / a11y

- [ ] 390×844 и 430×932: нет h-scroll.
- [ ] BottomNav не перекрывает CTA.
- [ ] Keyboard / focus на ссылках.
- [ ] Screen reader: обложка и названия.

## Security spot-checks

- [ ] Нет email / user_id на странице.
- [ ] Нет audio signed URL.
- [ ] Просмотр не добавляет в `user_practices`.
- [ ] Bucket `playlist-covers` private.
