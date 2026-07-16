const OWN_HOSTS = new Set(["audiolad.ru", "www.audiolad.ru", "localhost"]);

export function extractReferrerDomain(referrer: string | null | undefined): string | null {
  if (typeof referrer !== "string" || !referrer.trim()) {
    return null;
  }

  try {
    const url = new URL(referrer);
    const host = url.hostname.toLowerCase();

    if (!host || OWN_HOSTS.has(host)) {
      return null;
    }

    return host.slice(0, 128);
  } catch {
    return null;
  }
}

export function inferSourceFromReferrer(referrerDomain: string | null): string | null {
  if (!referrerDomain) {
    return null;
  }

  const host = referrerDomain.toLowerCase();

  if (host.includes("t.me") || host.includes("telegram.")) {
    return "telegram";
  }

  if (host.includes("vk.com") || host.includes("vk.ru")) {
    return "vk";
  }

  if (host.includes("max.ru") || host.includes("oneme.ru")) {
    return "max";
  }

  return null;
}

export function resolveTrafficSource(input: {
  utmSource: string | null;
  referrerDomain: string | null;
}): string {
  const utm = input.utmSource?.trim().toLowerCase();

  if (utm) {
    return utm.slice(0, 128);
  }

  const fromReferrer = inferSourceFromReferrer(input.referrerDomain);

  if (fromReferrer) {
    return fromReferrer;
  }

  if (input.referrerDomain) {
    return "other";
  }

  return "direct";
}

export type AdminSourceGroup = "max" | "telegram" | "vk" | "direct" | "other";

export function groupAdminSource(source: string | null | undefined): AdminSourceGroup {
  const normalized = (source ?? "").trim().toLowerCase();

  if (normalized === "max") {
    return "max";
  }

  if (normalized === "telegram" || normalized === "tg") {
    return "telegram";
  }

  if (normalized === "vk" || normalized === "vkontakte") {
    return "vk";
  }

  if (!normalized || normalized === "direct") {
    return "direct";
  }

  return "other";
}

export const ADMIN_SOURCE_LABELS: Record<AdminSourceGroup, string> = {
  max: "MAX",
  telegram: "Telegram",
  vk: "ВКонтакте",
  direct: "Прямые",
  other: "Другие",
};
