#!/usr/bin/env node
/**
 * Reservation → product link uses the loaded practices row.
 * Client publication_class is not proof. Aurafon keeps non-music beta linking.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AURAFON_AUTHOR_ID } from "../src/lib/authors/aurafon.ts";
import { isSeoReservationProductLinkAllowed } from "../src/lib/seo-queries/reservation-product-link-gate.ts";
import { mapSeoReservationLinkError } from "../src/lib/seo-queries/seo-reservation-product-context.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const OTHER = "00000000-0000-4000-8000-000000000099";

assert.equal(AURAFON_AUTHOR_ID, "59c7e5b8-eae4-4394-82fb-b815a10be6c2");

assert.equal(
  isSeoReservationProductLinkAllowed({
    authorId: OTHER,
    productKind: "music",
    publicationClass: "release",
  }),
  true,
  "other author factual music/release",
);
assert.equal(
  isSeoReservationProductLinkAllowed({
    authorId: OTHER,
    productKind: "music",
    publicationClass: null,
  }),
  true,
  "other author product_kind music",
);
assert.equal(
  isSeoReservationProductLinkAllowed({
    authorId: OTHER,
    productKind: "practice",
    publicationClass: "release",
  }),
  true,
  "other author publication_class release",
);

assert.equal(
  isSeoReservationProductLinkAllowed({
    authorId: OTHER,
    productKind: "practice",
    publicationClass: "practice",
  }),
  false,
  "other author practice; spoofed client release is not an input",
);
for (const publicationClass of ["course", "audiobook", "post"]) {
  assert.equal(
    isSeoReservationProductLinkAllowed({
      authorId: OTHER,
      productKind: publicationClass === "post" ? "audio_post" : "practice",
      publicationClass,
    }),
    false,
    publicationClass,
  );
}

assert.equal(
  isSeoReservationProductLinkAllowed({
    authorId: AURAFON_AUTHOR_ID,
    productKind: "practice",
    publicationClass: "practice",
  }),
  true,
  "aurafon non-music",
);
assert.equal(
  isSeoReservationProductLinkAllowed({
    authorId: AURAFON_AUTHOR_ID,
    productKind: "practice",
    publicationClass: "course",
  }),
  true,
);
assert.equal(
  isSeoReservationProductLinkAllowed({
    authorId: ` ${AURAFON_AUTHOR_ID} `,
    productKind: "practice",
    publicationClass: "post",
  }),
  true,
);

assert.equal(
  mapSeoReservationLinkError("seo_reservation_product_not_music").message,
  "Связать запрос можно только с музыкальным продуктом.",
);

const route = read("src/app/api/author/seo-reservations/route.ts");
const post = route.slice(0, route.indexOf("export async function DELETE"));
const patch = route.slice(route.indexOf("export async function PATCH"));
assert.match(post, /musicCreateSeoDiscoveryAllowed\(body\)/);
assert.match(post, /reserve_seo_query/);
assert.doesNotMatch(patch, /musicCreateSeoDiscoveryAllowed/);
assert.doesNotMatch(patch, /readString\(body,\s*"publication_class"\)/);
assert.match(patch, /\.from\("practices"\)/);
assert.match(patch, /author_id, product_kind, publication_class/);
assert.match(
  patch,
  /isSeoReservationProductLinkAllowed\(\{[\s\S]*authorId: practice\.author_id[\s\S]*productKind:[\s\S]*practice\.product_kind[\s\S]*publicationClass:[\s\S]*practice\.publication_class/,
);
assert.match(patch, /link_seo_reservation_to_product/);
assert.match(patch, /seoReservationProductNotMusicResponse\(\)/);
assert.match(route, /error: "seo_reservation_product_not_music"/);

const migration = read(
  "supabase/migrations/20261031120200_seo_reservation_link_music_gate.sql",
);
const previous = read(
  "supabase/migrations/20261021120000_seo_reservation_product_primary_sync.sql",
);
const originalGrant = read("supabase/migrations/20261006130000_seo_core_v1.sql");
assert.match(
  originalGrant,
  /GRANT EXECUTE ON FUNCTION public\.link_seo_reservation_to_product\(uuid, uuid\) TO authenticated/,
);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.link_seo_reservation_to_product\(\s*p_reservation_id uuid,\s*p_product_id uuid\s*\)/);
assert.doesNotMatch(migration, /p_publication_class|publication_class text/);
assert.match(migration, new RegExp(AURAFON_AUTHOR_ID));
assert.match(migration, /v_practice\.product_kind IS DISTINCT FROM 'music'/);
assert.match(migration, /v_practice\.publication_class IS DISTINCT FROM 'release'/);
assert.match(migration, /seo_reservation_product_not_music/);
assert.match(migration, /v_reservation\.product_id IS NOT DISTINCT FROM p_product_id/);
assert.match(migration, /primary_seo_query_id = v_reservation\.query_id/);
assert.match(migration, /seo_primary_query = v_query\.query_text/);
assert.match(migration, /FOR UPDATE/);
assert.match(migration, /seo_reservation_expired/);
assert.match(migration, /seo_reservation_already_linked/);
assert.match(migration, /practice_already_has_primary_seo_query/);
assert.match(migration, /seo_query_too_long_for_product/);
assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION public\.release_seo_query_reservation/);
assert.doesNotMatch(migration, /INSERT INTO public\.seo_queries/);
assert.doesNotMatch(migration, /ADD COLUMN|CREATE TABLE/);
assert.match(
  migration,
  /GRANT EXECUTE ON FUNCTION public\.link_seo_reservation_to_product\(uuid, uuid\) TO authenticated/,
);
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.link_seo_reservation_to_product\(uuid, uuid\) FROM PUBLIC, anon/,
);
assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.link_seo_reservation_to_product\(uuid, uuid\) TO anon/);

const gateAt = migration.indexOf("seo_reservation_product_not_music");
const idempotentAt = migration.indexOf(
  "v_reservation.product_id IS NOT DISTINCT FROM p_product_id",
);
const updateAt = migration.indexOf("primary_seo_query_id = v_reservation.query_id");
assert.ok(gateAt > 0 && gateAt < idempotentAt && idempotentAt < updateAt);

assert.match(previous, /CREATE OR REPLACE FUNCTION public\.link_seo_reservation_to_product/);
assert.doesNotMatch(previous, /seo_reservation_product_not_music/);

assert.equal(
  existsSync(
    path.join(root, "supabase/migrations/20261031120100_seo_music_product_queries_seed.sql"),
  ),
  false,
);
assert.equal(
  existsSync(path.join(root, "scripts/seo-music-product-queries-seed-unit.mjs")),
  false,
);
const pkg = JSON.parse(read("package.json"));
assert.equal(pkg.scripts["test:seo-music-product-queries-seed"], undefined);
assert.match(
  pkg.scripts["test:seo-reservation-link-music-gate"],
  /seo-reservation-link-music-gate-unit/,
);
const workflow = read(".github/workflows/pr-repository-validation.yml");
assert.doesNotMatch(workflow, /test:seo-music-product-queries-seed/);
assert.match(workflow, /test:seo-reservation-link-music-gate/);
assert.match(workflow, /test:music-product-rollout/);
assert.doesNotMatch(read("docs/DATABASE.md"), /20261031120100_seo_music_product_queries_seed/);
assert.match(read("docs/DATABASE.md"), /20261031120200_seo_reservation_link_music_gate/);

console.log("seo-reservation-link-music-gate-unit: ok");
