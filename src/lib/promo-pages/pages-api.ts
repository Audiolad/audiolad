import { NextResponse } from "next/server";

import {
  AuthorAccessError,
  handleAuthorRouteError,
} from "@/lib/author-products/auth";
import { PROMO_PAGE_DETAIL_SELECT, requirePromoPageAccess } from "@/lib/promo-pages/access";
import { listPromoEligibleProducts } from "@/lib/promo-pages/eligible-products";
import { mapPromoPageRpcErrorMessage } from "@/lib/promo-pages/errors";
import {
  getAuthorSlugFromPromoPageRow,
  mapPromoPageAdminDto,
  mapPromoPageListItem,
} from "@/lib/promo-pages/mappers";
import type { PromoPageStatus } from "@/lib/promo-pages/types";
import {
  normalizePromoPageProductIds,
  normalizePromoPageSlug,
  validatePromoPageCtaHref,
  validatePromoPageCtaLabel,
  validatePromoPageFooterText,
  validatePromoPageInternalName,
  validatePromoPagePublicDescription,
  validatePromoPagePublicTitle,
  validatePromoPageSlug,
} from "@/lib/promo-pages/validation";
import { requireAuthorPromotionAccess } from "@/lib/promotion/access";

type JsonRecord = Record<string, unknown>;

const PROMO_PAGE_CREATE_FIELDS = new Set([
  "author_id",
  "internal_name",
  "slug",
  "public_title",
  "public_description",
  "footer_text",
  "cta_label",
  "cta_href",
  "practice_ids",
]);

const PROMO_PAGE_PATCH_FIELDS = new Set([
  "internal_name",
  "slug",
  "public_title",
  "public_description",
  "footer_text",
  "cta_label",
  "cta_href",
  "practice_ids",
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

async function fetchPromoPageDetail(
  supabase: Awaited<ReturnType<typeof requireAuthorPromotionAccess>>["supabase"],
  pageId: string,
) {
  const { data, error } = await supabase
    .from("promo_pages")
    .select(PROMO_PAGE_DETAIL_SELECT)
    .eq("id", pageId)
    .maybeSingle();

  if (error) {
    console.error("promo_page_detail_error", error.message);
    throw new AuthorAccessError("internal_error", 500);
  }

  if (!data) {
    throw new AuthorAccessError("not_found", 404);
  }

  return mapPromoPageAdminDto(data as JsonRecord);
}

function rejectPublishedEdit(status: PromoPageStatus) {
  if (status === "published") {
    throw new AuthorAccessError("promo_page_edit_locked", 409);
  }
}

function parseOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parsePracticeIds(value: unknown): string[] | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  return normalizePromoPageProductIds(value.map(String));
}

type PromoPageWriteInput = {
  internal_name?: string;
  slug?: string;
  public_title?: string;
  public_description?: string | null;
  footer_text?: string | null;
  cta_label?: string | null;
  cta_href?: string | null;
  practice_ids?: string[];
};

function validateWriteInput(
  input: PromoPageWriteInput,
  options: { requireAll: boolean },
):
  | { error: string }
  | { payload: PromoPageWriteInput & { practice_ids?: string[] } } {
  const payload: PromoPageWriteInput & { practice_ids?: string[] } = {};

  if (options.requireAll || input.internal_name !== undefined) {
    const internalName = (input.internal_name ?? "").trim();
    const internalNameError = validatePromoPageInternalName(internalName);

    if (internalNameError) {
      return { error: internalNameError };
    }

    payload.internal_name = internalName;
  }

  if (options.requireAll || input.public_title !== undefined) {
    const publicTitle = (input.public_title ?? "").trim();
    const publicTitleError = validatePromoPagePublicTitle(publicTitle);

    if (publicTitleError) {
      return { error: publicTitleError };
    }

    payload.public_title = publicTitle;
  }

  if (options.requireAll || input.slug !== undefined) {
    const slugSource =
      input.slug ??
      (options.requireAll ? payload.internal_name ?? input.internal_name ?? "" : "");
    const slug = normalizePromoPageSlug(slugSource);
    const slugError = validatePromoPageSlug(slug);

    if (slugError) {
      return { error: slugError };
    }

    payload.slug = slug;
  } else if (options.requireAll) {
    const slug = normalizePromoPageSlug(payload.internal_name ?? "");
    const slugError = validatePromoPageSlug(slug);

    if (slugError) {
      return { error: slugError };
    }

    payload.slug = slug;
  }

  if (input.public_description !== undefined) {
    const publicDescription = parseOptionalString(input.public_description);

    if (publicDescription !== null) {
      const error = validatePromoPagePublicDescription(publicDescription);

      if (error) {
        return { error };
      }
    }

    payload.public_description = publicDescription;
  } else if (options.requireAll) {
    payload.public_description = null;
  }

  if (input.footer_text !== undefined) {
    const footerText = parseOptionalString(input.footer_text);

    if (footerText !== null) {
      const error = validatePromoPageFooterText(footerText);

      if (error) {
        return { error };
      }
    }

    payload.footer_text = footerText;
  } else if (options.requireAll) {
    payload.footer_text = null;
  }

  if (input.cta_label !== undefined) {
    const ctaLabel = parseOptionalString(input.cta_label);

    if (ctaLabel !== null) {
      const error = validatePromoPageCtaLabel(ctaLabel);

      if (error) {
        return { error };
      }
    }

    payload.cta_label = ctaLabel;
  } else if (options.requireAll) {
    payload.cta_label = null;
  }

  if (input.cta_href !== undefined) {
    const ctaHref = parseOptionalString(input.cta_href);

    if (ctaHref !== null) {
      const error = validatePromoPageCtaHref(ctaHref);

      if (error) {
        return { error };
      }
    }

    payload.cta_href = ctaHref;
  } else if (options.requireAll) {
    payload.cta_href = null;
  }

  const practiceIds = parsePracticeIds(input.practice_ids);

  if (input.practice_ids !== undefined && practiceIds === null) {
    return { error: "promo_page_product_duplicate" };
  }

  if (practiceIds != null) {
    payload.practice_ids = practiceIds;
  }

  return { payload };
}

async function updatePromoPageDraft(
  supabase: Awaited<ReturnType<typeof requireAuthorPromotionAccess>>["supabase"],
  pageId: string,
  payload: Required<
    Omit<PromoPageWriteInput, "practice_ids">
  > & { practice_ids: string[] },
) {
  const { error } = await supabase.rpc("update_promo_page_draft", {
    p_promo_page_id: pageId,
    p_internal_name: payload.internal_name,
    p_slug: payload.slug,
    p_public_title: payload.public_title,
    p_public_description: payload.public_description,
    p_footer_text: payload.footer_text,
    p_cta_label: payload.cta_label,
    p_cta_href: payload.cta_href,
    p_practice_ids: payload.practice_ids,
  });

  if (error) {
    const mapped = mapPromoPageRpcErrorMessage(error.message);
    throw new AuthorAccessError(mapped.error, mapped.status);
  }
}

export async function GET(request: Request) {
  try {
    const authorId = parseAuthorId(request);

    if (!authorId) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const { supabase } = await requireAuthorPromotionAccess(authorId);

    const { data, error } = await supabase
      .from("promo_pages")
      .select(
        `
        id,
        author_id,
        internal_name,
        slug,
        status,
        public_title,
        public_description,
        banner_path,
        footer_text,
        cta_label,
        cta_href,
        published_at,
        created_by,
        created_at,
        updated_at,
        authors!promo_pages_author_id_fkey (
          slug
        ),
        promo_page_products (
          practice_id
        )
      `,
      )
      .eq("author_id", authorId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("promo_pages_list_error", error.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json({
      pages: (data ?? []).map((row) =>
        mapPromoPageListItem(row as JsonRecord),
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

    if (rejectUnknownFields(record, PROMO_PAGE_CREATE_FIELDS)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if ("status" in record && record.status !== undefined) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if ("created_by" in record && record.created_by !== undefined) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const validated = validateWriteInput(
      {
        internal_name:
          typeof record.internal_name === "string" ? record.internal_name : "",
        slug: typeof record.slug === "string" ? record.slug : undefined,
        public_title:
          typeof record.public_title === "string" ? record.public_title : "",
        public_description:
          typeof record.public_description === "string" ||
          record.public_description === null
            ? (record.public_description as string | null)
            : undefined,
        footer_text:
          typeof record.footer_text === "string" || record.footer_text === null
            ? (record.footer_text as string | null)
            : undefined,
        cta_label:
          typeof record.cta_label === "string" || record.cta_label === null
            ? (record.cta_label as string | null)
            : undefined,
        cta_href:
          typeof record.cta_href === "string" || record.cta_href === null
            ? (record.cta_href as string | null)
            : undefined,
        practice_ids: Array.isArray(record.practice_ids)
          ? record.practice_ids.map(String)
          : undefined,
      },
      { requireAll: true },
    );

    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const { supabase } = await requireAuthorPromotionAccess(authorId);

    const practiceIds = validated.payload.practice_ids ?? [];

    const { data: created, error: createError } = await supabase.rpc(
      "create_promo_page_draft",
      {
        p_author_id: authorId,
        p_internal_name: validated.payload.internal_name,
        p_slug: validated.payload.slug,
        p_public_title: validated.payload.public_title,
        p_public_description: validated.payload.public_description,
        p_footer_text: validated.payload.footer_text,
        p_cta_label: validated.payload.cta_label,
        p_cta_href: validated.payload.cta_href,
        p_practice_ids: practiceIds,
      },
    );

    if (createError) {
      const mapped = mapPromoPageRpcErrorMessage(createError.message);
      throw new AuthorAccessError(mapped.error, mapped.status);
    }

    const pageId =
      created &&
      typeof created === "object" &&
      created !== null &&
      "promo_page_id" in created
        ? String((created as { promo_page_id: string }).promo_page_id)
        : null;

    if (!pageId) {
      console.error("promo_page_create_missing_id");
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const page = await fetchPromoPageDetail(supabase, pageId);

    return NextResponse.json({ page }, { status: 201 });
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
    const products = await listPromoEligibleProducts(supabase, authorId);

    return NextResponse.json({ products });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("eligible_products")) {
      console.error("promo_eligible_products_error", error.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return handleAuthorRouteError(error);
  }
}

export async function GETPageDetail(pageId: string) {
  try {
    const { page } = await requirePromoPageAccess(pageId);
    const authorSlug = getAuthorSlugFromPromoPageRow(page as JsonRecord);

    return NextResponse.json({
      page: mapPromoPageAdminDto(page as JsonRecord),
      author_slug: authorSlug,
    });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function PATCHPage(pageId: string, request: Request) {
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

    if (rejectUnknownFields(record, PROMO_PAGE_PATCH_FIELDS)) {
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

    const { supabase, page } = await requirePromoPageAccess(pageId);
    const current = mapPromoPageAdminDto(page as JsonRecord);

    rejectPublishedEdit(current.status);

    const validated = validateWriteInput(
      {
        internal_name:
          typeof record.internal_name === "string"
            ? record.internal_name
            : undefined,
        slug: typeof record.slug === "string" ? record.slug : undefined,
        public_title:
          typeof record.public_title === "string"
            ? record.public_title
            : undefined,
        public_description:
          typeof record.public_description === "string" ||
          record.public_description === null
            ? (record.public_description as string | null)
            : undefined,
        footer_text:
          typeof record.footer_text === "string" || record.footer_text === null
            ? (record.footer_text as string | null)
            : undefined,
        cta_label:
          typeof record.cta_label === "string" || record.cta_label === null
            ? (record.cta_label as string | null)
            : undefined,
        cta_href:
          typeof record.cta_href === "string" || record.cta_href === null
            ? (record.cta_href as string | null)
            : undefined,
        practice_ids: Array.isArray(record.practice_ids)
          ? record.practice_ids.map(String)
          : undefined,
      },
      { requireAll: false },
    );

    if ("error" in validated) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const fields = validated.payload;
    const mergedPracticeIds =
      fields.practice_ids ??
      current.products.map((product) => product.practice_id);

    const mergedPayload = {
      internal_name: fields.internal_name ?? current.internal_name,
      slug: fields.slug ?? current.slug,
      public_title: fields.public_title ?? current.public_title,
      public_description:
        fields.public_description !== undefined
          ? fields.public_description
          : current.public_description,
      footer_text:
        fields.footer_text !== undefined ? fields.footer_text : current.footer_text,
      cta_label: fields.cta_label !== undefined ? fields.cta_label : current.cta_label,
      cta_href: fields.cta_href !== undefined ? fields.cta_href : current.cta_href,
      practice_ids: mergedPracticeIds,
    };

    const mergedValidation = validateWriteInput(mergedPayload, { requireAll: true });

    if ("error" in mergedValidation) {
      return NextResponse.json({ error: mergedValidation.error }, { status: 400 });
    }

    await updatePromoPageDraft(
      supabase,
      pageId,
      mergedValidation.payload as Required<Omit<PromoPageWriteInput, "practice_ids">> & {
        practice_ids: string[];
      },
    );

    const nextPage = await fetchPromoPageDetail(supabase, pageId);
    const authorSlug = getAuthorSlugFromPromoPageRow(page as JsonRecord);

    return NextResponse.json({ page: nextPage, author_slug: authorSlug });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POSTPublish(pageId: string) {
  try {
    const { supabase } = await requirePromoPageAccess(pageId);

    const { data, error } = await supabase.rpc("publish_promo_page", {
      p_promo_page_id: pageId,
    });

    if (error) {
      const mapped = mapPromoPageRpcErrorMessage(error.message);
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    const page = await fetchPromoPageDetail(supabase, pageId);

    return NextResponse.json({ page, result: data });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function POSTUnpublish(pageId: string) {
  try {
    const { supabase } = await requirePromoPageAccess(pageId);

    const { data, error } = await supabase.rpc("unpublish_promo_page", {
      p_promo_page_id: pageId,
    });

    if (error) {
      const mapped = mapPromoPageRpcErrorMessage(error.message);
      return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    }

    const page = await fetchPromoPageDetail(supabase, pageId);

    return NextResponse.json({ page, result: data });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
