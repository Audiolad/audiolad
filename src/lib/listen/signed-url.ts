const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://audiolad.ru";

export function normalizeStorageSignedUrl(signedUrl: string): string | null {
  const trimmed = signedUrl.trim();

  if (!trimmed) {
    return null;
  }

  let pathAndQuery = trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);

      if (url.origin !== APP_ORIGIN) {
        const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(
          /\/$/,
          "",
        );

        if (
          supabaseOrigin &&
          url.origin === new URL(supabaseOrigin).origin
        ) {
          return trimmed;
        }

        return null;
      }

      pathAndQuery = `${url.pathname}${url.search}`;
    } catch {
      return null;
    }
  }

  if (pathAndQuery.startsWith("/storage/v1/")) {
    return `${APP_ORIGIN}${pathAndQuery}`;
  }

  if (pathAndQuery.startsWith("/object/sign/")) {
    return `${APP_ORIGIN}/storage/v1${pathAndQuery}`;
  }

  if (pathAndQuery.startsWith("object/sign/")) {
    return `${APP_ORIGIN}/storage/v1/${pathAndQuery}`;
  }

  return trimmed;
}

export const LISTEN_SIGNED_URL_TTL_SECONDS = 3600;
