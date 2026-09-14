#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHOR_PROJECT_CAPACITY_ORDER_KIND,
  AUTHOR_PROJECT_CAPACITY_PACKAGES,
  capacitySuccessMessage,
  formatCapacityRublesFromMinor,
  isAuthorProjectCapacitySku,
  resolveAuthorProjectCapacityPackage,
} from "../src/lib/author-projects/capacity-catalog.ts";
import {
  parseAuthorProjectCapacityCheckoutRequest,
  coerceAuthorProjectCapacityOrderRow,
} from "../src/lib/author-projects/capacity-checkout-api.ts";
import {
  canCreateOwnedAuthorProject,
  resolveEffectiveAuthorProjectLimit,
  shouldShowCapacityPurchaseOffer,
  shouldShowPremiumProjectUpsell,
} from "../src/lib/author-projects/limits.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function main() {
  // Free base slot still available
  const basic = resolveEffectiveAuthorProjectLimit({
    override: null,
    unlimited: false,
    premiumEnabled: false,
    purchasedSlots: 0,
  });
  assert.equal(basic.limit, 1);
  assert.equal(canCreateOwnedAuthorProject(0, basic.limit), true);
  assert.equal(
    shouldShowCapacityPurchaseOffer({
      used: 0,
      limit: basic.limit,
      unlimited: false,
    }),
    false,
  );

  // Exhausted base → offer
  assert.equal(
    shouldShowCapacityPurchaseOffer({
      used: 1,
      limit: 1,
      unlimited: false,
    }),
    true,
  );
  assert.equal(
    shouldShowPremiumProjectUpsell({
      used: 1,
      limit: 1,
      unlimited: false,
      source: "default",
    }),
    true,
  );

  // +1 pack
  const after1 = resolveEffectiveAuthorProjectLimit({
    override: null,
    unlimited: false,
    premiumEnabled: false,
    purchasedSlots: 1,
  });
  assert.equal(after1.limit, 2);
  assert.equal(after1.purchasedSlots, 1);
  assert.equal(canCreateOwnedAuthorProject(1, after1.limit), true);
  assert.equal(canCreateOwnedAuthorProject(2, after1.limit), false);

  // +5 pack
  const after5 = resolveEffectiveAuthorProjectLimit({
    override: null,
    unlimited: false,
    premiumEnabled: false,
    purchasedSlots: 5,
  });
  assert.equal(after5.limit, 6);

  // Multiple purchases stack: base1 +5 +1 +5 = 12
  const stacked = resolveEffectiveAuthorProjectLimit({
    override: null,
    unlimited: false,
    premiumEnabled: false,
    purchasedSlots: 11,
  });
  assert.equal(stacked.limit, 12);
  assert.equal(canCreateOwnedAuthorProject(12, stacked.limit), false);
  assert.equal(
    shouldShowCapacityPurchaseOffer({
      used: 12,
      limit: stacked.limit,
      unlimited: false,
    }),
    true,
  );

  // Premium base 3 + purchased 5 = 8
  const premiumBuy = resolveEffectiveAuthorProjectLimit({
    override: null,
    unlimited: false,
    premiumEnabled: true,
    purchasedSlots: 5,
  });
  assert.equal(premiumBuy.baseLimit, 3);
  assert.equal(premiumBuy.limit, 8);

  // Override 5 + purchased 5 = 10
  const overrideBuy = resolveEffectiveAuthorProjectLimit({
    override: 5,
    unlimited: false,
    premiumEnabled: false,
    purchasedSlots: 5,
  });
  assert.equal(overrideBuy.limit, 10);

  // Unlimited never paywalled
  const unlimited = resolveEffectiveAuthorProjectLimit({
    override: 5,
    unlimited: true,
    premiumEnabled: false,
    purchasedSlots: 99,
  });
  assert.equal(unlimited.unlimited, true);
  assert.equal(unlimited.limit, null);
  assert.equal(
    shouldShowCapacityPurchaseOffer({
      used: 100,
      limit: null,
      unlimited: true,
    }),
    false,
  );
  assert.equal(canCreateOwnedAuthorProject(100, null, true), true);

  // Catalog server amounts
  const sku1 = resolveAuthorProjectCapacityPackage("author_project_slot_1");
  const sku5 = resolveAuthorProjectCapacityPackage("author_project_slots_5");
  assert.equal(sku1?.amountMinor, 99900);
  assert.equal(sku1?.slots, 1);
  assert.equal(sku5?.amountMinor, 249900);
  assert.equal(sku5?.displayAmountMinor, 499500);
  assert.equal(sku5?.slots, 5);
  assert.equal(AUTHOR_PROJECT_CAPACITY_PACKAGES.author_project_slots_5.recommended, true);
  assert.equal(isAuthorProjectCapacitySku("nope"), false);
  assert.match(formatCapacityRublesFromMinor(249900), /2[\s\u00a0]?499/);
  assert.match(capacitySuccessMessage(1), /ещё 1 проект/);
  assert.match(capacitySuccessMessage(5), /ещё 5 проектов/);

  // Client cannot pass amount/author_id
  assert.equal(
    parseAuthorProjectCapacityCheckoutRequest({
      sku: "author_project_slot_1",
      amount_minor: 1,
    }).ok,
    false,
  );
  assert.equal(
    parseAuthorProjectCapacityCheckoutRequest({
      sku: "author_project_slot_1",
      author_id: "00000000-0000-4000-8000-000000000001",
    }).ok,
    false,
  );
  assert.equal(
    parseAuthorProjectCapacityCheckoutRequest({
      sku: "author_project_slot_1",
    }).ok,
    true,
  );

  // Coerce rejects amount/slots mismatch vs catalog
  assert.equal(
    coerceAuthorProjectCapacityOrderRow({
      order_id: "11111111-1111-4111-8111-111111111111",
      status: "pending",
      amount_minor: 100,
      currency: "RUB",
      order_kind: AUTHOR_PROJECT_CAPACITY_ORDER_KIND,
      sku: "author_project_slot_1",
      slots: 1,
      created_at: new Date().toISOString(),
    }),
    null,
  );

  const valid = coerceAuthorProjectCapacityOrderRow({
    order_id: "11111111-1111-4111-8111-111111111111",
    status: "pending",
    amount_minor: 99900,
    currency: "RUB",
    order_kind: AUTHOR_PROJECT_CAPACITY_ORDER_KIND,
    sku: "author_project_slot_1",
    slots: 1,
    created_at: new Date().toISOString(),
  });
  assert.equal(valid?.slots, 1);

  // Source contracts
  const migration = read(
    "supabase/migrations/20261008120000_author_project_capacity_purchase.sql",
  );
  assert.match(migration, /author_project_slots_purchased/);
  assert.match(migration, /author_project_capacity_grants/);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS author_project_capacity_grants_order_id_uidx/);
  assert.match(migration, /create_author_project_capacity_order/);
  assert.match(migration, /grant_author_project_capacity_for_order/);
  assert.match(migration, /author_project_capacity/);
  assert.match(migration, /99900/);
  assert.match(migration, /249900/);
  assert.match(migration, /499500/);
  assert.match(migration, /unlimited_account/);
  assert.doesNotMatch(migration, /в месяц|ежемесяч|продлен/i);

  // Hardening: pending unique per user+SKU, resume same SKU, grant payment gates
  assert.match(
    migration,
    /orders_one_pending_author_project_capacity_per_user_sku_idx/,
  );
  assert.match(
    migration,
    /ON public\.orders \(user_id, practice_slug_snapshot\)/,
  );
  assert.match(migration, /Resume an existing pending order/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /succeeded_payment_required/);
  assert.match(migration, /payment_amount_mismatch/);
  assert.match(migration, /payment_currency_mismatch/);
  assert.match(migration, /payment_order_mismatch/);
  assert.match(migration, /orders_practice_id_by_kind_check/);
  assert.match(
    migration,
    /order_kind IN \(\s*'product_purchase',\s*'course_upgrade',\s*'studio_music_license'\s*\)\s*AND practice_id IS NOT NULL/s,
  );
  assert.match(
    migration,
    /order_kind = 'author_project_capacity'\s*AND practice_id IS NULL/s,
  );
  // Grant must check NOT FOUND after selecting succeeded payment
  assert.match(
    migration,
    /AND p\.status = 'succeeded'[\s\S]*?IF NOT FOUND THEN[\s\S]*?succeeded_payment_required/,
  );

  const dialog = read(
    "src/components/author-dashboard/AuthorProjectCapacityOfferDialog.tsx",
  );
  assert.match(dialog, /Добавить проекты/);
  assert.match(dialog, /Разовая оплата/);
  assert.match(dialog, /Без ограничений по времени/);
  assert.match(dialog, /−50%/);
  assert.doesNotMatch(dialog, /в месяц|ежемесяч|продлен/i);
  assert.match(dialog, /без подписки/i);
  assert.match(dialog, /Разовая оплата/);
  assert.doesNotMatch(dialog, /kind:\s*"success"/);
  assert.doesNotMatch(dialog, /onPurchaseSucceeded/);
  assert.match(dialog, /window\.location\.assign/);

  const checkoutResult = read(
    "src/app/(platform)/checkout/result/CheckoutResultClient.tsx",
  );
  assert.match(
    checkoutResult,
    /author_project_capacity_purchase_succeeded/,
  );
  assert.match(checkoutResult, /capacitySucceededTrackedRef/);
  assert.match(checkoutResult, /paid_authenticated/);
  assert.match(checkoutResult, /Готово — проекты добавлены навсегда/);
  assert.match(checkoutResult, /Создать новый проект/);

  const statusApi = read("src/lib/payments/checkout-status-api.ts");
  assert.match(statusApi, /amountMinor/);
  assert.match(statusApi, /currency/);

  const statusRoute = read("src/app/api/checkout/status/route.ts");
  assert.match(statusRoute, /amount_minor/);
  assert.match(statusRoute, /currency/);

  // Call sites no longer wire unreachable dialog success callbacks
  for (const rel of [
    "src/components/author-dashboard/AuthorCreateProjectCta.tsx",
    "src/components/author-dashboard/AuthorProjectSwitcher.tsx",
    "src/components/author-dashboard/AuthorCreateProjectForm.tsx",
  ]) {
    assert.doesNotMatch(read(rel), /onPurchaseSucceeded/);
  }

  // Documented behavioural contracts (static SQL analysis — no production DB)
  assert.match(
    migration,
    /practice_slug_snapshot = v_package\.sku/,
  );
  assert.match(migration, /already_granted/);
  assert.match(migration, /ON CONFLICT \(order_id\) DO NOTHING/);

  const cta = read("src/components/author-dashboard/AuthorCreateProjectCta.tsx");
  assert.match(cta, /Создать новый проект/);
  assert.match(cta, /＋/);

  const nav = read("src/components/author-dashboard/AuthorDashboardNav.tsx");
  assert.match(nav, /AuthorCreateProjectCta/);

  const startTochka = read("src/lib/payments/start-tochka-checkout.ts");
  assert.match(startTochka, /AUTHOR_PROJECT_CAPACITY_ORDER_KIND/);
  assert.match(startTochka, /skipAuthorAccrualGate/);

  const route = read("src/app/api/checkout/author-project-capacity/route.ts");
  assert.match(route, /create_author_project_capacity_order/);
  assert.doesNotMatch(route, /amount_minor:\s*body/);

  const constants = read("src/lib/analytics/constants.ts");
  assert.match(constants, /author_project_capacity_purchase_succeeded/);

  console.log("author-project-capacity-unit: ok");
}

main();
