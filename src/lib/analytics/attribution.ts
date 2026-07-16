export type TrafficAttribution = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
};

const ATTRIBUTION_STORAGE_KEY = "audiolad_traffic_attribution";

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

type ReadonlyURLSearchParamsLike = {
  get(name: string): string | null;
};

export function parseTrafficAttributionFromSearchParams(
  params: URLSearchParams | ReadonlyURLSearchParamsLike,
): TrafficAttribution {
  return {
    utmSource:
      normalizeParam(params.get("utm_source")) ??
      normalizeParam(params.get("source")),
    utmMedium: normalizeParam(params.get("utm_medium")),
    utmCampaign:
      normalizeParam(params.get("utm_campaign")) ??
      normalizeParam(params.get("campaign")),
    utmContent: normalizeParam(params.get("utm_content")),
  };
}

export function hasTrafficAttribution(attribution: TrafficAttribution): boolean {
  return Boolean(
    attribution.utmSource ||
      attribution.utmMedium ||
      attribution.utmCampaign ||
      attribution.utmContent,
  );
}

export function mergeTrafficAttribution(
  primary: TrafficAttribution,
  fallback: TrafficAttribution | null,
): TrafficAttribution {
  if (!fallback) {
    return primary;
  }

  return {
    utmSource: primary.utmSource ?? fallback.utmSource,
    utmMedium: primary.utmMedium ?? fallback.utmMedium,
    utmCampaign: primary.utmCampaign ?? fallback.utmCampaign,
    utmContent: primary.utmContent ?? fallback.utmContent,
  };
}

export function readStoredTrafficAttribution(): TrafficAttribution | null {
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
    };
  } catch {
    return null;
  }
}

export function storeTrafficAttribution(attribution: TrafficAttribution): void {
  if (typeof window === "undefined") {
    return;
  }

  if (!hasTrafficAttribution(attribution)) {
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

export function resolveTrafficAttribution(
  fromParams: TrafficAttribution,
): TrafficAttribution {
  const stored = readStoredTrafficAttribution();
  const merged = mergeTrafficAttribution(fromParams, stored);

  storeTrafficAttribution(merged);

  return merged;
}

export function attributionToApiFields(attribution: TrafficAttribution): {
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
