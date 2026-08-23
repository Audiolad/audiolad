import { NextResponse } from "next/server";

import {
  AuthorAccessError,
  handleAuthorRouteError,
} from "@/lib/author-products/auth";
import { listAuthorProducts } from "@/lib/author-products/products";
import {
  QUICK_OFFER_DETAIL_SELECT,
  requireQuickOfferAccess,
  requireQuickOfferMutationAccess,
} from "@/lib/quick-offers/access";
import { mapQuickOfferRpcErrorMessage } from "@/lib/quick-offers/errors";
import {
  mapQuickOfferAdminDto,
  mapQuickOfferListItem,
} from "@/lib/quick-offers/mappers";
import { QUICK_OFFER_TEMPLATE_KEY } from "@/lib/quick-offers/types";
import {
  defaultCtaText,
  defaultTimerSeconds,
  isPracticeQuickOfferEligible,
  normalizeFormatLabel,
  normalizeQuickOfferSlug,
  validateFormatLabel,
  validatePromoPrice,
  validateQuickOfferCtaText,
  validateQuickOfferDescription,
  validateQuickOfferSlug,
  validateQuickOfferTitle,
  validateTemplateKey,
  validateTimerDurationSeconds,
} from "@/lib/quick-offers/validation";
import {
  requireAuthorPromotionAccess,
  requireAuthorPromotionMutationAccess,
} from "@/lib/promotion/access";

type JsonRecord = Record<string, unknown>;

const CREATE_FIELDS = new Set([
  "author_id",
  "practice_id",
  "title",
  "slug",
  "short_description",
  "promo_price",
  "cta_text",
  "timer_duration_seconds",
  "template_key",
  "mid_cta_after_count",
]);

const PATCH_FIELDS = new Set([
  "practice_id",
  "title",
  "slug",
  "short_description",
  "promo_price",
  "cta_text",
  "timer_duration_seconds",
  "template_key",
  "mid_cta_after_count",
]);

function rejectUnknownFields(
  record: JsonRecord,
  allowed: ReadonlySet<string>,
): boolean {
  return Object.keys(record).some((key) => !allowed.has(key));
}

function parseAuthorId(request: Request): string | null {
  const url = new URL(request.url);
  const authorId = url.searchParams.get("author_id")?.trim();
  return authorId || null;
}

function parseOptionalString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    return "";
  }

  return value;
}

function parseOptionalInteger(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  return value;
}

async function fetchOfferDetail(
  supabase: Awaited<ReturnType<typeof requireAuthorPromotionAccess>>["supabase"],
  offerId: string,
) {
  const { data, error } = await supabase
    .from("quick_offers")
    .select(QUICK_OFFER_DETAIL_SELECT)
    .eq("id", offerId)
    .maybeSingle();

  if (error) {
    console.error("quick_offer_detail_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  if (!data) {
    throw new AuthorAccessError("not_found", 404);
  }

  return mapQuickOfferAdminDto(data as JsonRecord);
}

async function assertPracticeOwnedAndEligible(
  supabase: Awaited<ReturnType<typeof requireAuthorPromotionAccess>>["supabase"],
  authorId: string,
  practiceId: string,
) {
  const { data, error } = await supabase
    .from("practices")
    .select("id, author_id, status, is_free, price")
    .eq("id", practiceId)
    .maybeSingle();

  if (error) {
    console.error("quick_offer_practice_lookup_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  if (!data) {
    throw new AuthorAccessError("quick_offer_product_not_eligible", 400);
  }

  if (
    !isPracticeQuickOfferEligible(
      {
        author_id: data.author_id,
        status: data.status,
        is_free: data.is_free,
        price: data.price,
      },
      authorId,
    )
  ) {
    throw new AuthorAccessError("quick_offer_product_not_eligible", 400);
  }
}

type WriteInput = {
  practice_id?: string;
  title?: string;
  slug?: string;
  short_description?: string;
  promo_price?: number;
  cta_text?: string;
  timer_duration_seconds?: number;
  template_key?: string;
  mid_cta_after_count?: number | null;
};

function validateWriteInput(
  input: WriteInput,
  options: { requireAll: boolean },
): { error: string } | { payload: WriteInput } {
  const payload: WriteInput = {};

  if (options.requireAll || input.title !== undefined) {
    const title = (input.title ?? "").trim();
    const titleError = validateQuickOfferTitle(title);

    if (titleError) {
      return { error: titleError };
    }

    payload.title = title;
  }

  if (options.requireAll || input.slug !== undefined) {
    const slugSource =
      input.slug ?? (options.requireAll ? payload.title ?? input.title ?? "" : "");
    const slug = normalizeQuickOfferSlug(slugSource);
    const slugError = validateQuickOfferSlug(slug);

    if (slugError) {
      return { error: slugError };
    }

    payload.slug = slug;
  }

  if (options.requireAll || input.short_description !== undefined) {
    const description = (input.short_description ?? "").trim();
    const descriptionError = validateQuickOfferDescription(description);

    if (descriptionError) {
      return { error: descriptionError };
    }

    payload.short_description = description;
  }

  if (options.requireAll || input.promo_price !== undefined) {
    const promoPrice = input.promo_price;
    const promoError = validatePromoPrice(promoPrice);

    if (promoError) {
      return { error: promoError };
    }

    payload.promo_price = promoPrice;
  }

  if (options.requireAll || input.cta_text !== undefined) {
    const cta = (input.cta_text ?? defaultCtaText()).trim();
    const ctaError = validateQuickOfferCtaText(cta);

    if (ctaError) {
      return { error: ctaError };
    }

    payload.cta_text = cta;
  } else if (options.requireAll) {
    payload.cta_text = defaultCtaText();
  }

  if (options.requireAll || input.timer_duration_seconds !== undefined) {
    const timer = input.timer_duration_seconds ?? defaultTimerSeconds();
    const timerError = validateTimerDurationSeconds(timer);

    if (timerError) {
      return { error: timerError };
    }

    payload.timer_duration_seconds = timer;
  }

  if (options.requireAll || input.template_key !== undefined) {
    const templateKey = input.template_key ?? QUICK_OFFER_TEMPLATE_KEY;
    const templateError = validateTemplateKey(templateKey);

    if (templateError) {
      return { error: templateError };
    }

    payload.template_key = templateKey;
  }

  if (input.practice_id !== undefined || options.requireAll) {
    const practiceId = (input.practice_id ?? "").trim();

    if (!practiceId) {
      return { error: "quick_offer_product_not_eligible" };
    }

    payload.practice_id = practiceId;
  }

  if (input.mid_cta_after_count !== undefined) {
    if (
      input.mid_cta_after_count !== null &&
      (typeof input.mid_cta_after_count !== "number" ||
        input.mid_cta_after_count < 1)
    ) {
      return { error: "invalid_request" };
    }

    payload.mid_cta_after_count = input.mid_cta_after_count;
  }

  return { payload };
}

function parseWriteInput(record: JsonRecord): WriteInput {
  return {
    practice_id: parseOptionalString(record.practice_id),
    title: parseOptionalString(record.title),
    slug: parseOptionalString(record.slug),
    short_description: parseOptionalString(record.short_description),
    promo_price:
      typeof record.promo_price === "number" ? record.promo_price : undefined,
    cta_text: parseOptionalString(record.cta_text),
    timer_duration_seconds:
      typeof record.timer_duration_seconds === "number"
        ? record.timer_duration_seconds
        : undefined,
    template_key: parseOptionalString(record.template_key),
    mid_cta_after_count: parseOptionalInteger(record.mid_cta_after_count),
  };
}

export async function GET(request: Request) {
  try {
    const authorId = parseAuthorId(request);

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requireAuthorPromotionAccess(authorId);

    const { data, error } = await supabase
      .from("quick_offers")
      .select(
        `
        id,
        author_id,
        practice_id,
        title,
        slug,
        promo_price,
        status,
        template_key,
        published_at,
        created_at,
        updated_at,
        practices (
          title,
          price
        ),
        quick_offer_materials (
          id
        )
      `,
      )
      .eq("author_id", authorId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("quick_offers_list_error", error.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json({
      offers: (data ?? []).map((row) =>
        mapQuickOfferListItem(row as JsonRecord),
      ),
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const record = body as JsonRecord;
    const authorId =
      typeof record.author_id === "string" ? record.author_id.trim() : "";

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (rejectUnknownFields(record, CREATE_FIELDS)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if ("status" in record || "created_by" in record) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const validated = validateWriteInput(parseWriteInput(record), {
      requireAll: true,
    });

    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const { supabase, user } = await requireAuthorPromotionMutationAccess(authorId);
    await assertPracticeOwnedAndEligible(
      supabase,
      authorId,
      validated.payload.practice_id!,
    );

    const { data: created, error: createError } = await supabase
      .from("quick_offers")
      .insert({
        author_id: authorId,
        practice_id: validated.payload.practice_id,
        title: validated.payload.title,
        slug: validated.payload.slug,
        short_description: validated.payload.short_description,
        promo_price: validated.payload.promo_price,
        cta_text: validated.payload.cta_text,
        timer_duration_seconds: validated.payload.timer_duration_seconds,
        template_key: validated.payload.template_key ?? QUICK_OFFER_TEMPLATE_KEY,
        mid_cta_after_count: validated.payload.mid_cta_after_count ?? null,
        created_by: user.id,
      })
      .select("id")
      .maybeSingle();

    if (createError) {
      if (createError.message.toLowerCase().includes("duplicate")) {
        return NextResponse.json(
          { error: "quick_offer_slug_taken" },
          { status: 409 },
        );
      }

      const mapped = mapQuickOfferRpcErrorMessage(createError.message);
      throw new AuthorAccessError(mapped.error, mapped.status);
    }

    if (!created?.id) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const offer = await fetchOfferDetail(supabase, created.id);
    return NextResponse.json({ offer }, { status: 201 });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function GETEligibleProducts(request: Request) {
  try {
    const authorId = parseAuthorId(request);

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requireAuthorPromotionAccess(authorId);
    const products = await listAuthorProducts(supabase, authorId);

    return NextResponse.json({
      products: products.filter((product) =>
        isPracticeQuickOfferEligible(
          {
            author_id: authorId,
            status: product.status,
            is_free: product.is_free,
            price: product.price,
          },
          authorId,
        ),
      ),
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function GETOfferDetail(offerId: string) {
  try {
    const { offer } = await requireQuickOfferAccess(offerId);
    return NextResponse.json({
      offer: mapQuickOfferAdminDto(offer as JsonRecord),
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function PATCHOffer(offerId: string, request: Request) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const record = body as JsonRecord;

    if (rejectUnknownFields(record, PATCH_FIELDS)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (
      "status" in record ||
      "author_id" in record ||
      "created_by" in record ||
      "published_at" in record
    ) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase, offer } = await requireQuickOfferMutationAccess(offerId);
    const current = mapQuickOfferAdminDto(offer as JsonRecord);
    const validated = validateWriteInput(parseWriteInput(record), {
      requireAll: false,
    });

    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const nextPracticeId =
      validated.payload.practice_id ?? current.practice_id;

    if (nextPracticeId !== current.practice_id) {
      await assertPracticeOwnedAndEligible(
        supabase,
        current.author_id,
        nextPracticeId,
      );
    }

    const { error } = await supabase
      .from("quick_offers")
      .update({
        practice_id: nextPracticeId,
        title: validated.payload.title ?? current.title,
        slug: validated.payload.slug ?? current.slug,
        short_description:
          validated.payload.short_description ?? current.short_description,
        promo_price: validated.payload.promo_price ?? current.promo_price,
        cta_text: validated.payload.cta_text ?? current.cta_text,
        timer_duration_seconds:
          validated.payload.timer_duration_seconds ??
          current.timer_duration_seconds,
        template_key: validated.payload.template_key ?? current.template_key,
        mid_cta_after_count:
          validated.payload.mid_cta_after_count !== undefined
            ? validated.payload.mid_cta_after_count
            : current.mid_cta_after_count,
      })
      .eq("id", offerId);

    if (error) {
      if (error.message.toLowerCase().includes("duplicate")) {
        return NextResponse.json(
          { error: "quick_offer_slug_taken" },
          { status: 409 },
        );
      }

      const mapped = mapQuickOfferRpcErrorMessage(error.message);
      throw new AuthorAccessError(mapped.error, mapped.status);
    }

    const next = await fetchOfferDetail(supabase, offerId);
    return NextResponse.json({ offer: next });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POSTPublish(offerId: string) {
  try {
    const { supabase } = await requireQuickOfferMutationAccess(offerId);
    const { data, error } = await supabase.rpc("publish_quick_offer", {
      p_offer_id: offerId,
    });

    if (error) {
      const mapped = mapQuickOfferRpcErrorMessage(error.message);
      return NextResponse.json(
        { error: mapped.error },
        { status: mapped.status },
      );
    }

    const offer = await fetchOfferDetail(supabase, offerId);
    return NextResponse.json({ offer, result: data });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POSTUnpublish(offerId: string) {
  try {
    const { supabase } = await requireQuickOfferMutationAccess(offerId);
    const { data, error } = await supabase.rpc("unpublish_quick_offer", {
      p_offer_id: offerId,
    });

    if (error) {
      const mapped = mapQuickOfferRpcErrorMessage(error.message);
      return NextResponse.json(
        { error: mapped.error },
        { status: mapped.status },
      );
    }

    const offer = await fetchOfferDetail(supabase, offerId);
    return NextResponse.json({ offer, result: data });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POSTMaterial(offerId: string, request: Request) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const record = body as JsonRecord;
    const formatLabel = normalizeFormatLabel(
      typeof record.format_label === "string" ? record.format_label : "",
    );
    const formatError = validateFormatLabel(formatLabel);

    if (formatError) {
      return NextResponse.json({ error: formatError }, { status: 400 });
    }

    const { supabase, offer } = await requireQuickOfferMutationAccess(offerId);
    const current = mapQuickOfferAdminDto(offer as JsonRecord);
    const nextOrder =
      current.materials.reduce(
        (max, material) => Math.max(max, material.sort_order),
        -1,
      ) + 1;

    const { data, error } = await supabase
      .from("quick_offer_materials")
      .insert({
        offer_id: offerId,
        format_label: formatLabel,
        sort_order: nextOrder,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      const mapped = mapQuickOfferRpcErrorMessage(error.message);
      throw new AuthorAccessError(mapped.error, mapped.status);
    }

    const next = await fetchOfferDetail(supabase, offerId);
    return NextResponse.json(
      { offer: next, material_id: data?.id ?? null },
      { status: 201 },
    );
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function PATCHMaterial(
  offerId: string,
  materialId: string,
  request: Request,
) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const record = body as JsonRecord;
    const updates: Record<string, unknown> = {};

    if (record.format_label !== undefined) {
      const formatLabel = normalizeFormatLabel(
        typeof record.format_label === "string" ? record.format_label : "",
      );
      const formatError = validateFormatLabel(formatLabel);

      if (formatError) {
        return NextResponse.json({ error: formatError }, { status: 400 });
      }

      updates.format_label = formatLabel;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requireQuickOfferMutationAccess(offerId);
    const { error } = await supabase
      .from("quick_offer_materials")
      .update(updates)
      .eq("id", materialId)
      .eq("offer_id", offerId);

    if (error) {
      const mapped = mapQuickOfferRpcErrorMessage(error.message);
      throw new AuthorAccessError(mapped.error, mapped.status);
    }

    const offer = await fetchOfferDetail(supabase, offerId);
    return NextResponse.json({ offer });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function DELETEMaterial(offerId: string, materialId: string) {
  try {
    const { supabase } = await requireQuickOfferMutationAccess(offerId);
    const { error } = await supabase
      .from("quick_offer_materials")
      .delete()
      .eq("id", materialId)
      .eq("offer_id", offerId);

    if (error) {
      const mapped = mapQuickOfferRpcErrorMessage(error.message);
      throw new AuthorAccessError(mapped.error, mapped.status);
    }

    const current = await fetchOfferDetail(supabase, offerId);
    const ordered = current.materials.map((material, index) => ({
      id: material.id,
      sort_order: index,
    }));

    for (const item of ordered) {
      const { error: reorderError } = await supabase
        .from("quick_offer_materials")
        .update({ sort_order: item.sort_order })
        .eq("id", item.id)
        .eq("offer_id", offerId);

      if (reorderError) {
        console.error("quick_offer_material_repack_error", reorderError.message);
        throw new AuthorAccessError("internal_error", 500);
      }
    }

    const offer = await fetchOfferDetail(supabase, offerId);
    return NextResponse.json({ offer });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POSTReorderMaterials(offerId: string, request: Request) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const ids = (body as JsonRecord).material_ids;

    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase, offer } = await requireQuickOfferMutationAccess(offerId);
    const current = mapQuickOfferAdminDto(offer as JsonRecord);
    const currentIds = new Set(current.materials.map((material) => material.id));

    if (
      ids.length !== current.materials.length ||
      ids.some((id) => !currentIds.has(id))
    ) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const offset = 1000;

    for (const [index, id] of ids.entries()) {
      const { error } = await supabase
        .from("quick_offer_materials")
        .update({ sort_order: offset + index })
        .eq("id", id)
        .eq("offer_id", offerId);

      if (error) {
        throw new AuthorAccessError("internal_error", 500);
      }
    }

    for (const [index, id] of ids.entries()) {
      const { error } = await supabase
        .from("quick_offer_materials")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("offer_id", offerId);

      if (error) {
        throw new AuthorAccessError("internal_error", 500);
      }
    }

    const next = await fetchOfferDetail(supabase, offerId);
    return NextResponse.json({ offer: next });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
