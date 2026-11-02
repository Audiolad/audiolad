export type GuestStartConfig = {
  enabled: boolean;
  available: boolean;
  networkLimit: number;
  windowSeconds: number;
  networkSecret: string;
  production: boolean;
};

function bounded(raw: string | undefined, fallback: number, max: number): number {
  if (!raw?.trim() || !Number.isFinite(Number(raw))) return fallback;
  return Math.min(max, Math.max(1, Math.floor(Number(raw))));
}

export function businessGuestStartConfig(env: Record<string, string | undefined>): GuestStartConfig {
  const enabled = env.AUDIOLAD_BUSINESS_GUEST_AUTH_ENABLED === "1";
  const networkSecret = env.AUDIOLAD_BUSINESS_GUEST_NETWORK_HASH_SECRET ?? "";
  return {
    enabled,
    available: enabled && new TextEncoder().encode(networkSecret).byteLength >= 32,
    networkLimit: bounded(env.AUDIOLAD_BUSINESS_GUEST_START_NETWORK_LIMIT, 3, 1000),
    windowSeconds: bounded(env.AUDIOLAD_BUSINESS_GUEST_START_WINDOW_HOURS, 24, 48) * 3600,
    networkSecret,
    production: env.NODE_ENV === "production",
  };
}
