# DEVELOPMENT_RULES.md

Правила разработки «АудиоЛад».

## Язык и стек

- TypeScript, React, Next.js (App Router).
- Tailwind CSS v4 для стилей.
- Supabase (`@supabase/ssr`, `@supabase/supabase-js`) для auth и данных.

## Структура файлов

- Страницы: `src/app/<маршрут>/page.tsx`.
- Общие компоненты: `src/components/`.
- Supabase-логика: `src/lib/supabase/`.
- Статика: `public/`.
- Импорты через алиас `@/`.

## Стиль кода

- Существующие страницы используют inline Tailwind-классы — следовать этому паттерну.
- Client components помечать `"use client"` в начале файла.
- Server components для загрузки данных с `export const dynamic = "force-dynamic"` при необходимости (как в каталоге).
- UI-тексты на русском языке.

## Именование

- Маршруты: kebab-case (`/auth/sign-up`, `/my-practices`).
- Компоненты: PascalCase (`BottomNav.tsx`).
- Файлы страниц: `page.tsx` (конвенция App Router).

## Git

- Основная ветка: `main`.
- Remote: `https://github.com/Audiolad/audiolad.git`
- Перед работой: `git status`.
- Коммит — только после подтверждения и показа `git diff`.
- Не включать в коммит секреты и несвязанные изменения.

## Проверки перед сдачей задачи

1. `git diff`
2. `npm run lint`
3. `npm run build`
4. Ручная проверка изменённого сценария

## Запрещено без подтверждения

Полный список — в `AGENTS.md`, раздел 5. Кратко: не трогать инфраструктуру, базу, `.env`, зависимости и production без явного разрешения.

## Тесты

Автотесты в проекте отсутствуют. При добавлении — согласовать подход с архитектором.
