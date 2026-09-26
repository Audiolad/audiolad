"use client";

const AUDIOLAD_PUBLIC_ORIGIN = "https://audiolad.ru";

type MaxWebAppExternalLink = {
  openLink?: (url: string) => void;
};

export function buildAudioladPublicUrl(pathname: string): string | null {
  if (!pathname.startsWith("/")) return null;
  try {
    const url = new URL(pathname, AUDIOLAD_PUBLIC_ORIGIN);
    if (url.origin !== AUDIOLAD_PUBLIC_ORIGIN) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function openMaxExternalUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;

  const webApp =
    typeof window !== "undefined"
      ? (window.WebApp as MaxWebAppExternalLink | undefined)
      : undefined;
  if (typeof webApp?.openLink === "function") {
    webApp.openLink(parsed.toString());
    return true;
  }
  if (typeof window !== "undefined") {
    window.open(parsed.toString(), "_blank", "noopener,noreferrer");
    return true;
  }
  return false;
}
