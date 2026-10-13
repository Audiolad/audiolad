import { createBrowserClient } from "@supabase/ssr";
import {
  expireHostOnlyInDocument,
  getSupabaseCookieOptions,
  parseCookieHeader,
  serialize,
} from "./cookie-domain";

export function createClient() {
  const cookieOptions =
    typeof window === "undefined"
      ? {}
      : getSupabaseCookieOptions(window.location.hostname);

  if (!cookieOptions.domain) {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
  }

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions,
      cookies: {
        getAll() {
          return parseCookieHeader(document.cookie);
        },
        setAll(cookiesToSet) {
          // Expire legacy host-only twins first, then write domain cookies,
          // so the document never keeps two same-name auth cookies.
          expireHostOnlyInDocument(cookiesToSet.map((c) => c.name));
          cookiesToSet.forEach(({ name, value, options }) => {
            document.cookie = serialize(name, value, {
              ...options,
              domain: cookieOptions.domain,
            });
          });
        },
      },
    },
  );
}
