#!/usr/bin/env node
/**
 * Checkout return flow regression checks.
 */
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const ROOT = "/var/www/audiolad/.worktrees/fix-checkout-return";

async function testSignedCheckoutToken() {
  const { execFileSync } = await import("node:child_process");
  execFileSync(
    "npx",
    ["tsx", "scripts/checkout-return-token-unit.ts"],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        CHECKOUT_STATUS_SECRET: "unit-test-checkout-secret",
      },
    },
  );
}

function testStatusEndpointContract() {
  const route = readFileSync(
    `${ROOT}/src/app/api/checkout/status/route.ts`,
    "utf8",
  );
  const ordersRoute = readFileSync(
    `${ROOT}/src/app/api/orders/[id]/route.ts`,
    "utf8",
  );

  assert(route.includes("verifySignedCheckoutToken"), "status route verifies token");
  assert(route.includes("createServiceRoleClient"), "status route uses service role read");
  assert(route.includes("practiceSlug"), "status route returns practice slug");
  assert(!route.includes("user_id"), "status route does not expose user id");
  assert(!route.includes("amount_minor"), "status route does not expose amount");
  assert(ordersRoute.includes('if (!user)'), "orders route still requires auth");
}

function testTochkaReturnUrlIncludesToken() {
  const tochkaClient = readFileSync(
    `${ROOT}/src/lib/payments/tochka-client.ts`,
    "utf8",
  );
  const paymentsRoute = readFileSync(
    `${ROOT}/src/app/api/payments/route.ts`,
    "utf8",
  );

  assert(
    tochkaClient.includes("checkoutToken"),
    "tochka client accepts checkout token",
  );
  assert(
    tochkaClient.includes("buildCheckoutResultQuery"),
    "tochka client builds signed checkout return url",
  );
  assert(
    paymentsRoute.includes("createSignedCheckoutToken"),
    "payments route creates checkout token",
  );
  assert(
    paymentsRoute.includes("checkout_token"),
    "payments route stores checkout token in metadata",
  );
}

function testCheckoutResultClientFlow() {
  const client = readFileSync(
    `${ROOT}/src/app/checkout/result/CheckoutResultClient.tsx`,
    "utf8",
  );

  assert(client.includes("/api/checkout/status"), "client polls checkout status endpoint");
  assert(!client.includes("/api/orders/"), "client no longer polls auth-only orders endpoint");
  assert(!client.includes("/first-audio-course"), "hardcoded first-audio-course CTA removed");
  assert(!client.includes("Вернуться к аудиолекции"), "old error CTA removed");
  assert(client.includes("Оплата получена"), "paid success title present");
  assert(client.includes("Перейти в Аудиотеку"), "library CTA present");
  assert(client.includes("Платёж обрабатывается"), "processing state present");
  assert(client.includes("Не удалось открыть информацию об этом заказе"), "invalid token copy present");
  assert(client.includes("/auth/sign-in?next="), "sign-in redirect to library present");
  assert(client.includes("overflow-x-hidden"), "mobile overflow guard present");
}

function testLibraryPurchasedToast() {
  const page = readFileSync(
    `${ROOT}/src/app/(listener)/(library)/my-practices/page.tsx`,
    "utf8",
  );
  const library = readFileSync(
    `${ROOT}/src/components/my-practices/MyPracticesLibrary.tsx`,
    "utf8",
  );

  assert(page.includes("purchasedSlug"), "my-practices reads purchased query");
  assert(
    library.includes("Практика добавлена в Аудиотеку"),
    "library shows purchased toast",
  );
  assert(library.includes("highlighted"), "library can highlight purchased card");
}

function testLoggingAndWebhookUnchanged() {
  const fulfill = readFileSync(`${ROOT}/src/lib/payments/fulfill-payment.ts`, "utf8");
  const webhook = readFileSync(
    `${ROOT}/src/app/api/webhooks/tochka/route.ts`,
    "utf8",
  );

  assert(fulfill.includes("grant_practice_purchase_access"), "grant RPC unchanged");
  assert(fulfill.includes("logCheckoutEvent"), "fulfill logs checkout events");
  assert(webhook.includes("fulfillSucceededTochkaPayment"), "webhook still fulfills payments");
  assert(webhook.includes("tochka_webhook_verified"), "webhook verification logged");
}

async function main() {
  await testSignedCheckoutToken();
  testStatusEndpointContract();
  testTochkaReturnUrlIncludesToken();
  testCheckoutResultClientFlow();
  testLibraryPurchasedToast();
  testLoggingAndWebhookUnchanged();
  console.log("checkout-return-unit: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
