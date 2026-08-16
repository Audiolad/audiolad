# Listener desktop shell

Техническая фиксация desktop-оболочки пользовательской части «АудиоЛад».

## Концепция

На больших экранах пользовательская часть — единое приложение:

```text
┌─────────────────────────────────────────────────────────────┐
│                     Верхняя панель                          │
├────────────┬───────────────────────────────┬────────────────┤
│            │                               │                │
│ Моё        │       Основной контент        │ Сейчас играет  │
│ пространство│                              │ (default mode) │
│            │                               │                │
├────────────┴───────────────────────────────┴────────────────┤
│               Постоянный аудиоплеер                         │
└─────────────────────────────────────────────────────────────┘
```

## Режимы shell (`src/lib/listener/shell-config.ts`)

| Режим | Маршруты | Sidebar | Right column | Desktop player | Mobile BottomNav |
|-------|----------|---------|--------------|----------------|------------------|
| `default` | `(listener)/*`, `/p/[slug]` | да | да | да | да |
| `profile` | `/profile`, `/profile/edit` | да | нет | да | да |
| `author` | `/author-dashboard/**` | да | нет | да | нет |

Подключение через route-level layouts (`src/app/(platform)/profile/layout.tsx`, `src/app/(platform)/author-dashboard/layout.tsx`, `src/app/(platform)/p/layout.tsx`), без переноса URL. `/p/[slug]` использует тот же `ListenerAppShell` в режиме `default`, без собственной узкой колонки.

## Отдельные пространства (вне listener-shell)

- `/admin/*` — админка
- `/auth/*` — вход и регистрация
- `/checkout/*` — оплата
- `/listen/*` — полноэкранный мобильный плеер
- `/settings` — пока отдельная страница (решение отложено)

## Технические принципы

1. **Глобальный `<audio>`** принадлежит `GlobalAudioPlayerProvider` внутри platform route group; полноэкранные studio routes его не монтируют.
2. **Shell** не дублирует доменную логику страниц.
3. **Мобильный интерфейс** — BottomNav в SSR HTML, после hydration portal на `document.body`; author mode скрывает bottom nav.

## Связанные документы

- `docs/ARCHITECTURE.md` — общая архитектура приложения
- `docs/NEXT_STEPS.md` — приоритеты разработки
