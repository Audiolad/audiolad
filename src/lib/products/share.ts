import { isAuthRoute, isPrivateRoute } from "@/lib/auth/routes";
import {
  buildPracticeCanonicalUrl,
  parsePracticePublicPath,
} from "@/lib/products/paths";
import { getAppOrigin } from "@/lib/seo/app-origin";

export const PRODUCT_SHARE_COPIED_TOAST = "Ссылка скопирована";
export const PRODUCT_SHARE_FAILED_TOAST = "Не удалось скопировать ссылку";

export type ProductSharePayload = {
  title: string;
  text?: string;
  url: string;
};

export type ProductShareResult = "shared" | "aborted" | "copied" | "failed";

export type ProductShareAdapters = {
  share?: (data: ProductSharePayload) => Promise<void>;
  canShare?: (data: ProductSharePayload) => boolean;
  writeText?: (text: string) => Promise<void>;
};

function pathnameOnly(raw: string): string {
  const trimmed = raw.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "";
  }

  return trimmed.split("#")[0]?.split("?")[0] ?? "";
}

function looksLikeListenPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();

  if (lower === "/listen" || lower.startsWith("/listen")) {
    return true;
  }

  return lower
    .split("/")
    .filter(Boolean)
    .some((segment) => segment === "listen" || segment === "listens");
}

export function buildProductShareUrl(practicePagePath: string): string | null {
  const pathname = pathnameOnly(practicePagePath);

  if (!pathname) {
    return null;
  }

  if (looksLikeListenPath(pathname) || isPrivateRoute(pathname) || isAuthRoute(pathname)) {
    return null;
  }

  const parsed = parsePracticePublicPath(pathname);

  if (!parsed) {
    return null;
  }

  const url = buildPracticeCanonicalUrl(parsed.authorSlug, parsed.productSlug);

  if (!url.startsWith(`${getAppOrigin()}/practice/`)) {
    return null;
  }

  return url;
}

export function buildProductShareText(
  subtitle: string | null | undefined,
): string | undefined {
  if (!subtitle) {
    return undefined;
  }

  const plain = subtitle
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return plain || undefined;
}

export function buildProductSharePayload(input: {
  title: string;
  path: string;
  subtitle?: string | null;
}): ProductSharePayload | null {
  const title = input.title.replace(/\s+/g, " ").trim();
  const url = buildProductShareUrl(input.path);

  if (!title || !url) {
    return null;
  }

  const text = buildProductShareText(input.subtitle);

  return text ? { title, text, url } : { title, url };
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError"
  );
}

function canUseWebShare(
  payload: ProductSharePayload,
  canShare?: (data: ProductSharePayload) => boolean,
): boolean {
  if (typeof canShare !== "function") {
    return true;
  }

  try {
    return canShare(payload) !== false;
  } catch {
    return false;
  }
}

export async function shareProductPage(
  payload: ProductSharePayload,
  adapters: ProductShareAdapters = {},
): Promise<ProductShareResult> {
  if (typeof adapters.share === "function" && canUseWebShare(payload, adapters.canShare)) {
    try {
      await adapters.share(payload);
      return "shared";
    } catch (error) {
      if (isAbortError(error)) {
        return "aborted";
      }
    }
  }

  if (typeof adapters.writeText === "function") {
    try {
      await adapters.writeText(payload.url);
      return "copied";
    } catch {
      return "failed";
    }
  }

  return "failed";
}

export function toastForShareResult(
  result: ProductShareResult,
): string | null {
  if (result === "copied") {
    return PRODUCT_SHARE_COPIED_TOAST;
  }

  if (result === "failed") {
    return PRODUCT_SHARE_FAILED_TOAST;
  }

  return null;
}
