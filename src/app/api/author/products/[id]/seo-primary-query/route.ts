import { NextResponse } from "next/server";

import {
  handleAuthorRouteError,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { catalogPickSeoPrimaryFields } from "@/lib/seo-queries/published-query-occupancy";
import { assertPublishedProductSeoAttachEnabled } from "@/lib/seo-queries/published-product-seo-attach-gate";
import {
  attachPublishedProductSeoQuery,
  mapPublishedSeoAttachError,
  searchPublishedProductSeoQueries,
} from "@/lib/seo-queries/published-product-seo-attach";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function betaOrLifecycleGate(practice: {
  author_id: string;
  product_kind?: string | null;
  publication_class?: string | null;
  status: string;
  deleted_at: string | null;
  primary_seo_query_id: string | null;
}) {
  assertPublishedProductSeoAttachEnabled({
    authorId: practice.author_id,
    productKind: practice.product_kind,
    publicationClass: practice.publication_class,
  });
  if (practice.deleted_at) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (practice.status !== "published") {
    return NextResponse.json(
      {
        error: "seo_attach_product_not_published",
        message: "Закрепить запрос можно только у опубликованного продукта.",
      },
      { status: 409 },
    );
  }
  return null;
}

/** Search analyzed seo_queries for attaching to a published product (no external suggestions). */
async function loadPrimarySeoQueryId(
  practiceId: string,
): Promise<string | null> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("practices")
    .select("primary_seo_query_id")
    .eq("id", practiceId)
    .maybeSingle();
  if (error) throw error;
  return typeof data?.primary_seo_query_id === "string"
    ? data.primary_seo_query_id
    : null;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { practice } = await requirePracticeMutationAccess(id);
    const primarySeoQueryId = await loadPrimarySeoQueryId(practice.id);
    const blocked = betaOrLifecycleGate({
      ...practice,
      primary_seo_query_id: primarySeoQueryId,
    });
    if (blocked) return blocked;

    const url = new URL(request.url);
    const phrase = (url.searchParams.get("q") ?? url.searchParams.get("phrase") ?? "").trim();
    if (!phrase) {
      return NextResponse.json({
        phrase: "",
        normalized: null,
        exactNormalizedMatch: false,
        matches: [],
      });
    }

    const service = createServiceRoleClient();
    const result = await searchPublishedProductSeoQueries(service, {
      phrase,
      productId: practice.id,
      authorId: practice.author_id,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "seo_discovery_beta_disabled"
    ) {
      return NextResponse.json(
        { error: "seo_discovery_beta_disabled", code: "seo_discovery_beta_disabled" },
        { status: 403 },
      );
    }
    return handleAuthorRouteError(error);
  }
}

/** Attach existing or create+attach query to a published Aurafon or music product. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { practice } = await requirePracticeMutationAccess(id);
    const primarySeoQueryId = await loadPrimarySeoQueryId(practice.id);
    const blocked = betaOrLifecycleGate({
      ...practice,
      primary_seo_query_id: primarySeoQueryId,
    });
    if (blocked) return blocked;

    if (primarySeoQueryId) {
      return NextResponse.json(
        {
          error: "practice_already_has_primary_seo_query",
          message: "У этого продукта уже закреплён основной поисковый запрос.",
        },
        { status: 409 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      query_id?: unknown;
      query_text?: unknown;
    };
    const queryId =
      typeof body.query_id === "string" ? body.query_id.trim() : "";
    const queryText =
      typeof body.query_text === "string" ? body.query_text.trim() : "";

    const picked = catalogPickSeoPrimaryFields({
      queryId: queryId || null,
      queryText: queryText || null,
    });
    if (!picked.primary_seo_query_id && !picked.seo_primary_query) {
      return NextResponse.json(
        { error: "seo_query_required", message: "Введите поисковый запрос." },
        { status: 400 },
      );
    }

    const service = createServiceRoleClient();
    const result = await attachPublishedProductSeoQuery(service, {
      productId: practice.id,
      queryId: picked.primary_seo_query_id,
      queryText: picked.primary_seo_query_id ? null : picked.seo_primary_query,
    });

    return NextResponse.json({
      queryId: result.queryId,
      queryText: result.queryText,
      reservationId: result.reservationId,
      status: result.status,
      createdQuery: result.createdQuery,
      idempotent: result.idempotent,
      message: "Запрос закреплён за этим продуктом.",
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "seo_discovery_beta_disabled"
    ) {
      return NextResponse.json(
        { error: "seo_discovery_beta_disabled", code: "seo_discovery_beta_disabled" },
        { status: 403 },
      );
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      "status" in error &&
      typeof (error as { status?: unknown }).status === "number"
    ) {
      const mapped = error as { code: string; status: number; message: string };
      const fromMessage = mapPublishedSeoAttachError(mapped.code);
      return NextResponse.json(
        {
          error: mapped.code || fromMessage.code,
          message: mapped.message || fromMessage.message,
        },
        { status: mapped.status || fromMessage.status },
      );
    }
    return handleAuthorRouteError(error);
  }
}
