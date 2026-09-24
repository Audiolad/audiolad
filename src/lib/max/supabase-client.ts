"use client";

import { createBrowserClient } from "@supabase/ssr";

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
      cookieOptions: MAX_SUPABASE_COOKIE_OPTIONS,
    },
  );
}
