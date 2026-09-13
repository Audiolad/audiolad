import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin/guard";
import {
  importWordstatIntakeItem,
  readWordstatIntakeItems,
  type WordstatIntakeRepository,
} from "@/lib/seo-queries/wordstat-intake";
import { fetchWordstatSuggestions } from "@/lib/seo/wordstat/client";
import { wordstatHttpStatus } from "@/lib/seo/wordstat/errors";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

function readPhrase(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function createWordstatIntakeRepository(): WordstatIntakeRepository {
  const supabase = createServiceRoleClient();
  return {
    async normalize(phrase) {
      const { data, error } = await supabase.rpc("normalize_seo_query", {
        p_query: phrase,
      });
      return error || typeof data !== "string" || !data ? null : data;
    },
    async findByNormalized(normalizedQuery) {
      const { data, error } = await supabase
        .from("seo_queries")
        .select("id")
        .eq("normalized_query", normalizedQuery)
        .maybeSingle();
      if (error) return undefined;
      return data ? { id: data.id } : null;
    },
    async refresh(id, frequency, frequencyCheckedAt) {
      const { data, error } = await supabase
        .from("seo_queries")
        .update({ frequency, frequency_checked_at: frequencyCheckedAt })
        .eq("id", id)
        .select("id, frequency")
        .single();
      return error || !data ? null : { id: data.id, frequency: data.frequency };
    },
    async create({ queryText, source, frequency, frequencyCheckedAt, analysisStatus }) {
      const { data, error } = await supabase
        .from("seo_queries")
        .insert({
          query_text: queryText,
          source,
          frequency,
          frequency_checked_at: frequencyCheckedAt,
          analysis_status: analysisStatus,
        })
        .select("id, frequency")
        .single();
      if (data && !error) {
        return { status: "created" as const, query: { id: data.id, frequency: data.frequency } };
      }
      return error?.code === "23505"
        ? { status: "conflict" as const }
        : { status: "error" as const };
    },
  };
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

  const parsed = readWordstatIntakeItems(body.items);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const repository = createWordstatIntakeRepository();
  const results = await Promise.all(
    parsed.items.map((item) => importWordstatIntakeItem(item, repository)),
  );
  const created = results.filter((item) => item.status === "created").length;
  const refreshed = results.filter((item) => item.status === "refreshed").length;
  const errors = results.filter((item) => item.status === "error").length;

  return NextResponse.json({ results, summary: { created, refreshed, errors } });
}
