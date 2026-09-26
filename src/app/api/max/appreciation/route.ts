import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  parseAppreciationIdempotencyKey,
  startAuthorAppreciationCheckout,
} from "@/app/api/author-appreciation/checkout/route";
import { readMaxAuthenticatedPost } from "@/lib/max/authenticated-post";
import { getMaxPublishedProduct } from "@/lib/max/product";
import { getPracticeByAuthorAndSlug } from "@/lib/products/lookup";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
export { setResolveMaxNativeUserForTests } from "@/lib/max/session-binding";

type AppreciationDeps = {
  createClient?: () => SupabaseClient;
  loadEmail?: (userId: string) => Promise<string | null>;
  getProduct?: typeof getMaxPublishedProduct;
  getPractice?: typeof getPracticeByAuthorAndSlug;
  startCheckout?: typeof startAuthorAppreciationCheckout;
};

let appreciationDeps: AppreciationDeps | null = null;

export function setMaxAppreciationDepsForTests(deps: AppreciationDeps | null) {
  appreciationDeps = deps;
}

function fail(reason: string, status: number) {
  return Response.json(
    { ok: false, reason },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function httpsPaymentLink(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function serviceClient() {
  return (appreciationDeps?.createClient ?? createServiceRoleClient)();
}

async function loadLinkedUserEmail(userId: string): Promise<string | null> {
  if (appreciationDeps?.loadEmail) return appreciationDeps.loadEmail(userId);
  const service = serviceClient();
  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error) return null;
  const email = data.user?.email?.trim() ?? "";
  return email || null;
}

export async function POST(request: Request) {
  const authenticated = await readMaxAuthenticatedPost(request, [
    "authorSlug",
    "productSlug",
  ]);
  if (!authenticated.ok) return authenticated.response;

  const idempotencyKey = parseAppreciationIdempotencyKey(
    authenticated.body.idempotencyKey,
  );
  const amountMinor = authenticated.body.amountMinor;
  if (
    !idempotencyKey ||
    typeof amountMinor !== "number" ||
    !Number.isSafeInteger(amountMinor)
  ) {
    return fail("invalid_request", 400);
  }

  const authorSlug = String(authenticated.body.authorSlug).trim();
  const productSlug = String(authenticated.body.productSlug).trim();
  const getProduct = appreciationDeps?.getProduct ?? getMaxPublishedProduct;
  const listed = await getProduct(authorSlug, productSlug);
  if (!listed.ok) return fail("storage_unavailable", 503);
  if (!listed.product) return fail("not_found", 404);

  const getPractice = appreciationDeps?.getPractice ?? getPracticeByAuthorAndSlug;
  let practiceId: string;
  let authorId: string;
  try {
    const loaded = await getPractice(serviceClient(), authorSlug, productSlug);
    if (loaded.error) return fail("storage_unavailable", 503);
    if (!loaded.practice?.id || !loaded.practice.author_id) {
      return fail("not_found", 404);
    }
    practiceId = loaded.practice.id;
    authorId = loaded.practice.author_id;
  } catch {
    return fail("storage_unavailable", 503);
  }

  const email = await loadLinkedUserEmail(authenticated.userId);
  if (!email) return fail("appreciation_unavailable", 404);

  const startCheckout = appreciationDeps?.startCheckout ?? startAuthorAppreciationCheckout;
  const checkout = await startCheckout({
    authorId,
    practiceId,
    surface: "product",
    amountMinor,
    userId: authenticated.userId,
    email,
    idempotencyKey,
  });
  const payload = (await checkout.json().catch(() => null)) as {
    error?: unknown;
    payment_link?: unknown;
    status?: unknown;
  } | null;
  const paymentLink = httpsPaymentLink(payload?.payment_link);
  if (checkout.status === 201 && paymentLink && payload?.status === "pending") {
    return Response.json(
      { ok: true, paymentLink, status: "pending" },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  }
  const reason = typeof payload?.error === "string" ? payload.error : "checkout_unavailable";
  return fail(reason, checkout.ok ? 502 : checkout.status);
}
