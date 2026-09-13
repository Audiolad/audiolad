import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin/guard";
import { fetchWordstatSuggestions } from "@/lib/seo/wordstat/client";
import {
  wordstatError,
  wordstatHttpStatus,
} from "@/lib/seo/wordstat/errors";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const MAX_IMPORT_ITEMS = 20;

type IntakeItem = {
  phrase: string;
  count: number;
};

function readPhrase(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readImportItems(value: unknown):
  | { ok: true; items: IntakeItem[] }
  | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_IMPORT_ITEMS) {
    return { ok: false, error: "invalid_import_items" };
  }

  const items: IntakeItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: "invalid_import_item" };
    }

    const record = item as Record<string, unknown>;
    const phrase = readPhrase(record.phrase);
    if (!phrase || !Number.isInteger(record.count) || (record.count as number) < 0) {
      return { ok: false, error: "invalid_import_item" };
    }
    items.push({ phrase, count: record.count as number });
  }

  return { ok: true, items };
}

async function refreshExistingQuery(
  normalizedQuery: string,
  frequency: number,
  frequencyCheckedAt: string,
) {
  const supabase = createServiceRoleClient();
  const { data: existing, error: lookupError } = await supabase
    .from("seo_queries")
    .select("id")
    .eq("normalized_query", normalizedQuery)
    .maybeSingle();

  if (lookupError || !existing) {
    return null;
  }

  const { data, error } = await supabase
    .from("seo_queries")
    .update({ frequency, frequency_checked_at: frequencyCheckedAt })
    .eq("id", existing.id)
    .select("id, frequency")
    .single();

  return error || !data ? null : data;
}

async function importItem(item: IntakeItem) {
  const supabase = createServiceRoleClient();
  // Database normalization is authoritative for conflict detection.
  const { data: normalizedQuery, error: normalizeError } = await supabase.rpc(
    "normalize_seo_query",
    { p_query: item.phrase },
  );
  if (normalizeError || typeof normalizedQuery !== "string" || !normalizedQuery) {
    return { phrase: item.phrase, frequency: item.count, status: "error" as const };
  }

  const frequencyCheckedAt = new Date().toISOString();
  const refreshed = await refreshExistingQuery(
    normalizedQuery,
    item.count,
    frequencyCheckedAt,
  );
  if (refreshed) {
    return {
      id: refreshed.id,
      phrase: item.phrase,
      frequency: refreshed.frequency,
      status: "refreshed" as const,
    };
  }

  const { data: created, error: insertError } = await supabase
    .from("seo_queries")
    .insert({
      query_text: item.phrase,
      source: "wordstat",
      frequency: item.count,
      frequency_checked_at: frequencyCheckedAt,
      analysis_status: "not_analyzed",
    })
    .select("id, frequency")
    .single();

  if (!insertError && created) {
    return {
      id: created.id,
      phrase: item.phrase,
      frequency: created.frequency,
      status: "created" as const,
    };
  }

  // A concurrent intake can win after the lookup. Refresh that row, without
  // changing any of its classification, reservation, or product metadata.
  if (insertError?.code === "23505") {
    const racedRefresh = await refreshExistingQuery(
      normalizedQuery,
      item.count,
      frequencyCheckedAt,
    );
    if (racedRefresh) {
      return {
        id: racedRefresh.id,
        phrase: item.phrase,
        frequency: racedRefresh.frequency,
        status: "refreshed" as const,
      };
    }
  }

  return { phrase: item.phrase, frequency: item.count, status: "error" as const };
}

/**
 * Admin-only Wordstat GetTop proxy. Browser input is limited to the phrase;
 * server-side configuration supplies credentials, region, and device.
 */
export async function POST(request: Request) {
  const session = await requireAdminPermission("seo.manage");

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const phrase = readPhrase(body.phrase);
  if (!phrase) {
    return NextResponse.json({ error: "phrase_required" }, { status: 400 });
  }

  const result = await fetchWordstatSuggestions(phrase, { userId: session.userId });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: wordstatHttpStatus(result.error.code) },
    );
  }

  return NextResponse.json(result.data);
}

export async function PUT(request: Request) {
  await requireAdminPermission("seo.manage");

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = readImportItems(body.items);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const results = await Promise.all(parsed.items.map(importItem));
  const created = results.filter((item) => item.status === "created").length;
  const refreshed = results.filter((item) => item.status === "refreshed").length;
  const errors = results.filter((item) => item.status === "error").length;

  return NextResponse.json({ results, summary: { created, refreshed, errors } });
}
