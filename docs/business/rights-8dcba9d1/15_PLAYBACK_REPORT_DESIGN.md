# 15. Отчёт «что играло в заведении во время T» и дизайн миграции для заверяемой справки

> **Черновик, требует проверки юриста.** 16.10.2026, задача 8dcba9d1 (P1-1 частично).

## Что сделано без миграции
- Кабинет → «Документы» (`src/app/business-app/documents/page.tsx`): клиент вводит дату/время в часовом поясе точки (`business_locations.timezone`) и окно ±N минут (≤180).
- Источник — только серверные `playback_usage_facts` (`usage_kind='business'`, `organization_id` и `location_id` первой активной точки участника). Членство проверяется сессией (RLS), чтение фактов — service role строго по этой организации (как в `load-support-diagnostics.ts`). Никаких записей в БД.
- Группировка по треку: интервал ≈ [occurred_at − listened_ms; последний факт], признак «играл во время T»; время показывается в TZ точки и в UTC.
- Ограничения (указаны в UI): нет статуса прав на момент события, нет хеша файла, нет подписи/номера; выбор точки — первая активная (мультиточечность — позже).

## Что требует миграции (НЕ сделано; нужен OK Сергея) — [MIG]
1. **Снимок статуса прав в факте** (P1-1 полный): `playback_usage_facts.rights_status_snapshot text`, `rights_grant_id_snapshot uuid` заполняются при приёме факта из eligibility; иначе «статус на момент T» восстанавливается только по истории grants (её версионирования нет).
2. **Хеш файла**: `audio_items.content_sha256` (или в паспорте трека) + снимок в факте.
3. **Реестр выданных справок/документов точки** (P1-2): `business_issued_documents(id, organization_id, location_id, kind, number unique, version, params jsonb, content_sha256, issued_at, issued_by, verify_token)`; RLS — чтение участниками организации; запись только service role. Публичная страница проверки по `verify_token`.
4. **Реестр претензий** (P1-6): `business_claims(id, organization_id, location_id, claimant, received_at, period, tracks jsonb, status, outcome, documents jsonb)`.
5. Индекс `playback_usage_facts (organization_id, location_id, occurred_at)` — при росте объёма (сейчас запрос ограничен окном и `limit 2000`).
