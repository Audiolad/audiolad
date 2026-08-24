import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PRACTICE_BUY_SIGN_IN_INTRO,
  buildBuySignInHref,
  isPracticeProductSignInNext,
  resolveBuySignInReturnPath,
  resolveSignInIntroCopy,
} from "../src/lib/auth/buy-sign-in";
import { getSafeNextPath } from "../src/lib/auth/routes";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function test401HrefKeepsPracticeNext() {
  const href = buildBuySignInHref(
    "/practice/anna/morning",
    "/catalog",
  );

  assert.equal(href, "/auth/sign-in?next=%2Fpractice%2Fanna%2Fmorning");
  assert.match(href ?? "", /next=/);
  assert.equal(
    new URL(href ?? "", "https://audiolad.ru").searchParams.get("next"),
    "/practice/anna/morning",
  );
  assert.equal(
    resolveBuySignInReturnPath(undefined, "/practice/anna/morning?src=pdp"),
    "/practice/anna/morning?src=pdp",
  );
  assert.equal(buildBuySignInHref("", ""), null);
}

function testLoginReplaceReturnsToPdp() {
  const next = "/practice/anna/morning";
  const destination = getSafeNextPath(next);
  const signIn = read("src/app/(platform)/auth/sign-in/page.tsx");

  assert.equal(destination, next);
  assert.match(signIn, /getSafeNextPath\(searchParams\.get\("next"\)\)/);
  assert.match(signIn, /router\.replace\(destination\)/);
  assert.doesNotMatch(signIn, /\/api\/orders/);
}

function testAuthFlowDoesNotCreateOrder() {
  const signIn = read("src/app/(platform)/auth/sign-in/page.tsx");
  const helper = read("src/lib/auth/buy-sign-in.ts");
  const button = read("src/components/BuyPracticeButton.tsx");

  assert.doesNotMatch(signIn, /fetch\(["']\/api\/orders/);
  assert.doesNotMatch(helper, /\/api\/orders|checkout|createOrder/);
  assert.match(button, /buildBuySignInHref/);
  assert.match(button, /orderResponse\.status === 401/);
  assert.doesNotMatch(button, /window\.location\.pathname : "\/"/);
}

function testPracticeLoginCopy() {
  assert.equal(isPracticeProductSignInNext("/practice/anna/morning"), true);
  assert.equal(isPracticeProductSignInNext("/catalog"), false);
  assert.equal(
    resolveSignInIntroCopy("/practice/anna/morning"),
    PRACTICE_BUY_SIGN_IN_INTRO,
  );
  assert.equal(
    PRACTICE_BUY_SIGN_IN_INTRO,
    "Войдите, чтобы купить этот материал. После входа нажмите Купить ещё раз.",
  );

  const signIn = read("src/app/(platform)/auth/sign-in/page.tsx");
  assert.match(signIn, /resolveSignInIntroCopy\(searchParams\.get\("next"\)\)/);
}

function testBoundaries() {
  const pending = read("src/lib/library/pending-library-save.ts");
  const heart = read("src/lib/library/use-catalog-library-save.ts");
  const orders = read("src/app/api/orders/route.ts");
  const checkout = read("src/lib/orders/create-order-api.ts");

  assert.doesNotMatch(pending, /buildBuySignInHref|PRACTICE_BUY_SIGN_IN/);
  assert.doesNotMatch(heart, /buildBuySignInHref|PRACTICE_BUY_SIGN_IN/);
  assert.doesNotMatch(orders, /buildBuySignInHref|PRACTICE_BUY_SIGN_IN/);
  assert.doesNotMatch(checkout, /buildBuySignInHref|PRACTICE_BUY_SIGN_IN/);
}

test401HrefKeepsPracticeNext();
testLoginReplaceReturnsToPdp();
testAuthFlowDoesNotCreateOrder();
testPracticeLoginCopy();
testBoundaries();

console.log("buy-continuation-after-login-unit: ok");
