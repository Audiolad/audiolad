/**
 * Where a gift week came from (task 253821e0, PR 3). Pure helpers shared by the
 * browser capture, the guest-start API and tests. Only coarse labels survive:
 * bot channel, referrer domain (never the full URL) and utm_* values.
 */

export type BusinessEntryChannel = "max" | "tg";

export type BusinessTrialAttribution = {
  channel: BusinessEntryChannel | null;
  referrerDomain: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

/** First landing of this tab on coffee/business hosts, read once at guest start. */
export const BUSINESS_ATTRIBUTION_STORAGE_KEY = "audiolad.business.attribution.v1";
/** Same first landing on audiolad.ru (atlas), carried to coffee/business links. */
export const AUDIOLAD_CARRY_STORAGE_KEY = "audiolad.attribution.carry.v1";

/** URL parameters carried from audiolad.ru pages to the coffee/business hosts. */
export const BUSINESS_CARRY_PARAMS = ["ch", "utm_source", "utm_medium", "utm_campaign"] as const;
export const BUSINESS_CARRY_HOSTS = ["coffee.audiolad.ru", "business.audiolad.ru"] as const;

const UTM_MAX = 100;
const OWN_HOSTS = new Set<string>(BUSINESS_CARRY_HOSTS);

export function businessEntryChannel(value: unknown): BusinessEntryChannel | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "max") return "max";
  if (v === "tg" || v === "telegram") return "tg";
  return null;
}

/** utm_* value: trimmed, at most 100 characters, no control characters. */
export function businessUtmValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v.length > UTM_MAX || /[\u0000-\u001f\u007f]/.test(v)) return null;
  return v;
}

/**
 * Referrer domain only: lower-case hostname without «www.», no port, path or query.
 * Our own coffee/business hosts are not a source and stay null.
 */
export function businessReferrerDomain(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) return null;
  let host = value.trim().toLowerCase();
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(host)) {
    try {
      host = new URL(host).hostname;
    } catch {
      return null;
    }
  }
  host = host.replace(/\.$/, "").replace(/^www\./, "");
  if (host.length > 253 || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  if (OWN_HOSTS.has(host)) return null;
  return host;
}

/** Strict server-side copy of the browser payload. Anything unexpected becomes null. */
export function sanitizeBusinessTrialAttribution(value: unknown): BusinessTrialAttribution | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const result: BusinessTrialAttribution = {
    channel: businessEntryChannel(raw.ch),
    referrerDomain: businessReferrerDomain(raw.ref),
    utmSource: businessUtmValue(raw.utm_source),
    utmMedium: businessUtmValue(raw.utm_medium),
    utmCampaign: businessUtmValue(raw.utm_campaign),
  };
  return Object.values(result).some((v) => v !== null) ? result : null;
}

export type BusinessAttributionPayload = Partial<Record<(typeof BUSINESS_CARRY_PARAMS)[number] | "ref", string>>;

/** What the browser keeps for this tab: carried params plus the referrer domain. */
export function businessAttributionFromLanding(search: string, referrer: string): BusinessAttributionPayload {
  const params = new URLSearchParams(search);
  const payload: BusinessAttributionPayload = {};
  const ch = businessEntryChannel(params.get("ch"));
  if (ch) payload.ch = ch;
  for (const key of ["utm_source", "utm_medium", "utm_campaign"] as const) {
    const v = businessUtmValue(params.get(key));
    if (v) payload[key] = v;
  }
  const ref = businessReferrerDomain(referrer);
  if (ref) payload.ref = ref;
  return payload;
}

/**
 * Adds the carried ch/utm_* to a link to coffee/business hosts.
 * Parameters already present in the link win; other hosts are returned unchanged.
 */
export function carryBusinessAttribution(href: string, carried: BusinessAttributionPayload, base?: string): string | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !OWN_HOSTS.has(url.hostname)) return null;
  let changed = false;
  for (const key of BUSINESS_CARRY_PARAMS) {
    const v = carried[key];
    if (v && !url.searchParams.has(key)) {
      url.searchParams.set(key, v);
      changed = true;
    }
  }
  return changed ? url.toString() : null;
}

/** Reads a stored payload back; tolerant to old or broken storage. */
export function parseStoredBusinessAttribution(raw: string | null): BusinessAttributionPayload | null {
  if (!raw || raw.length > 2048) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: BusinessAttributionPayload = {};
    const p = parsed as Record<string, unknown>;
    const ch = businessEntryChannel(p.ch);
    if (ch) out.ch = ch;
    for (const key of ["utm_source", "utm_medium", "utm_campaign"] as const) {
      const v = businessUtmValue(p[key]);
      if (v) out[key] = v;
    }
    const ref = businessReferrerDomain(p.ref);
    if (ref) out.ref = ref;
    return out;
  } catch {
    return null;
  }
}
