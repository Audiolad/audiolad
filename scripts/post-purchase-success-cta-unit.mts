import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildLibraryPurchasedHref,
  buildPaidAuthenticatedPrimaryHref,
} from "../src/lib/payments/checkout-result-cta";
import {
  readNestedAuthorSlug,
  toCheckoutStatusBody,
} from "../src/lib/payments/checkout-status-api";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function testPrimaryHrefUsesPracticePage() {
  assert.equal(
    buildPaidAuthenticatedPrimaryHref({
      authorSlug: "anna",
      practiceSlug: "morning",
    }),
    "/practice/anna/morning",
  );

  const body = toCheckoutStatusBody({
    status: "paid",
    practiceSlug: "morning",
    practiceTitle: "Утро",
    authorSlug: "anna",
    authenticated: true,
  });

  assert.equal(body.authorSlug, "anna");
  assert.equal(
    buildPaidAuthenticatedPrimaryHref(body),
    "/practice/anna/morning",
  );
}

function testFallbackWithoutAuthorSlug() {
  assert.equal(
    buildPaidAuthenticatedPrimaryHref({
      authorSlug: null,
      practiceSlug: "morning",
    }),
    "/my-practices?purchased=morning",
  );
  assert.equal(
    buildLibraryPurchasedHref("morning"),
    "/my-practices?purchased=morning",
  );
}

function testNoProfileRedirect() {
  const client = read(
    "src/app/(platform)/checkout/result/CheckoutResultClient.tsx",
  );
  const route = read("src/app/api/checkout/status/route.ts");

  assert.match(client, /Слушать сейчас/);
  assert.match(client, /Открыть в Аудиотеке/);
  assert.match(client, /buildPaidAuthenticatedPrimaryHref/);
  assert.doesNotMatch(client, /\/profile/);
  assert.doesNotMatch(client, /AUTO_REDIRECT|router\.push\(libraryHref\)/);
  assert.match(route, /authors!practices_author_id_fkey/);
  assert.match(route, /authorSlug/);
  assert.doesNotMatch(route, /practice_slug_snapshot, author/);
}

function testAuthorJoinReader() {
  assert.equal(readNestedAuthorSlug({ slug: "anna" }), "anna");
  assert.equal(readNestedAuthorSlug([{ slug: "anna" }]), "anna");
  assert.equal(readNestedAuthorSlug(null), null);
}

function testBoundaries() {
  const tochka = read("src/lib/payments/tochka-client.ts");
  const fulfill = read("src/lib/payments/fulfill-payment.ts");
  const orders = read("src/lib/orders/create-order-api.ts");
  const webhook = read("src/app/api/webhooks/tochka/route.ts");

  assert.doesNotMatch(tochka, /authorSlug|Слушать сейчас/);
  assert.doesNotMatch(fulfill, /authorSlug|Слушать сейчас/);
  assert.doesNotMatch(orders, /authorSlug|Слушать сейчас/);
  assert.doesNotMatch(webhook, /authorSlug|Слушать сейчас/);
}

testPrimaryHrefUsesPracticePage();
testFallbackWithoutAuthorSlug();
testNoProfileRedirect();
testAuthorJoinReader();
testBoundaries();

console.log("post-purchase-success-cta-unit: ok");
