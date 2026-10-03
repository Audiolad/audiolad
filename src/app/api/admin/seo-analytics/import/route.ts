import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin/guard";
import { aggregateSearchMetrics } from "@/lib/seo-analytics/aggregate";
import { previewSeoQueryMatches } from "@/lib/seo-analytics/load-dashboard";
import { seoAnalyticsErrorMessage } from "@/lib/seo-analytics/messages";
import { importYandexWebmasterSnapshot } from "@/lib/seo-analytics/persist-import";
import {
  parseYandexWebmasterXlsx,
  SEO_ANALYTICS_MAX_XLSX_BYTES,
  SeoAnalyticsImportError,
} from "@/lib/seo-analytics/yandex-webmaster-xlsx";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const maxDuration = 60;

function jsonError(code: string, status: number, detail?: string) {
  return NextResponse.json(
    { error: code, message: detail || seoAnalyticsErrorMessage(code) },
    { status },
  );
}

function rpcErrorCode(error: { message?: string }): string {
  const message = error.message ?? "";
  if (message.includes("import_seo_search_snapshot") && /does not exist|schema cache/i.test(message)) {
    return "migration_required";
  }
  const known = [
    "permission_denied",
    "duplicate_normalized_query",
    "invalid_metrics",
    "invalid_period",
    "unsupported_source",
    "invalid_filename",
  ];
  return known.find((code) => message.includes(code)) ?? "import_failed";
}

export async function POST(request: Request) {
  await requireAdminPermission("seo.manage");

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("not_xlsx", 400);
  }

  const intent = formData.get("intent");
  if (intent !== "preview" && intent !== "commit") {
    return jsonError("preview_failed", 400, "Нужно указать режим preview или commit.");
  }
  const file = formData.get("file");
  if (!(file instanceof File)) return jsonError("file_required", 400);
  if (!file.name.toLowerCase().endsWith(".xlsx")) return jsonError("not_xlsx", 400);
  if (file.size > SEO_ANALYTICS_MAX_XLSX_BYTES) return jsonError("file_too_large", 400);

  let workbook;
  try {
    workbook = parseYandexWebmasterXlsx(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof SeoAnalyticsImportError) {
      return jsonError(error.code, 400, error.message);
    }
    return jsonError("not_xlsx", 400);
  }

  const totals = aggregateSearchMetrics(workbook.rows);
  if (intent === "preview") {
    try {
      const matches = await previewSeoQueryMatches(workbook.rows.map((row) => row.normalizedQuery));
      return NextResponse.json({
        periodStart: workbook.periodStart,
        periodEnd: workbook.periodEnd,
        rowCount: workbook.sourceRowCount,
        sourceRowCount: workbook.sourceRowCount,
        metricCount: workbook.rows.length,
        collapsedGroupCount: workbook.collapsedGroupCount,
        impressions: totals.impressions,
        clicks: totals.clicks,
        matched: matches.matched,
        fresh: matches.fresh,
      });
    } catch (error) {
      console.error("seo_analytics_map_match_failed", error);
      return jsonError("seo_map_match_failed", 500);
    }
  }

  try {
    const result = await importYandexWebmasterSnapshot(
      createServiceRoleClient(),
      workbook,
      file.name,
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("seo_analytics_import_failed", error);
    const code = rpcErrorCode(error as { message?: string });
    return jsonError(code, code === "migration_required" || code === "import_failed" ? 500 : 400);
  }
}
