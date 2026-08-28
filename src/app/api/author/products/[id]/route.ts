import { NextResponse } from "next/server";

import {
  assertAuthorCommercialWriteAllowed,
  handleAuthorRouteError,
  requirePracticeAccess,
  requirePracticeMutationAccess,
} from "@/lib/author-products/auth";
import {
  validateDescriptionLength,
  validateListeningNoticeTextLength,
  validateListeningNoticeTitleLength,
  validateStoredFormatLength,
  validateSubtitleLength,
  validateTitleLength,
} from "@/lib/author-products/limits";
import {
  PRODUCT_PAID_PURCHASE_DELETE_LOCK,
} from "@/lib/author-products/delete-lock";
import {
  deletePracticeProduct,
  getDeleteBlockerMessage,
  getDeleteBlockers,
  getProductLifecycleBlockers,
} from "@/lib/author-products/lifecycle";
import {
  assertMusicUsagePermissionForKind,
  canChangeProductKind,
  MUSIC_USAGE_PERMISSION,
  normalizeProductKind,
  PRODUCT_KIND,
  PRODUCT_KIND_LOCKED_AFTER_PUBLISH,
} from "@/lib/author-products/product-kind";
import {
  mapLegacyProductKindToClass,
  parseCabinetBranch,
  parsePublicationClass,
  publicationClassToCabinetBranch,
  publicationClassToLegacyKind,
} from "@/lib/author-products/publication-class";
import { assertPracticePublicContentEditableForActor } from "@/lib/author-products/moderation";
import {
  generateUniqueSlug,
  getAuthorProductDetail,
  isPracticeSlugTaken,
} from "@/lib/author-products/products";
import { syncPracticeAudioCompatibility } from "@/lib/author-products/publish";
import {
  isClearableTextFieldProvided,
  normalizeClearableTextField,
} from "@/lib/author-products/text-fields";
import {
  DEFAULT_LISTENING_NOTICE_TEXT,
  DEFAULT_LISTENING_NOTICE_TITLE,
} from "@/lib/products/listening-notice";
import { validatePromoRecommendation } from "@/lib/products/promo-recommendation";
import { buildPracticeCanonicalUrl } from "@/lib/products/paths";
import {
  loadAuthorSlug,
  planPracticeSlugChangeIndexNow,
  scheduleIndexNowNotification,
} from "@/lib/seo/indexnow/hooks";
import { hasPracticePublicIndexNowChanges } from "@/lib/seo/indexnow/public-fields";
import { shouldNotifyIndexNowByVisibility } from "@/lib/products/catalog-visibility";
import { INDEXNOW_REASONS } from "@/lib/seo/indexnow/reasons";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { validatePaidPriceRubles } from "@/lib/pricing/money";
import { slugifyTitle } from "@/lib/author-products/utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePracticeAccess(id);
    const product = await getAuthorProductDetail(supabase, id);

    if (!product) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ product });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

function applyClearableTextField(
  body: object,
  key: "subtitle" | "description" | "format",
  updates: Record<string, unknown>,
  validate?: (value: string) => string | null,
) {
  if (!isClearableTextFieldProvided(body, key)) {
    return null;
  }

  try {
    const normalized = normalizeClearableTextField(
      (body as Record<string, unknown>)[key],
    );
    const valueForValidation = normalized ?? "";

    if (validate) {
      const validationError = validate(valueForValidation);

      if (validationError) {
        return validationError;
      }
    }

    updates[key] = normalized;
    return null;
  } catch {
    return "invalid_request";
  }
}

function applyListeningNoticeTextField(
  body: object,
  key: "listening_notice_title" | "listening_notice_text",
  updates: Record<string, unknown>,
  validate: (value: string) => string | null,
) {
  if (!isClearableTextFieldProvided(body, key)) {
    return null;
  }

  const raw = (body as Record<string, unknown>)[key];

  if (raw === null || raw === undefined) {
    updates[key] =
      key === "listening_notice_title"
        ? DEFAULT_LISTENING_NOTICE_TITLE
        : DEFAULT_LISTENING_NOTICE_TEXT;
    return null;
  }

  if (typeof raw !== "string") {
    return "invalid_request";
  }

  const validationError = validate(raw);

  if (validationError) {
    return validationError;
  }

  if (key === "listening_notice_title") {
    const trimmed = raw.trim();
    updates[key] = trimmed || DEFAULT_LISTENING_NOTICE_TITLE;
    return null;
  }

  updates[key] = raw;
  return null;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase, practice, user, accessStatus } =
      await requirePracticeMutationAccess(id);
    await assertPracticePublicContentEditableForActor(
      supabase,
      practice,
      user.id,
    );

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if ("title" in body && typeof body.title === "string") {
      const title = body.title.trim();

      if (!title) {
        return NextResponse.json({ error: "invalid_request" }, { status: 400 });
      }

      const titleError = validateTitleLength(title);

      if (titleError) {
        return NextResponse.json({ error: titleError }, { status: 400 });
      }

      updates.title = title;
    }

    if ("subtitle" in body) {
      const subtitleError = applyClearableTextField(
        body,
        "subtitle",
        updates,
        validateSubtitleLength,
      );

      if (subtitleError) {
        return NextResponse.json({ error: subtitleError }, { status: 400 });
      }
    }

    if ("description" in body) {
      const descriptionError = applyClearableTextField(
        body,
        "description",
        updates,
        validateDescriptionLength,
      );

      if (descriptionError) {
        return NextResponse.json({ error: descriptionError }, { status: 400 });
      }
    }

    if ("format" in body) {
      const formatError = applyClearableTextField(
        body,
        "format",
        updates,
        validateStoredFormatLength,
      );

      if (formatError) {
        return NextResponse.json({ error: formatError }, { status: 400 });
      }
    }

    const currentPublicationClass = parsePublicationClass(
      practice.publication_class,
    );
    let nextPublicationClass = currentPublicationClass;
    let nextProductKind = normalizeProductKind(practice.product_kind);

    if ("publication_class" in body) {
      const requestedClass =
        typeof body.publication_class === "string"
          ? parsePublicationClass(body.publication_class)
          : null;

      if (!requestedClass) {
        return NextResponse.json(
          { error: "invalid_publication_class" },
          { status: 400 },
        );
      }

      if (
        requestedClass !== currentPublicationClass &&
        !canChangeProductKind(practice.published_at)
      ) {
        return NextResponse.json(
          {
            error: PRODUCT_KIND_LOCKED_AFTER_PUBLISH,
            message:
              "Тип продукта нельзя изменить после первой публикации.",
          },
          { status: 409 },
        );
      }

      nextPublicationClass = requestedClass;
      nextProductKind = publicationClassToLegacyKind(requestedClass);
      updates.publication_class = requestedClass;
      updates.product_kind = nextProductKind;

      if (nextProductKind !== PRODUCT_KIND.MUSIC) {
        updates.music_usage_permission = null;
      } else if (
        !("music_usage_permission" in body) &&
        !practice.music_usage_permission
      ) {
        updates.music_usage_permission = MUSIC_USAGE_PERMISSION.LISTEN_ONLY;
      }
    }

    if ("product_kind" in body) {
      if (
        typeof body.product_kind !== "string" ||
        (body.product_kind !== PRODUCT_KIND.PRACTICE &&
          body.product_kind !== PRODUCT_KIND.MUSIC &&
          body.product_kind !== PRODUCT_KIND.AUDIO_POST)
      ) {
        return NextResponse.json(
          { error: "invalid_product_kind" },
          { status: 400 },
        );
      }

      const requestedKind = normalizeProductKind(body.product_kind);

      if ("publication_class" in body && requestedKind !== nextProductKind) {
        return NextResponse.json(
          { error: "invalid_product_kind" },
          { status: 400 },
        );
      }

      if (
        requestedKind !== normalizeProductKind(practice.product_kind) &&
        !canChangeProductKind(practice.published_at)
      ) {
        return NextResponse.json(
          {
            error: PRODUCT_KIND_LOCKED_AFTER_PUBLISH,
            message:
              "Тип продукта нельзя изменить после первой публикации.",
          },
          { status: 409 },
        );
      }

      nextProductKind = requestedKind;
      updates.product_kind = nextProductKind;

      if (
        !("publication_class" in body) &&
        currentPublicationClass &&
        publicationClassToLegacyKind(currentPublicationClass) !==
          nextProductKind
      ) {
        nextPublicationClass = mapLegacyProductKindToClass(nextProductKind);
        updates.publication_class = nextPublicationClass;
      }

      if (nextProductKind !== PRODUCT_KIND.MUSIC) {
        updates.music_usage_permission = null;
      } else if (
        !("music_usage_permission" in body) &&
        !practice.music_usage_permission
      ) {
        updates.music_usage_permission = MUSIC_USAGE_PERMISSION.LISTEN_ONLY;
      }
    }

    if ("cabinet_branch" in body) {
      const requestedBranch =
        typeof body.cabinet_branch === "string"
          ? parseCabinetBranch(body.cabinet_branch)
          : null;

      if (!requestedBranch) {
        return NextResponse.json(
          { error: "invalid_cabinet_branch" },
          { status: 400 },
        );
      }
      const classForBranch =
        nextPublicationClass ?? mapLegacyProductKindToClass(nextProductKind);

      if (
        requestedBranch !== publicationClassToCabinetBranch(classForBranch)
      ) {
        return NextResponse.json(
          { error: "invalid_cabinet_branch" },
          { status: 400 },
        );
      }
    }

    if ("music_usage_permission" in body) {
      const rawPermission =
        body.music_usage_permission === null
          ? null
          : typeof body.music_usage_permission === "string"
            ? body.music_usage_permission.trim()
            : "";

      if (nextProductKind !== PRODUCT_KIND.MUSIC) {
        if (rawPermission) {
          return NextResponse.json(
            {
              error: "music_usage_not_allowed_for_practice",
              message:
                "Условия использования музыки недоступны для аудиопрактики.",
            },
            { status: 400 },
          );
        }

        updates.music_usage_permission = null;
      } else {
        const permissionCheck = assertMusicUsagePermissionForKind(
          PRODUCT_KIND.MUSIC,
          rawPermission,
        );

        if (!permissionCheck.ok) {
          return NextResponse.json(
            {
              error: permissionCheck.code,
              message: permissionCheck.message,
            },
            { status: 400 },
          );
        }

        updates.music_usage_permission = permissionCheck.permission;
      }
    } else if (nextProductKind !== PRODUCT_KIND.MUSIC && "product_kind" in body) {
      updates.music_usage_permission = null;
    }

    const settingFree =
      "is_free" in body &&
      typeof body.is_free === "boolean" &&
      body.is_free;

    if ("is_free" in body && typeof body.is_free === "boolean") {
      if (
        nextProductKind === PRODUCT_KIND.AUDIO_POST &&
        body.is_free !== true
      ) {
        return NextResponse.json(
          { error: "audio_post_must_be_free" },
          { status: 400 },
        );
      }

      if (!body.is_free) {
        await assertAuthorCommercialWriteAllowed(
          practice.author_id,
          accessStatus,
        );
      }

      updates.is_free = body.is_free;

      if (body.is_free) {
        updates.price = 0;
      }
    }

    if (
      !settingFree &&
      "price" in body &&
      typeof body.price === "number" &&
      Number.isInteger(body.price)
    ) {
      if (nextProductKind === PRODUCT_KIND.AUDIO_POST) {
        return NextResponse.json(
          { error: "audio_post_must_be_free" },
          { status: 400 },
        );
      }

      await assertAuthorCommercialWriteAllowed(
        practice.author_id,
        accessStatus,
      );

      if (!validatePaidPriceRubles(body.price).ok) {
        return NextResponse.json({ error: "invalid_price" }, { status: 400 });
      }

      updates.price = body.price;
      updates.is_free = false;
    }

    if (nextProductKind === PRODUCT_KIND.AUDIO_POST) {
      updates.is_free = true;
      updates.price = 0;
    }

    if (
      "catalog_visibility" in body &&
      (body.catalog_visibility === "listed" ||
        body.catalog_visibility === "unlisted" ||
        body.catalog_visibility === "selected_users")
    ) {
      updates.catalog_visibility = body.catalog_visibility;
      updates.is_catalog_listed = body.catalog_visibility === "listed";
    } else if (
      "is_catalog_listed" in body &&
      typeof body.is_catalog_listed === "boolean"
    ) {
      updates.is_catalog_listed = body.is_catalog_listed;
    }

    const hasPromoUpdate = [
      "promo_enabled",
      "promo_title",
      "promo_text",
      "promo_button_text",
      "promo_url",
      "promo_open_in_new_tab",
    ].some((key) => key in body);

    if (nextProductKind === PRODUCT_KIND.AUDIO_POST && hasPromoUpdate) {
      const promo = validatePromoRecommendation({
        promo_enabled:
          "promo_enabled" in body
            ? body.promo_enabled === true
            : practice.promo_enabled === true,
        promo_title:
          "promo_title" in body && typeof body.promo_title === "string"
            ? body.promo_title
            : practice.promo_title,
        promo_text:
          "promo_text" in body && typeof body.promo_text === "string"
            ? body.promo_text
            : practice.promo_text,
        promo_button_text:
          "promo_button_text" in body &&
          typeof body.promo_button_text === "string"
            ? body.promo_button_text
            : practice.promo_button_text,
        promo_url:
          "promo_url" in body && typeof body.promo_url === "string"
            ? body.promo_url
            : practice.promo_url,
        promo_open_in_new_tab:
          "promo_open_in_new_tab" in body
            ? body.promo_open_in_new_tab === true
            : practice.promo_open_in_new_tab === true,
      });

      if (!promo.ok) {
        return NextResponse.json(
          { error: promo.code, message: promo.message },
          { status: 400 },
        );
      }

      Object.assign(updates, promo.value);
    } else if (
      nextProductKind !== PRODUCT_KIND.AUDIO_POST &&
      (hasPromoUpdate || "product_kind" in body)
    ) {
      Object.assign(updates, {
        promo_enabled: false,
        promo_title: null,
        promo_text: null,
        promo_button_text: null,
        promo_url: null,
        promo_open_in_new_tab: false,
      });
    }

    if ("slug" in body && typeof body.slug === "string") {
      if (practice.status !== "published" && !practice.published_at) {
        const requestedSlug = slugifyTitle(body.slug) || slugifyTitle(String(updates.title ?? ""));

        if (!requestedSlug) {
          return NextResponse.json({ error: "invalid_request" }, { status: 400 });
        }

        if (
          await isPracticeSlugTaken(
            supabase,
            requestedSlug,
            practice.author_id,
            id,
          )
        ) {
          return NextResponse.json({ error: "slug_taken" }, { status: 409 });
        }

        updates.slug = requestedSlug;
      }
    } else if (
      "title" in body &&
      typeof body.title === "string" &&
      practice.status !== "published" &&
      !practice.published_at
    ) {
      updates.slug = await generateUniqueSlug(
        supabase,
        body.title.trim(),
        practice.author_id,
        id,
      );
    }

    if (
      "use_shared_cover" in body &&
      typeof body.use_shared_cover === "boolean"
    ) {
      updates.use_shared_cover = body.use_shared_cover;
    }

    if (
      "listening_notice_enabled" in body &&
      typeof body.listening_notice_enabled === "boolean"
    ) {
      updates.listening_notice_enabled = body.listening_notice_enabled;
    }

    if ("listening_notice_title" in body) {
      const titleError = applyListeningNoticeTextField(
        body,
        "listening_notice_title",
        updates,
        validateListeningNoticeTitleLength,
      );

      if (titleError) {
        return NextResponse.json({ error: titleError }, { status: 400 });
      }
    }

    if ("listening_notice_text" in body) {
      const textError = applyListeningNoticeTextField(
        body,
        "listening_notice_text",
        updates,
        validateListeningNoticeTextLength,
      );

      if (textError) {
        return NextResponse.json({ error: textError }, { status: 400 });
      }
    }

    if (
      "author_id" in body &&
      typeof body.author_id === "string" &&
      body.author_id.trim()
    ) {
      if (practice.status !== "published" && !practice.published_at) {
        const nextAuthorId = body.author_id.trim();
        const { data: membership } = await supabase
          .from("author_members")
          .select("role")
          .eq("author_id", nextAuthorId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (
          !membership ||
          (membership.role !== "owner" && membership.role !== "editor")
        ) {
          return NextResponse.json({ error: "forbidden" }, { status: 403 });
        }

        updates.author_id = nextAuthorId;
      }
    }

    const previousSlug = practice.slug;
    const { data: updatedPractice, error: updateError } = await supabase
      .from("practices")
      .update(updates)
      .eq("id", id)
      .select("id, title, subtitle, description, format, updated_at")
      .maybeSingle();

    if (updateError) {
      console.error("author_product_update_error", updateError.message);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    if (!updatedPractice?.id) {
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    await syncPracticeAudioCompatibility(supabase, id);

    const product = await getAuthorProductDetail(supabase, id);

    if (!product) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (
      practice.status === "published" &&
      hasPracticePublicIndexNowChanges(updates) &&
      shouldNotifyIndexNowByVisibility(
        product.practice.catalog_visibility,
        product.practice.is_catalog_listed,
      )
    ) {
      const authorSlug = await loadAuthorSlug(supabase, practice.author_id);
      const nextSlug = product.practice.slug;

      if (authorSlug && nextSlug) {
        const slugChange = planPracticeSlugChangeIndexNow({
          authorSlug,
          previousSlug,
          nextSlug,
        });

        if (slugChange) {
          scheduleIndexNowNotification(slugChange.urls, slugChange.reason);
        } else {
          scheduleIndexNowNotification(
            [buildPracticeCanonicalUrl(authorSlug, nextSlug)],
            INDEXNOW_REASONS.practice_updated,
          );
        }
      }
    }

    return NextResponse.json({ product });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { supabase } = await requirePracticeMutationAccess(id);
    const serviceSupabase = createServiceRoleClient();

    const blockers = getDeleteBlockers(
      await getProductLifecycleBlockers(serviceSupabase, id),
    );

    if (blockers.length > 0) {
      return NextResponse.json(
        {
          error: blockers[0],
          message: getDeleteBlockerMessage(blockers),
        },
        { status: 409 },
      );
    }

    try {
      // Soft delete RPC requires the author session (auth.uid()).
      await deletePracticeProduct(supabase, id);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: string }).code === PRODUCT_PAID_PURCHASE_DELETE_LOCK
      ) {
        return NextResponse.json(
          {
            error: PRODUCT_PAID_PURCHASE_DELETE_LOCK,
            message: getDeleteBlockerMessage([PRODUCT_PAID_PURCHASE_DELETE_LOCK]),
          },
          { status: 409 },
        );
      }

      const code =
        error instanceof Error ? error.message : "practice_delete_failed";

      if (code === PRODUCT_PAID_PURCHASE_DELETE_LOCK) {
        return NextResponse.json(
          {
            error: code,
            message: getDeleteBlockerMessage([code]),
          },
          { status: 409 },
        );
      }

      if (
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof (error as { message: unknown }).message === "string"
      ) {
        const mapped = error as { message: string; code?: string; status?: number };
        return NextResponse.json(
          {
            error: mapped.code ?? "practice_delete_failed",
            message: mapped.message,
          },
          { status: mapped.status ?? 409 },
        );
      }

      console.error("author_product_delete_error", id, code);
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAuthorRouteError(error);
  }
}
