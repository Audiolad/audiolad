# c02fe282 · Phase 1 · кабинет владельца SPA

**Awaiting Sergey design approval**

Исследование и отдельный интерактивный макет. Действующий кабинет, плееры, engine, layout, shell, навигация и auth не изменены. Конкурентный обзор оставлен руководителю. Это не публикация нового рабочего дизайна.

## Индекс

1. [Принципы, конфликты, пробелы](01-bible-principles-matrix.md)
2. [Аудит каждого существующего экрана](02-spa-audit.md)
3. [Конкурентное исследование — заголовок для руководителя](03-competitive.md)
4. [Сценарии, IA, потоки](04-scenarios-ia-flows.md)
5. [Дизайн-система и рассчитанный контраст](05-design-system.md)
6. [Реестр достоверности каждого элемента](06-truthfulness-inventory.md)
7. [Следующие технические стадии, без реализации](07-next-technical-stages.md)

## Просмотр

Маршрут: `src/app/business-app/spa/design-preview/page.tsx`.
URL в окружении, обслуживающем эту ветку: `https://business.audiolad.ru/business-app/spa/design-preview`. Это адрес маршрута, **не утверждение, что ветка развёрнута на production**. Короткий `/spa/design-preview` не регистрировался: текущая allowlist rewrites допускает только точные публичные пути; прямой `/business-app/...` на business host пропускается существующей политикой.

Нужна та же allowlisted сессия, что для `/spa`; `loadSpaPilotContext()` и null → 404. На других host родительский layout/proxy закрывает Business App. Dynamic SSR, robots noindex/nofollow. Нет обхода доступа, env toggle или публичного демо. Имя/точка во внешней оболочке могут быть реальными; всё внутри явно обозначенной рамки — статический макет.

Выберите один из 6 экранов, одно из 5 состояний и телефонную/десктопную рамку. Кнопки внутри меняют только экран или образец паузы. FAQ раскрывается локально; будущие функции — статические блоки «Концепт · позже». Звук, бизнес-записи и запрос manifest отсутствуют.

## Awaiting Sergey design approval — checklist

- [ ] Сергей просмотрел все шесть экранов и пять состояний, включая unknown/offline/error.
- [ ] Сергей одобрил телефон 390px, поведение при 360px и desktop.
- [ ] Одобрены мягкие violet/lilac токены и русские тексты.
- [ ] Одобрено разделение Owner Dashboard / Venue Player / будущая Enterprise Console.
- [ ] Подтверждено, какие концепты оставить видимыми в будущем рабочем кабинете.
- [ ] Получена «Аудиолад Бизнес Библия(4).docx» и проведена сверка; сейчас файла в репозитории нет.
- [ ] Руководитель заполнил `03-competitive.md`.
- [ ] Пройдены отсутствующие runtime/browser проверки в подготовленном окружении.
- [ ] Зафиксированы дата и версия одобрения; отдельно разрешён план live-изменений.

Ни один пункт не считается одобренным автоматически по факту создания или коммита preview.

## Состав изменений и проверки

Восемь документов этой папки; новый route; `src/components/business-app/design-preview/SpaDesignPreview.tsx`; scoped `design-preview.module.css`; `scripts/business-spa-design-preview-unit.mjs`; одна команда `test:business-spa-design-preview` в `package.json`. Зависимости и lockfile не менялись.

Static unit запускается офлайн: `node scripts/business-spa-design-preview-unit.mjs` (либо npm-командой). Проверяет gate, dynamic/noindex, banner, отсутствие audio/actions/network/storage и оранжевых цветов, наличие экранов/состояний и noninteractive concept. Это проверка исходников, не исполнение React и не доказательство browser/access поведения.

Окружение этой сессии: Node 18.19.1, нет `npm`, `node_modules`, локальной документации `node_modules/next/dist/docs/`, линтера, TypeScript и браузерного раннера. Установка зависимостей не выполнялась. Поэтому lint/typecheck/build и ручной browser smoke здесь недоступны. Расчёт контраста выполнен Node-скриптом по sRGB; размеры и семантика проверены по исходникам, не измерены браузером.

Фактические результаты: `node --check scripts/business-spa-design-preview-unit.mjs`, прямой запуск static unit и `git diff --check` — PASS. Попытки `npm run lint`, `npm run typecheck`, `npm run build` завершились кодом 127: `npm: command not found`. Это ограничения проверки, не результаты успешной сборки. В начале работы ветка `ai-company/task-c02fe282`, рабочая копия чистая.

Запрошенный единый коммит не создан: `git add` завершился `Unable to create .git/index.lock: Read-only file system`. Каталог `.git` в этой сессии доступен только для чтения. Push не выполнялся. После переноса в окружение с доступной для записи `.git` проверить полный diff этих 13 файлов и создать один коммит с сообщением `docs+preview(business-spa): owner cabinet Phase 1 research & mockups (c02fe282)`; это не разрешение на live-внедрение.

## Точка продолжения

Сначала просмотреть макет в подготовленном окружении с allowlisted сессией, выполнить checklist и получить явное решение Сергея. Затем согласовать минимальный план P0 исправлений достоверности из `07-next-technical-stages.md`. До этого live cabinet не менять. Коммит Phase 1 не пушить и не деплоить в рамках этой задачи.
