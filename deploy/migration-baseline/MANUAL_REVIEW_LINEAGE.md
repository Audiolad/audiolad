# Lineage for the 13 leftover audit versions

These versions had no conclusive auto-probes, or their auto-extracted objects were later replaced. The audit now uses handcrafted SELECT probes and a `superseded_by:<version>` evidence type.

Absence of an object is **not** `PROVEN_NOT_APPLIED` when a later migration dropped or replaced it and the replacement is present.

## Decisions

| Version | File | Kind | Final expected production state | Downstream |
|---|---|---|---|---|
| 20260710122053 | configure_starter_practices | data | Active `starter_practices` for `elixir-molodosti` / `klyuch-k-izobiliyu` / `kod-prityazheniya` at sort 1/2/3 | Archive then `20260715170000` republishes the three slugs. Do **not** require `published` on the original configure post-check. |
| 20260710123015 | backfill_starter_practices | data | `user_practices` rows exist for all three starter slugs | Signup grant continues after this; archived starters are not granted to new users. Footprint of the three slugs is the durable invariant. |
| 20260713150000 | seed_first_audio_course_practice | data | Row `a8f4c2e1-…` / slug `first-audio-course` / author `50ee125c-…` | `20260715160000` archives it. Do **not** require published / 990. |
| 20260714190000 | assign_platform_owner_memberships | data | `1@audiolad.ru` is `owner` of `sergey-petrov`, `zoya-petrova`, `sergey-and-zoya` | Later admin/editorial files depend on that email; they do not remove memberships. |
| 20260714201600 | rename_sergey_and_zoya_author | data | `authors.name = 'Сергей и Зоя'` for slug `sergey-and-zoya` | `20260714180000` had set `Сергей и Зоя Петровы`. This file is the final name. |
| 20260715160000 | archive_demo_catalog_practices | data | Existing demo slugs are `unpublished` | `20260715170000` republishes the three starters. `20260731180000` remaps remaining `archived` → `unpublished`. Starters stay published. Evidence `superseded_by:20260731180000`. |
| 20260715240000 | repair_published_practice_audio_status | data | No published practice has a draft `audio_item` with a non-empty `audio_path` | Later publish RPCs keep publishing items. Current leftover-draft invariant is the post-repair state. |
| 20260719140000 | clear_legacy_author_seed_description | data | No author still has the exact seeded bio text | No later file restores that copy. |
| 20260719150000 | promo_pages_foundation | schema | Tables, remaining triggers/indexes/select policies stay. Write policies and `promo_pages_status_change_guard` are gone. | `20260719154000` drops `promo_pages_status_change_guard` → `promo_pages_mutation_guard`, drops product write policies → `promo_page_replace_products_core`. `20260719155000` drops `promo_pages_insert` / `promo_pages_update` → `create_promo_page_draft` / `update_promo_page_draft`. |
| 20260728190000 | admin_analytics_p2_privileges_harden | schema | `admin_analytics_p2_*` exist; EXECUTE revoked from `anon` / `authenticated` / `PUBLIC`; granted to `service_role` | No later CREATE OR REPLACE of these functions. |
| 20260801120000 | aurafon_bypass_product_moderation | data | author `59c7e5b8-…` has `can_bypass_product_moderation = true` | Column comes from `20260731180000`. No later file clears Aurafon. |
| 20260810160000 | studio_recording_webm_assets | data | `storage.buckets` `studio-draft-assets` allows `audio/webm` | Bucket created by `20260809150000`. Later studio-render uses a different bucket. |
| 20260816120000 | playlist_description_max_300 | schema | `playlists_description_length_check` is `<= 300`, column comment says Max 300 | `20260814120000` had `<= 1000`. This file is the final constraint. |

## Evidence type

When an auto-extracted object is absent and its replacement probe is present:

```
evidenceType = superseded_by:<downstream-version>
ok = false
satisfied = true
```

That version can still be `PROVEN_APPLIED`.
