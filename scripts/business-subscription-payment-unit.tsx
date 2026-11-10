import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import AuthBottomNav, { CoffeeAuthProvider } from "../src/components/auth/AuthHostNavigation";
import { BusinessChromeAccessProvider } from "../src/components/business-app/BusinessAccessLine";
import BusinessHomeAccessCard, { BusinessPayError } from "../src/components/business-app/BusinessHomeAccessCard";
import { BusinessDomainProvider } from "../src/components/business-app/BusinessDomainProvider";
import { gracePlaybackUntil, resolveCustomerAccess } from "../src/lib/access-grants/policy";
import { resolveBusinessProxyAction } from "../src/lib/business-app/proxy-policy";
import { BUSINESS_GRACE_MS } from "../src/lib/business/plan";
import { BUSINESS_RECEIPT_EMAIL_META_KEY, businessReceiptEmailToRemember, mapBusinessSubscriptionRpcError, normalizeBusinessReceiptEmail, ownerCanPayFromThisBrowser, resolveBusinessReceiptEmail, savedBusinessReceiptEmail } from "../src/lib/business/subscription-checkout";
import { BUSINESS_PAYMENT_RETURN_SIGN_IN_INTRO } from "../src/lib/access-grants/copy";
import { isBusinessCabinetReturnNext } from "../src/lib/access-grants/paths";
import { resolveSignInIntroCopy } from "../src/lib/auth/buy-sign-in";
import { CHECKOUT_RETURN_SITE_COOKIE, businessCheckoutResultCard, buildBusinessSubscriptionPaidHref, readCheckoutReturnSiteCookie, resolveCheckoutReturnSite, buildBusinessSubscriptionSignInHref, isBusinessSubscriptionCheckout, type BusinessCheckoutResultView } from "../src/lib/payments/checkout-result-cta";
import { buildCreatePaymentData } from "../src/lib/payments/tochka-client";
import type { TochkaConfig } from "../src/lib/payments/tochka-config";
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
assert.equal(offer.href, "/documents/business-offer");
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
  owner: { userId: "owner", firstName: "Анна", lastName: "Иванова" },
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
assert.match(graceHtml, /Оплатите, чтобы музыка продолжала играть\./);
assert.doesNotMatch(graceHtml, /[её]щ[её] \d+ (день|дня|дней)|остановится|льготн/u, "no grace countdown (253821e0)");
assert.match(graceHtml, /href="\/documents\/business-offer"/);
assert.match(graceHtml, /data-testid="biz-home-accept"/);
assert.doesNotMatch(graceHtml, /data-testid="biz-home-pay-button"/);
assert.doesNotMatch(graceHtml, /—/);

// Every «Принять условия» says what is accepted, once per account, and links the document (in-app sheet, no new PWA window).
assert.match(graceHtml, /data-testid="biz-home-accept-note"/);
assert.match(graceHtml, /один раз для всего аккаунта/);
assert.match(graceHtml, /<a href="\/documents\/business-offer"(?![^>]*target=)[^>]*aria-haspopup="dialog"[^>]*>Договор-оферта «АудиоЛад Бизнес»<\/a>/);
assert.match(graceHtml, /data-offer-version="offer-v2-2026-11-09"/);
assert.match(graceHtml, /редакция 2 от 09\.11\.2026/);
assert.match(graceHtml, /Перед первой оплатой примите договор-оферту/);
assert.ok(graceHtml.indexOf("biz-home-accept-note") < graceHtml.indexOf('data-testid="biz-home-accept"'), "note above the button");

{
  // Edition 2 (09.11.2026): an owner who accepted edition 1 is asked once more, per account, before the next payment.
  const pending = card({ ...ownerDomain, offerAccepted: false, offerNewEditionPending: true }, grace);
  assert.match(pending, /Опубликована новая редакция договора-оферты\. Примите её перед следующей оплатой – один раз для всего аккаунта и всех точек\./);
  assert.match(pending, /data-testid="biz-home-accept"/);
  assert.doesNotMatch(pending, /data-testid="biz-home-pay-button"/, "checkout needs the current edition");
  assert.doesNotMatch(pending, /Перед первой оплатой/);
  assert.doesNotMatch(pending, /—/);
  // Any warning to accept links straight to the «Принять условия» button next to it.
  const err = renderToStaticMarkup(<BusinessPayError error={{ code: "offer_acceptance_required", href: "/documents/business-offer" }} acceptAnchorId="biz-offer-accept-x" />);
  assert.match(err, /<a href="#biz-offer-accept-x"[^>]*data-testid="biz-home-pay-error-accept-link"[^>]*>Перейти и принять<\/a>/);
  assert.match(pending, /id="biz-offer-accept-[A-Za-z0-9_-]+"[^>]*data-testid="biz-home-accept"/);
  // The regular tariff per point is shown before payment, as section 4 item 1 of the offer says.
  const multi = card({ ...ownerDomain, offerAccepted: true, pilotSlots: true, locations: [{ status: "active" }, { status: "active" }] } as unknown as BusinessOwnerHomeContext, grace);
  assert.match(multi, /Тариф – 799 ₽ за одну точку на 30 дней\. Итого 1598 ₽ за все активные точки\./);
  // Access is never gated on the offer: only the pay controls read it.
  for (const f of ["src/lib/access-grants/policy.ts", "src/lib/business-app/proxy-policy.ts"]) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /offerAccepted|offerNewEditionPending|business_offer_edition/, f);
  }
}
const accepted = card({ ...ownerDomain, offerAccepted: true }, grace);
assert.doesNotMatch(accepted, /biz-home-receipt-email/, "account with email: no receipt field");
const guestStart = card({ ...ownerDomain, offerAccepted: true, needsReceiptEmail: true }, grace);
assert.match(guestStart, /data-testid="biz-home-receipt-email-input"/);
assert.match(guestStart, /type="email"/);
assert.match(guestStart, /Почта для чека/);
assert.match(guestStart, /В аккаунте нет почты\. Укажите, куда прислать чек об оплате\./);
assert.ok(guestStart.indexOf("biz-home-receipt-email") < guestStart.indexOf("biz-home-pay-button"), "email before pay");
assert.doesNotMatch(guestStart, /—/);
const guestNotAccepted = card({ ...ownerDomain, needsReceiptEmail: true }, grace);
assert.doesNotMatch(guestNotAccepted, /biz-home-receipt-email/, "email only after the terms");

// Receipt email: account email wins; a guest-start account (no email) can type one.
assert.equal(resolveBusinessReceiptEmail("owner@example.test", "other@example.test"), "owner@example.test");
assert.equal(resolveBusinessReceiptEmail(null, " Guest@Example.Test "), "guest@example.test");
assert.equal(resolveBusinessReceiptEmail("", undefined), null);
assert.equal(resolveBusinessReceiptEmail(undefined, "not-an-email"), null);
assert.equal(normalizeBusinessReceiptEmail(123), null);
assert.equal(normalizeBusinessReceiptEmail("a@b"), null);
assert.equal(normalizeBusinessReceiptEmail("a b@c.ru"), null);
assert.equal(normalizeBusinessReceiptEmail(`${"x".repeat(250)}@c.ru`), null);
assert.equal(normalizeBusinessReceiptEmail("a@c.ru\n"), "a@c.ru");
const checkoutSource = readFileSync("src/app/api/business/subscription/checkout/route.ts", "utf8");
assert.match(checkoutSource, /resolveBusinessReceiptEmail\(user\.email, body\?\.receipt_email, savedReceiptEmail\)/);

// t1343u: the receipt email of an account without email is remembered and prefilled.
assert.equal(BUSINESS_RECEIPT_EMAIL_META_KEY, "receipt_email");
assert.equal(savedBusinessReceiptEmail({ receipt_email: " Guest@Example.Test " }), "guest@example.test");
assert.equal(savedBusinessReceiptEmail({ receipt_email: "bad" }), null);
assert.equal(savedBusinessReceiptEmail(null), null);
assert.equal(savedBusinessReceiptEmail({ first_name: "Анна" }), null);
// Typed wins over remembered; remembered is used when nothing is typed; account email still wins.
assert.equal(resolveBusinessReceiptEmail(null, "new@example.test", "old@example.test"), "new@example.test");
assert.equal(resolveBusinessReceiptEmail(null, undefined, "old@example.test"), "old@example.test");
assert.equal(resolveBusinessReceiptEmail(null, "not-an-email", "old@example.test"), "old@example.test");
assert.equal(resolveBusinessReceiptEmail("owner@example.test", undefined, "old@example.test"), "owner@example.test");
// Remember only for an account without email, only when new.
assert.equal(businessReceiptEmailToRemember(null, "guest@example.test", null), "guest@example.test");
assert.equal(businessReceiptEmailToRemember("", "new@example.test", "old@example.test"), "new@example.test");
assert.equal(businessReceiptEmailToRemember(null, "old@example.test", "old@example.test"), null);
assert.equal(businessReceiptEmailToRemember("owner@example.test", "owner@example.test", null), null);
assert.equal(businessReceiptEmailToRemember(null, "bad", null), null);
// Saved after the payment link exists (best effort), only the one key – user_metadata merges.
assert.ok(checkoutSource.indexOf("businessReceiptEmailToRemember(") > checkoutSource.indexOf("if (!started.ok)"), "remember after checkout start");
assert.match(checkoutSource, /auth\.admin\.updateUserById\(user\.id, \{\s*user_metadata: \{ \[BUSINESS_RECEIPT_EMAIL_META_KEY\]: rememberEmail \}/);
assert.doesNotMatch(checkoutSource, /console\.error\([^)]*rememberEmail/, "no email in logs");
{
  const prefilled = card({ ...ownerDomain, offerAccepted: true, needsReceiptEmail: true, savedReceiptEmail: "guest@example.test" }, grace);
  assert.match(prefilled, /data-testid="biz-home-receipt-email-input"/);
  assert.match(prefilled, /value="guest@example\.test"/, "remembered email prefilled");
  assert.match(prefilled, /Чек придёт на эту почту\. Изменить её можно здесь или в профиле\./);
  assert.doesNotMatch(prefilled, /В аккаунте нет почты/);
  assert.doesNotMatch(prefilled, /—/);
  assert.match(guestStart, /Мы запомним её для следующих оплат\./);
  assert.match(guestStart, /value=""/);
  const domainSource = readFileSync("src/lib/business-app/domain.ts", "utf8");
  assert.match(domainSource, /savedReceiptEmail = needsReceiptEmail \? savedBusinessReceiptEmail\(user\.user_metadata\) : null/);
  const actions = readFileSync("src/app/business-app/profile/actions.ts", "utf8");
  assert.match(actions, /export async function saveBusinessReceiptEmail/);
  assert.match(actions, /updateUser\(\{ data: \{ \[BUSINESS_RECEIPT_EMAIL_META_KEY\]: receiptEmail \} \}\)/);
  const page = readFileSync("src/app/business-app/profile/page.tsx", "utf8");
  assert.match(page, /domain\.needsReceiptEmail \? \(\s*<BusinessReceiptEmailForm receiptEmail=\{domain\.savedReceiptEmail \?\? null\} \/>/);
  assert.match(page, /Сюда же приходят чеки об оплате\./);
}
assert.match(checkoutSource, /error: "receipt_email_required" \}, \{ status: 400 \}/);
assert.match(readFileSync("src/lib/business-app/domain.ts", "utf8"), /needsReceiptEmail = canPay && !\(user\.email\?\.trim\(\) \?\? ""\)/);
assert.match(accepted, /data-testid="biz-home-pay-button"/);
// Next to «Оплатить» the same offer link and edition, every time.
assert.match(accepted, /data-testid="biz-home-terms-accepted"/);
assert.match(accepted, /<a href="\/documents\/business-offer"(?![^>]*target=)[^>]*aria-haspopup="dialog"[^>]*>Договор-оферта «АудиоЛад Бизнес»<\/a>/);
assert.ok(accepted.indexOf("biz-home-terms-accepted") < accepted.indexOf("biz-home-pay-button"), "offer link before pay");
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
assert.match(returnPage, /businessReturnTarget\(\{ site, cabinet: true \}\)/);
assert.doesNotMatch(returnPage, /activateBusinessTrial/);
assert.match(readFileSync("src/lib/business-app/domain.ts", "utf8"), /ownerCanPayFromThisBrowser/);
for (const route of ["src/app/api/business/subscription/checkout/route.ts", "src/app/api/business/subscription/accept/route.ts"]) {
  const source = readFileSync(route, "utf8");
  assert.match(source, /businessHallDeviceLocked/);
  assert.ok(source.indexOf("businessHallDeviceLocked()") < source.indexOf(".rpc("), route);
}



// Return markers affect only the two URLs; the provider remains on the configured apex.
const config: TochkaConfig = {
  apiBaseUrl: "https://provider.test", jwtToken: "test", customerCode: "customer",
  merchantId: null, clientId: "client", paymentModes: ["card", "sbp"],
  useReceipt: false, taxSystemCode: null, receiptVatType: null,
  receiptPaymentMethod: "full_payment", receiptPaymentObject: "service",
  siteUrl: "https://audiolad.ru",
};
const paymentInput = {
  orderId: "test-order", checkoutToken: "test-token", amountMinor: 79900,
  purpose: "Test purpose", consumerId: "user", customerEmail: "test@example.test", itemName: "Test item",
};
for (const useReceipt of [false, true]) {
  const receiptConfig: TochkaConfig = { ...config, useReceipt, taxSystemCode: "patent", receiptVatType: "none" };
  const legacy = buildCreatePaymentData(receiptConfig, paymentInput);
  assert.equal(legacy.redirectUrl, "https://audiolad.ru/checkout/result?order_id=test-order&token=test-token");
  assert.equal(legacy.failRedirectUrl, `${legacy.redirectUrl}&status=failed`);
  assert.deepEqual(buildCreatePaymentData(receiptConfig, { ...paymentInput, returnSite: undefined }), legacy);
  const coffee = buildCreatePaymentData(receiptConfig, { ...paymentInput, returnSite: "coffee" });
  assert.equal(coffee.redirectUrl, `${legacy.redirectUrl}&site=coffee`);
  assert.equal(coffee.failRedirectUrl, `${legacy.failRedirectUrl}&site=coffee`);
  assert.deepEqual(coffee, { ...legacy, redirectUrl: coffee.redirectUrl, failRedirectUrl: coffee.failRedirectUrl });
}

const coffeeFlag = process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
try {
  for (const enabled of [undefined, "1"]) {
    if (enabled) process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = enabled;
    else delete process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
    for (const site of [undefined, "evil", "Coffee", "https://evil.test", "coffee"]) {
      for (const view of views) {
        for (const authenticated of [false, true]) {
          const legacy = businessCheckoutResultCard(view, authenticated);
          const actual = businessCheckoutResultCard(view, authenticated, site);
          if (!enabled || site !== "coffee") {
            assert.deepEqual(actual, legacy);
            continue;
          }
          const target = view === "paid_authenticated" || (authenticated && view !== "paid_unauthenticated")
            ? "https://coffee.audiolad.ru/cabinet#dostup"
            : "https://coffee.audiolad.ru/auth/sign-in?next=%2Fauth%2Fbusiness-cabinet%3Fsite%3Dcoffee";
          assert.deepEqual(actual, {
            ...legacy,
            actionHref: view === "processing" ? null : target,
            secondaryHref: view === "processing" ? target : null,
          });
        }
      }
    }
  }
} finally {
  if (coffeeFlag === undefined) delete process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
  else process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = coffeeFlag;
}
const checkoutRoute = readFileSync("src/app/api/business/subscription/checkout/route.ts", "utf8");
assert.match(checkoutRoute, /isCoffeeHostRequest\(request.headers\) \? "coffee" : undefined/);
assert.match(checkoutRoute, /returnSite,/);
assert.match(catalogClient, /const siteParam = searchParams.get\("site"\)/);
assert.match(catalogClient, /readCheckoutReturnSiteCookie\(document\.cookie\)/);
assert.match(catalogClient, /resolveCheckoutReturnSite\(returnSiteCookie, siteParam\)/);
assert.match(checkoutRoute, /response\.cookies\.set\(CHECKOUT_RETURN_SITE_COOKIE, returnSite \?\? "business"/);
assert.match(checkoutRoute, /getSupabaseCookieOptions\(hostnameFromHeaders\(request\.headers\)\)/);
// Latest start wins over the marker of a reused pending link (business -> coffee and coffee -> business).
assert.equal(CHECKOUT_RETURN_SITE_COOKIE, "al_checkout_return_site");
assert.equal(resolveCheckoutReturnSite("coffee", null), "coffee");
assert.equal(resolveCheckoutReturnSite("coffee", "business"), "coffee");
assert.equal(resolveCheckoutReturnSite("business", "coffee"), undefined);
assert.equal(resolveCheckoutReturnSite(null, "coffee"), "coffee");
assert.equal(resolveCheckoutReturnSite(null, null), undefined);
for (const bad of ["Coffee", "https://evil.test", "coffee ", "", "evil"]) {
  assert.equal(resolveCheckoutReturnSite(bad, null), undefined);
  assert.equal(resolveCheckoutReturnSite(bad, "coffee"), "coffee");
  assert.equal(resolveCheckoutReturnSite(null, bad), undefined);
}
assert.equal(readCheckoutReturnSiteCookie("a=1; al_checkout_return_site=coffee; b=2"), "coffee");
assert.equal(readCheckoutReturnSiteCookie("x_al_checkout_return_site=coffee"), null);
assert.equal(readCheckoutReturnSiteCookie(""), null);
assert.match(catalogClient, /businessSubscription && isBusinessCheckoutResultView/);
assert.match(catalogClient, /businessCheckoutResultCard\(viewState, status\?\.authenticated === true, returnSite\)/);
// Polling and manual re-check keep the page URL (and site marker) intact.
assert.doesNotMatch(catalogClient, /router\.replace|history\.replaceState|window\.location\s*=/);

const authNav = renderToStaticMarkup(<CoffeeAuthProvider><AuthBottomNav /></CoffeeAuthProvider>);
for (const href of ["/", "/cabinet", "/documents"]) assert.ok(authNav.includes(`href="${href}"`));
assert.doesNotMatch(authNav, /href="\/(?:catalog|my-practices|playlists|profile)"/);
const platformLayout = readFileSync("src/app/(platform)/layout.tsx", "utf8");
assert.match(platformLayout, /isCoffeeHostRequest\(await headers\(\)\)/);
assert.ok(platformLayout.indexOf("return <CoffeeAuthProvider>") < platformLayout.indexOf("return <PlatformProviders>"));

console.log("business-subscription-payment-unit: ok");
