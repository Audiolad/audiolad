-- Baseline for the pre-migration policy set (broad author write access),
-- so the smoke proves it detects the change. Rolled back.
BEGIN;
SELECT set_config('request.jwt.claim.sub', 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', true);
SET LOCAL ROLE authenticated;
SELECT public.t_pc_expect(
  public.t_pc_try_insert('practices/11111111-1111-4111-8111-111111111111/variants/vx/md.webp'),
  'before: editor can insert product cover variant');
SELECT public.t_pc_expect(
  public.t_pc_try_update('practices/11111111-1111-4111-8111-111111111111/cover.jpg') = 1,
  'before: editor can update legacy product cover');
ROLLBACK;
SELECT 'practice_covers_storage_policy_before: ALL PASS' AS result;
