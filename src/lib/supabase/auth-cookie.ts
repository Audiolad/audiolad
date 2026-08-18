/**
 * Detect whether the request/document already has a Supabase SSR auth cookie.
 * Name is derived from NEXT_PUBLIC_SUPABASE_URL (sb-<first-label>-auth-token),
 * including chunk suffixes (.0) and -code-verifier / -user.
 */
export function getSupabaseAuthStorageKey(supabaseUrl: string): string {
  const hostname = new URL(supabaseUrl).hostname;
  const projectRef = hostname.split(".")[0];

  if (!projectRef) {
    throw new Error("Supabase URL has no hostname label");
  }

  return `sb-${projectRef}-auth-token`;
}

export function cookieNameLooksLikeSupabaseAuth(
  cookieName: string,
  storageKey: string,
): boolean {
  return (
    cookieName === storageKey ||
    cookieName.startsWith(`${storageKey}.`) ||
    cookieName.startsWith(`${storageKey}-`)
  );
}

export function hasSupabaseAuthCookie(
  cookieHeader: string,
  supabaseUrl: string | undefined,
): boolean {
  if (!supabaseUrl) {
    return true;
  }

  let storageKey: string;

  try {
    storageKey = getSupabaseAuthStorageKey(supabaseUrl);
  } catch {
    return true;
  }

  const trimmed = cookieHeader.trim();

  if (!trimmed) {
    return false;
  }

  return trimmed.split(";").some((part) => {
    const name = part.trim().split("=", 1)[0];
    return cookieNameLooksLikeSupabaseAuth(name, storageKey);
  });
}
