#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canUseMusicInStudio,
  hasStudioMusicEntitlement,
} from "../src/lib/studio-music/access.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const licenseTerms = read("src/lib/studio-music/license-terms.ts");
const licenseCopy = read("src/lib/studio-music/license-ui-copy.ts");
const card = read("src/components/studio/StudioMusicCatalogCard.tsx");
const modal = read("src/components/studio/StudioMusicLicenseInfoModal.tsx");
const overlay = read("src/components/studio/StudioMusicCatalogOverlay.tsx");
const checkout = read("src/app/(platform)/checkout/result/CheckoutResultClient.tsx");
const mig = read("supabase/migrations/20261008120200_studio_license_terms_v1_1.sql");
const legal = read("supabase/migrations/20261006140000_studio_music_legal_foundation_v1_2.sql");
const entitlementsMig = read("supabase/migrations/20261003120000_studio_music_entitlements.sql");
const authorTerms = read("src/lib/author-terms/approved-content.ts");
const accessSrc = read("src/lib/studio-music/access.ts");

assert.match(licenseTerms, /studio-license-v1\.1/);
assert.match(licenseTerms, /2026-09-15/);
assert.match(licenseTerms, /любом количестве собственных проектов/i);
assert.match(licenseTerms, /Повторно приобретать/);
assert.match(licenseTerms, /Периодическое продление/);
assert.match(licenseTerms, /все треки альбома/);
assert.match(licenseTerms, /исключительных прав/);
assert.match(licenseTerms, /перепродавать|стоков/);
assert.match(licenseTerms, /46d186eae0798e28a0f8c979ccd0b0b23d0fa57828828b33aefa0a6046d9df12/);

const mod = await import("../src/lib/studio-music/license-terms.ts");
assert.equal(mod.STUDIO_LICENSE_TERMS_VERSION, "studio-license-v1.1");
assert.equal(mod.STUDIO_LICENSE_TERMS_EDITION_DATE, "2026-09-15");
assert.equal(
  mod.STUDIO_LICENSE_TERMS_CONTENT_HASH,
  createHash("sha256").update(mod.STUDIO_LICENSE_TERMS_CANONICAL_TEXT, "utf8").digest("hex"),
);
assert.equal(mod.STUDIO_LICENSE_TERMS_CONTENT_HASH, "036269bf83b4ba8b453604f7a2aeb9de6c0dc9528beb60e4ce76e16fb335846c");
assert.match(mig, /036269bf83b4ba8b453604f7a2aeb9de6c0dc9528beb60e4ce76e16fb335846c/);

const entitlement = { revoked_at: null };
assert.equal(hasStudioMusicEntitlement(entitlement), true);
assert.equal(canUseMusicInStudio({ entitlement, isAuthorMember: false }), true);
assert.doesNotMatch(accessSrc, /project_id/);
assert.doesNotMatch(accessSrc, /usage_count|single.?use|consum/);
assert.match(entitlementsMig, /user_id, practice_id/);
assert.doesNotMatch(entitlementsMig, /project_id/);

assert.match(card, /STUDIO_LICENSE_BENEFIT_LINE/);
assert.match(card, /STUDIO_LICENSE_OWNED_BENEFIT_LINE/);
assert.match(card, /STUDIO_LICENSE_DETAILS_LINK_LABEL/);
assert.match(card, /STUDIO_LICENSE_ALBUM_HINT/);
assert.match(licenseCopy, /Бессрочная лицензия/);
assert.match(licenseCopy, /Любое количество проектов/);
assert.match(modal, /role="dialog"/);
assert.match(modal, /aria-modal="true"/);
assert.match(modal, /Escape/);
assert.match(overlay, /StudioMusicLicenseInfoModal/);
assert.match(overlay, /licenseInfoOpen/);
assert.match(licenseCopy, /не требует продления/);
assert.match(licenseCopy, /все треки альбома/);
assert.match(licenseCopy, /перепродавать/);
assert.match(licenseCopy, /\/offer#studio-license/);

assert.match(checkout, /STUDIO_LICENSE_CHECKOUT_PAID_TITLE/);
assert.match(checkout, /STUDIO_LICENSE_CHECKOUT_PAID_DESCRIPTION/);
assert.match(checkout, /STUDIO_LICENSE_CHECKOUT_PAID_UNAUTH/);
assert.match(checkout, /Оплата прошла\. Доступ открыт\./);
assert.match(checkout, /Готово — проекты добавлены навсегда/);
assert.match(licenseCopy, /Оплата прошла\. Лицензия получена\./);
assert.match(licenseCopy, /любом количестве своих проектов/);

assert.match(overlay, /STUDIO_LICENSE_FREE_ACQUIRED_NOTICE/);
assert.match(overlay, /STUDIO_LICENSE_GUEST_FREE_HINT/);
assert.match(licenseCopy, /этой сессии Студии/);
assert.doesNotMatch(licenseCopy, /бессрочно в аккаунте/);

assert.match(mig, /studio-license-v1\.1/);
assert.match(mig, /freeze_studio_entitlement_terms/);
assert.doesNotMatch(mig, /UPDATE public\.studio_music_entitlements/);
assert.match(mig, /Does NOT UPDATE existing rows|Historical orders/);
assert.match(legal, /studio-license-v1\.0/);
assert.match(legal, /46d186eae0798e28a0f8c979ccd0b0b23d0fa57828828b33aefa0a6046d9df12/);

assert.match(authorTerms, /26\.7/);
assert.match(authorTerms, /нескольких собственных проектах/);
assert.match(authorTerms, /v1\.2/);

console.log("studio-music-license-lifetime-unit: ok");
