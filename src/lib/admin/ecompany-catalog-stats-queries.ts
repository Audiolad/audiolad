import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  catalogCountPoints,
  catalogPeriods,
  composeCatalogStats,
  parseCounts,
  parseSnapshot,
  type CatalogCounts,
  type CatalogSnapshot,
  type CatalogStatsModel,
} from "./ecompany-catalog-stats";

/**
 * c353a4b5: one aggregate RPC (a few hundred rows scanned), one idempotent daily snapshot upsert,
 * one history read. Errors degrade to "нет данных" and never break the ИИ-компания board.
 */
export async function loadCatalogStats(now: Date = new Date()): Promise<{ model: CatalogStatsModel | null; error: string | null }> {
  try {
    const supabase = createServiceRoleClient();
    // Snapshot first so today's row exists; a failed capture still lets the totals render.
    const capture = await supabase.rpc("ecompany_catalog_stats_capture");
    if (capture.error) console.error("ecompany_catalog_stats_capture_error", capture.error.message);

    const points = catalogCountPoints(now, catalogPeriods(now));
    const [counts, history] = await Promise.all([
      supabase.rpc("ecompany_catalog_stats_counts", { p_points: points.map((p) => p.toISOString()) }),
      supabase.rpc("ecompany_catalog_stats_history", { p_limit: 400 }),
    ]);
    if (counts.error || !Array.isArray(counts.data)) {
      console.error("ecompany_catalog_stats_counts_error", counts.error?.message);
      return { model: null, error: "Статистика каталога сейчас недоступна." };
    }
    const countsAt = new Map<number, CatalogCounts>();
    for (const row of counts.data as Array<Record<string, unknown>>) {
      const parsed = parseCounts(row);
      const at = typeof row.point === "string" ? Date.parse(row.point) : NaN;
      if (parsed && Number.isFinite(at)) countsAt.set(at, parsed);
    }
    // Map DB-normalised instants back to our exact points.
    const aligned = new Map<number, CatalogCounts>();
    for (const p of points) {
      const hit = countsAt.get(p.getTime()) ?? countsAt.get(Math.floor(p.getTime() / 1000) * 1000);
      if (hit) aligned.set(p.getTime(), hit);
    }
    const snapshots: CatalogSnapshot[] = history.error || !Array.isArray(history.data)
      ? []
      : (history.data as unknown[]).map(parseSnapshot).filter((s): s is CatalogSnapshot => s !== null);
    if (history.error) console.error("ecompany_catalog_stats_history_error", history.error.message);
    const model = composeCatalogStats(now, aligned, snapshots);
    return model ? { model, error: null } : { model: null, error: "Статистика каталога вернула неполные данные." };
  } catch (error) {
    console.error("ecompany_catalog_stats_load_error", error);
    return { model: null, error: "Статистика каталога сейчас недоступна." };
  }
}
