/**
 * Public playlist URL helpers (owner copy-link + canonical).
 */

export function buildPublicPlaylistPath(slug: string): string {
  return `/p/${slug.trim()}`;
}

export function buildPublicPlaylistCanonicalUrl(slug: string): string {
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://audiolad.ru";
  return `${origin}${buildPublicPlaylistPath(slug)}`;
}

/**
 * Copy text to clipboard. Returns true on success.
 * Does not log the value.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }

  try {
    if (typeof document === "undefined") {
      return false;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
