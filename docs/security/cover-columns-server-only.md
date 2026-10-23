# Обложки и слайды галереи – только через сервер

Миграция: `supabase/migrations/20270118120000_cover_columns_server_only.sql`
Продолжение: `docs/security/practice-covers-storage-write-policies.md` (20270117120000).

## Проблема

После 20270117120000 автор не может сам загрузить файл обложки в Storage, но:

- мог загрузить неквадратную картинку в префикс галереи
  (`practices/{id}/gallery/...`) напрямую через Storage API;
- на продукте в статусе DRAFT мог записать любой URL напрямую через
  REST API базы в `practices.cover_url / cover_image`,
  `audio_items.cover_url / cover_image` и в
  `publication_gallery_slides.image_url / image_manifest`.

Существующий guard модерации (20260731181000) срабатывает только для
submitted и approved-unpublished, поэтому черновик не был защищён, а после
публикации такая обложка попадала в каталог без проверки 1:1.

## Что меняется

1. Триггеры `BEFORE INSERT OR UPDATE`:
   - `guard_practices_cover_server_only_trigger` на `public.practices`;
   - `guard_audio_items_cover_server_only_trigger` на `public.audio_items`;
   - `guard_gallery_slides_image_server_only_trigger` на
     `public.publication_gallery_slides`.

   Для ролей `authenticated` / `anon` (`current_user`):
   - INSERT с непустым `cover_url` / `cover_image` – отказ;
   - UPDATE, меняющий `cover_url` / `cover_image` (в т. ч. очистка в NULL), – отказ;
   - INSERT слайда, смена `image_url`, `image_manifest` или
     `publication_id` слайда – отказ;
   - код ошибки 42501, сообщения `cover_requires_server` /
     `gallery_image_requires_server`.

   Не затрагиваются: `service_role` (серверные маршруты),
   SECURITY DEFINER-функции и миграции/сиды (`current_user` = владелец),
   запись без изменения этих колонок, `use_shared_cover`, `position` и `alt`
   слайдов (перестановка), удаление слайдов. Обхода через GUC нет.

2. Storage, бакет `practice-covers`:
   - политика `Author members can upload practice gallery images`
     (INSERT для authenticated) удалена – файлы галереи загружает сервер
     после проверки 1:1;
   - политика `Author members can delete practice gallery images`
     пересоздана с проверкой `position('..' in name) = 0`.

3. Код:
   - `/api/author/products/[id]/cover` и
     `/api/author/products/[id]/audio/[audioId]/cover` пишут колонки обложки
     через `createPracticeImageWriteClient()` (service role) после проверок
     доступа (`writePracticeCoverColumns` / `writeTrackCoverColumns`,
     с проверкой, что строка действительно обновлена);
   - `/api/author/products/[id]/gallery` (POST) и
     `/api/author/products/[id]/gallery/[slideId]` (PATCH, DELETE) загружают
     файлы и пишут строки слайдов через тот же клиент; очистка файлов
     ограничена префиксом `practices/{id}/gallery/{slideId}/`; `slideId`
     обязан быть UUID;
   - перестановка слайдов (`reorder`) и чтение остаются на клиенте
     пользователя.

## Изменение поведения

- Обход блокировки опубликованных треков сотрудником с правом
  `author_products.moderate` (через `auth.uid()` в
  `actor_can_bypass_product_moderation`) не применяется к смене обложки
  трека: запись идёт от сервера, где `auth.uid()` пуст. Флаг автора
  `can_bypass_product_moderation` и режим поддержки работают как раньше
  (режим поддержки и так писал через service role).
- Guard модерации (`guard_practices_moderated_content_immutable`,
  `guard_audio_items_published_immutable`) не зависит от роли и продолжает
  действовать для серверной записи.

## Порядок выката

Деплой применяет миграции до переключения приложения. Между этими шагами
старый код ещё пишет обложки и слайды клиентом пользователя и получит отказ
(загрузка/удаление обложки, добавление/замена слайда вернут 500). Остальные
операции не затронуты. Выкатывать в спокойное время; окно – несколько минут.

## Проверка после применения (read-only)

```sql
SELECT tgname, tgrelid::regclass
FROM pg_trigger
WHERE tgname LIKE 'guard_%server_only_trigger';

SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'Author members can % practice gallery images';
```

Ожидается: 3 триггера; одна политика DELETE с `'..'` в `qual`, политики
upload нет.

## Откат

```sql
DROP TRIGGER IF EXISTS guard_practices_cover_server_only_trigger ON public.practices;
DROP TRIGGER IF EXISTS guard_audio_items_cover_server_only_trigger ON public.audio_items;
DROP TRIGGER IF EXISTS guard_gallery_slides_image_server_only_trigger ON public.publication_gallery_slides;
DROP FUNCTION IF EXISTS public.guard_cover_columns_server_only();
DROP FUNCTION IF EXISTS public.guard_gallery_slide_image_server_only();

-- Вернуть загрузку галереи автором (как в 20270117120000):
DROP POLICY IF EXISTS "Author members can upload practice gallery images" ON storage.objects;
CREATE POLICY "Author members can upload practice gallery images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'practice-covers'
    AND split_part(name, '/', 1) = 'practices'
    AND split_part(name, '/', 2) <> ''
    AND split_part(name, '/', 3) = 'gallery'
    AND split_part(name, '/', 4) <> ''
    AND position('..' in name) = 0
    AND EXISTS (
      SELECT 1
      FROM public.practices pr
      JOIN public.author_members am ON am.author_id = pr.author_id
      WHERE pr.id::text = split_part(name, '/', 2)
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );
```

Политику DELETE с проверкой `'..'` при откате можно оставить. Код
приложения после отката продолжает работать (service role проходит и без
триггеров).
