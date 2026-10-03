import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  parseAppreciationIdempotencyKey,
  startAuthorAppreciationCheckout,
} from "@/app/api/author-appreciation/checkout/route";
import { validateEmailFormat } from "@/lib/auth/email/validate-format";
import { getMaxPublishedProduct } from "@/lib/max/product";
import { getPracticeByAuthorAndSlug } from "@/lib/products/lookup";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { readVkJsonPost, readVkSlug, vkFail, vkJson } from "@/lib/vk/request";

export const dynamic = "force-dynamic";

const APPRECIATION_BODY_KEYS = new Set([
  "authorSlug",
  "productSlug",
  "amountMinor",
  "guestEmail",
  "idempotencyKey",
]);

type AppreciationDeps = {
  createClient?: () => SupabaseClient;
  getProduct?: typeof getMaxPublishedProduct;
  getPractice?: typeof getPracticeByAuthorAndSlug;
  startCheckout?: typeof startAuthorAppreciationCheckout;
};

let appreciationDeps: AppreciationDeps | null = null;

export function setVkAppreciationDepsForTests(deps: AppreciationDeps | null) {
  appreciationDeps = deps;
}

function serviceClient() {
  return (appreciationDeps?.createClient ?? createServiceRoleClient)();
}

function httpsPaymentLink(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeReason(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9_]+$/.test(value)
    ? value
    : "checkout_unavailable";
}

/**
 * Guest VK appreciation. Public slugs only; practice and author ids are resolved here.
 * Checkout rules stay in startAuthorAppreciationCheckout. The response is a pending HTTPS link.
 */
export async function POST(request: Request) {
  const parsed = await readVkJsonPost(request);
  if (!parsed.ok) return parsed.response;

  if (!Object.keys(parsed.body).every((key) => APPRECIATION_BODY_KEYS.has(key))) {
    return vkFail("invalid_request", 400);
  }

  const authorSlug = readVkSlug(parsed.body.authorSlug);
  const productSlug = readVkSlug(parsed.body.productSlug);
  const idempotencyKey = parseAppreciationIdempotencyKey(parsed.body.idempotencyKey);
  const amountMinor = parsed.body.amountMinor;
  const guest = validateEmailFormat(
    typeof parsed.body.guestEmail === "string" ? parsed.body.guestEmail : "",
  );
  if (
    !authorSlug ||
    !productSlug ||
    !idempotencyKey ||
    typeof amountMinor !== "number" ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0
  ) {
    return vkFail("invalid_request", 400);
  }
  if (!guest.ok) return vkFail("guest_email_invalid", 400);

  const getProduct = appreciationDeps?.getProduct ?? getMaxPublishedProduct;
  const listed = await getProduct(authorSlug, productSlug, null);
  if (!listed.ok) return vkFail("storage_unavailable", 503);
  if (
    !listed.product ||
    listed.product.authorSlug !== authorSlug ||
    listed.product.productSlug !== productSlug
  ) {
    return vkFail("not_found", 404);
  }
  if (!listed.product.appreciation?.authorName?.trim()) {
    return vkFail("appreciation_unavailable", 404);
  }

  const getPractice = appreciationDeps?.getPractice ?? getPracticeByAuthorAndSlug;
  let practiceId: string;
  let authorId: string;
  try {
    const loaded = await getPractice(serviceClient(), authorSlug, productSlug);
    if (loaded.error) return vkFail("storage_unavailable", 503);
    if (
      !loaded.practice?.id ||
      !loaded.practice.author_id ||
      loaded.practice.slug !== productSlug
    ) {
      return vkFail("not_found", 404);
    }
    practiceId = loaded.practice.id;
    authorId = loaded.practice.author_id;
  } catch {
    return vkFail("storage_unavailable", 503);
  }

  const startCheckout = appreciationDeps?.startCheckout ?? startAuthorAppreciationCheckout;
  let checkout: Awaited<ReturnType<typeof startAuthorAppreciationCheckout>>;
  try {
    checkout = await startCheckout({
      authorId,
      practiceId,
      surface: "product",
      amountMinor,
      userId: null,
      email: guest.normalizedEmail,
      idempotencyKey,
    });
  } catch {
    return vkFail("storage_unavailable", 503);
  }
  const payload = (await checkout.json().catch(() => null)) as {
    error?: unknown;
    payment_link?: unknown;
    status?: unknown;
  } | null;
  const paymentLink = httpsPaymentLink(payload?.payment_link);
  if (checkout.status === 201 && payload?.status === "pending" && paymentLink) {
    return vkJson({ ok: true, paymentLink, status: "pending" }, 201);
  }

  const status = checkout.status >= 400 && checkout.status < 600 ? checkout.status : 502;
  return vkFail(safeReason(payload?.error), status);
}
