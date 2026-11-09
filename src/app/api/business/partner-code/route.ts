import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { checkAnalyticsRateLimit } from "@/lib/analytics/sanitize";

import { businessHallDeviceLocked } from "@/lib/business-app/cabinet-mode.server";
import {
  PARTNER_CODE_COOKIE,
  PARTNER_CODE_COOKIE_MAX_AGE_SECONDS,
  mapPartnerCodeRpcError,
  partnerCodeClientIp,
  partnerCodeErrorIsFinal,
  normalizePartnerCode,
  parsePartnerQuote,
  partnerQuoteToWire,
  type PartnerQuote,
} from "@/lib/business/partner-codes";
import { getSupabaseCookieOptions, hostnameFromHeaders } from "@/lib/supabase/cookie-domain";
import { createClientFromRequest } from "@/lib/supabase/request-client";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

function readPendingCode(request: Request): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === PARTNER_CODE_COOKIE) {
      try {
        return normalizePartnerCode(decodeURIComponent(rest.join("=")));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function cookieOptions(request: Request, maxAge: number) {
  return {
    ...getSupabaseCookieOptions(hostnameFromHeaders(request.headers)),
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    maxAge,
  };
}

function withPendingCookie(response: NextResponse, request: Request, code: string | null): NextResponse {
  if (code) response.cookies.set(PARTNER_CODE_COOKIE, code, cookieOptions(request, PARTNER_CODE_COOKIE_MAX_AGE_SECONDS));
  else response.cookies.set(PARTNER_CODE_COOKIE, "", cookieOptions(request, 0));
  return response;
}

// Simple per-address limit (same in-memory limiter as other public routes): enough for a
// person typing a code, useless for guessing 32^12 codes.
const PARTNER_CODE_RATE_LIMIT = 30;
const PARTNER_CODE_RATE_WINDOW_MS = 60_000;

function partnerCodeRateLimited(request: Request): boolean {
  const ip = partnerCodeClientIp(request.headers);
  const key = `biz-partner-code:${createHash("sha256").update(ip).digest("hex").slice(0, 16)}`;
  return !checkAnalyticsRateLimit(key, PARTNER_CODE_RATE_LIMIT, PARTNER_CODE_RATE_WINDOW_MS);
}

/** Only for a personal link opened before any account exists. Says whether the offer is open. */
async function previewCode(code: string) {
  try {
    const { data, error } = await createServiceRoleClient().rpc("business_partner_code_preview", { p_code: code });
    if (error || !data || typeof data !== "object") return null;
    const row = data as Record<string, unknown>;
    if (row.available !== true) return { available: false as const };
    return {
      available: true as const,
      unitPriceRub: Number(row.unit_price_minor) / 100,
      standardUnitPriceRub: Number(row.standard_unit_price_minor) / 100,
      discountPeriods: Number(row.discount_periods),
    };
  } catch {
    return null;
  }
}

/**
 * POST { code? }: one endpoint for both channels of one mechanism.
 * - Personal link before an account exists: the code is kept in an httpOnly cookie
 *   (nothing is reserved or burned) and the open offer is previewed.
 * - Signed-in owner (link, cookie, or the «У меня есть подарочный код» field): a short
 *   server reservation, then the server quote. The code binds to the account only on
 *   the first successful payment. The price is never taken from the browser.
 * A hall device never applies a code.
 */
export async function POST(request: Request) {
  if (partnerCodeRateLimited(request)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const typed = body && "code" in body ? normalizePartnerCode(body.code) : undefined;
  if (typed === null) {
    return NextResponse.json({ error: "partner_code_invalid" }, { status: 404 });
  }
  const code = typed ?? readPendingCode(request);

  const supabase = await createClientFromRequest(request);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (!code) return NextResponse.json({ quote: null });
    const preview = await previewCode(code);
    if (preview && !preview.available) {
      return withPendingCookie(NextResponse.json({ error: "partner_code_invalid" }, { status: 404 }), request, null);
    }
    return withPendingCookie(NextResponse.json({ quote: null, pending: true, preview }), request, code);
  }
  if (await businessHallDeviceLocked()) {
    return NextResponse.json({ error: "venue_device" }, { status: 403 });
  }

  let keepCookie: string | null = code;
  let reserveError: string | null = null;
  let quote: PartnerQuote | null = null;
  if (code) {
    const { data, error } = await supabase.rpc("reserve_business_partner_code", { p_code: code });
    if (error) {
      const mapped = mapPartnerCodeRpcError(error.message);
      // Only a final answer about the code itself drops the link code. «Not an owner yet»,
      // support mode or a transient error keep it for the next visit.
      const final = partnerCodeErrorIsFinal(mapped.error);
      if (typed !== undefined) {
        return withPendingCookie(
          NextResponse.json({ error: mapped.error }, { status: mapped.status }),
          request,
          // A wrong typed code never drops a different code kept from the personal link.
          final && readPendingCode(request) === typed ? null : readPendingCode(request),
        );
      }
      if (final) keepCookie = null;
      reserveError = mapped.error === "internal_error" ? null : mapped.error;
    } else {
      quote = parsePartnerQuote((data as { quote?: unknown } | null)?.quote);
    }
  }
  if (!quote) {
    const { data, error } = await supabase.rpc("business_partner_quote_for_caller");
    quote = error ? null : parsePartnerQuote(data);
  }
  // Bound (or used up): the link cookie has done its job.
  if (quote && (quote.source === "entitlement" || quote.source === "finished")) keepCookie = null;
  // The browser parses the same snake_case row again (parsePartnerQuote), never the parsed object.
  const response = NextResponse.json({
    quote: quote ? partnerQuoteToWire(quote) : null,
    ...(reserveError ? { pending_error: reserveError } : {}),
  });
  return code ? withPendingCookie(response, request, keepCookie) : response;
}
