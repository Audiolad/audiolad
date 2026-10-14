import {
  getSafeNextPath,
  isAuthEntryRoute,
  isPrivateRoute,
} from "@/lib/auth/routes";
import {
  AUTHOR_SUPPORT_COOKIE_NAME,
  isAuthorSupportBlockedMutation,
  isAuthorSupportSensitivePath,
} from "@/lib/author-support/policy";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { SerializeOptions } from "cookie";

import {
  getSupabaseCookieOptions,
  hostnameFromHeaders,
  planSupabaseCookieScope,
  SUPABASE_COOKIE_SCOPE_MARKER,
  SUPABASE_COOKIE_SCOPE_MARKER_VALUE,
} from "./cookie-domain";

type SupabaseCookieToSet = {
  name: string;
  value: string;
  options: SerializeOptions;
};

function applySupabaseCookiesAndHeaders(
  response: NextResponse,
  cookiesToSet: SupabaseCookieToSet[],
  headers: Record<string, string>,
): NextResponse {
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

function redirectWithSupabaseCookies(
  request: NextRequest,
  cookiesToSet: SupabaseCookieToSet[],
  headers: Record<string, string>,
  destination: string,
): NextResponse {
  const redirectResponse = NextResponse.redirect(
    new URL(destination, request.url),
  );

  return applySupabaseCookiesAndHeaders(
    redirectResponse,
    cookiesToSet,
    headers,
  );
}

type UpdateSessionOptions = {
  /** Internal pathname rewrite (browser URL unchanged). */
  rewritePathname?: string;
};

function createPassthroughResponse(
  request: NextRequest,
  rewritePathname?: string,
): NextResponse {
  if (rewritePathname) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = rewritePathname;
    // Nginx terminates TLS. The Next.js listener is plain HTTP on loopback.
    // If we keep https from X-Forwarded-Proto, Next tries HTTPS to localhost
    // and the school host rewrite fails with EPROTO / 500.
    rewriteUrl.protocol = "http:";
    return NextResponse.rewrite(rewriteUrl);
  }

  return NextResponse.next({
    request,
  });
}

export async function updateSession(
  request: NextRequest,
  options?: UpdateSessionOptions,
): Promise<NextResponse> {
  const hostname = hostnameFromHeaders(request.headers);
  const cookieOptions = getSupabaseCookieOptions(hostname);
  // Snapshot before Supabase mutates request.cookies during refresh.
  const originalRequestCookies = request.cookies
    .getAll()
    .map(({ name, value }) => ({ name, value }));
  const written: SupabaseCookieToSet[] = [];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Pre-plan (no writes yet) to know whether this host has legacy cookies.
  const prePlan = planSupabaseCookieScope({
    hostname,
    supabaseUrl,
    requestCookies: originalRequestCookies,
    written: [],
  });

  if (prePlan.mode !== "none") {
    // One-time per-host migration of legacy host-only cookies. Legacy twins
    // cannot be told apart from shared domain cookies in the Cookie header, so
    // this request is NOT processed: the browser gets the expiries (legacy values are never re-issued)
    // and repeats the same request (307 keeps method and body) carrying only
    // domain-scoped cookies. No Supabase read/write and no server action runs
    // on the ambiguous cookie set, so logout/refresh never race the migration.
    // Location MUST be absolute: Next's middleware adapter parses it with
    // `new NextURL(location)` (no base) and a relative "/path" throws
    // "TypeError: Invalid URL" -> plain-text 500 for every request carrying a
    // legacy auth cookie (task 9c000895). Next relativizes same-host
    // redirects itself, so the browser still sees "/path?query".
    const reload = NextResponse.redirect(request.nextUrl.clone(), 307);
    reload.headers.set("cache-control", "no-store");
    for (const line of prePlan.lines) {
      reload.headers.append("set-cookie", line);
    }
    return reload;
  }

  const finalize = (response: NextResponse): NextResponse => {
    const plan = planSupabaseCookieScope({
      hostname,
      supabaseUrl,
      requestCookies: [
        {
          name: SUPABASE_COOKIE_SCOPE_MARKER,
          value: SUPABASE_COOKIE_SCOPE_MARKER_VALUE,
        },
      ],
      written,
    });
    // Appended after Next's own cookie serialization: raw lines can carry two
    // same-name cookies (host-only expiry + Domain=.audiolad.ru write).
    for (const line of plan.lines) {
      response.headers.append("set-cookie", line);
    }
    return response;
  };

  return finalize(await updateSessionInner(request, options, cookieOptions, written));
}

async function updateSessionInner(
  request: NextRequest,
  options: UpdateSessionOptions | undefined,
  cookieOptions: { domain?: string },
  written: SupabaseCookieToSet[],
): Promise<NextResponse> {
  const rewritePathname = options?.rewritePathname;

  let supabaseResponse = createPassthroughResponse(request, rewritePathname);

  let pendingCookies: SupabaseCookieToSet[] = [];
  let pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(rawCookiesToSet, headers) {
          const cookiesToSet = rawCookiesToSet.map((c) => ({
            ...c,
            options: { ...c.options, ...cookieOptions },
          }));
          written.push(...cookiesToSet);
          pendingCookies = cookiesToSet;
          pendingHeaders = headers;

          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = createPassthroughResponse(
            request,
            rewritePathname,
          );

          applySupabaseCookiesAndHeaders(
            supabaseResponse,
            cookiesToSet,
            headers,
          );
        },
      },
    },
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const authenticatedUser = error ? null : user;

  const { pathname, search } = request.nextUrl;

  if (!authenticatedUser && isPrivateRoute(pathname)) {
    const signInUrl = new URL("/auth/sign-in", request.url);
    signInUrl.searchParams.set("next", `${pathname}${search}`);

    return redirectWithSupabaseCookies(
      request,
      pendingCookies,
      pendingHeaders,
      `${signInUrl.pathname}${signInUrl.search}`,
    );
  }

  if (authenticatedUser && isAuthEntryRoute(pathname)) {
    const destination = getSafeNextPath(
      request.nextUrl.searchParams.get("next"),
    );

    return redirectWithSupabaseCookies(
      request,
      pendingCookies,
      pendingHeaders,
      destination,
    );
  }

  const supportCookie = request.cookies.get(AUTHOR_SUPPORT_COOKIE_NAME)?.value;
  if (supportCookie && isAuthorSupportSensitivePath(pathname)) {
    return redirectWithSupabaseCookies(
      request,
      pendingCookies,
      pendingHeaders,
      "/author-dashboard",
    );
  }

  if (
    supportCookie &&
    isAuthorSupportBlockedMutation({
      pathname,
      method: request.method,
    })
  ) {
    if (pathname.startsWith("/api/")) {
      const blocked = NextResponse.json(
        { error: "support_mutation_blocked" },
        { status: 403 },
      );
      return applySupabaseCookiesAndHeaders(
        blocked,
        pendingCookies,
        pendingHeaders,
      );
    }

    return redirectWithSupabaseCookies(
      request,
      pendingCookies,
      pendingHeaders,
      "/author-dashboard",
    );
  }

  return supabaseResponse;
}
