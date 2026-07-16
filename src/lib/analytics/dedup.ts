import { PAGE_VIEW_DEDUP_MS } from "@/lib/analytics/constants";

const pageViewTimestamps = new Map<string, number>();

export function shouldTrackPageView(path: string): boolean {
  const normalized = path.trim() || "/";
  const now = Date.now();
  const last = pageViewTimestamps.get(normalized);

  if (last && now - last < PAGE_VIEW_DEDUP_MS) {
    return false;
  }

  pageViewTimestamps.set(normalized, now);
  return true;
}

function milestoneKey(
  listeningSessionKey: string,
  milestone: string,
): string {
  return `audiolad_analytics_ms:${listeningSessionKey}:${milestone}`;
}

export function hasTrackedListeningMilestone(
  listeningSessionKey: string,
  milestone: string,
): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(milestoneKey(listeningSessionKey, milestone)) === "1";
  } catch {
    return false;
  }
}

export function markListeningMilestoneTracked(
  listeningSessionKey: string,
  milestone: string,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(milestoneKey(listeningSessionKey, milestone), "1");
  } catch {
    // sessionStorage unavailable
  }
}

export function buildListeningSessionKey(input: {
  practiceId: string;
  audioItemId: string;
  sessionStartedAt: number;
}): string {
  return `${input.practiceId}:${input.audioItemId}:${input.sessionStartedAt}`;
}

export function createListeningSessionStartedAt(): number {
  return Date.now();
}

export function isListeningSessionExpired(startedAt: number, gapMs: number): boolean {
  return Date.now() - startedAt > gapMs;
}
