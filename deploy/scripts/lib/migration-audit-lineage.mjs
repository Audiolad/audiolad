/**
 * Handcrafted read-only probes and supersession map for versions whose
 * auto-extracted objects are incomplete or later replaced.
 * Never mutates a database. Every sql must be SELECT/WITH only.
 */
import {
  ARCHIVE_DEMO_SLUGS_FINAL,
  ARCHIVE_DEMO_MIGRATION_AT,
  archiveDemoHistoricalTargetSql,
} from "./migration-audit-archive-demo.mjs";

export { ARCHIVE_DEMO_SLUGS_FINAL, ARCHIVE_DEMO_MIGRATION_AT };

export const STARTER_SLUGS = [
  "elixir-molodosti",
  "klyuch-k-izobiliyu",
  "kod-prityazheniya",
];

export const FIRST_AUDIO_COURSE_ID = "a8f4c2e1-9b3d-4f6a-8c7e-1d2f3a4b5c6d";
export const SERGEY_AND_ZOYA_AUTHOR_ID = "50ee125c-8951-4ac6-819a-3f6b11150008";
export const AURAFON_AUTHOR_ID = "59c7e5b8-eae4-4394-82fb-b815a10be6c2";
export const PLATFORM_OWNER_EMAIL = "1@audiolad.ru";
export const LEGACY_AUTHOR_SEED_TEXT =
  "Медитации, энергопрактики и программы для внутренней гармонии.";

function dataProbe(id, sql, evidenceHint) {
  return {
    id,
    kind: "data",
    conclusive: true,
    sql,
    evidenceHint,
  };
}

function schemaProbe(id, kind, sql, evidenceHint) {
  return {
    id,
    kind,
    conclusive: true,
    sql,
    evidenceHint,
  };
}

const functionExists = (schema, name) =>
  `SELECT EXISTS (SELECT 1 FROM information_schema.routines WHERE routine_schema = '${schema}' AND routine_name = '${name}')`;

const triggerExists = (name) =>
  `SELECT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_name = '${name}')`;

/**
 * version -> { extraProbes, superseded }
 * superseded[probeId] = { supersededBy, replacementId }
 */
export const AUDIT_LINEAGE = {
  "20260710122053": {
    extraProbes: [
      dataProbe(
        "data:starter_practices.configured_bundle",
        `SELECT (
  SELECT count(*)
  FROM public.starter_practices AS sp
  JOIN public.practices AS p ON p.id = sp.practice_id
  WHERE sp.is_active = true
    AND (
      (p.slug = 'elixir-molodosti' AND sp.sort_order = 1)
      OR (p.slug = 'klyuch-k-izobiliyu' AND sp.sort_order = 2)
      OR (p.slug = 'kod-prityazheniya' AND sp.sort_order = 3)
    )
) = 3`,
        "active starter_practices rows for elixir/klyuch/kod at sort 1/2/3",
      ),
    ],
  },

  "20260710123015": {
    extraProbes: [
      dataProbe(
        "data:user_practices.starter_backfill_footprint",
        `SELECT (
  SELECT count(DISTINCT p.slug)
  FROM public.user_practices AS up
  JOIN public.practices AS p ON p.id = up.practice_id
  WHERE p.slug IN (
    'elixir-molodosti',
    'klyuch-k-izobiliyu',
    'kod-prityazheniya'
  )
) = 3`,
        "user_practices rows exist for all three configured starter slugs",
      ),
    ],
  },

  "20260713150000": {
    extraProbes: [
      dataProbe(
        "data:practices.first_audio_course_seed",
        `SELECT EXISTS (
  SELECT 1
  FROM public.practices
  WHERE id = '${FIRST_AUDIO_COURSE_ID}'
    AND slug = 'first-audio-course'
    AND author_id = '${SERGEY_AND_ZOYA_AUTHOR_ID}'
)`,
        "first-audio-course row with seeded id and sergey-and-zoya author",
      ),
    ],
  },

  "20260714190000": {
    extraProbes: [
      dataProbe(
        "data:author_members.platform_owner_three_workspaces",
        `SELECT (
  SELECT count(DISTINCT a.slug)
  FROM auth.users AS u
  JOIN public.author_members AS am
    ON am.user_id = u.id
   AND am.role = 'owner'
  JOIN public.authors AS a ON a.id = am.author_id
  WHERE lower(btrim(u.email)) = lower(btrim('${PLATFORM_OWNER_EMAIL}'))
    AND a.slug IN ('sergey-petrov', 'zoya-petrova', 'sergey-and-zoya')
) = 3`,
        "1@audiolad.ru is owner of sergey-petrov, zoya-petrova, sergey-and-zoya",
      ),
    ],
  },

  "20260714201600": {
    extraProbes: [
      dataProbe(
        "data:authors.sergey_and_zoya_final_name",
        `SELECT EXISTS (
  SELECT 1
  FROM public.authors
  WHERE slug = 'sergey-and-zoya'
    AND name = 'Сергей и Зоя'
)`,
        "sergey-and-zoya display name is Сергей и Зоя",
      ),
    ],
  },

  "20260715160000": {
    superseded: {
      "data:practices.demo_catalog_archived": {
        supersededBy: "20260731180000",
        replacementId: "data:practices.demo_catalog_unpublished",
      },
    },
    extraProbes: [
      dataProbe(
        "data:practices.demo_catalog_archived",
        `SELECT NOT EXISTS (
  SELECT 1
  FROM public.practices
  WHERE ${archiveDemoHistoricalTargetSql()}
    AND deleted_at IS NULL
    AND status IS DISTINCT FROM 'archived'
)`,
        "historical published-at-apply-time rows still archived; 31180000 remaps them",
      ),
      dataProbe(
        "data:practices.demo_catalog_unpublished",
        `SELECT (
  EXISTS (
    SELECT 1
    FROM public.practices
    WHERE ${archiveDemoHistoricalTargetSql()}
      AND (
        status IN ('unpublished', 'archived')
        OR deleted_at IS NOT NULL
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.practices
    WHERE ${archiveDemoHistoricalTargetSql()}
      AND deleted_at IS NULL
      AND status NOT IN ('unpublished', 'archived')
  )
)`,
        "historical archive targets are unpublished/archived/deleted; later same-slug rows ignored",
      ),
    ],
  },

  "20260715240000": {
    extraProbes: [
      dataProbe(
        "data:audio_items.no_draft_audio_on_published",
        `SELECT NOT EXISTS (
  SELECT 1
  FROM public.audio_items AS ai
  JOIN public.practices AS p ON p.id = ai.practice_id
  WHERE p.status = 'published'
    AND ai.status = 'draft'
    AND ai.audio_path IS NOT NULL
    AND btrim(ai.audio_path) <> ''
)`,
        "no leftover draft audio_items with a path on published practices",
      ),
    ],
  },

  "20260719140000": {
    extraProbes: [
      dataProbe(
        "data:authors.legacy_seed_description_cleared",
        `SELECT NOT EXISTS (
  SELECT 1
  FROM public.authors
  WHERE btrim(COALESCE(short_bio, '')) = '${LEGACY_AUTHOR_SEED_TEXT}'
     OR btrim(COALESCE(description, '')) = '${LEGACY_AUTHOR_SEED_TEXT}'
)`,
        "no author still has the exact legacy seed short_bio/description",
      ),
    ],
  },

  "20260719150000": {
    superseded: {
      "trigger:promo_pages_status_change_guard": {
        supersededBy: "20260719154000",
        replacementId: "trigger:promo_pages_mutation_guard",
      },
      "policy:promo_pages.promo_pages_insert": {
        supersededBy: "20260719155000",
        replacementId: "function:public.create_promo_page_draft",
      },
      "policy:promo_pages.promo_pages_update": {
        supersededBy: "20260719155000",
        replacementId: "function:public.update_promo_page_draft",
      },
      "policy:promo_page_products.promo_page_products_insert": {
        supersededBy: "20260719154000",
        replacementId: "function:public.promo_page_replace_products_core",
      },
      "policy:promo_page_products.promo_page_products_update": {
        supersededBy: "20260719154000",
        replacementId: "function:public.promo_page_replace_products_core",
      },
      "policy:promo_page_products.promo_page_products_delete": {
        supersededBy: "20260719154000",
        replacementId: "function:public.promo_page_replace_products_core",
      },
    },
    extraProbes: [
      schemaProbe(
        "trigger:promo_pages_mutation_guard",
        "trigger",
        triggerExists("promo_pages_mutation_guard"),
        "19154000 replaced status_change_guard with mutation_guard",
      ),
      schemaProbe(
        "function:public.create_promo_page_draft",
        "function",
        functionExists("public", "create_promo_page_draft"),
        "19155000 RPC-only insert; dropped promo_pages_insert",
      ),
      schemaProbe(
        "function:public.update_promo_page_draft",
        "function",
        functionExists("public", "update_promo_page_draft"),
        "19155000 RPC-only update; dropped promo_pages_update",
      ),
      schemaProbe(
        "function:public.promo_page_replace_products_core",
        "function",
        functionExists("public", "promo_page_replace_products_core"),
        "19154000 RPC-only products; dropped product write policies",
      ),
    ],
  },

  "20260728190000": {
    extraProbes: [
      schemaProbe(
        "privilege:admin_analytics_p2.locked",
        "privilege",
        `SELECT
  NOT EXISTS (
    SELECT 1
    FROM information_schema.routine_privileges
    WHERE specific_schema = 'public'
      AND routine_name LIKE 'admin_analytics_p2%'
      AND privilege_type = 'EXECUTE'
      AND grantee IN ('anon', 'authenticated', 'PUBLIC')
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.routine_privileges
    WHERE specific_schema = 'public'
      AND routine_name = 'admin_analytics_p2_summary'
      AND privilege_type = 'EXECUTE'
      AND grantee = 'service_role'
  )`,
        "admin_analytics_p2_* EXECUTE revoked from anon/authenticated/PUBLIC; granted to service_role",
      ),
    ],
  },

  "20260801120000": {
    extraProbes: [
      dataProbe(
        "data:authors.aurafon_bypass_product_moderation",
        `SELECT EXISTS (
  SELECT 1
  FROM public.authors
  WHERE id = '${AURAFON_AUTHOR_ID}'
    AND can_bypass_product_moderation IS TRUE
)`,
        "aurafon workspace 59c7e5b8… has can_bypass_product_moderation",
      ),
    ],
  },

  "20260810160000": {
    extraProbes: [
      dataProbe(
        "data:storage.studio_draft_assets_allows_webm",
        `SELECT EXISTS (
  SELECT 1
  FROM storage.buckets
  WHERE id = 'studio-draft-assets'
    AND 'audio/webm' = ANY (allowed_mime_types)
)`,
        "studio-draft-assets allowed_mime_types includes audio/webm",
      ),
    ],
  },

  "20260816120000": {
    extraProbes: [
      schemaProbe(
        "constraint:public.playlists.playlists_description_length_check_300",
        "constraint",
        `SELECT EXISTS (
  SELECT 1
  FROM pg_constraint AS c
  JOIN pg_class AS rel ON rel.oid = c.conrelid
  JOIN pg_namespace AS n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public'
    AND rel.relname = 'playlists'
    AND c.conname = 'playlists_description_length_check'
    AND pg_get_constraintdef(c.oid) LIKE '%<= 300%'
)`,
        "playlists_description_length_check is the final <= 300 constraint",
      ),
      schemaProbe(
        "comment:public.playlists.description_max_300",
        "comment",
        `SELECT EXISTS (
  SELECT 1
  FROM pg_description AS d
  JOIN pg_attribute AS a
    ON a.attrelid = d.objoid
   AND a.attnum = d.objsubid
  JOIN pg_class AS rel ON rel.oid = a.attrelid
  JOIN pg_namespace AS n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public'
    AND rel.relname = 'playlists'
    AND a.attname = 'description'
    AND d.description LIKE '%Max 300%'
)`,
        "playlists.description comment records max 300",
      ),
    ],
  },
};

export function lineageForVersion(version) {
  return AUDIT_LINEAGE[String(version)] || { extraProbes: [], superseded: {} };
}
