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
) {
  const rewritePathname = options?.rewritePathname;

  let supabaseResponse = createPassthroughResponse(request, rewritePathname);

  let pendingCookies: SupabaseCookieToSet[] = [];
  let pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet, headers) {
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
