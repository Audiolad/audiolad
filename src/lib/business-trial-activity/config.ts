/**
 * Gift-week activity recording (task 253821e0, PR 2). Default OFF: with the flag unset the
 * app writes nothing and the admin screen shows «нет данных» in the activity columns.
 * Needs migration 20270213120000 applied first (Sergey's Human Gate).
 */
export type BusinessTrialActivityConfig = {
  enabled: boolean;
  /** Days of daily rows kept per venue. */
  retentionDays: number;
  /** «Слушали не меньше N минут» threshold on the admin screen. */
  activeMinutes: number;
  /** Most seconds one listen report may add (reports come about every 15 s). */
  maxStepSeconds: number;
  /** A cabinet open counts as a new visit after this pause. */
  visitGapSeconds: number;
};

export const BUSINESS_TRIAL_ACTIVITY_DEFAULTS = {
  retentionDays: 180,
  activeMinutes: 60,
  maxStepSeconds: 30,
  visitGapSeconds: 30 * 60,
} as const;

function bounded(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw?.trim() || !Number.isFinite(Number(raw))) return fallback;
  return Math.min(max, Math.max(min, Math.floor(Number(raw))));
}

export function businessTrialActivityConfig(env: Record<string, string | undefined>): BusinessTrialActivityConfig {
  return {
    enabled: env.AUDIOLAD_BUSINESS_TRIAL_ACTIVITY_ENABLED === "1",
    retentionDays: bounded(env.AUDIOLAD_BUSINESS_TRIAL_ACTIVITY_RETENTION_DAYS, BUSINESS_TRIAL_ACTIVITY_DEFAULTS.retentionDays, 1, 730),
    activeMinutes: bounded(env.AUDIOLAD_BUSINESS_TRIAL_ACTIVE_MINUTES, BUSINESS_TRIAL_ACTIVITY_DEFAULTS.activeMinutes, 1, 1440),
    maxStepSeconds: BUSINESS_TRIAL_ACTIVITY_DEFAULTS.maxStepSeconds,
    visitGapSeconds: BUSINESS_TRIAL_ACTIVITY_DEFAULTS.visitGapSeconds,
  };
}

export type BusinessStartHost = "coffee" | "business";

/** Only our two hosts are stored; anything else stays NULL. */
export function businessStartHost(hostname: string | null | undefined): BusinessStartHost | null {
  const host = (hostname ?? "").trim().toLowerCase().replace(/:\d+$/, "");
  if (host === "coffee.audiolad.ru") return "coffee";
  if (host === "business.audiolad.ru") return "business";
  return null;
}
