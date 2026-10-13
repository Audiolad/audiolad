import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

import { getSupabaseCookieOptions, hostnameFromHeaders } from "./cookie-domain";

export async function createClient() {
  const cookieStore = await cookies();
  const cookieOptions = getSupabaseCookieOptions(
    hostnameFromHeaders(await headers()),
  );

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, { ...options, ...cookieOptions });
            });
          } catch {
            // В серверном компоненте запись cookies может быть недоступна.
            // Позже обновление сессии будет выполнять отдельный proxy-файл.
          }
        },
      },
    },
  );
}