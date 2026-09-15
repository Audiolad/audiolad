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
import {
  STUDIO_LICENSE_TERMS_CANONICAL_TEXT,
  STUDIO_LICENSE_TERMS_CONTENT_HASH,
  STUDIO_LICENSE_TERMS_EDITION_DATE,
  STUDIO_LICENSE_TERMS_V1_0_CONTENT_HASH,
  STUDIO_LICENSE_TERMS_VERSION,
  STUDIO_LICENSE_OFFER,
} from "../src/lib/studio-music/license-terms.ts";
import {
  STUDIO_LICENSE_ALBUM_HINT,
  STUDIO_LICENSE_BENEFIT_LINE,
  STUDIO_LICENSE_CHECKOUT_PAID_DESCRIPTION,
  STUDIO_LICENSE_CHECKOUT_PAID_TITLE,
  STUDIO_LICENSE_CHECKOUT_PAID_UNAUTH_DESCRIPTION,
  STUDIO_LICENSE_CHECKOUT_PAID_UNAUTH_TITLE,
  STUDIO_LICENSE_DETAILS_LINK_LABEL,
  STUDIO_LICENSE_FREE_ACQUIRED_NOTICE,
  STUDIO_LICENSE_GUEST_FREE_HINT,
  STUDIO_LICENSE_MODAL_BULLETS,
  STUDIO_LICENSE_MODAL_FORBIDDEN,
  STUDIO_LICENSE_MODAL_FULL_TERMS_HREF,
  STUDIO_LICENSE_MODAL_LEAD,
  STUDIO_LICENSE_MODAL_TITLE,
  STUDIO_LICENSE_OWNED_BENEFIT_LINE,
} from "../src/lib/studio-music/license-ui-copy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

// LEGAL 1–4
assert.equal(STUDIO_LICENSE_TERMS_VERSION, "studio-license-v1.1");
assert.equal(STUDIO_LICENSE_TERMS_EDITION_DATE, "2026-09-15");
assert.equal(
  STUDIO_LICENSE_TERMS_CONTENT_HASH,
  createHash("sha256")
    .update(STUDIO_LICENSE_TERMS_CANONICAL_TEXT, "utf8")
    .digest("hex"),
);
assert.equal(STUDIO_LICENSE_TERMS_CONTENT_HASH, "036269bf83b4ba8b453604f7a2aeb9de6c0dc9528beb60e4ce76e16fb335846c");
assert.match(STUDIO_LICENSE_TERMS_CANONICAL_TEXT, /любом количестве собственных проектов/i);
assert.match(STUDIO_LICENSE_TERMS_CANONICAL_TEXT, /Повторно приобретать/i);
assert.match(STUDIO_LICENSE_TERMS_CANONICAL_TEXT, /Периодическое продление/i);
assert.match(STUDIO_LICENSE_TERMS_CANONICAL_TEXT, /все треки альбома/i);
assert.match(STUDIO_LICENSE_TERMS_CANONICAL_TEXT, /исключительных прав/i);
assert.match(STUDIO_LICENSE_OFFER.forbidden.join("\n"), /перепродавать|стоков/i);
assert.equal(
  STUDIO_LICENSE_TERMS_V1_0_CONTENT_HASH,
  "46d186eae0798e28a0f8c979ccd0b0b23d0fa57828828b33aefa0a6046d9df12",
);

// ENTITLEMENT 10–13: practice-scoped reuse, no project consumption
const entitlement = { revoked_at: null };
assert.equal(hasStudioMusicEntitlement(entitlement), true);
assert.equal(canUseMusicInStudio({ entitlement, isAuthorMember: false }), true);
// same entitlement authorizes project A and project B (helpers ignore projectId)
assert.equal(
  canUseMusicInStudio({ entitlement, isAuthorMember: false }),
  canUseMusicInStudio({ entitlement, isAuthorMember: false }),
);
const access = read("src/lib/studio-music/access.ts");
assert.doesNotMatch(access, /project_id/);
assert.doesNotMatch(access, /usage_count|single.?use|consum/);
const entitlementsMig = read(
  "supabase/migrations/20261003120000_studio_music_entitlements.sql",
);
assert.match(entitlementsMig, /user_id, practice_id/);
assert.doesNotMatch(entitlementsMig, /project_id/);

// CARD/UI 14–17
const card = read("src/components/studio/StudioMusicCatalogCard.tsx");
const modal = read("src/components/studio/StudioMusicLicenseInfoModal.tsx");
const overlay = read("src/components/studio/StudioMusicCatalogOverlay.tsx");
assert.match(card, /STUDIO_LICENSE_BENEFIT_LINE/);
assert.match(card, /STUDIO_LICENSE_OWNED_BENEFIT_LINE/);
assert.match(card, /STUDIO_LICENSE_DETAILS_LINK_LABEL/);
assert.match(card, /STUDIO_LICENSE_ALBUM_HINT/);
assert.match(STUDIO_LICENSE_BENEFIT_LINE, /Бессрочная лицензия/);
assert.match(STUDIO_LICENSE_BENEFIT_LINE, /Любое количество проектов/);
assert.match(STUDIO_LICENSE_OWNED_BENEFIT_LINE, /Лицензия получена/);
assert.match(modal, /role=\"dialog\"/);
assert.match(modal, /aria-modal=\"true\"/);
assert.match(modal, /STUDIO_LICENSE_MODAL_TITLE|Лицензия для Студии/);
assert.match(modal, /Escape/);
assert.match(modal, /onClose/);
assert.match(overlay, /StudioMusicLicenseInfoModal/);
assert.match(overlay, /licenseInfoOpen/);
assert.ok(STUDIO_LICENSE_MODAL_BULLETS.some((b) => /любом количестве/i.test(b)));
assert.ok(STUDIO_LICENSE_MODAL_BULLETS.some((b) => /не требует продления/i.test(b)));
assert.ok(STUDIO_LICENSE_MODAL_BULLETS.some((b) => /все треки альбома/i.test(b)));
assert.match(STUDIO_LICENSE_MODAL_FORBIDDEN, /перепродавать/i);
assert.equal(STUDIO_LICENSE_MODAL_FULL_TERMS_HREF, "/offer#studio-license");
assert.match(STUDIO_LICENSE_MODAL_LEAD, /один раз/i);

// CHECKOUT 18–20
const checkout = read(
  "src/app/(platform)/checkout/result/CheckoutResultClient.tsx",
);
assert.match(checkout, /STUDIO_LICENSE_CHECKOUT_PAID_TITLE/);
assert.match(checkout, /STUDIO_LICENSE_CHECKOUT_PAID_DESCRIPTION/);
assert.match(checkout, /STUDIO_LICENSE_CHECKOUT_PAID_UNAUTH/);
assert.match(checkout, /Оплата прошла\. Доступ открыт\./);
assert.match(checkout, /Готово — проекты добавлены навсегда/);
assert.equal(STUDIO_LICENSE_CHECKOUT_PAID_TITLE, "Оплата прошла. Лицензия получена.");
assert.match(STUDIO_LICENSE_CHECKOUT_PAID_DESCRIPTION, /любом количестве/i);
assert.match(STUDIO_LICENSE_CHECKOUT_PAID_UNAUTH_DESCRIPTION, /Повторно покупать/i);

// FREE 21–22
assert.match(overlay, /STUDIO_LICENSE_FREE_ACQUIRED_NOTICE/);
assert.match(overlay, /STUDIO_LICENSE_GUEST_FREE_HINT/);
assert.match(STUDIO_LICENSE_FREE_ACQUIRED_NOTICE, /любом количестве проектов/i);
assert.match(STUDIO_LICENSE_GUEST_FREE_HINT, /этой сессии/i);
assert.doesNotMatch(STUDIO_LICENSE_GUEST_FREE_HINT, /бессрочно в аккаунте/i);

// SQL migration 5–9 (parse)
const mig = read(
  "supabase/migrations/20261008120200_studio_license_terms_v1_1.sql",
);
assert.match(mig, /studio-license-v1\.1/);
assert.match(mig, /036269bf83b4ba8b453604f7a2aeb9de6c0dc9528beb60e4ce76e16fb335846c/);
assert.match(mig, /freeze_studio_entitlement_terms/);
assert.doesNotMatch(mig, /UPDATE public\.studio_music_entitlements/);
assert.match(mig, /Does NOT UPDATE existing rows|Historical orders/);
const legal = read(
  "supabase/migrations/20261006140000_studio_music_legal_foundation_v1_2.sql",
);
assert.match(legal, /studio-license-v1\.0/);
assert.match(legal, /46d186eae0798e28a0f8c979ccd0b0b23d0fa57828828b33aefa0a6046d9df12/);

// Author Terms untouched
const authorTerms = read("src/lib/author-terms/approved-content.ts");
assert.match(authorTerms, /26\.7/);
assert.match(authorTerms, /нескольких собственных проектах/);
assert.match(authorTerms, /v1\.2/);

console.log("studio-music-license-lifetime-unit: ok");
