import "server-only";

import {
  isAppreciationIntentStatus,
  isAppreciationSurface,
  projectAppreciationAnalytics,
  type AppreciationAnalyticsProjection,
  type AppreciationIntentFact,
} from "@/lib/admin/appreciation-analytics";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const LIST_LIMIT = 50;

type IntentRow = {
  id: string;
  author_id: string;
  practice_id: string | null;
  surface: string;
  source_title: string | null;
  amount_minor: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  authors:
    | { name: string | null }
    | { name: string | null }[]
    | null;
};

type AccrualRow = {
  author_appreciation_intent_id: string;
  amount_minor: number;
  available_at: string | null;
};

function asAuthorName(value: IntentRow["authors"]): string {
  const row = Array.isArray(value) ? value[0] : value;
  const name = row?.name?.trim();
  return name && name.length > 0 ? name : "Автор";
}

export async function getAdminAppreciationAnalytics(): Promise<AppreciationAnalyticsProjection> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("author_appreciation_payment_intents")
    .select(
      "id, author_id, practice_id, surface, source_title, amount_minor, status, paid_at, created_at, authors(name)",
    )
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    console.error("admin_appreciation_analytics_intents_error", error.message);
    return projectAppreciationAnalytics([]);
  }

  const intents = (data ?? []) as IntentRow[];
  const intentIds = intents.map((row) => row.id);
  const accrualByIntent = new Map<string, AccrualRow>();

  if (intentIds.length > 0) {
    const { data: accruals, error: accrualError } = await supabase
      .from("author_ledger_entries")
      .select("author_appreciation_intent_id, amount_minor, available_at")
      .eq("entry_type", "sale_accrual")
      .in("author_appreciation_intent_id", intentIds);

    if (accrualError) {
      console.error("admin_appreciation_analytics_ledger_error", accrualError.message);
    } else {
      for (const raw of accruals ?? []) {
        const row = raw as AccrualRow;
        if (row.author_appreciation_intent_id) {
          accrualByIntent.set(row.author_appreciation_intent_id, row);
        }
      }
    }
  }

  const facts: AppreciationIntentFact[] = intents.flatMap((row) => {
    if (!isAppreciationIntentStatus(row.status)) return [];
    const surface = isAppreciationSurface(row.surface) ? row.surface : "author";
    const accrual = accrualByIntent.get(row.id);
    return [
      {
        intentId: row.id,
        authorId: row.author_id,
        authorName: asAuthorName(row.authors),
        surface,
        productTitle:
          surface === "product" ? row.source_title : null,
        amountMinor: Number(row.amount_minor) || 0,
        status: row.status,
        paidAt: row.paid_at,
        createdAt: row.created_at,
        authorAccruedMinor: accrual ? Number(accrual.amount_minor) || 0 : null,
        availableAt: accrual?.available_at ?? null,
      },
    ];
  });

  return projectAppreciationAnalytics(facts);
}
