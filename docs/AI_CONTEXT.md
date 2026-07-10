# AI_CONTEXT.md

Контекст для ИИ-агентов, работающих с проектом «АудиоЛад».

## Обязательное чтение перед работой

1. `AGENTS.md` в корне проекта — главная инструкция.
2. `docs/PROJECT_STATE.md` — что работает сейчас.
3. `docs/NEXT_STEPS.md` — ближайшие задачи.
4. `git status` — фактическое состояние рабочей копии.

## Технические особенности Next.js в проекте

- Используется App Router (`src/app/`).
- Вместо `middleware.ts` — файл `proxy.ts` в корне (механизм сессий Next.js).
- Перед написанием кода читать `node_modules/next/dist/docs/` — версия может отличаться от устаревших знаний.

## Паттерны, принятые в коде

- Страницы — `"use client"` для интерактивных форм, server components для загрузки данных (каталог).
- Supabase browser client: `createClient()` из `@/lib/supabase/client`.
- Стилизация: Tailwind CSS, inline-классы, фиолетовая палитра (`#7042c5`, `#25135c`).
- Мобильный layout: `max-w-[430px]`, фиксированная нижняя навигация.
- Алиас путей: `@/*` → `./src/*`.

## Антипаттерны — чего избегать

- Создавать параллельные клиенты Supabase вместо существующих в `src/lib/supabase/`.
- Добавлять `middleware.ts` — в проекте используется `proxy.ts`.
- Фиксировать версии библиотек в документации — смотреть `package.json` и `package-lock.json`.
- Перезаписывать незакоммиченные изменения в рабочей копии.
- Выводить значения `.env`-переменных в отчёты или документацию.

## Где искать код по темам

| Тема | Путь |
|------|------|
| Регистрация | `src/app/auth/sign-up/page.tsx` |
| Вход | `src/app/auth/sign-in/page.tsx` |
| Каталог (база) | `src/app/catalog/page.tsx` |
| Нижняя навигация | `src/components/BottomNav.tsx` |
| Сессия Supabase | `proxy.ts`, `src/lib/supabase/proxy.ts` |

## Переменные окружения (только имена)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
