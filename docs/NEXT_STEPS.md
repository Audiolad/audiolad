# NEXT_STEPS.md

Ближайшие технические задачи «АудиоЛад».

## Технический backlog

- `fix(next): remove invalid headers export from src/app/(platform)/d/layout.tsx` — устранить baseline-ошибку Next.js build: `headers` не является допустимым export поля layout.

## 0. SEO — после PR1 (приоритет: средний)

SEO PR1 на production (`89abe17`, release `20260716-065224-89abe17`).

Далее:

1. SEO-PR2: title templates, OG image, author canonical.
2. SEO-PR3: JSON-LD Product/Offer + BreadcrumbList.
3. SEO-PR4: `playlists.description` (migration) + stable public playlist cover URLs.

## 0a. Плейлисты — Play All MVP (приоритет: высокий)

PR1–PR5 на production (`6a692a2`). Play All реализован в рабочей копии (не commit / не production).

Далее по плейлистам:

1. Review → commit Play All → backup → deploy → **обязательный iPhone smoke** → зафиксировать завершение этапа плейлистов.
2. После стабильной точки — переход к профилю слушателя (не развитие плейлистов).
3. Отложено: save чужого, публичный каталог, DnD, audio_item entries, paid public queue, queue persistence.

## 1. Добавить защиту приватных маршрутов (приоритет: высокий)

Приватные страницы сейчас доступны без авторизации. Реализовать проверку сессии через `proxy.ts` или серверные компоненты.

**Маршруты:** `/profile`, `/profile/edit`, `/my-practices`, `/favorites`, `/history`, `/downloads`, `/purchases` и др.

## Pre-deploy: author sales Auth/IDOR smoke (обязательно)

`test(author-sales): run real bearer-token membership and HTTP IDOR checks in isolated Supabase Auth/API staging`

Предпочтительный экономный вариант — временный локальный Supabase stack с отдельной тестовой БД и реальными Auth bearer tokens. Перед production deploy проверить RLS и HTTP IDOR для author sales без использования production endpoint, production пользователей или production данных.

## 2. Закоммитить накопленные изменения (приоритет: средний)

В рабочей копии есть незакоммиченные правки (профиль, брендинг, layout, PWA-иконки, `docs/`). Согласовать состав коммита с владельцем.

## 3. Добавить навигацию к auth-страницам (приоритет: низкий)

Ссылки на вход/регистрацию отсутствуют в основном UI. Определить места размещения с владельцем.

## 4. Заполнить оставшиеся разделы DATABASE.md (приоритет: низкий)

Схема `profiles` задокументирована. Остаётся детализировать `practices`, миграции и резервное копирование.

---

## Завершённые задачи

### Подключение профиля к Supabase (завершено 2026-07-10)

`/profile` и `/profile/edit` читают и сохраняют данные авторизованного пользователя через серверный клиент. Имя, email и редактирование `full_name` проверены на production.

**Файлы:** `src/app/(platform)/profile/page.tsx`, `src/app/(platform)/profile/edit/page.tsx`, `src/app/(platform)/profile/edit/actions.ts`.

**Инфраструктура:** добавлен Nginx `location /rest/v1/` для Supabase REST API.

### Редирект после регистрации (завершено 2026-07-10)

После успешной регистрации выполняется переход на `/auth/sign-in?registered=1`. На странице входа при `registered=1` показывается сообщение об успешной регистрации. Проверено на production.

**Файлы:** `src/app/(platform)/auth/sign-up/page.tsx`, `src/app/(platform)/auth/sign-in/page.tsx`.

---

## Будущий этап: регистрация и авторизация для пользователей из России (не начат)

Этот этап **не является ближайшей задачей**. Начинается после завершения базовой пользовательской механики:

1. Регистрация и вход (включая редирект после регистрации) — **завершено**.
2. Профиль, связанный с Supabase — **завершено**.
3. Защита приватных маршрутов.

### Исследование (до любой реализации)

- проверить актуальные правовые требования;
- определить допустимые способы регистрации;
- исследовать MAX, российский номер телефона, Яндекс ID и VK ID;
- определить способ связи внешнего идентификатора с Supabase Auth и профилем;
- решить, допускается ли email-регистрация и какие ограничения ей нужны;
- только после этого проектировать код.

---

## MAX Mini App

**Этап 1 — проверка initData: сделано.** Сервер принимает сырой
`window.WebApp.initData`, проверяет HMAC (`MAX_BOT_TOKEN`) и свежесть.

**Этап 2 — touch `external_identities`: сделано.** После успешного HMAC
сервер атомарно upsert-ит `(provider='max', provider_user_id)` с
`user_id = NULL` для новых строк.

**Этап 3A — link RPC: сделано.** `POST /api/max/session/link` связывает
проверенный MAX id с сессионным `auth.users.id`.

**Этап 3B — вход существующего аккаунта + link: сделано.** Форма входа
в оболочке MAX, затем `/link`. Регистрации и каталога нет.

Следующие этапы MAX (не начинать без отдельного задания):

- replay / повторное использование `query_id`;
- регистрация внутри мини-приложения;
- библиотека внутри мини-приложения.

### Планируемый результат полной воронки

Воронка: реклама в MAX → бот / BotHelp → бесплатные аудиоматериалы → мини-приложение → серверная проверка данных MAX → поиск или создание профиля → автоматический вход → библиотека пользователя.

Связь идентификаторов: `MAX user_id` ↔ профиль «АудиоЛада» ↔ пользователь Supabase Auth.
