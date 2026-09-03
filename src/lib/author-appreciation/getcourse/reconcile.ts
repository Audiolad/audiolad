import "server-only";

import { confirmGetCourseDealPayment } from "@/lib/author-appreciation/getcourse/confirm-deal";
import {
  getGetCourseConfig,
  type GetCourseConfig,
} from "@/lib/author-appreciation/getcourse/provider";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const RECONCILE_MAX_INTENTS = 20;
const RECONCILE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const RECONCILE_MIN_INTERVAL_MS = 60_000;

export type PendingAppreciationIntent = {
  id: string;
  amount_minor: number;
  provider_deal_id: string | null;
  provider_deal_number: string | null;
  provider_metadata: unknown;
  created_at: string;
  status: string;
};

export type ReconcileDeps = {
  config?: GetCourseConfig;
  listPending?: () => Promise<PendingAppreciationIntent[]>;
  applyCallback?: (args: {
    providerDealId: string | null;
    providerDealNumber: string | null;
    offerId: string;
    amountMinor: number;
    status: string;
    payedMoneyMinor: number | null;
    leftCostMoneyMinor: number | null;
  }) => Promise<{ error: { message?: string } | null; data: unknown }>;
  confirmDeal?: typeof confirmGetCourseDealPayment;
  fetchImpl?: typeof fetch;
  now?: Date;
  force?: boolean;
};

export type ReconcileResult = {
  attempted: number;
  applied: number;
  skipped: number;
  provider_error: boolean;
  deferred: boolean;
};

let inFlight: Promise<ReconcileResult> | null = null;
let lastStartedAt = 0;

function metadataOfferId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const offerId = (metadata as { offer_id?: unknown }).offer_id;
  return typeof offerId === "string" && offerId.trim() ? offerId.trim() : null;
}

function logReconcileSkipped(reason: string, extras: Record<string, boolean | number> = {}): void {
  console.info("author_appreciation_getcourse_reconcile_skipped", {
    reason,
    ...extras,
  });
}

async function defaultListPending(
  now: Date,
): Promise<PendingAppreciationIntent[]> {
  const service = createServiceRoleClient();
  const cutoff = new Date(now.getTime() - RECONCILE_MAX_AGE_MS).toISOString();
  const { data, error } = await service
    .from("author_appreciation_payment_intents")
    .select("id, amount_minor, provider_deal_id, provider_deal_number, provider_metadata, created_at, status")
    .eq("provider", "getcourse")
    .eq("status", "pending")
    .not("provider_deal_id", "is", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(RECONCILE_MAX_INTENTS);
  if (error) throw new Error("author_appreciation_reconcile_list_failed");
  return (data ?? []) as PendingAppreciationIntent[];
}

async function defaultApplyCallback(args: {
  providerDealId: string | null;
  providerDealNumber: string | null;
  offerId: string;
  amountMinor: number;
  status: string;
  payedMoneyMinor: number | null;
  leftCostMoneyMinor: number | null;
}) {
  const service = createServiceRoleClient();
  return service.rpc("apply_author_appreciation_getcourse_callback", {
    p_provider_deal_id: args.providerDealId,
    p_provider_deal_number: args.providerDealNumber,
    p_offer_id: args.offerId,
    p_amount_minor: args.amountMinor,
    p_status: args.status,
    p_payed_money_minor: args.payedMoneyMinor,
    p_left_cost_money_minor: args.leftCostMoneyMinor,
  });
}

async function runReconcile(deps: ReconcileDeps = {}): Promise<ReconcileResult> {
  const now = deps.now ?? new Date();
  let config: GetCourseConfig;
  try {
    config = deps.config ?? getGetCourseConfig();
  } catch {
    return { attempted: 0, applied: 0, skipped: 0, provider_error: true, deferred: false };
  }

  const pending = await (deps.listPending ?? (() => defaultListPending(now)))();
  const confirmDeal = deps.confirmDeal ?? confirmGetCourseDealPayment;
  const applyCallback = deps.applyCallback ?? defaultApplyCallback;
  let applied = 0;
  let skipped = 0;
  let providerError = false;

  for (const intent of pending) {
    if (intent.status !== "pending" || !intent.provider_deal_id) {
      skipped += 1;
      logReconcileSkipped("not_pending_or_missing_deal", {
        deal_id_present: Boolean(intent.provider_deal_id),
      });
      continue;
    }
    const offerId = metadataOfferId(intent.provider_metadata);
    if (!offerId || offerId !== config.appreciationOfferId) {
      skipped += 1;
      logReconcileSkipped("offer_metadata_mismatch", {
        deal_id_present: true,
      });
      continue;
    }

    const confirmation = await confirmDeal(
      config,
      { dealId: intent.provider_deal_id, createdAtIso: intent.created_at },
      deps.fetchImpl,
      now,
    );
    if (!confirmation.confirmed) {
      if (confirmation.reason === "provider_error") {
        providerError = true;
        logReconcileSkipped("provider_error", { deal_id_present: true });
        break;
      }
      skipped += 1;
      logReconcileSkipped(confirmation.reason, {
        deal_id_present: true,
        status_payed: confirmation.reason !== "unpaid",
      });
      continue;
    }

    const deal = confirmation.deal;
    if (deal.status && deal.status !== "payed") {
      skipped += 1;
      logReconcileSkipped("unpaid", { deal_id_present: true, status_payed: false });
      continue;
    }
    if (deal.amountMinor !== null && deal.amountMinor !== intent.amount_minor) {
      skipped += 1;
      logReconcileSkipped("amount_mismatch", {
        deal_id_present: true,
        amount_match: false,
        status_payed: true,
      });
      continue;
    }
    if (
      deal.offerIds.length > 0 &&
      !deal.offerIds.includes(config.appreciationOfferId)
    ) {
      skipped += 1;
      logReconcileSkipped("export_offer_mismatch", {
        deal_id_present: true,
        amount_match: deal.amountMinor === null || deal.amountMinor === intent.amount_minor,
        status_payed: true,
      });
      continue;
    }
    if (deal.payedMoneyMinor !== null && deal.payedMoneyMinor < intent.amount_minor) {
      skipped += 1;
      logReconcileSkipped("partial_payment", {
        deal_id_present: true,
        amount_match: true,
        status_payed: true,
      });
      continue;
    }
    if (deal.leftCostMoneyMinor !== null && deal.leftCostMoneyMinor > 0) {
      skipped += 1;
      logReconcileSkipped("partial_payment", {
        deal_id_present: true,
        amount_match: true,
        status_payed: true,
      });
      continue;
    }

    const { error } = await applyCallback({
      providerDealId: intent.provider_deal_id,
      providerDealNumber: intent.provider_deal_number,
      offerId,
      amountMinor: intent.amount_minor,
      status: "payed",
      payedMoneyMinor: deal.payedMoneyMinor ?? intent.amount_minor,
      leftCostMoneyMinor: deal.leftCostMoneyMinor ?? 0,
    });
    if (error) {
      providerError = true;
      logReconcileSkipped("rpc_error", { deal_id_present: true });
      break;
    }
    applied += 1;
  }

  return {
    attempted: pending.length,
    applied,
    skipped,
    provider_error: providerError,
    deferred: false,
  };
}

export async function reconcilePendingGetCourseAppreciationIntents(
  deps: ReconcileDeps = {},
): Promise<ReconcileResult> {
  if (inFlight && !deps.force) return inFlight;
  const nowMs = (deps.now ?? new Date()).getTime();
  if (!deps.force && lastStartedAt > 0 && nowMs - lastStartedAt < RECONCILE_MIN_INTERVAL_MS) {
    return {
      attempted: 0,
      applied: 0,
      skipped: 0,
      provider_error: false,
      deferred: true,
    };
  }
  lastStartedAt = nowMs;
  inFlight = runReconcile(deps).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function resetGetCourseAppreciationReconcileForTests(): void {
  inFlight = null;
  lastStartedAt = 0;
}

export function scheduleGetCourseAppreciationReconcile(): void {
  void reconcilePendingGetCourseAppreciationIntents().catch(() => {
    console.info("author_appreciation_getcourse_reconcile_skipped", {
      reason: "reconcile_failed",
      deal_id_present: false,
    });
  });
}
