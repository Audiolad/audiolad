import "server-only";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  coveringExportDateWindow,
  exportPaidGetCourseDealsOnce,
  indexExportedDealsById,
  indexExportedDealsByNumber,
  lookupExportedDealForIntent,
  matchIntentToExportedDeal,
  type ExportPaidGetCourseDealsOptions,
} from "@/lib/author-appreciation/getcourse/confirm-deal";
import {
  getGetCourseConfig,
  type GetCourseConfig,
} from "@/lib/author-appreciation/getcourse/provider";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const RECONCILE_MAX_INTENTS = 20;
export const RECONCILE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const RECONCILE_MIN_INTERVAL_MS = 45 * 60 * 1000;

export type PendingAppreciationIntent = {
  id: string;
  amount_minor: number;
  provider_deal_id: string | null;
  provider_deal_number: string | null;
  provider_metadata: unknown;
  created_at: string;
  status: string;
};

export type ReconcileCooldownStore = {
  readLastStartedAt(): number;
  writeLastStartedAt(ms: number): void;
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
  exportDeals?: typeof exportPaidGetCourseDealsOnce;
  fetchImpl?: typeof fetch;
  now?: Date;
  force?: boolean;
  cooldown?: ReconcileCooldownStore;
  exportOptions?: ExportPaidGetCourseDealsOptions;
};

export type ReconcileResult = {
  attempted: number;
  correlatable: number;
  matched: number;
  applied: number;
  skipped: number;
  provider_error: boolean;
  deferred: boolean;
  exports: number;
  polls: number;
  skip_reasons_summary?: string;
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

function summarizeSkipReasons(counts: Map<string, number>): string | undefined {
  if (counts.size === 0) return undefined;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, count]) => `${reason}:${count}`)
    .join(",");
}

function defaultCooldownFilePath(): string | null {
  const configured = process.env.AUDIOLAD_APPRECIATION_RECONCILE_COOLDOWN_FILE?.trim();
  if (configured) return configured;
  return "/var/lib/audiolad/author-appreciation-getcourse-reconcile.stamp";
}

export function createFileReconcileCooldownStore(
  filePath: string | null = defaultCooldownFilePath(),
): ReconcileCooldownStore {
  return {
    readLastStartedAt() {
      if (!filePath) return 0;
      try {
        const raw = readFileSync(filePath, "utf8").trim();
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : 0;
      } catch {
        return 0;
      }
    },
    writeLastStartedAt(ms: number) {
      if (!filePath) return;
      try {
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, String(ms), "utf8");
      } catch {
        // Best-effort cross-process cooldown. In-memory still applies.
      }
    },
  };
}

function memoryAndFileCooldown(store: ReconcileCooldownStore): ReconcileCooldownStore {
  return {
    readLastStartedAt() {
      return Math.max(lastStartedAt, store.readLastStartedAt());
    },
    writeLastStartedAt(ms: number) {
      lastStartedAt = ms;
      store.writeLastStartedAt(ms);
    },
  };
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
    .or("provider_deal_id.not.is.null,provider_deal_number.not.is.null")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true })
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
    return {
      attempted: 0,
      correlatable: 0,
      matched: 0,
      applied: 0,
      skipped: 0,
      provider_error: true,
      deferred: false,
      exports: 0,
      polls: 0,
    };
  }

  const pending = await (deps.listPending ?? (() => defaultListPending(now)))();
  const correlatable = pending.filter((intent) => {
    const offerId = metadataOfferId(intent.provider_metadata);
    return (
      intent.status === "pending" &&
      Boolean(intent.provider_deal_id || intent.provider_deal_number) &&
      offerId === config.appreciationOfferId
    );
  });
  if (correlatable.length === 0) {
    const skipReasons = new Map<string, number>();
    for (const intent of pending) {
      const offerId = metadataOfferId(intent.provider_metadata);
      let reason = "unknown";
      if (intent.status !== "pending") reason = "not_pending";
      else if (!intent.provider_deal_id && !intent.provider_deal_number) reason = "missing_deal_reference";
      else if (!offerId) reason = "missing_offer_metadata";
      else if (offerId !== config.appreciationOfferId) reason = "offer_metadata_mismatch";
      skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);
    }
    return {
      attempted: pending.length,
      correlatable: 0,
      matched: 0,
      applied: 0,
      skipped: pending.length,
      provider_error: false,
      deferred: false,
      exports: 0,
      polls: 0,
      skip_reasons_summary: summarizeSkipReasons(skipReasons),
    };
  }

  const exportDeals = deps.exportDeals ?? exportPaidGetCourseDealsOnce;
  const applyCallback = deps.applyCallback ?? defaultApplyCallback;
  const window = coveringExportDateWindow(
    correlatable.map((intent) => intent.created_at),
    now,
  );
  const exported = await exportDeals(config, window, deps.fetchImpl, deps.exportOptions);
  const byId = exported.ok ? indexExportedDealsById(exported.deals) : new Map();
  const byNumber = exported.ok ? indexExportedDealsByNumber(exported.deals) : new Map();
  let matched = 0;
  let applied = 0;
  let skipped = pending.length - correlatable.length;
  let providerError = !exported.ok && exported.reason === "provider_error";
  const skipReasons = new Map<string, number>();

  if (exported.ok) {
    const schema = exported.schema ?? { row_count: exported.deals.length };
    console.info(
      "author_appreciation_getcourse_export_observed",
      schema.row_count === 0 && exported.envelope
        ? { ...schema, ...exported.envelope }
        : schema,
    );
  } else {
    console.info("author_appreciation_getcourse_export_observed", {
      ok: false,
      reason: exported.reason,
      export_id_present: Boolean(exported.exportId),
      poll_count: exported.pollCount,
      ...(exported.envelope ?? {}),
    });
  }

  for (const intent of correlatable) {
    if (
      intent.status !== "pending" ||
      (!intent.provider_deal_id && !intent.provider_deal_number)
    ) {
      skipped += 1;
      skipReasons.set("not_pending_or_missing_deal", (skipReasons.get("not_pending_or_missing_deal") ?? 0) + 1);
      logReconcileSkipped("not_pending_or_missing_deal", {
        deal_id_present: Boolean(intent.provider_deal_id),
        deal_number_present: Boolean(intent.provider_deal_number),
      });
      continue;
    }
    const offerId = metadataOfferId(intent.provider_metadata);
    if (!offerId || offerId !== config.appreciationOfferId) {
      skipped += 1;
      skipReasons.set("offer_metadata_mismatch", (skipReasons.get("offer_metadata_mismatch") ?? 0) + 1);
      logReconcileSkipped("offer_metadata_mismatch", {
        deal_id_present: true,
      });
      continue;
    }
    if (!exported.ok) {
      skipped += 1;
      const reason = exported.reason === "empty" ? "not_found" : "provider_error";
      skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);
      logReconcileSkipped(reason, {
        deal_id_present: true,
      });
      continue;
    }

    const match = matchIntentToExportedDeal({
      deal: lookupExportedDealForIntent({
        providerDealId: intent.provider_deal_id,
        providerDealNumber: intent.provider_deal_number,
        byId,
        byNumber,
      }),
      configuredOfferId: config.appreciationOfferId,
      amountMinor: intent.amount_minor,
    });
    if (!match.matched) {
      skipped += 1;
      skipReasons.set(match.reason, (skipReasons.get(match.reason) ?? 0) + 1);
      logReconcileSkipped(match.reason, {
        deal_id_present: Boolean(intent.provider_deal_id),
        deal_number_present: Boolean(intent.provider_deal_number),
        status_payed: match.reason !== "unpaid",
        amount_match: match.reason !== "amount_mismatch",
      });
      continue;
    }
    matched += 1;

    const { error } = await applyCallback({
      providerDealId: intent.provider_deal_id ?? match.deal.dealId,
      providerDealNumber: intent.provider_deal_number ?? match.deal.dealNumber,
      offerId,
      amountMinor: intent.amount_minor,
      status: "payed",
      payedMoneyMinor: match.deal.payedMoneyMinor ?? intent.amount_minor,
      leftCostMoneyMinor: match.deal.leftCostMoneyMinor ?? 0,
    });
    if (error) {
      providerError = true;
      logReconcileSkipped("rpc_error", { deal_id_present: true });
      console.info("author_appreciation_getcourse_reconcile_provider_error", {
        reason: "rpc_error",
        exports: 1,
      });
      break;
    }
    applied += 1;
    console.info("author_appreciation_getcourse_reconcile_applied", {
      matched: true,
      applied: 1,
    });
  }

  if (!exported.ok && exported.reason === "provider_error") {
    console.info("author_appreciation_getcourse_reconcile_provider_error", {
      reason: "export_failed",
      exports: 1,
    });
  }

  return {
    attempted: pending.length,
    correlatable: correlatable.length,
    matched,
    applied,
    skipped,
    provider_error: providerError,
    deferred: false,
    exports: 1,
    polls: exported.pollCount,
    skip_reasons_summary: summarizeSkipReasons(skipReasons),
  };
}

export async function reconcilePendingGetCourseAppreciationIntents(
  deps: ReconcileDeps = {},
): Promise<ReconcileResult> {
  if (inFlight && !deps.force) return inFlight;
  const nowMs = (deps.now ?? new Date()).getTime();
  const cooldown = memoryAndFileCooldown(
    deps.cooldown ?? createFileReconcileCooldownStore(),
  );
  if (!deps.force && cooldown.readLastStartedAt() > 0) {
    const elapsed = nowMs - cooldown.readLastStartedAt();
    if (elapsed < RECONCILE_MIN_INTERVAL_MS) {
      return {
        attempted: 0,
        correlatable: 0,
        matched: 0,
        applied: 0,
        skipped: 0,
        provider_error: false,
        deferred: true,
        exports: 0,
        polls: 0,
      };
    }
  }

  const run = (async () => {
    const result = await runReconcile(deps);
    if (result.exports > 0) {
      cooldown.writeLastStartedAt(nowMs);
    }
    return result;
  })();

  inFlight = run.finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function resetGetCourseAppreciationReconcileForTests(): void {
  inFlight = null;
  lastStartedAt = 0;
}
