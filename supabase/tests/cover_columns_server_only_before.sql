-- Before 20270118120000: an editor can point a DRAFT cover / slide at any URL
-- (the loophole), and can upload gallery objects directly.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', true);
SET LOCAL ROLE authenticated;
SELECT public.t_cc_expect(public.t_cc_try($q$UPDATE public.practices SET cover_url = 'https://example.test/wide.webp' WHERE id = '11111111-1111-4111-8111-111111111111'$q$), 'ok:1', 'before: editor rewrites draft cover');
SELECT public.t_cc_expect(public.t_cc_try($q$UPDATE public.publication_gallery_slides SET image_url = 'https://example.test/wide.webp' WHERE id = 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1'$q$), 'ok:1', 'before: editor rewrites slide image');
SELECT public.t_cc_expect(public.t_cc_try($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('practice-covers', 'practices/11111111-1111-4111-8111-111111111111/gallery/s5/variants/v0/md.webp')$q$), 'ok:1', 'before: editor uploads gallery object');
ROLLBACK;
SELECT 'cover_columns_server_only_before: ALL PASS' AS result;
