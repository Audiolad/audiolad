import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin/guard";
import { sendSeoQueryProposalApprovedAuthorEmail } from "@/lib/email/send-seo-query-proposal-decision-email";
import { sendSeoQueryProposalRejectedAuthorEmail } from "@/lib/email/send-seo-query-proposal-decision-email";
import { classifySeoQuery } from "@/lib/seo-queries/classifier";
import {
  parseSeoQueryIds,
  SEO_QUERY_ANALYSIS_MAX_ITEMS,
  validateSeoQueryApplyItem,
} from "@/lib/seo-queries/analysis-validation";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function POST(request: Request) {
  await requireAdminPermission("seo.manage");
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const ids = parseSeoQueryIds(body.query_ids);
  if (!ids) return NextResponse.json({ error: "invalid_query_ids" }, { status: 400 });

  const { data, error } = await createServiceRoleClient()
    .from("seo_queries")
    .select("id, query_text, source, frequency, analysis_status")
    .in("id", ids);
  if (error) {
    return NextResponse.json(
      { error: "seo_query_analysis_load_failed" },
      { status: 400 },
    );
  }
  const byId = new Map((data ?? []).map((row) => [row.id as string, row]));
  const results = ids.map((id) => {
    const row = byId.get(id);
    if (!row) return { id, status: "not_found" as const };
    if (row.analysis_status !== "not_analyzed") {
      return {
        id,
        query_text: row.query_text,
        source: row.source,
        frequency: row.frequency,
        current_analysis_status: row.analysis_status,
        status: "already_reviewed" as const,
      };
    }
    const suggested = classifySeoQuery({ queryText: row.query_text as string });
    return {
      id,
      query_text: row.query_text,
      source: row.source,
      frequency: row.frequency,
      current_analysis_status: row.analysis_status,
      status: "ready_for_review" as const,
      suggested: {
        intent: suggested.intent,
        recommended_format: suggested.recommendedFormat,
        audio_fit: suggested.audioFit,
        recommended_disposition: suggested.recommendedDisposition,
        confidence: suggested.confidence,
        reasons: suggested.reasons,
      },
    };
  });
  return NextResponse.json({ results });
}

async function loadSubmitterEmail(
  supabase: ReturnType<typeof createServiceRoleClient>,
  userId: string | null,
): Promise<string | null> {
  if (!userId) return null;
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

export async function PUT(request: Request) {
  await requireAdminPermission("seo.manage");
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const items = body.items;
  if (
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > SEO_QUERY_ANALYSIS_MAX_ITEMS
  ) {
    return NextResponse.json({ error: "invalid_items" }, { status: 400 });
  }
  const ids = items.map((item) =>
    item && typeof item === "object"
      ? (item as Record<string, unknown>).id
      : null,
  );
  if (!parseSeoQueryIds(ids)) {
    return NextResponse.json({ error: "invalid_items" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const results: Array<Record<string, unknown>> = [];

  for (const input of items) {
    const parsed = validateSeoQueryApplyItem(input);
    const raw =
      input && typeof input === "object"
        ? (input as Record<string, unknown>)
        : null;
    const id =
      raw && typeof raw.id === "string" ? (raw.id as string) : null;
    const proposalIdOverride =
      raw && typeof raw.proposal_id === "string"
        ? (raw.proposal_id as string)
        : null;
    if (!parsed) {
      results.push({ id, status: "invalid_item" });
      continue;
    }
    const {
      id: queryId,
      intent,
      recommendedFormat,
      audioFit,
      analysisStatus,
    } = parsed;

    const { data: proposal } = proposalIdOverride
      ? await supabase
          .from("seo_query_proposals")
          .select(
            "id, query_id, author_id, submitted_by_user_id, authors(name, slug)",
          )
          .eq("id", proposalIdOverride)
          .maybeSingle()
      : await supabase
          .from("seo_query_proposals")
          .select(
            "id, query_id, author_id, submitted_by_user_id, authors(name, slug)",
          )
          .eq("query_id", queryId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

    if (proposal && proposal.query_id === queryId) {
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "admin_review_seo_query_proposal",
        {
          p_proposal_id: proposal.id,
          p_decision: analysisStatus,
          p_intent: intent,
          p_recommended_format: recommendedFormat,
          p_audio_fit: audioFit,
        },
      );

      if (rpcError) {
        const message = rpcError.message ?? "";
        let status = "error";
        if (message.includes("seo_reservation_limit_reached")) {
          status = "reservation_limit_reached";
        } else if (
          message.includes("seo_query_already_reserved") ||
          message.includes("seo_query_already_used")
        ) {
          status = "reservation_conflict";
        } else if (message.includes("seo_proposal_already_analyzed")) {
          status = "already_reviewed";
        }
        results.push({ id: queryId, status, message });
        continue;
      }

      const payload = (rpcData ?? {}) as Record<string, unknown>;
      results.push({
        id: queryId,
        status: "applied",
        analysis_status: payload.analysis_status ?? analysisStatus,
        reservation_id: payload.reservation_id ?? null,
        proposal_id: proposal.id,
        idempotent: Boolean(payload.idempotent),
        reconciled: Boolean(payload.reconciled),
        expires_at: payload.expires_at ?? null,
      });

      // Non-blocking author emails.
      try {
        const author = Array.isArray(proposal.authors)
          ? proposal.authors[0]
          : proposal.authors;
        const authorSlug =
          typeof author?.slug === "string" ? author.slug : null;
        const recipientEmail = await loadSubmitterEmail(
          supabase,
          (proposal.submitted_by_user_id as string | null) ?? null,
        );
        if (recipientEmail && authorSlug) {
          if (
            analysisStatus === "analyzed" &&
            typeof payload.reservation_id === "string"
          ) {
            const emailResult = await sendSeoQueryProposalApprovedAuthorEmail({
              proposalId: proposal.id as string,
              recipientEmail,
              queryText: String(payload.query_text ?? ""),
              frequency:
                typeof payload.frequency === "number"
                  ? (payload.frequency as number)
                  : null,
              expiresAt: String(payload.expires_at ?? ""),
              authorSlug,
              reservationId: payload.reservation_id as string,
              supabase,
            });
            if (!emailResult.ok) {
              console.error(
                "seo_proposal_approved_email_failed",
                emailResult.code,
              );
            }
          } else if (analysisStatus === "not_applicable") {
            const emailResult = await sendSeoQueryProposalRejectedAuthorEmail({
              proposalId: proposal.id as string,
              recipientEmail,
              queryText: String(payload.query_text ?? ""),
              authorSlug,
              supabase,
            });
            if (!emailResult.ok) {
              console.error(
                "seo_proposal_rejected_email_failed",
                emailResult.code,
              );
            }
          }
        } else {
          console.error("seo_proposal_author_email_skipped_missing_recipient");
        }
      } catch (error) {
        console.error(
          "seo_proposal_author_email_unexpected",
          error instanceof Error ? error.message : error,
        );
      }
      continue;
    }

    // Ordinary admin query without proposal — preserve existing path.
    const { data: reservation } = await supabase
      .from("seo_query_reservations")
      .select("id")
      .eq("query_id", queryId)
      .in("status", ["active", "used"])
      .maybeSingle();
    if (reservation) {
      results.push({ id: queryId, status: "reservation_conflict" });
      continue;
    }
    const { data, error } = await supabase
      .from("seo_queries")
      .update({
        intent,
        recommended_format: recommendedFormat,
        audio_fit: audioFit,
        analysis_status: analysisStatus,
      })
      .eq("id", queryId)
      .eq("analysis_status", "not_analyzed")
      .select("id, intent, recommended_format, audio_fit, analysis_status")
      .maybeSingle();
    if (error) {
      results.push({ id: queryId, status: "error" });
      continue;
    }
    results.push(
      data
        ? { ...data, status: "applied" }
        : { id: queryId, status: "already_reviewed" },
    );
  }

  const summary = {
    analyzed: results.filter(
      (item) => item.status === "applied" && item.analysis_status === "analyzed",
    ).length,
    not_applicable: results.filter(
      (item) =>
        item.status === "applied" && item.analysis_status === "not_applicable",
    ).length,
    conflicts: results.filter(
      (item) =>
        item.status === "already_reviewed" ||
        item.status === "reservation_conflict" ||
        item.status === "reservation_limit_reached",
    ).length,
    errors: results.filter(
      (item) => item.status === "error" || item.status === "invalid_item",
    ).length,
  };
  return NextResponse.json({ results, summary });
}
