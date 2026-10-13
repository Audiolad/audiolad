"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseCookieOptions } from "@/lib/supabase/cookie-domain";

export const MAX_SUPABASE_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "none" as const,
  secure: true,
};

export function createMaxSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: {
        ...MAX_SUPABASE_COOKIE_OPTIONS,
        // Shared session scope on *.audiolad.ru (task 0e05333f); host-only in dev.
        ...(typeof window === "undefined"
          ? {}
          : getSupabaseCookieOptions(window.location.hostname)),
      },
    },
  );
}
