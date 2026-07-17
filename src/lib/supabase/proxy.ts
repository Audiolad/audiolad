import {
  getSafeNextPath,
  isAuthEntryRoute,
  isPrivateRoute,
} from "@/lib/auth/routes";
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

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

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

          supabaseResponse = NextResponse.next({
            request,
          });

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

  return supabaseResponse;
}
