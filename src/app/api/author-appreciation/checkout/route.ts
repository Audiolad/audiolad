import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  getAuthorAppreciationRolloutConfig,
  isAuthorAppreciationRolloutEnabled,
} from "@/lib/author-appreciation/config";
import {
  isAppreciationProductEligible,
  resolveAuthorAppreciationSettings,
} from "@/lib/author-appreciation/effective-visibility";
import {
  createGetCourseAppreciationDeal,
  getGetCourseConfig,
} from "@/lib/author-appreciation/getcourse/provider";
import type {
  GetCourseConfig,
  GetCourseDeal,
} from "@/lib/author-appreciation/getcourse/provider";
import { validateEmailFormat } from "@/lib/auth/email/validate-format";
import { isAuthorCommercialActiveAccess } from "@/lib/authors/access";
import { isAllowedSupportRequestOrigin } from "@/lib/help/request-guard";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  buildAuthorPublicPath,
  buildPracticePublicPath,
} from "@/lib/products/paths";

type CheckoutBody = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function error(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeIdempotencyKey(request: Request): string | null {
  const key = request.headers.get("idempotency-key")?.trim();
  return key && key.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(key) ? key : null;
}

export async function POST(request: Request) {
  if (!isAllowedSupportRequestOrigin(request)) return error("forbidden_origin", 403);
  const idempotencyKey = safeIdempotencyKey(request);
  if (!idempotencyKey) return error("idempotency_key_required", 400);

  let body: CheckoutBody;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") return error("invalid_request", 400);
    body = parsed as CheckoutBody;
  } catch {
    return error("invalid_request", 400);
  }

  const authorId = string(body.author_id);
  const practiceId = body.practice_id === null ? null : string(body.practice_id);
  const surface = body.surface;
  const amountMinor = body.amount_minor;
  if (
    !authorId ||
    !UUID.test(authorId) ||
    (practiceId !== null && (!practiceId || !UUID.test(practiceId))) ||
    (surface !== "author" && surface !== "product") ||
    (surface === "author" && practiceId !== null) ||
    (surface === "product" && !practiceId) ||
    typeof amountMinor !== "number" ||
    !Number.isSafeInteger(amountMinor)
  ) {
    return error("invalid_request", 400);
  }

  const rollout = getAuthorAppreciationRolloutConfig();
  if (
    !isAuthorAppreciationRolloutEnabled(rollout, authorId) ||
    amountMinor < rollout.minAmountMinor ||
    amountMinor > rollout.maxAmountMinor ||
    amountMinor % 100 !== 0
  ) {
    return error("appreciation_unavailable", 404);
  }
  let getCourseConfig: GetCourseConfig;
  try {
    getCourseConfig = getGetCourseConfig();
  } catch {
    return error("checkout_unavailable", 503);
  }

  let userId: string | null = null;
  let email: string;
  try {
    const sessionClient = await createClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();
    userId = user?.id ?? null;
    if (user?.email) {
      email = user.email;
    } else {
      const guest = validateEmailFormat(string(body.guest_email) ?? "");
      if (!guest.ok) return error("guest_email_invalid", 400);
      email = guest.normalizedEmail;
    }
  } catch {
    const guest = validateEmailFormat(string(body.guest_email) ?? "");
    if (!guest.ok) return error("guest_email_invalid", 400);
    email = guest.normalizedEmail;
  }

  const service = createServiceRoleClient();
  const replay = await service
    .from("author_appreciation_payment_intents")
    .select("id, status")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (replay.error) return error("internal_error", 500);
  if (replay.data) {
    // A payment URL is deliberately not persisted; returning it on replay
    // would turn this endpoint into a payment-link disclosure oracle.
    return NextResponse.json({ intent_id: replay.data.id, status: replay.data.status });
  }

  const { data: author, error: authorError } = await service
    .from("authors")
    .select("id, name, slug, access_status, author_appreciation_settings(listener_appreciation_enabled, listener_appreciation_profile_enabled, listener_appreciation_free_products_default)")
    .eq("id", authorId)
    .maybeSingle();
  if (authorError || !author || !isAuthorCommercialActiveAccess(author.access_status)) {
    return error("appreciation_unavailable", 404);
  }
  const settingsRow = Array.isArray(author.author_appreciation_settings)
    ? author.author_appreciation_settings[0]
    : author.author_appreciation_settings;
  const settings = resolveAuthorAppreciationSettings(
    settingsRow
      ? {
          enabled: settingsRow.listener_appreciation_enabled,
          profileEnabled: settingsRow.listener_appreciation_profile_enabled,
          freeProductsDefault: settingsRow.listener_appreciation_free_products_default,
        }
      : null,
  );
  if (!settings.enabled || (surface === "author" && !settings.profileEnabled)) {
    return error("appreciation_unavailable", 404);
  }

  let sourceTitle = author.name;
  let sourcePath = buildAuthorPublicPath(author.slug);
  if (practiceId) {
    const { data: practice, error: practiceError } = await service
      .from("practices")
      .select("id, author_id, title, slug, status, is_free, publication_class, product_kind, catalog_visibility, is_catalog_listed, listener_appreciation_override")
      .eq("id", practiceId)
      .eq("author_id", authorId)
      .maybeSingle();
    if (
      practiceError ||
      !practice ||
      !isAppreciationProductEligible({
        status: practice.status,
        isFree: practice.is_free,
        publicationClass: practice.publication_class,
        productKind: practice.product_kind,
        catalogVisibility: practice.catalog_visibility,
        isCatalogListed: practice.is_catalog_listed,
        override: practice.listener_appreciation_override,
      }) ||
      !(practice.listener_appreciation_override ?? settings.freeProductsDefault)
    ) {
      return error("appreciation_unavailable", 404);
    }
    sourceTitle = practice.title;
    sourcePath = buildPracticePublicPath(author.slug, practice.slug);
  }

  const intentId = randomUUID();
  const localDealNumber = `aa-${intentId}`;
  const { error: insertError } = await service.from("author_appreciation_payment_intents").insert({
    id: intentId,
    author_id: authorId,
    practice_id: practiceId,
    surface,
    user_id: userId,
    email,
    source_title: sourceTitle,
    source_path: sourcePath,
    amount_minor: amountMinor,
    currency: "RUB",
    status: "pending",
    provider: "getcourse",
    local_deal_number: localDealNumber,
    idempotency_key: idempotencyKey,
    provider_metadata: { offer_id: getCourseConfig.appreciationOfferId },
  });
  if (insertError) {
    // A concurrent retry can win between the initial replay lookup and INSERT.
    const { data: concurrentReplay } = await service
      .from("author_appreciation_payment_intents")
      .select("id, status")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (concurrentReplay) {
      return NextResponse.json({
        intent_id: concurrentReplay.id,
        status: concurrentReplay.status,
      });
    }
    return error("internal_error", 500);
  }

  let deal: GetCourseDeal;
  try {
    deal = await createGetCourseAppreciationDeal(getCourseConfig, {
      email,
      amountMinor,
    });
  } catch (providerError) {
    console.error("author_appreciation_checkout_provider_failed", {
      reason: providerError instanceof Error ? providerError.message : "unknown",
      intent_id: intentId,
    });
    await service
      .from("author_appreciation_payment_intents")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", intentId)
      .eq("status", "pending");
    return error("checkout_unavailable", 502);
  }

  try {
    const { error: updateError } = await service
      .from("author_appreciation_payment_intents")
      .update({
        provider_deal_id: deal.dealId,
        provider_deal_number: deal.dealNumber,
        updated_at: new Date().toISOString(),
      })
      .eq("id", intentId)
      .eq("status", "pending");
    if (updateError) throw new Error("author_appreciation_intent_provider_save_failed");
    return NextResponse.json(
      { intent_id: intentId, status: "pending", payment_link: deal.paymentLink },
      { status: 201 },
    );
  } catch {
    await service
      .from("author_appreciation_payment_intents")
      .update({ status: "needs_review", updated_at: new Date().toISOString() })
      .eq("id", intentId)
      .eq("status", "pending");
    return error("checkout_unavailable", 502);
  }
}
