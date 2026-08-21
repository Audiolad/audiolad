#!/usr/bin/env node
/**
 * Platform-owner sales visibility — targeted unit tests (no production DB).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADMIN_NAV_ITEMS,
  getVisibleAdminNavItems,
} from "@/lib/admin/nav";
import {
  buildPlatformOwnerSaleSubject,
  detectAdminSaleBuyerKind,
  formatAdminSaleAmount,
  resolvePlatformOwnerSaleNotifyIntent,
  shouldNotifyPlatformOwnerOfSale,
} from "@/lib/admin/sales";
import { mapAdminSaleListItem } from "@/lib/admin/sales-queries";
import {
  createAdminSalesDetailHandler,
  createAdminSalesListHandler,
} from "@/lib/admin/sales-route-handlers";
import type { PlatformAccessSnapshot } from "@/lib/auth/platform-access";
import {
  PLATFORM_ROLE_PERMISSIONS,
  resolvePermissionsForRoles,
  rolesGrantPermission,
  type PlatformTeamRole,
} from "@/lib/auth/platform-permissions";
import {
  PLATFORM_OWNER_SALE_MESSAGE_TYPE,
  buildPlatformOwnerSaleDedupKey,
  resolveOperationalEmailDeliverySendIntent,
} from "@/lib/email/operational-deliveries";
import { sendPlatformOwnerSaleEmail } from "@/lib/email/send-platform-owner-sale-email";
import {
  buildPlatformOwnerSaleEmailSubject,
  renderPlatformOwnerSaleEmailHtml,
  renderPlatformOwnerSaleEmailText,
} from "@/lib/email/templates/platform-owner-sale";
import { brandEmailTemplateRenderer } from "@/lib/email/templates/renderer";
import { notifyPlatformOwnerOfConfirmedSale } from "@/lib/payments/notify-platform-owner-sale";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath: string) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

function accessForRoles(roles: PlatformTeamRole[]): PlatformAccessSnapshot {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    roles,
    permissions: resolvePermissionsForRoles(roles),
    usedLegacyFallback: false,
  };
}

const SALE = {
  paymentId: "11111111-1111-4111-8111-111111111111",
  orderId: "22222222-2222-4222-8222-222222222222",
  paidAt: "2026-08-21T10:00:00.000Z",
  buyerUserId: "33333333-3333-4333-8333-333333333333",
  buyerName: "Анна Покупатель",
  buyerEmail: "anna@example.test",
  productTitle: "Медитация на деньги",
  authorId: "44444444-4444-4444-8444-444444444444",
  authorName: "Оля Невская",
  amountMinor: 149000,
  currency: "RUB",
  paymentStatus: "succeeded",
  orderStatus: "paid",
  buyerKind: "external" as const,
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return {
    ok: status >= 200 && status < 300,
    response: {
      status,
      json: async () => body,
    },
  };
}

async function testNotifyOnlyOnConfirmedSuccess() {
  assert.equal(
    shouldNotifyPlatformOwnerOfSale({
      ok: true,
      paymentStatus: "succeeded",
      isTest: false,
      paymentId: SALE.paymentId,
      orderId: SALE.orderId,
    }),
    true,
    "confirmed success notifies",
  );
  assert.equal(
    shouldNotifyPlatformOwnerOfSale({
      ok: true,
      paymentStatus: "pending",
      isTest: false,
      paymentId: SALE.paymentId,
      orderId: SALE.orderId,
    }),
    false,
    "pending does not notify",
  );
  assert.equal(
    shouldNotifyPlatformOwnerOfSale({
      ok: true,
      paymentStatus: "created",
      isTest: false,
      paymentId: SALE.paymentId,
      orderId: SALE.orderId,
    }),
    false,
    "created does not notify",
  );
  assert.equal(
    shouldNotifyPlatformOwnerOfSale({
      ok: false,
      paymentStatus: "succeeded",
      isTest: false,
      paymentId: SALE.paymentId,
      orderId: SALE.orderId,
    }),
    false,
    "failed fulfill does not notify",
  );
  assert.equal(
    shouldNotifyPlatformOwnerOfSale({
      ok: true,
      paymentStatus: "succeeded",
      isTest: true,
      paymentId: SALE.paymentId,
      orderId: SALE.orderId,
    }),
    false,
    "test payment does not notify",
  );

  const sendCalls: unknown[] = [];
  const pendingClient = {
    from(table: string) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => {
          if (table === "payments") {
            return {
              data: {
                id: SALE.paymentId,
                order_id: SALE.orderId,
                status: "pending",
                amount_minor: SALE.amountMinor,
                currency: "RUB",
                confirmed_at: null,
                created_at: SALE.paidAt,
                is_test: false,
              },
              error: null,
            };
          }
          throw new Error(`unexpected table ${table}`);
        },
      };
    },
  };

  await notifyPlatformOwnerOfConfirmedSale({
    paymentId: SALE.paymentId,
    orderId: SALE.orderId,
    supabase: pendingClient as never,
    send: async (input) => {
      sendCalls.push(input);
      return { ok: true };
    },
  });
  assert.equal(sendCalls.length, 0, "pending payment never reaches SMTP");

  const succeededClient = {
    from(table: string) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => {
          if (table === "payments") {
            return {
              data: {
                id: SALE.paymentId,
                order_id: SALE.orderId,
                status: "succeeded",
                amount_minor: SALE.amountMinor,
                currency: "RUB",
                confirmed_at: SALE.paidAt,
                created_at: SALE.paidAt,
                is_test: false,
              },
              error: null,
            };
          }
          if (table === "orders") {
            return {
              data: {
                id: SALE.orderId,
                user_id: SALE.buyerUserId,
                status: "paid",
                practice_title_snapshot: SALE.productTitle,
                author_id_snapshot: SALE.authorId,
                paid_at: SALE.paidAt,
                checkout_origin_path: "/practice/meditatsiya-na-dengi",
              },
              error: null,
            };
          }
          if (table === "profiles") {
            return {
              data: {
                id: SALE.buyerUserId,
                email: SALE.buyerEmail,
                full_name: SALE.buyerName,
              },
              error: null,
            };
          }
          if (table === "authors") {
            return {
              data: { id: SALE.authorId, name: SALE.authorName },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      };
    },
  };

  await notifyPlatformOwnerOfConfirmedSale({
    paymentId: SALE.paymentId,
    orderId: SALE.orderId,
    supabase: succeededClient as never,
    send: async (input) => {
      sendCalls.push(input);
      return { ok: true };
    },
  });
  assert.equal(sendCalls.length, 1, "confirmed success sends once");
  assert.equal(
    (sendCalls[0] as { productTitle: string }).productTitle,
    SALE.productTitle,
  );
}

function createDeliveryClient(existing: { status: "pending" | "sent" | "failed" } | null) {
  const rows = existing
    ? [
        {
          id: "delivery-1",
          dedup_key: buildPlatformOwnerSaleDedupKey(SALE.paymentId),
          message_type: PLATFORM_OWNER_SALE_MESSAGE_TYPE,
          application_id: null,
          recipient_email: "1@audiolad.ru",
          status: existing.status,
          attempt_count: 1,
          last_attempt_at: SALE.paidAt,
          sent_at: existing.status === "sent" ? SALE.paidAt : null,
          last_error: null,
          created_at: SALE.paidAt,
          updated_at: SALE.paidAt,
        },
      ]
    : [];

  return {
    from() {
      const filters: Record<string, string> = {};
      return {
        select() {
          return this;
        },
        eq(column: string, value: string) {
          filters[column] = value;
          return this;
        },
        maybeSingle: async () => ({
          data:
            rows.find((row) => row.dedup_key === filters.dedup_key) ?? null,
          error: null,
        }),
        insert() {
          return {
            select() {
              return {
                single: async () => ({
                  data: {
                    id: "delivery-new",
                    dedup_key: buildPlatformOwnerSaleDedupKey(SALE.paymentId),
                    status: "pending",
                    attempt_count: 0,
                  },
                  error: null,
                }),
              };
            },
          };
        },
        update() {
          return {
            eq() {
              return {
                select() {
                  return {
                    single: async () => ({
                      data: rows[0] ?? { id: "delivery-1", status: "pending" },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

async function testDuplicateWebhookDoesNotSendSecondEmail() {
  assert.equal(
    resolvePlatformOwnerSaleNotifyIntent("sent"),
    "skip",
    "already sent is skipped",
  );
  assert.deepEqual(
    resolveOperationalEmailDeliverySendIntent({ status: "sent" }, false),
    { kind: "skip", reason: "already_sent" },
  );
  assert.equal(
    buildPlatformOwnerSaleDedupKey(SALE.paymentId),
    `platform_owner_sale:${SALE.paymentId}`,
  );

  const sendCalls: unknown[] = [];
  const first = await sendPlatformOwnerSaleEmail({
    ...SALE,
    authorName: SALE.authorName,
    paidAt: SALE.paidAt,
    paymentStatus: "Оплачено",
    supabase: createDeliveryClient(null) as never,
  });
  assert.equal(first.ok, false, "first send reaches SMTP path or persist");

  const skipped = await sendPlatformOwnerSaleEmail({
    ...SALE,
    authorName: SALE.authorName,
    paidAt: SALE.paidAt,
    paymentStatus: "Оплачено",
    supabase: createDeliveryClient({ status: "sent" }) as never,
  });
  assert.deepEqual(skipped, { ok: true, skipped: true });
  assert.equal(sendCalls.length, 0);

  const fulfill = read("src/lib/payments/fulfill-payment.ts");
  assert.match(fulfill, /notifyPlatformOwnerOfConfirmedSale/);
  assert.match(fulfill, /shouldNotifyPlatformOwnerOfSale/);
  assert.match(fulfill, /paymentStatus === "succeeded"/);
}

async function testNormalUserCannotAccessAdminSales() {
  const unauthorized = createAdminSalesListHandler({
    requireAccess: async () =>
      jsonResponse(401, { error: "unauthorized" }) as never,
    listSales: async () => {
      throw new Error("must_not_list");
    },
  });
  const unauthResponse = await unauthorized(
    new Request("http://test/api/admin/sales"),
  );
  assert.equal(unauthResponse.status, 401);

  const forbidden = createAdminSalesListHandler({
    requireAccess: async () =>
      jsonResponse(403, { error: "forbidden" }) as never,
    listSales: async () => {
      throw new Error("must_not_list");
    },
  });
  const forbiddenResponse = await forbidden(
    new Request("http://test/api/admin/sales"),
  );
  assert.equal(forbiddenResponse.status, 403);

  const detailForbidden = createAdminSalesDetailHandler({
    requireAccess: async () =>
      jsonResponse(403, { error: "forbidden" }) as never,
    getSale: async () => {
      throw new Error("must_not_load");
    },
  });
  const detailResponse = await detailForbidden(
    new Request(`http://test/api/admin/sales/${SALE.paymentId}`),
    { params: Promise.resolve({ id: SALE.paymentId }) },
  );
  assert.equal(detailResponse.status, 403);

  assert.equal(rolesGrantPermission([], "sales.view"), false);
  assert.equal(rolesGrantPermission(["editor"], "sales.view"), false);
  assert.equal(rolesGrantPermission(["support"], "sales.view"), false);
  assert.equal(rolesGrantPermission(["analyst"], "sales.view"), false);
  assert.equal(rolesGrantPermission(["finance"], "sales.view"), false);

  const listenerNav = getVisibleAdminNavItems(accessForRoles([]));
  assert.equal(
    listenerNav.some((item) => item.href === "/admin/sales"),
    false,
  );
}

async function testOwnerAndAdminCanSeeSale() {
  assert.equal(rolesGrantPermission(["owner"], "sales.view"), true);
  assert.equal(rolesGrantPermission(["admin"], "sales.view"), true);
  assert.ok(PLATFORM_ROLE_PERMISSIONS.admin.includes("sales.view"));

  const ownerNav = getVisibleAdminNavItems(accessForRoles(["owner"]));
  assert.ok(ownerNav.some((item) => item.href === "/admin/sales"));
  assert.equal(
    ADMIN_NAV_ITEMS.find((item) => item.href === "/admin/sales")
      ?.requiredPermission,
    "sales.view",
  );

  const adminNav = getVisibleAdminNavItems(accessForRoles(["admin"]));
  assert.ok(adminNav.some((item) => item.href === "/admin/sales"));

  const listed = createAdminSalesListHandler({
    requireAccess: async () =>
      ({
        ok: true,
        actor: { userId: "owner-1" },
      }) as never,
    listSales: async () => ({
      sales: [SALE],
      total: 1,
      page: 1,
      pageSize: 20,
    }),
  });
  const listResponse = await listed(new Request("http://test/api/admin/sales"));
  const listJson = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.equal(listJson.sales[0].paymentId, SALE.paymentId);
  assert.equal(listJson.sales[0].buyerEmail, SALE.buyerEmail);

  const detail = createAdminSalesDetailHandler({
    requireAccess: async () =>
      ({
        ok: true,
        actor: { userId: "owner-1" },
      }) as never,
    getSale: async (id) =>
      id === SALE.paymentId
        ? {
            ...SALE,
            practiceId: "practice-1",
            practiceSlug: "meditatsiya-na-dengi",
            provider: "tochka",
            providerPaymentId: "op-1",
            checkoutOriginPath: "/practice/meditatsiya-na-dengi",
            createdAt: SALE.paidAt,
            confirmedAt: SALE.paidAt,
            isTest: false,
          }
        : null,
  });
  const detailResponse = await detail(
    new Request(`http://test/api/admin/sales/${SALE.paymentId}`),
    { params: Promise.resolve({ id: SALE.paymentId }) },
  );
  const detailJson = await detailResponse.json();
  assert.equal(detailResponse.status, 200);
  assert.equal(detailJson.orderId, SALE.orderId);
  assert.equal(detailJson.buyerUserId, SALE.buyerUserId);
}

function testThirdPartyAuthorProductDisplayed() {
  const row = mapAdminSaleListItem({
    paymentId: SALE.paymentId,
    orderId: SALE.orderId,
    paidAt: SALE.paidAt,
    buyerUserId: SALE.buyerUserId,
    buyerFullName: "Мария",
    buyerEmail: "maria@example.test",
    productTitle: "Утренний ритуал",
    authorId: SALE.authorId,
    authorName: "Оля Невская",
    amountMinor: 99000,
    currency: "RUB",
    paymentStatus: "succeeded",
    orderStatus: "paid",
    authorMemberUserIds: ["55555555-5555-4555-8555-555555555555"],
    authorMemberEmails: ["olya@author.test"],
  });

  assert.equal(row.productTitle, "Утренний ритуал");
  assert.equal(row.authorName, "Оля Невская");
  assert.equal(row.buyerName, "Мария");
  assert.equal(row.buyerKind, "external");
  assert.notEqual(row.authorName, "АудиоЛад");

  assert.equal(
    detectAdminSaleBuyerKind({
      buyerUserId: "55555555-5555-4555-8555-555555555555",
      buyerEmail: "other@example.test",
      authorMemberUserIds: ["55555555-5555-4555-8555-555555555555"],
      authorMemberEmails: ["olya@author.test"],
    }),
    "self_purchase",
  );
  assert.equal(
    detectAdminSaleBuyerKind({
      buyerUserId: SALE.buyerUserId,
      buyerEmail: "olya@author.test",
      authorMemberUserIds: ["55555555-5555-4555-8555-555555555555"],
      authorMemberEmails: ["olya@author.test"],
    }),
    "self_purchase",
  );
  assert.equal(
    detectAdminSaleBuyerKind({
      buyerUserId: SALE.buyerUserId,
      buyerEmail: "maria@example.test",
      authorMemberUserIds: [],
      authorMemberEmails: [],
    }),
    null,
    "omit badge without reliable author account data",
  );
  assert.equal(
    detectAdminSaleBuyerKind({
      buyerUserId: SALE.buyerUserId,
      buyerEmail: "maria@example.test",
      authorMemberUserIds: ["55555555-5555-4555-8555-555555555555"],
      authorMemberEmails: ["olya@author.test"],
    }),
    "external",
  );
}

function testCheckoutAndPaymentSuccessPathStillWorks() {
  const fulfill = read("src/lib/payments/fulfill-payment.ts");
  const webhook = read("src/app/api/webhooks/tochka/route.ts");
  const createOrder = read("src/lib/orders/create-order-api.ts");
  const checkoutStatus = read("src/app/api/checkout/status/route.ts");
  const notify = read("src/lib/payments/notify-platform-owner-sale.ts");

  assert.match(fulfill, /fulfill_tochka_payment_transactional/);
  assert.match(fulfill, /notifyAuthorOfCanonicalSale/);
  assert.match(fulfill, /notifyPlatformOwnerOfConfirmedSale/);
  assert.doesNotMatch(fulfill, /from\("payments"\)\s*\n\s*\.update/);
  assert.match(webhook, /fulfillSucceededTochkaPayment/);
  assert.doesNotMatch(createOrder, /notifyPlatformOwnerOfConfirmedSale/);
  assert.doesNotMatch(createOrder, /sendPlatformOwnerSaleEmail/);
  assert.doesNotMatch(checkoutStatus, /grant_practice_purchase_access/);
  assert.doesNotMatch(checkoutStatus, /notifyPlatformOwnerOfConfirmedSale/);
  assert.match(notify, /try \{/);
  assert.match(notify, /platform_owner_sale_notify_unexpected_error/);
  assert.doesNotMatch(notify, /card|token|secret|password/i);
}

async function testOwnerSaleEmailTemplate() {
  const subject = buildPlatformOwnerSaleEmailSubject(
    149000,
    "Медитация на деньги",
  );
  assert.equal(
    subject,
    `Новая продажа — ${formatAdminSaleAmount(149000)} — Медитация на деньги`,
  );
  assert.equal(
    buildPlatformOwnerSaleSubject({
      amountMinor: 149000,
      productTitle: "Медитация на деньги",
    }),
    subject,
  );

  const html = renderPlatformOwnerSaleEmailHtml({
    productTitle: "Медитация на деньги",
    authorName: "Оля Невская",
    amountMinor: 149000,
    buyerName: "Анна",
    buyerEmail: "anna@example.test",
    paidAt: SALE.paidAt,
    orderId: SALE.orderId,
    paymentId: SALE.paymentId,
    paymentStatus: "Оплачено",
    checkoutOriginPath: "/practice/meditatsiya-na-dengi",
    siteOrigin: "https://audiolad.ru",
  });
  const text = renderPlatformOwnerSaleEmailText({
    productTitle: "Медитация на деньги",
    authorName: "Оля Невская",
    amountMinor: 149000,
    buyerName: "Анна",
    buyerEmail: "anna@example.test",
    paidAt: SALE.paidAt,
    orderId: SALE.orderId,
    paymentId: SALE.paymentId,
    paymentStatus: "Оплачено",
    checkoutOriginPath: "/practice/meditatsiya-na-dengi",
    siteOrigin: "https://audiolad.ru",
  });

  assert.match(html, /Продукт: Медитация на деньги/);
  assert.match(html, /Автор: Оля Невская/);
  assert.match(html, /Email покупателя: anna@example\.test/);
  assert.match(html, /ID заказа/);
  assert.match(html, /\/admin\/sales\//);
  assert.match(text, /Source \/ purchase URL: \/practice\/meditatsiya-na-dengi/);

  const rendered = await brandEmailTemplateRenderer.render({
    templateKey: "platform_owner_sale",
    templateVersion: "platform-owner-sale-v1-20260821",
    payload: {
      productTitle: "Медитация на деньги",
      authorName: "Оля Невская",
      amountMinor: 149000,
      buyerName: "Анна",
      buyerEmail: "anna@example.test",
      paidAt: SALE.paidAt,
      orderId: SALE.orderId,
      paymentId: SALE.paymentId,
      paymentStatus: "Оплачено",
    },
  });
  assert.equal(rendered.ok, true);
  if (rendered.ok) {
    assert.equal(rendered.subject, subject);
  }
}

async function main() {
  await testNotifyOnlyOnConfirmedSuccess();
  await testDuplicateWebhookDoesNotSendSecondEmail();
  await testNormalUserCannotAccessAdminSales();
  await testOwnerAndAdminCanSeeSale();
  testThirdPartyAuthorProductDisplayed();
  testCheckoutAndPaymentSuccessPathStillWorks();
  await testOwnerSaleEmailTemplate();
  console.log("admin-sales-visibility-unit: ok");
}

await main();
