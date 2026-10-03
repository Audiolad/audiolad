import { parseProductStartPayload } from "../mini-app/product-target";

export {
  buildVkFrameAncestorsPolicy,
  VK_OFFICIAL_FRAME_ANCESTORS,
} from "./frame-policy";

export const VK_APP_ID = "54802101";
export const VK_ENTRY_PATH = "/vk";
export const VK_ENTRY_URL = "https://audiolad.ru/vk";
export const VK_MINI_APP_ORIGIN = "https://vk.com";

/**
 * Temporary smoke token. Resolves only to the approved test release, and
 * only after the same published-listed check as a product payload.
 */
export const VK_SMOKE_TOKEN = "smoke";
export const VK_SMOKE_AUTHOR_SLUG = "aurafon";
export const VK_SMOKE_PRODUCT_SLUG = "muzyka-dlya-krepkogo-sna";

export type VkLaunchTarget =
  | { kind: "product"; payload: string }
  | { kind: "smoke" };

export function vkLaunchTargetToken(target: VkLaunchTarget): string {
  return target.kind === "smoke" ? VK_SMOKE_TOKEN : target.payload;
}

export function parseVkLaunchToken(
  value: string | null | undefined,
): VkLaunchTarget | null {
  const token = value?.trim() ?? "";
  if (!token || token.length > 128) return null;
  if (token === VK_SMOKE_TOKEN) return { kind: "smoke" };

  const product = parseProductStartPayload(token);
  if (!product) return null;
  return { kind: "product", payload: `p_${product.practiceId.replaceAll("-", "")}` };
}

function hashToken(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const first = decoded.split("&")[0]?.split("?")[0]?.trim() ?? "";
  return first || null;
}

/**
 * VK copies the mini-app fragment into the `hash` query parameter and may
 * also keep `location.hash`. `start` is the direct Audiolad fallback.
 */
export function readVkLaunchTarget(input: {
  hash?: string;
  search?: string;
}): VkLaunchTarget | null {
  const search = input.search ?? "";
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const candidates = [
    params.get("hash"),
    hashToken(input.hash ?? ""),
    params.get("start"),
  ];

  for (const candidate of candidates) {
    const target = parseVkLaunchToken(candidate);
    if (target) return target;
  }
  return null;
}
