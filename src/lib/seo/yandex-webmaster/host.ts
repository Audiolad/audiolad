import { AUDIOLAD_RECRAWL_ORIGIN } from "@/lib/seo/search-recrawl/origin";

/**
 * audiolad.ru is its own Webmaster host, with its own recrawl queue and quota.
 * host_id is never taken from another site and never parsed out of the id string.
 */
export const AUDIOLAD_WEBMASTER_HOST_ORIGIN = AUDIOLAD_RECRAWL_ORIGIN;

export type YandexWebmasterHostRecord = {
  hostId: string;
  asciiHostUrl: string | null;
  unicodeHostUrl: string | null;
  verified: boolean | null;
};

export type AudioladHostMatchFailure =
  | "host_empty"
  | "host_not_found"
  | "host_ambiguous"
  | "host_unverified"
  | "host_id_missing"
  | "host_mismatch";

export function hostUrlMatchesAudiolad(raw: string | null | undefined): boolean {
  if (!raw?.trim()) {
    return false;
  }

  try {
    const parsed = new URL(raw.trim());
    return (
      parsed.origin === AUDIOLAD_WEBMASTER_HOST_ORIGIN &&
      parsed.hostname === "audiolad.ru" &&
      parsed.protocol === "https:" &&
      (parsed.port === "" || parsed.port === "443") &&
      (parsed.pathname === "/" || parsed.pathname === "") &&
      parsed.search === "" &&
      parsed.hash === "" &&
      parsed.username === "" &&
      parsed.password === ""
    );
  } catch {
    return false;
  }
}

export function parseYandexWebmasterHosts(body: unknown): YandexWebmasterHostRecord[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return [];
  }

  const hosts = (body as { hosts?: unknown }).hosts;
  if (!Array.isArray(hosts)) {
    return [];
  }

  const parsed: YandexWebmasterHostRecord[] = [];

  for (const item of hosts) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    const record = item as Record<string, unknown>;
    const hostId = typeof record.host_id === "string" ? record.host_id.trim() : "";

    if (!hostId) {
      continue;
    }

    parsed.push({
      hostId,
      asciiHostUrl:
        typeof record.ascii_host_url === "string" ? record.ascii_host_url : null,
      unicodeHostUrl:
        typeof record.unicode_host_url === "string" ? record.unicode_host_url : null,
      verified: typeof record.verified === "boolean" ? record.verified : null,
    });
  }

  return parsed;
}

/**
 * Pick the Webmaster host_id only when a hosts-list entry is exactly
 * https://audiolad.ru and that entry's host_id equals the configured pin.
 * Any other host, including a different site on the same account, is rejected.
 */
export function resolveAudioladHostId(
  hosts: readonly YandexWebmasterHostRecord[],
  configuredHostId: string | null | undefined,
):
  | { ok: true; hostId: string }
  | { ok: false; reason: AudioladHostMatchFailure } {
  if (hosts.length === 0) {
    return { ok: false, reason: "host_empty" };
  }

  const matches = hosts.filter(
    (host) =>
      hostUrlMatchesAudiolad(host.asciiHostUrl) ||
      hostUrlMatchesAudiolad(host.unicodeHostUrl),
  );

  if (matches.length === 0) {
    return { ok: false, reason: "host_not_found" };
  }

  if (matches.length > 1) {
    return { ok: false, reason: "host_ambiguous" };
  }

  const match = matches[0];

  if (match.verified !== true) {
    return { ok: false, reason: "host_unverified" };
  }

  if (!match.hostId) {
    return { ok: false, reason: "host_id_missing" };
  }

  const configured = configuredHostId?.trim() ?? "";

  if (!configured || configured !== match.hostId) {
    return { ok: false, reason: "host_mismatch" };
  }

  return { ok: true, hostId: match.hostId };
}
