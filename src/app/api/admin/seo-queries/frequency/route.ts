import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin/guard";
import { parseSeoQueryIds } from "@/lib/seo-queries/analysis-validation";
import { refreshMissingSeoQueryFrequencies } from "@/lib/seo-queries/analysis-plan";
import { fetchWordstatSuggestions } from "@/lib/seo/wordstat/client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Admin-only: fills a missing Wordstat frequency for selected SEO queries.
 * Uses the shared Wordstat client (cache + per-user and process quotas). Never overwrites an
 * existing frequency and never touches review fields or analysis_status.
 */
export async function POST(request: Request) {
  const session = await requireAdminPermission("seo.manage");
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const ids = parseSeoQueryIds(body.query_ids);
  if (!ids) return NextResponse.json({ error: "invalid_query_ids" }, { status: 400 });

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("seo_queries")
    .select("id, query_text, frequency")
    .in("id", ids);
  if (error) {
    return NextResponse.json({ error: "seo_query_frequency_load_failed" }, { status: 400 });
  }
  const byId = new Map((data ?? []).map((row) => [row.id as string, row]));
  const rows = ids.flatMap((id) => {
    const row = byId.get(id);
    return row
      ? [{ id, query_text: row.query_text as string, frequency: (row.frequency as number | null) ?? null }]
      : [];
  });

  const results = await refreshMissingSeoQueryFrequencies(rows, {
    fetchWordstat: (phrase) => fetchWordstatSuggestions(phrase, { userId: session.userId }),
    async saveFrequency(id, frequency, checkedAt) {
      const { data: saved, error: saveError } = await supabase
        .from("seo_queries")
        .update({ frequency, frequency_checked_at: checkedAt })
        .eq("id", id)
        .is("frequency", null)
        .select("id")
        .maybeSingle();
      return !saveError && Boolean(saved);
    },
  });
  return NextResponse.json({ results });
}
