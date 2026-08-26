# Playlists PR4 — UI manual checklist (reorder ↑↓ + shared DnD)

Ручная проверка на `/playlists/[id]` после deploy PR4 (или локально с применённой migration).

## Подготовка

- Войти владельцем плейлиста.
- Иметь плейлист с ≥3 материалами, один unavailable (без entitlement / archived).
- Иметь плейлист с 1 материалом.
- Иметь public и private плейлисты.
- Для mosaic: ≥5 материалов без custom cover.
- Для custom cover: плейлист с загруженной обложкой.

## Порядок списка

- [ ] Первый item: «↑» disabled, «↓» активна.
- [ ] Средний item: обе активны.
- [ ] Последний item: «↓» disabled, «↑» активна.
- [ ] Единственный item: обе disabled.
- [ ] Номера в UI — порядковые 1…N (не сырые gaps).
- [ ] Unavailable материал можно перемещать.
- [ ] Public и private — одинаковое поведение для владельца.
- [ ] Гость / чужой пользователь не видит кнопки (страница owner-only / 404).

## Взаимодействие

- [ ] Клик «↑»/«↓» блокирует reorder до ответа (нет double-submit).
- [ ] Быстрые повторные клики не ломают порядок и не дают 500.
- [ ] Стрелки: нет optimistic swap до ответа сервера.
- [ ] DnD: optimistic только на drop, не во время pointermove.
- [ ] После успеха список обновляется (`router.refresh`).
- [ ] Loading на активной строке понятен.
- [ ] Error: «Не удалось изменить порядок…» / «Материал не найден…» / «Порядок уже изменился…».
- [ ] SQL / UUID / constraint names не показываются.

## Mosaic / cover

- [ ] Automatic mosaic: после перемещения 5-го вверх в top-4 обложка обновляется.
- [ ] Custom cover не меняется при reorder.

## Mobile (390 / 430)

- [ ] Стрелки вертикально рядом с «···».
- [ ] Touch target ≈ 40–44 px.
- [ ] Не перекрывают название.
- [ ] Нет горизонтального скролла.
- [ ] Disabled визуально отличим.

## Desktop / a11y

- [ ] Hover/focus states видимы.
- [ ] Tab достигает обеих кнопок.
- [ ] `aria-label`: «Переместить выше/ниже: {title}».
- [ ] Screen reader озвучивает disabled.

## Drag-and-drop (общий слой в обоих редакторах)

- [ ] Editorial и user-owned используют один `PlaylistItemsSortableList`.
- [ ] Ручка 6 точек; drag стартует с ручки, не со всей строки.
- [ ] Desktop mouse + mobile finger. Page scroll не начинает drag (distance / delay+tolerance).
- [ ] Play / Слушать всё не срабатывают на pointerdown по ручке.
- [ ] Во время drag видно место вставки.
- [ ] Drop: один вызов `POST .../move` с `targetPosition`; ошибка откатывает порядок.
- [ ] После reload порядок тот же.
- [ ] Стрелки ↑/↓ остаются как fallback.
- [ ] Editorial 15 items: 15→1, 1→15, 8→3, reload persists.
- [ ] User playlist: то же.
- [ ] После reorder: Слушать всё и `/p/[slug]` читают новый порядок; каталог не затронут.

## Не в scope (не проверять как готовое)

- Сортировка по названию/дате
- Ручной ввод позиции
