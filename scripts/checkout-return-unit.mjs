#!/usr/bin/env node
/**
 * Checkout return flow regression checks.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

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
  const route = read("src/app/api/checkout/status/route.ts");
  const ordersRoute = read("src/app/api/orders/[id]/route.ts");

  assert(route.includes("verifySignedCheckoutToken"), "status route verifies token");
  assert(route.includes("createServiceRoleClient"), "status route uses service role read");
  assert(route.includes("practiceSlug"), "status route returns practice slug");
  assert(!route.includes("user_id"), "status route does not expose user id");
  assert(!route.includes("amount_minor"), "status route does not expose amount");
  assert(ordersRoute.includes('if (!user)'), "orders route still requires auth");
}

function testTochkaReturnUrlIncludesToken() {
  const tochkaClient = read("src/lib/payments/tochka-client.ts");
  const paymentsRoute = read("src/app/api/payments/route.ts");

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
  const client = read("src/app/checkout/result/CheckoutResultClient.tsx");

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
  const page = read("src/app/(listener)/(library)/my-practices/page.tsx");
  const library = read("src/components/my-practices/MyPracticesLibrary.tsx");

  assert(page.includes("purchasedSlug"), "my-practices reads purchased query");
  assert(
    library.includes("Практика добавлена в Аудиотеку"),
    "library shows purchased toast",
  );
  assert(library.includes("highlighted"), "library can highlight purchased card");
}

function testLoggingAndWebhookUnchanged() {
  const fulfill = read("src/lib/payments/fulfill-payment.ts");
  const webhook = read("src/app/api/webhooks/tochka/route.ts");

  assert(
    fulfill.includes("fulfill_tochka_payment_transactional"),
    "fulfill uses transactional RPC",
  );
  assert(fulfill.includes("logCheckoutEvent"), "fulfill logs checkout events");
  assert(webhook.includes("fulfillSucceededTochkaPayment"), "webhook still fulfills payments");
  assert(webhook.includes("recordTochkaWebhookEvent"), "webhook writes ledger");
  assert(webhook.includes("tochka_webhook_verified"), "webhook verification logged");
  assert(
    webhook.includes("tochka_webhook_signature_invalid"),
    "invalid signature is logged",
  );
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
