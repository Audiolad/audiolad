#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import {
  ACCESS_LINK_SECTION_COPY,
  ACCESS_LINK_SECTION_TITLE,
  ACCESS_LINK_TOKEN_BYTE_LENGTH,
  buildAccessLinkPath,
  buildAccessLinkUrl,
  deriveAccessLinkDisplayStatus,
  isAccessLinkPath,
  isValidPracticeAccessTokenFormat,
  parseAccessLinkCreateRequestBody,
  parseAccessLinkExpiryOption,
  parseAccessLinkTargetLevel,
  redactAccessTokenFromHref,
  redactAccessTokenFromPath,
  resolveAccessLinkCreateExpiry,
  resolveAccessLinkCreateTargetLevel,
  resolveAccessLinkExpiry,
  validateAccessLinkTargetLevel,
} from "../src/lib/products/access-links.ts";
import {
  generatePracticeAccessToken,
  hashPracticeAccessToken,
} from "../src/lib/products/access-links-crypto.ts";
import {
  AccessLinkError,
  readAccessLinkCreateRequestBody,
} from "../src/lib/products/access-links-server.ts";
import { grantAccess } from "../src/lib/products/grant-access.ts";
import { resolveValidatedNextPath } from "../src/lib/auth/routes.ts";
import {
  ACCESS_LINK_SIGN_IN_INTRO,
  isAccessLinkSignInNext,
  resolveSignInIntroCopy,
} from "../src/lib/auth/buy-sign-in.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const token = generatePracticeAccessToken();
assert.equal(token.rawToken.length >= 40, true);
assert.equal(isValidPracticeAccessTokenFormat(token.rawToken), true);
assert.equal(token.tokenHash.length, 64);
assert.equal(
  token.tokenHash,
  createHash("sha256").update(token.rawToken, "utf8").digest("hex"),
);
assert.equal(hashPracticeAccessToken(token.rawToken), token.tokenHash);
assert.equal(ACCESS_LINK_TOKEN_BYTE_LENGTH, 32);
assert.doesNotMatch(token.tokenHash, /[A-F]/);

const second = generatePracticeAccessToken();
assert.notEqual(token.rawToken, second.rawToken);
assert.notEqual(token.tokenHash, second.tokenHash);

assert.equal(
  validateAccessLinkTargetLevel({
    publicationClass: "practice",
    configuredLevels: [],
    targetLevel: 1,
  }).ok,
  true,
);
assert.equal(
  validateAccessLinkTargetLevel({
    publicationClass: "practice",
    configuredLevels: [],
    targetLevel: 2,
  }).code,
  "access_level_not_available",
);
assert.equal(
  validateAccessLinkTargetLevel({
    publicationClass: "course",
    configuredLevels: [],
    targetLevel: 1,
  }).ok,
  true,
);
assert.equal(
  validateAccessLinkTargetLevel({
    publicationClass: "course",
    configuredLevels: [],
    targetLevel: 2,
  }).code,
  "target_level_not_configured",
);
assert.equal(
  validateAccessLinkTargetLevel({
    publicationClass: "course",
    configuredLevels: [{ level: 1 }, { level: 2 }],
    targetLevel: 2,
  }).ok,
  true,
);
assert.equal(
  validateAccessLinkTargetLevel({
    publicationClass: "course",
    configuredLevels: [{ level: 1 }, { level: 2 }],
    targetLevel: 999,
  }).code,
  "target_level_not_configured",
);

assert.equal(parseAccessLinkTargetLevel(2), 2);
assert.equal(parseAccessLinkTargetLevel("2"), 2);
assert.equal(parseAccessLinkTargetLevel(1.5), null);
assert.equal(parseAccessLinkExpiryOption("7d"), "7d");
assert.equal(parseAccessLinkExpiryOption("hidden"), null);

assert.equal(resolveAccessLinkCreateTargetLevel({}).ok && resolveAccessLinkCreateTargetLevel({}).targetLevel, 1);
assert.equal(resolveAccessLinkCreateTargetLevel({ targetAccessLevel: 0 }).code, "invalid_access_level");
assert.equal(resolveAccessLinkCreateTargetLevel({ targetAccessLevel: "abc" }).code, "invalid_access_level");
assert.equal(resolveAccessLinkCreateTargetLevel({ targetAccessLevel: null }).code, "invalid_access_level");
assert.equal(resolveAccessLinkCreateTargetLevel({ targetAccessLevel: {} }).code, "invalid_access_level");
assert.equal(resolveAccessLinkCreateTargetLevel({ targetAccessLevel: [] }).code, "invalid_access_level");
assert.equal(resolveAccessLinkCreateTargetLevel({ targetAccessLevel: 1.5 }).code, "invalid_access_level");
assert.equal(resolveAccessLinkCreateTargetLevel({ targetAccessLevel: -1 }).code, "invalid_access_level");
assert.equal(resolveAccessLinkCreateTargetLevel({ targetAccessLevel: "" }).code, "invalid_access_level");
assert.equal(resolveAccessLinkCreateTargetLevel({ targetAccessLevel: 2 }).targetLevel, 2);

assert.equal(resolveAccessLinkCreateExpiry({}).expiry, "none");
assert.equal(resolveAccessLinkCreateExpiry({ expiresIn: "24h" }).expiry, "24h");
assert.equal(resolveAccessLinkCreateExpiry({ expiresIn: "7d" }).expiry, "7d");
assert.equal(resolveAccessLinkCreateExpiry({ expiresIn: "none" }).expiry, "none");
assert.equal(resolveAccessLinkCreateExpiry({ expiresIn: "1d" }).code, "invalid_access_link_expiry");
assert.equal(resolveAccessLinkCreateExpiry({ expiresIn: "7days" }).code, "invalid_access_link_expiry");
assert.equal(resolveAccessLinkCreateExpiry({ expiresIn: "forever" }).code, "invalid_access_link_expiry");
assert.equal(resolveAccessLinkCreateExpiry({ expiresIn: "" }).code, "invalid_access_link_expiry");
assert.equal(resolveAccessLinkCreateExpiry({ expiresIn: null }).code, "invalid_access_link_expiry");
assert.equal(resolveAccessLinkCreateExpiry({ expiresIn: {} }).code, "invalid_access_link_expiry");
assert.equal(resolveAccessLinkCreateExpiry({ expiresIn: [] }).code, "invalid_access_link_expiry");

assert.equal(parseAccessLinkCreateRequestBody({}).ok, true);
assert.deepEqual(parseAccessLinkCreateRequestBody({}).body, {});
assert.equal(parseAccessLinkCreateRequestBody(null).code, "invalid_access_link_request");
assert.equal(parseAccessLinkCreateRequestBody([]).code, "invalid_access_link_request");
assert.equal(parseAccessLinkCreateRequestBody("abc").code, "invalid_access_link_request");
assert.equal(parseAccessLinkCreateRequestBody(123).code, "invalid_access_link_request");
assert.equal(parseAccessLinkCreateRequestBody(true).code, "invalid_access_link_request");
assert.equal(parseAccessLinkCreateRequestBody(false).code, "invalid_access_link_request");
assert.equal(resolveAccessLinkCreateTargetLevel({}).targetLevel, 1);
assert.equal(resolveAccessLinkCreateExpiry({}).expiry, "none");

function jsonRequest(body) {
  return new Request("https://audiolad.ru/api/author/products/p1/access-links", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

async function assertInvalidCreateBody(body) {
  await assert.rejects(
    () => readAccessLinkCreateRequestBody(jsonRequest(body)),
    (error) =>
      error instanceof AccessLinkError &&
      error.code === "invalid_access_link_request" &&
      error.status === 400,
  );
}

const emptyObjectBody = await readAccessLinkCreateRequestBody(jsonRequest("{}"));
assert.deepEqual(emptyObjectBody, {});
assert.equal(resolveAccessLinkCreateTargetLevel(emptyObjectBody).targetLevel, 1);
assert.equal(resolveAccessLinkCreateExpiry(emptyObjectBody).expiry, "none");

await assertInvalidCreateBody("{");
await assertInvalidCreateBody("not-json");
await assertInvalidCreateBody("[]");
await assertInvalidCreateBody("null");
await assertInvalidCreateBody('"abc"');
await assertInvalidCreateBody("123");
await assertInvalidCreateBody("true");
await assertInvalidCreateBody("false");

assert.equal(redactAccessTokenFromPath(`/access/${token.rawToken}`), "/access/[redacted]");
assert.equal(
  redactAccessTokenFromPath(`/api/access/${token.rawToken}/redeem`),
  "/api/access/[redacted]/redeem",
);
const redactedSignIn = redactAccessTokenFromHref(
  `https://audiolad.ru/auth/sign-in?next=/access/${token.rawToken}`,
);
assert.match(redactedSignIn, /\/auth\/sign-in\?next=/);
assert.match(decodeURIComponent(redactedSignIn), /\/access\/\[redacted\]/);
assert.equal(redactedSignIn.includes(token.rawToken), false);

const now = new Date("2026-09-06T12:00:00.000Z");
assert.equal(resolveAccessLinkExpiry("none", now), null);
assert.equal(
  resolveAccessLinkExpiry("24h", now)?.toISOString(),
  "2026-09-07T12:00:00.000Z",
);
assert.equal(
  resolveAccessLinkExpiry("7d", now)?.toISOString(),
  "2026-09-13T12:00:00.000Z",
);

assert.equal(
  deriveAccessLinkDisplayStatus({
    status: "active",
    expiresAt: "2026-09-05T12:00:00.000Z",
    now,
  }),
  "expired",
);
assert.equal(
  deriveAccessLinkDisplayStatus({
    status: "redeemed",
    expiresAt: "2026-09-05T12:00:00.000Z",
    now,
  }),
  "redeemed",
);

assert.equal(buildAccessLinkPath(token.rawToken), `/access/${token.rawToken}`);
assert.equal(
  buildAccessLinkUrl(token.rawToken, "https://audiolad.ru"),
  `https://audiolad.ru/access/${token.rawToken}`,
);
assert.equal(isAccessLinkPath(`/access/${token.rawToken}`), true);
assert.equal(
  resolveValidatedNextPath(`/access/${token.rawToken}`),
  `/access/${token.rawToken}`,
);
assert.equal(isAccessLinkSignInNext(`/access/${token.rawToken}`), true);
assert.equal(
  resolveSignInIntroCopy(`/access/${token.rawToken}`),
  ACCESS_LINK_SIGN_IN_INTRO,
);

const granted = await grantAccess(
  {
    rpc(name, args) {
      assert.equal(name, "grant_practice_access");
      assert.equal(args.p_access_source, "external_manual");
      assert.equal(args.p_metadata.granted_via, "external_access_link");
      return Promise.resolve({
        data: {
          user_id: args.p_user_id,
          practice_id: args.p_practice_id,
          access_level: 2,
          previous_access_level: null,
          inserted: true,
          raised: true,
        },
        error: null,
      });
    },
  },
  {
    userId: "user-1",
    practiceId: "course-1",
    targetLevel: 2,
    accessSource: "external_manual",
    metadata: { access_link_id: "link-1", granted_via: "external_access_link" },
  },
);
assert.equal(granted.access_level, 2);
assert.equal(granted.raised, true);

const migration = read("supabase/migrations/20260926120000_practice_access_links.sql");
assert.match(migration, /practice_access_links/);
assert.match(migration, /redeem_practice_access_link/);
assert.match(migration, /preview_practice_access_link/);
assert.doesNotMatch(migration, /raw_token|token text NOT NULL/);
assert.match(read("src/lib/products/access-links-server.ts"), /import "server-only"/);
assert.match(
  read("src/lib/products/access-links-server.ts"),
  /createServiceRoleClient/,
);
assert.doesNotMatch(
  read("src/lib/products/access-links-server.ts"),
  /SUPABASE_SERVICE_ROLE_KEY/,
);

const authorRoute = read("src/app/api/author/products/[id]/access-links/route.ts");
assert.match(authorRoute, /requirePracticeMutationAccess/);
assert.match(authorRoute, /createPracticeAccessLink/);
assert.match(authorRoute, /readAccessLinkCreateRequestBody/);
assert.doesNotMatch(authorRoute, /body = \{\}/);
assert.doesNotMatch(authorRoute, /as Record<string, unknown>/);
assert.doesNotMatch(authorRoute, /\?\? 1/);
assert.doesNotMatch(authorRoute, /\?\? "none"/);
assert.doesNotMatch(authorRoute, /from\("practice_access_links"\)\.insert/);

const adminRoute = read("src/app/api/admin/products/[id]/access-links/route.ts");
assert.match(adminRoute, /requirePlatformAdminAccessLinkActor/);
assert.match(adminRoute, /readAccessLinkCreateRequestBody/);
assert.doesNotMatch(adminRoute, /body = \{\}/);
assert.doesNotMatch(adminRoute, /as Record<string, unknown>/);
assert.doesNotMatch(adminRoute, /\?\? 1/);
assert.doesNotMatch(adminRoute, /\?\? "none"/);

const createHelper = read("src/lib/products/access-links-server.ts");
assert.match(createHelper, /readAccessLinkCreateRequestBody/);
assert.match(createHelper, /invalid_access_link_request/);
assert.match(createHelper, /resolveAccessLinkCreateTargetLevel/);
assert.match(createHelper, /resolveAccessLinkCreateExpiry/);
assert.doesNotMatch(createHelper, /parseAccessLinkTargetLevel\(input\.targetLevel\) \?\? 1/);
assert.doesNotMatch(createHelper, /parseAccessLinkExpiryOption\(input\.expiry\) \?\?/);

const reactivate = read(
  "supabase/migrations/20260927120000_practice_access_link_permanent_entitlement.sql",
);
assert.match(reactivate, /activate_permanent_practice_access/);
assert.match(reactivate, /expires_at = NULL/);
assert.match(reactivate, /entitlement_still_expired/);
assert.match(reactivate, /grant_practice_access\(/);
assert.doesNotMatch(
  read("supabase/migrations/20260923120100_course_access_levels_foundation.sql"),
  /expires_at =/,
);

assert.match(
  read("src/lib/analytics/yandex-metrika-url.ts"),
  /redactAccessTokenFromPath/,
);
assert.match(
  read("src/lib/analytics/yandex-metrika-environment.ts"),
  /isAccessTokenAnalyticsRoute/,
);
assert.match(
  read("src/lib/client-errors/sanitize.ts"),
  /redactAccessTokenFromPath/,
);

const redeemRoute = read("src/app/api/access/[token]/redeem/route.ts");
assert.match(redeemRoute, /export async function POST/);
assert.doesNotMatch(redeemRoute, /export async function GET/);
assert.match(read("src/lib/products/access-links-server.ts"), /already_redeemed_by_you/);

const landing = read("src/app/(platform)/access/[token]/page.tsx");
assert.match(landing, /previewPracticeAccessLink/);
assert.doesNotMatch(landing, /redeemPracticeAccessLink/);
assert.match(landing, /robots/);

const landingUi = read("src/components/access/AccessLinkLanding.tsx");
assert.match(landingUi, /Вам предоставлен доступ к:/);
assert.match(landingUi, /Войти/);
assert.match(landingUi, /Зарегистрироваться/);
assert.match(landingUi, /Открыть доступ/);
assert.match(landingUi, /Перейти к продукту/);
assert.match(landingUi, /buildAuthRouteHref\("\/auth\/sign-in", returnPath\)/);

const authorUi = read("src/components/author-dashboard/AuthorPracticeAccessLinks.tsx");
assert.match(authorUi, /ACCESS_LINK_SECTION_TITLE/);
assert.match(authorUi, /ACCESS_LINK_SECTION_COPY/);
assert.match(authorUi, /ACCESS_LINK_CREATE_ORDINARY_LABEL/);
assert.match(authorUi, /ACCESS_LINK_CREATE_COURSE_LABEL/);
assert.match(authorUi, /expiresIn/);
assert.doesNotMatch(authorUi, /token_hash|rawToken/);

const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /AuthorPracticeAccessLinks/);

const deleteGuard = read("src/lib/author-products/course-access-levels.ts");
assert.match(deleteGuard, /practice_access_links/);
assert.match(deleteGuard, /activeAccessLinkCount/);

const phase4Checkout = read("src/lib/course-content/course-upgrade-order-api.ts");
assert.match(phase4Checkout, /course_upgrade/);
assert.doesNotMatch(phase4Checkout, /practice_access_links/);

const fulfill = read(
  "supabase/migrations/20260925120200_fulfill_tochka_course_upgrade.sql",
);
assert.match(fulfill, /grant_practice_access/);
assert.doesNotMatch(fulfill, /practice_access_links/);

const grantTs = read("src/lib/products/grant-access.ts");
assert.match(grantTs, /external_manual/);

assert.equal(ACCESS_LINK_SECTION_TITLE, "Доступ по ссылке");
assert.match(
  ACCESS_LINK_SECTION_COPY,
  /оплатил продукт вне Audiolad/,
);

console.log("practice-access-links-unit: ok");
