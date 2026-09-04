/**
 * Author-cabinet appreciation reads. Access must already be proved.
 * Uses service_role only because intent/ledger tables are not author-readable.
 */

import "server-only";

import {
  isAppreciationSurface,
  type AppreciationSurface,
} from "@/lib/admin/appreciation-analytics";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  filterAuthorAppreciationFactsForAuthor,
  isPaidAtInRange,
  projectAuthorAppreciationCabinet,
  type AuthorAppreciationCabinetFact,
  type AuthorAppreciationFinanceRow,
  type AuthorAppreciationFinanceSummary,
} from "./appreciation-cabinet";

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
};

type AccrualRow = {
  id: string;
  author_id: string;
  author_appreciation_intent_id: string;
  amount_minor: number;
  available_at: string | null;
};

type AllocationRow = {
  ledger_entry_id: string;
  status: string;
};

type PracticeRow = {
  id: string;
  slug: string | null;
};

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asPayoutAllocationStatus(
  value: string | null | undefined,
): AuthorAppreciationCabinetFact["payoutAllocationStatus"] {
  if (
    value === "reserved" ||
    value === "paid" ||
    value === "released" ||
    value === "requires_review"
  ) {
    return value;
  }
  return null;
}

export type AuthorAppreciationFinanceQuery = {
  authorId: string;
  from?: string | null;
  to?: string | null;
};

export async function loadAuthorAppreciationCabinetFacts(
  input: AuthorAppreciationFinanceQuery,
): Promise<AuthorAppreciationCabinetFact[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("author_appreciation_payment_intents")
    .select(
      "id, author_id, practice_id, surface, source_title, amount_minor, status, paid_at, created_at",
    )
    .eq("author_id", input.authorId)
    .eq("status", "paid")
    .order("paid_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("author_appreciation_finance_intents_error", error.message);
    return [];
  }

  const intents = ((data ?? []) as IntentRow[]).filter(
    (row) => row.author_id === input.authorId && row.status === "paid",
  );
  const intentIds = intents.map((row) => row.id);
  const practiceIds = [
    ...new Set(
      intents
        .map((row) => row.practice_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const accrualByIntent = new Map<string, AccrualRow>();
  const allocationByEntry = new Map<string, string>();
  const slugByPractice = new Map<string, string>();

  if (intentIds.length > 0) {
    const { data: accruals, error: accrualError } = await supabase
      .from("author_ledger_entries")
      .select("id, author_id, author_appreciation_intent_id, amount_minor, available_at")
      .eq("author_id", input.authorId)
      .eq("entry_type", "sale_accrual")
      .in("author_appreciation_intent_id", intentIds);

    if (accrualError) {
      console.error("author_appreciation_finance_ledger_error", accrualError.message);
    } else {
      for (const raw of accruals ?? []) {
        const row = raw as AccrualRow;
        if (
          row.author_appreciation_intent_id &&
          row.author_id === input.authorId
        ) {
          accrualByIntent.set(row.author_appreciation_intent_id, row);
        }
      }
    }

    const entryIds = [...accrualByIntent.values()].map((row) => row.id);
    if (entryIds.length > 0) {
      const { data: allocations, error: allocationError } = await supabase
        .from("author_payout_allocations")
        .select("ledger_entry_id, status")
        .eq("author_id", input.authorId)
        .in("ledger_entry_id", entryIds);

      if (allocationError) {
        console.error(
          "author_appreciation_finance_allocation_error",
          allocationError.message,
        );
      } else {
        for (const raw of allocations ?? []) {
          const row = raw as AllocationRow;
          if (row.ledger_entry_id) {
            allocationByEntry.set(row.ledger_entry_id, row.status);
          }
        }
      }
    }
  }

  if (practiceIds.length > 0) {
    const { data: practices, error: practiceError } = await supabase
      .from("practices")
      .select("id, slug")
      .in("id", practiceIds);

    if (practiceError) {
      console.error("author_appreciation_finance_practice_error", practiceError.message);
    } else {
      for (const raw of practices ?? []) {
        const row = raw as PracticeRow;
        if (row.id && row.slug) {
          slugByPractice.set(row.id, row.slug);
        }
      }
    }
  }

  const facts: AuthorAppreciationCabinetFact[] = intents.flatMap((row) => {
    const surface: AppreciationSurface = isAppreciationSurface(row.surface)
      ? row.surface
      : "author";
    const accrual = accrualByIntent.get(row.id);
    return [
      {
        intentId: row.id,
        authorId: row.author_id,
        intentStatus: row.status,
        surface,
        sourceTitle: row.source_title,
        practiceId: surface === "product" ? row.practice_id : null,
        practiceSlug:
          surface === "product" && row.practice_id
            ? slugByPractice.get(row.practice_id) ?? null
            : null,
        amountMinor: asNumber(row.amount_minor),
        createdAt: row.created_at,
        paidAt: row.paid_at,
        currency: "RUB",
        hasSaleAccrual: accrual !== undefined,
        authorAccruedMinor: accrual ? asNumber(accrual.amount_minor) : null,
        availableAt: accrual?.available_at ?? null,
        payoutAllocationStatus: accrual
          ? asPayoutAllocationStatus(allocationByEntry.get(accrual.id) ?? null)
          : null,
      },
    ];
  });

  return filterAuthorAppreciationFactsForAuthor(facts, input.authorId);
}

export async function getAuthorAppreciationFinanceList(input: {
  authorId: string;
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
}): Promise<{
  summary: AuthorAppreciationFinanceSummary;
  total: number;
  limit: number;
  offset: number;
  rows: AuthorAppreciationFinanceRow[];
}> {
  const limit = input.limit ?? 100;
  const offset = input.offset ?? 0;
  const facts = (await loadAuthorAppreciationCabinetFacts(input)).filter((fact) =>
    isPaidAtInRange(fact.paidAt, input.from, input.to),
  );
  const projected = projectAuthorAppreciationCabinet(facts);
  const rows = projected.rows.slice(offset, offset + limit);

  return {
    summary: projected.summary,
    total: projected.rows.length,
    limit,
    offset,
    rows,
  };
}
