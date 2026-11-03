/**
 * Gift-week attribution (task 253821e0, PR 3). Default OFF: with the flag unset the app
 * neither writes nor reads the new business_guest_starts columns.
 * Needs migration 20270214120000 applied first (Sergey's Human Gate).
 */
export type BusinessTrialAttributionConfig = {
  enabled: boolean;
  /** Local DB-IP Lite City .mmdb; unset or missing file = no city, everything else still works. */
  geoDbPath: string | null;
  /** MAX Поток read-only channel funnel endpoint (server to server, no personal data). */
  maxPotokFunnelUrl: string | null;
  maxPotokFunnelToken: string | null;
};

function httpsUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function businessTrialAttributionConfig(env: Record<string, string | undefined>): BusinessTrialAttributionConfig {
  const geo = env.AUDIOLAD_GEOIP_CITY_DB?.trim();
  const token = env.AUDIOLAD_MAX_POTOK_FUNNEL_TOKEN?.trim();
  return {
    enabled: env.AUDIOLAD_BUSINESS_TRIAL_ATTRIBUTION_ENABLED === "1",
    geoDbPath: geo && geo.startsWith("/") ? geo : null,
    maxPotokFunnelUrl: httpsUrl(env.AUDIOLAD_MAX_POTOK_FUNNEL_URL),
    maxPotokFunnelToken: token && token.length >= 32 && token.length <= 512 ? token : null,
  };
}
