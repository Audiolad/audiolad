import "server-only";

import type { MaxPotokChannelCounts } from "@/lib/admin/business-trials";
import { businessTrialAttributionConfig } from "@/lib/business-trial-attribution/config";

/**
 * Read-only per-channel counts from MAX Поток for «Воронка по каналам» (task 253821e0, PR 3).
 * Server to server, bearer token from env, 3 s timeout, no personal data in either direction.
 * Any problem = null («нет данных»), never an error on the admin page.
 */
const TIMEOUT_MS = 3000;

function counts(value: unknown): MaxPotokChannelCounts | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  const ok = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  if (!ok(v.botStarts) || !ok(v.giftClicks)) return undefined;
  return { botStarts: v.botStarts as number, giftClicks: v.giftClicks as number };
}

export function parseMaxPotokFunnel(body: unknown): Partial<Record<"max" | "tg", MaxPotokChannelCounts>> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { ok?: unknown; channels?: Record<string, unknown> };
  if (b.ok !== true || !b.channels || typeof b.channels !== "object") return null;
  const max = counts(b.channels.max);
  const tg = counts(b.channels.tg);
  if (!max && !tg) return null;
  return { ...(max ? { max } : {}), ...(tg ? { tg } : {}) };
}

export async function loadMaxPotokFunnel(fromIso: string | null): Promise<Partial<Record<"max" | "tg", MaxPotokChannelCounts>> | null> {
  const config = businessTrialAttributionConfig(process.env);
  if (!config.enabled || !config.maxPotokFunnelUrl || !config.maxPotokFunnelToken) return null;
  const url = new URL(config.maxPotokFunnelUrl);
  if (fromIso) url.searchParams.set("from", fromIso);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.maxPotokFunnelToken}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn("admin_max_potok_funnel_unavailable");
      return null;
    }
    return parseMaxPotokFunnel(await response.json());
  } catch {
    console.warn("admin_max_potok_funnel_unavailable");
    return null;
  }
}
