#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  accessLinkAuthorErrorMessage,
  accessLinkPublicErrorMessage,
  mapAccessLinkListItem,
} from "../src/lib/products/access-links.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const listed = mapAccessLinkListItem({
  id: "link-1",
  target_access_level: 2,
  status: "redeemed",
  created_at: "2026-09-06T12:00:00.000Z",
  expires_at: null,
  redeemed_at: "2026-09-06T13:00:00.000Z",
  revoked_at: null,
});

assert.equal(listed.status, "redeemed");
assert.equal(listed.targetAccessLevel, 2);
assert.equal("tokenHash" in listed, false);
assert.equal("token_hash" in listed, false);
assert.equal("accessUrl" in listed, false);

assert.equal(accessLinkPublicErrorMessage("already_redeemed_by_you"), "Доступ уже открыт.");
assert.equal(accessLinkPublicErrorMessage("link_already_used"), "Эта ссылка уже использована.");
assert.doesNotMatch(accessLinkPublicErrorMessage("link_already_used"), /@|email|user/);
assert.match(accessLinkAuthorErrorMessage("target_level_not_configured"), /уровн/i);

const ui = read("src/components/author-dashboard/AuthorPracticeAccessLinks.tsx");
assert.match(ui, /ACCESS_LINK_COPY_LABEL/);
assert.match(ui, /ACCESS_LINK_ONCE_HINT/);
assert.match(ui, /Скрыть ссылку/);
assert.match(ui, /Отозвать/);
assert.match(ui, /Использована/);
assert.doesNotMatch(ui, /email|телефон|phone/);
assert.doesNotMatch(ui, /tochka|\/api\/orders|оплат/i);

const landing = read("src/components/access/AccessLinkLanding.tsx");
assert.doesNotMatch(landing, /practice_id|token_hash|author_id/);
assert.doesNotMatch(landing, /Купить|оплат|заказ/i);

const redeem = read("src/app/api/access/[token]/redeem/route.ts");
assert.doesNotMatch(redeem, /create_order|tochka|payment/);
assert.match(redeem, /auth\.getUser/);

console.log("author-practice-access-links-unit: ok");
