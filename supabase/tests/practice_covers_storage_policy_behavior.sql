-- practice-covers after 20270117120000: cover objects are server-only,
-- gallery stays writable by owner/editor, public read unchanged.
\set p1 'practices/11111111-1111-4111-8111-111111111111'

-- Catalogue checks.
SELECT public.t_pc_expect(NOT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname IN (
      'Author members can upload practice covers',
      'Author members can update practice covers',
      'Author members can delete practice covers')
), 'broad author write policies are dropped');
SELECT public.t_pc_expect((
  SELECT count(*) FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname IN (
      'Author members can upload practice gallery images',
      'Author members can delete practice gallery images')
) = 2, 'gallery policies exist once');
SELECT public.t_pc_expect(EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Public can read practice covers' AND cmd = 'SELECT'
), 'public read policy kept');
SELECT public.t_pc_expect(NOT EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND cmd = 'UPDATE'
    AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%practice-covers%'
), 'no UPDATE policy on practice-covers');

-- Editor of the practice.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', true);
SET LOCAL ROLE authenticated;
SELECT public.t_pc_expect(NOT public.t_pc_try_insert(:'p1' || '/variants/v1/md.webp'), 'editor cannot insert product cover variant');
SELECT public.t_pc_expect(NOT public.t_pc_try_insert(:'p1' || '/variants/v1/original.png'), 'editor cannot insert product cover original');
SELECT public.t_pc_expect(NOT public.t_pc_try_insert(:'p1' || '/cover.png'), 'editor cannot insert legacy product cover');
SELECT public.t_pc_expect(NOT public.t_pc_try_insert(:'p1' || '/track-covers/a1/variants/v1/md.webp'), 'editor cannot insert track cover variant');
SELECT public.t_pc_expect(NOT public.t_pc_try_insert(:'p1' || '/track-covers/a1.webp'), 'editor cannot insert legacy track cover');
SELECT public.t_pc_expect(NOT public.t_pc_try_insert(:'p1' || '/gallery'), 'editor cannot insert bare gallery path');
SELECT public.t_pc_expect(NOT public.t_pc_try_insert(:'p1' || '/gallery/s1/../../variants/v1/md.webp'), 'editor cannot insert gallery path with ..');
SELECT public.t_pc_expect(public.t_pc_try_update(:'p1' || '/variants/v0/md.webp') = 0, 'editor cannot update product cover variant');
SELECT public.t_pc_expect(public.t_pc_try_update(:'p1' || '/cover.jpg') = 0, 'editor cannot update legacy product cover');
SELECT public.t_pc_expect(public.t_pc_try_update(:'p1' || '/track-covers/a0/variants/v0/md.webp') = 0, 'editor cannot update track cover');
SELECT public.t_pc_expect(public.t_pc_try_update(:'p1' || '/gallery/s0/variants/v0/md.webp') = 0, 'editor cannot update gallery object (upsert is not used)');
SELECT public.t_pc_expect(public.t_pc_try_delete(:'p1' || '/variants/v0/md.webp') = 0, 'editor cannot delete product cover variant');
SELECT public.t_pc_expect(public.t_pc_try_delete(:'p1' || '/cover.jpg') = 0, 'editor cannot delete legacy product cover');
SELECT public.t_pc_expect(public.t_pc_try_delete(:'p1' || '/track-covers/a0/variants/v0/md.webp') = 0, 'editor cannot delete track cover variant');
SELECT public.t_pc_expect(public.t_pc_try_delete(:'p1' || '/track-covers/a0.png') = 0, 'editor cannot delete legacy track cover');
SELECT public.t_pc_expect(public.t_pc_try_insert(:'p1' || '/gallery/s1/variants/v1/md.webp'), 'editor can insert gallery variant');
SELECT public.t_pc_expect(public.t_pc_try_insert(:'p1' || '/gallery/s1/variants/v1/original.jpg'), 'editor can insert gallery original');
SELECT public.t_pc_expect(public.t_pc_try_delete(:'p1' || '/gallery/s0/variants/v0/md.webp') = 1, 'editor can delete gallery object');
SELECT public.t_pc_expect(public.t_pc_visible(:'p1' || '/variants/v0/md.webp') = 1, 'editor can read product cover');
ROLLBACK;

-- Member without write role.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3', true);
SET LOCAL ROLE authenticated;
SELECT public.t_pc_expect(NOT public.t_pc_try_insert(:'p1' || '/gallery/s2/variants/v1/md.webp'), 'viewer cannot insert gallery');
SELECT public.t_pc_expect(public.t_pc_try_delete(:'p1' || '/gallery/s9/variants/v0/md.webp') = 0, 'viewer cannot delete gallery');
ROLLBACK;

-- Member of another author.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2', true);
SET LOCAL ROLE authenticated;
SELECT public.t_pc_expect(NOT public.t_pc_try_insert(:'p1' || '/gallery/s3/variants/v1/md.webp'), 'stranger cannot insert gallery of another practice');
SELECT public.t_pc_expect(public.t_pc_try_delete(:'p1' || '/gallery/s9/variants/v0/md.webp') = 0, 'stranger cannot delete gallery of another practice');
SELECT public.t_pc_expect(NOT public.t_pc_try_insert(:'p1' || '/variants/v2/md.webp'), 'stranger cannot insert cover');
ROLLBACK;

-- Anonymous visitor.
BEGIN;
SET LOCAL ROLE anon;
SELECT public.t_pc_expect(public.t_pc_visible(:'p1' || '/variants/v0/md.webp') = 1, 'anon can read product cover');
SELECT public.t_pc_expect(public.t_pc_visible(:'p1' || '/track-covers/a0/variants/v0/md.webp') = 1, 'anon can read track cover');
SELECT public.t_pc_expect(NOT public.t_pc_try_insert(:'p1' || '/gallery/s4/variants/v1/md.webp'), 'anon cannot insert');
ROLLBACK;

-- Server (service_role) keeps full access for the cover routes.
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.t_pc_expect(public.t_pc_try_insert(:'p1' || '/variants/v3/md.webp'), 'service_role can insert product cover');
SELECT public.t_pc_expect(public.t_pc_try_insert(:'p1' || '/track-covers/a3/variants/v3/md.webp'), 'service_role can insert track cover');
SELECT public.t_pc_expect(public.t_pc_try_delete(:'p1' || '/cover.jpg') = 1, 'service_role can delete legacy cover');
SELECT public.t_pc_expect(public.t_pc_try_delete(:'p1' || '/variants/v0/md.webp') = 1, 'service_role can delete cover variant');
ROLLBACK;

SELECT 'practice_covers_storage_policy_behavior: ALL PASS' AS result;
