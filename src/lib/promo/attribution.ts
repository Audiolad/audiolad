export type PromoAttribution = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  source: string | null;
  campaign: string | null;
};

const ATTRIBUTION_STORAGE_KEY = "audiolad_promo_attribution";

function normalizeParam(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > 128) {
    return null;
  }

  return trimmed;
}

export function parsePromoAttributionFromSearchParams(
  params: URLSearchParams | ReadonlyURLSearchParamsLike,
): PromoAttribution {
  const utmSource =
    normalizeParam(params.get("utm_source")) ??
    normalizeParam(params.get("source"));
  const utmMedium = normalizeParam(params.get("utm_medium"));
  const utmCampaign =
    normalizeParam(params.get("utm_campaign")) ??
    normalizeParam(params.get("campaign"));
  const utmContent = normalizeParam(params.get("utm_content"));

  return {
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
    source: utmSource,
    campaign: utmCampaign,
  };
}

type ReadonlyURLSearchParamsLike = {
  get(name: string): string | null;
};

export function hasPromoAttribution(attribution: PromoAttribution): boolean {
  return Boolean(
    attribution.utmSource ||
      attribution.utmMedium ||
      attribution.utmCampaign ||
      attribution.utmContent,
  );
}

export function mergePromoAttribution(
  primary: PromoAttribution,
  fallback: PromoAttribution | null,
): PromoAttribution {
  if (!fallback) {
    return primary;
  }

  return {
    utmSource: primary.utmSource ?? fallback.utmSource,
    utmMedium: primary.utmMedium ?? fallback.utmMedium,
    utmCampaign: primary.utmCampaign ?? fallback.utmCampaign,
    utmContent: primary.utmContent ?? fallback.utmContent,
    source: primary.source ?? fallback.source,
    campaign: primary.campaign ?? fallback.campaign,
  };
}

export function readStoredPromoAttribution(): PromoAttribution | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const record = parsed as Record<string, unknown>;

    return {
      utmSource: normalizeParam(record.utmSource as string | undefined),
      utmMedium: normalizeParam(record.utmMedium as string | undefined),
      utmCampaign: normalizeParam(record.utmCampaign as string | undefined),
      utmContent: normalizeParam(record.utmContent as string | undefined),
      source: normalizeParam(record.source as string | undefined),
      campaign: normalizeParam(record.campaign as string | undefined),
    };
  } catch {
    return null;
  }
}

export function storePromoAttribution(attribution: PromoAttribution): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!hasPromoAttribution(attribution)) {
    return;
  }

  try {
    window.localStorage.setItem(
      ATTRIBUTION_STORAGE_KEY,
      JSON.stringify(attribution),
    );
  } catch {
    // localStorage unavailable
  }
}

export function resolvePromoAttribution(
  fromParams: PromoAttribution,
): PromoAttribution {
  const stored = readStoredPromoAttribution();
  const merged = mergePromoAttribution(fromParams, stored);

  storePromoAttribution(merged);

  return merged;
}

export function attributionToAnalyticsFields(attribution: PromoAttribution): {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
} {
  return {
    utm_source: attribution.utmSource,
    utm_medium: attribution.utmMedium,
    utm_campaign: attribution.utmCampaign,
    utm_content: attribution.utmContent,
  };
}
