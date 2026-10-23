-- After 20270118120000: cover and gallery image columns are server-only.
\set p1 '11111111-1111-4111-8111-111111111111'
\set p2 '22222222-2222-4222-8222-222222222222'
\set p3 '33333333-3333-4333-8333-333333333333'
\set t1 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'
\set s1 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1'
\set s2 'd2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2'
\set s3 'd3d3d3d3-d3d3-4d3d-8d3d-d3d3d3d3d3d3'
\set gal 'practices/11111111-1111-4111-8111-111111111111/gallery'

-- Catalogue.
SELECT public.t_cc_expect((
  SELECT count(*)::text FROM pg_trigger
  WHERE NOT tgisinternal AND tgname IN (
    'guard_practices_cover_server_only_trigger',
    'guard_audio_items_cover_server_only_trigger',
    'guard_gallery_slides_image_server_only_trigger')
), '3', 'guard triggers exist once each');
SELECT public.t_cc_expect((
  SELECT count(*)::text FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Author members can upload practice gallery images'
), '0', 'authenticated gallery upload policy dropped');
SELECT public.t_cc_expect((
  SELECT count(*)::text FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Author members can delete practice gallery images'
    AND cmd = 'DELETE' AND qual LIKE '%..%'
), '1', 'gallery delete policy has the .. check');
SELECT public.t_cc_expect((
  SELECT count(*)::text FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND cmd IN ('INSERT', 'UPDATE', 'ALL')
    AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%practice-covers%'
), '0', 'no authenticated write policy on practice-covers except gallery delete');

-- Editor of A1 (owner/editor rights over P1 and P3).
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', true);
SET LOCAL ROLE authenticated;
-- practices, draft
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.practices SET cover_url = 'https://example.test/wide.webp' WHERE id = %L$q$, :'p1')), 'denied:cover_requires_server', 'editor: draft cover_url refused');
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.practices SET cover_image = '{"v":2}' WHERE id = %L$q$, :'p1')), 'denied:cover_requires_server', 'editor: draft cover_image refused');
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.practices SET cover_url = NULL, cover_image = NULL WHERE id = %L$q$, :'p1')), 'denied:cover_requires_server', 'editor: draft cover clear refused');
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.practices SET title = 'P1 renamed', use_shared_cover = false WHERE id = %L$q$, :'p1')), 'ok:1', 'editor: draft title / use_shared_cover allowed');
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.practices SET cover_url = cover_url, cover_image = cover_image, title = 'P1 again' WHERE id = %L$q$, :'p1')), 'ok:1', 'editor: unchanged cover values pass');
-- practices, submitted
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.practices SET cover_url = 'https://example.test/wide.webp' WHERE id = %L$q$, :'p3')), 'denied:cover_requires_server', 'editor: submitted cover_url refused');
-- practices, insert
SELECT public.t_cc_expect(public.t_cc_try($q$INSERT INTO public.practices (id, author_id, cover_url) VALUES ('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'https://example.test/wide.webp')$q$), 'denied:cover_requires_server', 'editor: insert with cover_url refused');
SELECT public.t_cc_expect(public.t_cc_try($q$INSERT INTO public.practices (id, author_id, cover_image) VALUES ('44444444-4444-4444-8444-444444444445', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"v":1}')$q$), 'denied:cover_requires_server', 'editor: insert with cover_image refused');
SELECT public.t_cc_expect(public.t_cc_try($q$INSERT INTO public.practices (id, author_id, title) VALUES ('44444444-4444-4444-8444-444444444446', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'new draft')$q$), 'ok:1', 'editor: insert without cover allowed');
-- audio_items
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.audio_items SET cover_url = 'https://example.test/wide.webp' WHERE id = %L$q$, :'t1')), 'denied:cover_requires_server', 'editor: track cover_url refused');
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.audio_items SET cover_image = '{"v":2}' WHERE id = %L$q$, :'t1')), 'denied:cover_requires_server', 'editor: track cover_image refused');
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.audio_items SET cover_url = 'https://example.test/wide.webp' WHERE practice_id = %L$q$, :'p3')), 'denied:cover_requires_server', 'editor: submitted track cover refused');
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.audio_items SET title = 'T1 renamed' WHERE id = %L$q$, :'t1')), 'ok:1', 'editor: track title allowed');
SELECT public.t_cc_expect(public.t_cc_try(format($q$INSERT INTO public.audio_items (practice_id, title, cover_url) VALUES (%L, 'T new', 'https://example.test/wide.webp')$q$, :'p1')), 'denied:cover_requires_server', 'editor: track insert with cover refused');
SELECT public.t_cc_expect(public.t_cc_try(format($q$INSERT INTO public.audio_items (practice_id, title) VALUES (%L, 'T new')$q$, :'p1')), 'ok:1', 'editor: track insert without cover allowed');
-- gallery slides
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.publication_gallery_slides SET image_url = 'https://example.test/wide.webp' WHERE id = %L$q$, :'s1')), 'denied:gallery_image_requires_server', 'editor: slide image_url refused');
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.publication_gallery_slides SET image_manifest = '{"v":2}' WHERE id = %L$q$, :'s1')), 'denied:gallery_image_requires_server', 'editor: slide image_manifest refused');
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.publication_gallery_slides SET publication_id = %L WHERE id = %L$q$, :'p3', :'s1')), 'denied:gallery_image_requires_server', 'editor: moving slide to another product refused');
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.publication_gallery_slides SET image_url = 'https://example.test/wide.webp' WHERE id = %L$q$, :'s3')), 'denied:gallery_image_requires_server', 'editor: submitted slide image refused');
SELECT public.t_cc_expect(public.t_cc_try(format($q$INSERT INTO public.publication_gallery_slides (publication_id, image_url, position) VALUES (%L, 'https://example.test/wide.webp', 5)$q$, :'p1')), 'denied:gallery_image_requires_server', 'editor: slide insert refused');
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.publication_gallery_slides SET position = 7, alt = 'alt text' WHERE id = %L$q$, :'s1')), 'ok:1', 'editor: slide position / alt allowed (reorder)');
SELECT public.t_cc_expect(public.t_cc_try(format($q$DELETE FROM public.publication_gallery_slides WHERE id = %L$q$, :'s2')), 'ok:1', 'editor: slide delete allowed');
-- storage
SELECT public.t_cc_expect(public.t_cc_try(format($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('practice-covers', %L)$q$, :'gal' || '/s5/variants/v0/md.webp')), 'denied:%', 'editor: gallery upload refused (server-only)');
SELECT public.t_cc_expect(public.t_cc_try(format($q$DELETE FROM storage.objects WHERE bucket_id = 'practice-covers' AND name = %L$q$, :'gal' || '/s8/../../variants/v0/md.webp')), 'ok:0', 'editor: gallery delete with .. refused');
SELECT public.t_cc_expect(public.t_cc_try(format($q$DELETE FROM storage.objects WHERE bucket_id = 'practice-covers' AND name = %L$q$, :'gal' || '/s7/variants/v0/md.webp')), 'ok:1', 'editor: own gallery object delete allowed');
-- SECURITY DEFINER path (RPC / migration) is not affected.
SELECT public.t_cc_expect(public.t_cc_definer_set_cover(:'p1', 'https://example.test/server.webp')::text, '1', 'security definer path allowed');
ROLLBACK;

-- Owner of A2 on its own draft: the owner role is refused too.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', true);
SET LOCAL ROLE authenticated;
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.practices SET cover_url = 'https://example.test/wide.webp' WHERE id = %L$q$, :'p2')), 'denied:cover_requires_server', 'owner: own draft cover refused');
-- Other account on A1 products: filtered by RLS, nothing changes.
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.practices SET cover_url = 'https://example.test/wide.webp' WHERE id = %L$q$, :'p1')), 'ok:0', 'other account: cover of another author untouched');
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.audio_items SET cover_url = 'https://example.test/wide.webp' WHERE id = %L$q$, :'t1')), 'ok:0', 'other account: track cover untouched');
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.publication_gallery_slides SET image_url = 'https://example.test/wide.webp' WHERE id = %L$q$, :'s1')), 'ok:0', 'other account: slide untouched');
SELECT public.t_cc_expect(public.t_cc_try(format($q$INSERT INTO public.publication_gallery_slides (publication_id, image_url) VALUES (%L, 'https://example.test/wide.webp')$q$, :'p1')), 'denied:%', 'other account: slide insert refused');
SELECT public.t_cc_expect(public.t_cc_try(format($q$DELETE FROM storage.objects WHERE bucket_id = 'practice-covers' AND name = %L$q$, :'gal' || '/s7/variants/v0/md.webp')), 'ok:0', 'other account: gallery object delete refused');
ROLLBACK;

-- Viewer of A1: filtered by RLS.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', true);
SET LOCAL ROLE authenticated;
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.practices SET cover_url = 'https://example.test/wide.webp' WHERE id = %L$q$, :'p1')), 'ok:0', 'viewer: cover untouched');
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.audio_items SET cover_url = 'https://example.test/wide.webp' WHERE id = %L$q$, :'t1')), 'ok:0', 'viewer: track cover untouched');
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.publication_gallery_slides SET image_url = 'https://example.test/wide.webp' WHERE id = %L$q$, :'s1')), 'ok:0', 'viewer: slide untouched');
SELECT public.t_cc_expect(public.t_cc_try(format($q$DELETE FROM storage.objects WHERE bucket_id = 'practice-covers' AND name = %L$q$, :'gal' || '/s7/variants/v0/md.webp')), 'ok:0', 'viewer: gallery object delete refused');
ROLLBACK;

-- Anonymous visitor.
BEGIN;
SET LOCAL ROLE anon;
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.practices SET cover_url = 'https://example.test/wide.webp' WHERE id = %L$q$, :'p1')), 'denied:%', 'anon: cover update refused');
ROLLBACK;

-- Values unchanged after all refused attempts.
SELECT public.t_cc_expect((SELECT cover_url FROM public.practices WHERE id = :'p1'), 'https://example.test/p1.webp', 'P1 cover unchanged');
SELECT public.t_cc_expect((SELECT cover_url FROM public.audio_items WHERE id = :'t1'), 'https://example.test/t1.webp', 'T1 cover unchanged');
SELECT public.t_cc_expect((SELECT image_url FROM public.publication_gallery_slides WHERE id = :'s1'), 'https://example.test/s1.webp', 'S1 image unchanged');

-- Server path (service_role), used by the routes after the 1:1 check.
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.practices SET cover_url = 'https://example.test/square.webp', cover_image = '{"v":3}' WHERE id = %L AND deleted_at IS NULL$q$, :'p1')), 'ok:1', 'server: draft cover allowed');
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.practices SET cover_url = NULL, cover_image = NULL WHERE id = %L$q$, :'p3')), 'ok:1', 'server: submitted cover clear allowed (moderation guard still applies in prod)');
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.audio_items SET cover_url = 'https://example.test/square.webp' WHERE id = %L AND practice_id = %L$q$, :'t1', :'p1')), 'ok:1', 'server: track cover allowed');
SELECT public.t_cc_expect(public.t_cc_try(format($q$INSERT INTO public.publication_gallery_slides (publication_id, image_url, position) VALUES (%L, 'https://example.test/square.webp', 3)$q$, :'p1')), 'ok:1', 'server: slide insert allowed');
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.publication_gallery_slides SET image_url = 'https://example.test/square.webp', image_manifest = '{"v":3}' WHERE id = %L$q$, :'s1')), 'ok:1', 'server: slide image replace allowed');
SELECT public.t_cc_expect(public.t_cc_try(format($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('practice-covers', %L)$q$, :'gal' || '/s6/variants/v0/md.webp')), 'ok:1', 'server: gallery upload allowed');
ROLLBACK;

-- Migration owner (postgres) path.
BEGIN;
SELECT public.t_cc_expect(public.t_cc_try(format($q$UPDATE public.practices SET cover_url = 'https://example.test/seed.webp' WHERE id = %L$q$, :'p1')), 'ok:1', 'owner role (migrations / seeds) allowed');
ROLLBACK;

SELECT 'cover_columns_server_only_behavior: ALL PASS' AS result;
