-- Live RLS / RPC checks for preview or staging BEFORE merge.
-- Do not run against production. Requires the visibility migrations applied.
--
-- Expected outcomes:
-- 1. has_function_privilege('authenticated', 'public.is_practice_author_member(uuid,uuid)', 'execute') = true
-- 2. has_function_privilege('anon', 'public.is_practice_author_member(uuid,uuid)', 'execute') = false
-- 3. Anon SELECT author_featured_products does not return selected_users product_id
-- 4. Anon get_public_quick_offer(slug) for a selected product returns NULL
--    (no title/slug/price)
-- 5. Anon get_public_promo_page for selected+guest_access returns NULL / omits product
-- 6. Allowlisted authenticated SELECT practices sees the selected row
-- 7. Other authenticated / anon SELECT practices does not
-- 8. Legacy INSERT: is_catalog_listed=false without catalog_visibility → unlisted
-- 9. Modern INSERT without visibility fields → listed
-- 10. Explicit selected_users → is_catalog_listed=false
-- 11. Explicit listed → is_catalog_listed=true
-- 12. UPDATE is_catalog_listed keeps CHECK is_catalog_listed = (catalog_visibility = 'listed')
-- 13. Anon SELECT playlist_items from a public playlist returns listed product IDs
--     only; selected_users has no item slot or practice_id.
-- 14. add_practice_visibility_user rejects a foreign practice and stops raw UUID
--     attempts after 20 / 10 minutes.
-- 15. COVER STORAGE FINDING REMAINS: practice-covers is a public bucket, so
--     known selected cover paths remain fetchable until the separate private-bucket
--     + signed-delivery migration is approved.

SELECT has_function_privilege(
  'authenticated',
  'public.is_practice_author_member(uuid,uuid)',
  'execute'
) AS authenticated_can_execute_author_member;

SELECT has_function_privilege(
  'anon',
  'public.is_practice_author_member(uuid,uuid)',
  'execute'
) AS anon_can_execute_author_member;
