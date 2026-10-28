import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { BusinessChromeAccessProvider } from "../src/components/business-app/BusinessAccessLine";
import BusinessHomeAccessCard from "../src/components/business-app/BusinessHomeAccessCard";
import { BusinessDomainProvider } from "../src/components/business-app/BusinessDomainProvider";
import { gracePlaybackUntil, resolveCustomerAccess } from "../src/lib/access-grants/policy";
import { resolveBusinessProxyAction } from "../src/lib/business-app/proxy-policy";
import { BUSINESS_GRACE_MS } from "../src/lib/business/plan";
import { mapBusinessSubscriptionRpcError, ownerCanPayFromThisBrowser } from "../src/lib/business/subscription-checkout";
import { BUSINESS_PAYMENT_RETURN_SIGN_IN_INTRO } from "../src/lib/access-grants/copy";
import { isBusinessCabinetReturnNext } from "../src/lib/access-grants/paths";
import { resolveSignInIntroCopy } from "../src/lib/auth/buy-sign-in";
import { businessCheckoutResultCard, buildBusinessSubscriptionPaidHref, buildBusinessSubscriptionSignInHref, isBusinessSubscriptionCheckout, type BusinessCheckoutResultView } from "../src/lib/payments/checkout-result-cta";
import type { BusinessOwnerHomeContext } from "../src/lib/business-app/domain";

const END = "2026-11-22T14:11:37.000Z";
const grant = {
  emailHash: "ab",
  userId: "user",
  kind: "business_new_client",
  startsAt: "2026-10-23T14:11:37.000Z",
  endsAt: END,
};

const atEnd = resolveCustomerAccess({
  now: new Date(END),
  emailConfirmed: true,
  grant,
  paidUntil: null,
});
assert.equal(atEnd.mode, "grace");
assert.equal(atEnd.player, true);
assert.equal(atEnd.endsAt, END);
assert.equal(atEnd.playbackUntil, gracePlaybackUntil(END));
assert.equal(Date.parse(atEnd.playbackUntil!) - Date.parse(END), BUSINESS_GRACE_MS);

const after = resolveCustomerAccess({
  now: new Date(Date.parse(END) + BUSINESS_GRACE_MS),
  emailConfirmed: true,
  grant,
  paidUntil: null,
});
assert.equal(after.mode, "offer");
assert.equal(after.player, false);
assert.equal(after.playbackUntil, null);

const offer = mapBusinessSubscriptionRpcError("offer_acceptance_required");
assert.equal(offer.href, "/documents/b2b-terms");
const owner = mapBusinessSubscriptionRpcError("not_organization_owner");
assert.equal(owner.href, "/onboarding");
assert.equal(mapBusinessSubscriptionRpcError("support_mode_consent_forbidden").href, null);
assert.equal(ownerCanPayFromThisBrowser(true, false), true);
assert.equal(ownerCanPayFromThisBrowser(true, true), false, "the hall device never pays");
assert.equal(ownerCanPayFromThisBrowser(false, false), false);

assert.equal(isBusinessSubscriptionCheckout("business_subscription"), true);
assert.match(buildBusinessSubscriptionPaidHref(), /business\.audiolad\.ru\/#dostup$/);

for (const api of ["/api/business/subscription/accept", "/api/business/subscription/checkout"]) {
  assert.equal(resolveBusinessProxyAction("business.audiolad.ru", api).action, "pass_through", api);
}
assert.equal(resolveBusinessProxyAction("audiolad.ru", "/api/business/subscription/checkout").action, "pass_through");

const ownerDomain: BusinessOwnerHomeContext = {
  status: "authenticated",
  owner: { userId: "owner", firstName: "Анна" },
  organizationId: "org",
  organizationName: "Кафе",
  location: null,
  canPay: true,
  offerAccepted: false,
  signals: null,
};
const managerDomain: BusinessOwnerHomeContext = { ...ownerDomain, canPay: false, offerAccepted: false };
const grace = { mode: "grace" as const, endsAt: END, graceEndsAt: gracePlaybackUntil(END) };

function card(domain: BusinessOwnerHomeContext, access: { mode: "grace" | "offer" | "trial"; endsAt: string; graceEndsAt?: string }) {
  return renderToStaticMarkup(
    <BusinessDomainProvider value={domain}>
      <BusinessChromeAccessProvider value={access}>
        <BusinessHomeAccessCard />
      </BusinessChromeAccessProvider>
    </BusinessDomainProvider>,
  );
}

const graceHtml = card(ownerDomain, grace);
assert.match(graceHtml, /data-mode="grace"/);
assert.match(graceHtml, /Музыка играет ещё/);
assert.match(graceHtml, /href="\/documents\/b2b-terms"/);
assert.match(graceHtml, /data-testid="biz-home-accept"/);
assert.doesNotMatch(graceHtml, /data-testid="biz-home-pay-button"/);
assert.doesNotMatch(graceHtml, /—/);

const accepted = card({ ...ownerDomain, offerAccepted: true }, grace);
assert.match(accepted, /data-testid="biz-home-pay-button"/);
assert.match(accepted, /Оплатить/);
assert.match(accepted, /Автосписания нет/);
assert.doesNotMatch(accepted, /href="https:\/\/(?!business\.audiolad\.ru)/);

const hidden = card(managerDomain, grace);
assert.doesNotMatch(hidden, /data-testid="biz-home-pay"/, "a manager does not see payment");

assert.match(readFileSync("src/app/api/business/player/track-url/route.ts", "utf8"), /access\.mode === "offer"/);
assert.match(readFileSync("src/lib/business-workspace/model.ts", "utf8"), /status === "grace"/);

const cabinet = "https://business.audiolad.ru/#dostup";
const signIn = buildBusinessSubscriptionSignInHref();
assert.equal(signIn, "/auth/sign-in?next=%2Fauth%2Fbusiness-cabinet");
assert.equal(isBusinessCabinetReturnNext("/auth/business-cabinet"), true);
assert.equal(resolveSignInIntroCopy("/auth/business-cabinet"), BUSINESS_PAYMENT_RETURN_SIGN_IN_INTRO);
assert.doesNotMatch(BUSINESS_PAYMENT_RETURN_SIGN_IN_INTRO, /Аудиотек|практик/i);

const views: BusinessCheckoutResultView[] = [
  "paid_authenticated",
  "paid_unauthenticated",
  "processing",
  "failed",
  "cancelled",
  "refunded",
];
for (const view of views) {
  for (const authenticated of view === "paid_authenticated" ? [true] : [true, false]) {
    const card = businessCheckoutResultCard(view, authenticated);
    const blob = `${card.title} ${card.description} ${card.actionLabel} ${card.secondaryLabel ?? ""}`;
    assert.doesNotMatch(blob, /Аудиотек|практик|каталог/i, `${view} ${authenticated}`);
    assert.doesNotMatch(blob, /—/, view);
    const hrefs = [card.actionHref, card.secondaryHref].filter((href): href is string => Boolean(href));
    assert.ok(hrefs.length > 0, view);
    const expectsSignIn = view === "paid_unauthenticated" || !authenticated;
    if (expectsSignIn) {
      assert.ok(hrefs.includes(signIn), `${view} unsigned`);
      assert.match(blob, /Войти и вернуться в кабинет/);
    } else if (view === "processing") {
      assert.equal(card.actionHref, null);
      assert.equal(card.secondaryHref, cabinet);
      assert.equal(card.secondaryLabel, "Вернуться в кабинет");
    } else {
      assert.equal(card.actionHref, cabinet);
      assert.equal(card.actionLabel, "Вернуться в кабинет");
    }
  }
}

const catalogClient = readFileSync("src/app/(platform)/checkout/result/CheckoutResultClient.tsx", "utf8");
assert.match(catalogClient, /Перейти в каталог/);
assert.match(catalogClient, /практика автоматически появится в вашей Аудиотеке/);
assert.match(catalogClient, /Практика добавлена в ваш аккаунт/);
const returnPage = readFileSync("src/app/(platform)/auth/business-cabinet/page.tsx", "utf8");
assert.match(returnPage, /buildBusinessSubscriptionPaidHref/);
assert.doesNotMatch(returnPage, /activateBusinessTrial/);
assert.match(readFileSync("src/lib/business-app/domain.ts", "utf8"), /ownerCanPayFromThisBrowser/);
for (const route of ["src/app/api/business/subscription/checkout/route.ts", "src/app/api/business/subscription/accept/route.ts"]) {
  const source = readFileSync(route, "utf8");
  assert.match(source, /businessPointSessionAlive/);
  assert.ok(source.indexOf("businessPointSessionAlive") < source.indexOf(".rpc("), route);
}

console.log("business-subscription-payment-unit: ok");
