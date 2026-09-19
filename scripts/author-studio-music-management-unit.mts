import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertCanEnableStudioMusic,
  buildStudioDisableFields,
  buildStudioEnableFields,
  isStudioParticipationEnabled,
  studioMusicConfigurationChanged,
  initialStudioFixedPriceDraft,
} from "../src/lib/author-studio-music/management";
import { canAcquireStudioMusic } from "../src/lib/studio-music/access";
import { isStudioSourceAuthorCommercial } from "../src/lib/studio-music/commercial-author";
import { DEFAULT_STUDIO_MUSIC_FIXED_RUBLES } from "../src/lib/studio-music/pricing";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

assert.equal(isStudioSourceAuthorCommercial("commercial_active"), true);
assert.equal(isStudioSourceAuthorCommercial("commercial"), true);
assert.equal(isStudioSourceAuthorCommercial("free"), false);
assert.equal(isStudioSourceAuthorCommercial("commercial_pending"), false);

const publishedReuse = {
  id: "p1",
  status: "published",
  deleted_at: null,
  product_kind: "music",
  music_usage_permission: "platform_reuse_allowed",
};

assert.equal(
  canAcquireStudioMusic(publishedReuse, { authorAccessStatus: "free" }),
  false,
);
assert.equal(
  canAcquireStudioMusic(publishedReuse, {
    authorAccessStatus: "commercial_active",
  }),
  true,
);

assert.equal(
  assertCanEnableStudioMusic({
    accessStatus: "free",
    productKind: "music",
    status: "published",
  }).ok,
  false,
);
assert.equal(
  assertCanEnableStudioMusic({
    accessStatus: "commercial_active",
    productKind: "music",
    status: "draft",
  }).ok,
  false,
);
assert.equal(
  assertCanEnableStudioMusic({
    accessStatus: "commercial_active",
    productKind: "music",
    status: "published",
  }).ok,
  true,
);

const enable = buildStudioEnableFields({});
assert.equal(enable.ok, true);
if (enable.ok) {
  assert.equal(enable.studio_music_pricing_mode, "fixed");
  assert.equal(
    enable.studio_music_price_minor,
    DEFAULT_STUDIO_MUSIC_FIXED_RUBLES * 100,
  );
  assert.equal(enable.music_usage_permission, "platform_reuse_allowed");
}
assert.equal(buildStudioEnableFields({ priceRubles: 498 }).ok, false);
assert.equal(buildStudioEnableFields({ priceRubles: 599 }).ok, true);

const disable = buildStudioDisableFields();
assert.equal(disable.music_usage_permission, "listen_only");
assert.equal(disable.studio_music_pricing_mode, null);
assert.equal(disable.studio_music_price_minor, null);

assert.equal(
  isStudioParticipationEnabled({
    music_usage_permission: "platform_reuse_allowed",
  }),
  true,
);

const form = readFileSync(
  join(repoRoot, "src/components/author-dashboard/AuthorProductForm.tsx"),
  "utf8",
);
assert.match(form, /canConfigureStudioMusic/);
assert.match(form, /доступно после/);

const patch = readFileSync(
  join(repoRoot, "src/app/api/author/products/[id]/route.ts"),
  "utf8",
);
assert.match(patch, /STUDIO_MUSIC_COMMERCIAL_REQUIRED/);

const catalog = readFileSync(
  join(repoRoot, "src/lib/studio-music/catalog.ts"),
  "utf8",
);
assert.match(catalog, /isStudioSourceAuthorCommercial/);

const nav = readFileSync(
  join(repoRoot, "src/components/author-dashboard/AuthorDashboardNav.tsx"),
  "utf8",
);
assert.match(nav, /author-dashboard\/music/);

const mig = readFileSync(
  join(
    repoRoot,
    "supabase/migrations/20261009120500_studio_require_commercial_author.sql",
  ),
  "utf8",
);
assert.match(mig, /commercial_active/);
assert.doesNotMatch(mig, /UPDATE\s+public\.practices/i);

console.log("author-studio-music-management-unit: ok");


assert.equal(
  studioMusicConfigurationChanged({
    oldPermission: "platform_reuse_allowed",
    nextPermission: "platform_reuse_allowed",
    oldMode: "fixed",
    nextMode: "fixed",
    oldMinor: 49900,
    nextMinor: 49900,
  }),
  false,
  "identical studio re-save",
);

assert.equal(
  studioMusicConfigurationChanged({
    oldPermission: "platform_reuse_allowed",
    nextPermission: "platform_reuse_allowed",
    oldMode: "fixed",
    nextMode: "auto_2x_listener",
    oldMinor: 49900,
    nextMinor: null,
  }),
  true,
  "mode change",
);

assert.equal(
  studioMusicConfigurationChanged({
    oldPermission: "listen_only",
    nextPermission: "platform_reuse_allowed",
    oldMode: null,
    nextMode: "fixed",
    oldMinor: null,
    nextMinor: 49900,
  }),
  true,
  "enable studio",
);

assert.equal(
  studioMusicConfigurationChanged({
    oldPermission: "platform_reuse_allowed",
    nextPermission: "platform_reuse_allowed",
    oldMode: "fixed",
    nextMode: "fixed",
    oldMinor: 49900,
    nextMinor: 99900,
  }),
  true,
  "price change",
);

assert.equal(
  initialStudioFixedPriceDraft({
    studioPricingMode: "auto_2x_listener",
    studioPriceRubles: null,
  }),
  null,
  "AUTO must not seed as fixed 499",
);
assert.equal(
  initialStudioFixedPriceDraft({
    studioPricingMode: "free",
    studioPriceRubles: null,
    grandfatheredFree: true,
  }),
  null,
  "grandfathered FREE must not seed as fixed 499",
);
assert.equal(
  initialStudioFixedPriceDraft({
    studioPricingMode: "fixed",
    studioPriceRubles: 799,
  }),
  799,
);

console.log("author-studio-music-management-unit: config-changed ok");
