/**
 * P1-07 Support diagnostic projection — pure helpers.
 * Read-only status before calling the client. No rights grants or catalog eligibility invention.
 */

export type BusinessSupportIssueCode =
  | "ANONYMOUS"
  | "NO_ORGANIZATION"
  | "NO_LOCATION"
  | "NO_PLAYER"
  | "PLAYER_NEVER_SEEN"
  | "PLAYER_OFFLINE"
  | "PLAYER_STALE"
  | "PLAYER_UNASSIGNED"
  | "NO_BUSINESS_PLAY"
  | "STALE_BUSINESS_PLAY";

export type BusinessSupportPlayerRow = {
  playerId: string;
  playerCode: string;
  displayName: string | null;
  playerStatus: string;
  healthStatus: string;
  secondsSinceHeartbeat: number | null;
  lastHeartbeatAt: string | null;
  locationId: string | null;
  zoneId: string | null;
};

export type BusinessSupportLastPlay = {
  occurredAt: string;
  audioItemId: string | null;
  playerId: string | null;
  locationId: string | null;
  minutesAgo: number | null;
};

export type BusinessSupportIssue = {
  code: BusinessSupportIssueCode;
  severity: "info" | "warn" | "error";
  messageRu: string;
};

export type BusinessSupportDiagnostics = {
  organizationId: string | null;
  organizationName: string | null;
  location: {
    id: string;
    name: string;
    timezone: string;
    countryCode: string;
    status: string;
    defaultZoneId: string | null;
  } | null;
  players: BusinessSupportPlayerRow[];
  lastPlay: BusinessSupportLastPlay | null;
  issues: BusinessSupportIssue[];
  /** Highest severity among issues (or ok when empty). */
  overall: "ok" | "warn" | "error";
  source: "a1_a2_pop";
};

export function anonymousSupportDiagnostics(): BusinessSupportDiagnostics {
  return {
    organizationId: null,
    organizationName: null,
    location: null,
    players: [],
    lastPlay: null,
    issues: [
      {
        code: "ANONYMOUS",
        severity: "info",
        messageRu: "Войдите как владелец, чтобы увидеть диагностику точки.",
      },
    ],
    overall: "ok",
    source: "a1_a2_pop",
  };
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function mapSupportHealthRpcRows(
  rawRows: unknown,
): BusinessSupportPlayerRow[] {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    const seconds = asFiniteNumber(r.seconds_since_heartbeat);
    const lastHb =
      typeof r.last_heartbeat_at === "string" && r.last_heartbeat_at.trim()
        ? r.last_heartbeat_at
        : null;
    return {
      playerId: String(r.player_id ?? ""),
      playerCode: String(r.player_code ?? ""),
      displayName: typeof r.display_name === "string" ? r.display_name : null,
      playerStatus:
        typeof r.player_status === "string" ? r.player_status : "unknown",
      healthStatus:
        typeof r.health_status === "string" ? r.health_status : "never_seen",
      secondsSinceHeartbeat: seconds != null ? Math.max(0, seconds) : null,
      lastHeartbeatAt: lastHb,
      locationId: typeof r.location_id === "string" ? r.location_id : null,
      zoneId: typeof r.zone_id === "string" ? r.zone_id : null,
    };
  });
}

function severityRank(s: BusinessSupportIssue["severity"]): number {
  if (s === "error") return 3;
  if (s === "warn") return 2;
  return 1;
}

function pickOverall(
  issues: readonly BusinessSupportIssue[],
): "ok" | "warn" | "error" {
  let best: "ok" | "warn" | "error" = "ok";
  for (const issue of issues) {
    if (issue.severity === "error") return "error";
    if (issue.severity === "warn") best = "warn";
  }
  return best;
}

/**
 * Derive support-facing issue codes from A1 domain + A2 health + last PoP.
 * "error" here means connectivity / assignment gaps — not app stack traces.
 */
export function deriveSupportIssues(input: {
  hasUser: boolean;
  organizationId: string | null;
  locationId: string | null;
  players: readonly BusinessSupportPlayerRow[];
  lastPlay: BusinessSupportLastPlay | null;
  /** Minutes after which last play is considered stale for support triage. */
  stalePlayMinutes?: number;
}): BusinessSupportIssue[] {
  const stalePlayMinutes = input.stalePlayMinutes ?? 120;
  const issues: BusinessSupportIssue[] = [];

  if (!input.hasUser) {
    issues.push({
      code: "ANONYMOUS",
      severity: "info",
      messageRu: "Войдите как владелец, чтобы увидеть диагностику точки.",
    });
    return issues;
  }

  if (!input.organizationId) {
    issues.push({
      code: "NO_ORGANIZATION",
      severity: "error",
      messageRu: "Организация ещё не создана — сначала пройдите bootstrap.",
    });
    return issues;
  }

  if (!input.locationId) {
    issues.push({
      code: "NO_LOCATION",
      severity: "error",
      messageRu: "Активная точка (Location) не найдена.",
    });
  }

  const scoped = input.locationId
    ? input.players.filter(
        (p) => p.locationId == null || p.locationId === input.locationId,
      )
    : [...input.players];

  if (scoped.length === 0) {
    issues.push({
      code: "NO_PLAYER",
      severity: "error",
      messageRu: "Плеер не зарегистрирован на организацию / точку.",
    });
  } else {
    for (const player of scoped) {
      if (!player.zoneId) {
        issues.push({
          code: "PLAYER_UNASSIGNED",
          severity: "warn",
          messageRu: `Плеер ${player.playerCode} не назначен на зону.`,
        });
      }
      if (player.healthStatus === "never_seen") {
        issues.push({
          code: "PLAYER_NEVER_SEEN",
          severity: "error",
          messageRu: `Плеер ${player.playerCode} ещё не выходил на связь (heartbeat).`,
        });
      } else if (player.healthStatus === "offline") {
        issues.push({
          code: "PLAYER_OFFLINE",
          severity: "error",
          messageRu: `Плеер ${player.playerCode} offline — heartbeat давно не обновлялся.`,
        });
      } else if (player.healthStatus === "stale") {
        issues.push({
          code: "PLAYER_STALE",
          severity: "warn",
          messageRu: `Плеер ${player.playerCode} отвечает с задержкой (stale heartbeat).`,
        });
      }
    }
  }

  if (!input.lastPlay) {
    issues.push({
      code: "NO_BUSINESS_PLAY",
      severity: scoped.some((p) => p.healthStatus === "online")
        ? "warn"
        : "info",
      messageRu:
        "Фактов business Proof of Play пока нет (или нет доступа к ledgers).",
    });
  } else if (
    input.lastPlay.minutesAgo != null &&
    input.lastPlay.minutesAgo > stalePlayMinutes
  ) {
    issues.push({
      code: "STALE_BUSINESS_PLAY",
      severity: "warn",
      messageRu: `Последний business play был ${input.lastPlay.minutesAgo} мин назад.`,
    });
  }

  // Deduplicate by code+message
  const seen = new Set<string>();
  const unique: BusinessSupportIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.code}:${issue.messageRu}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(issue);
  }

  // Prefer higher severity first for support triage
  unique.sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity),
  );

  return unique;
}

export function buildSupportDiagnostics(input: {
  hasUser: boolean;
  organizationId: string | null;
  organizationName: string | null;
  location: BusinessSupportDiagnostics["location"];
  players: readonly BusinessSupportPlayerRow[];
  lastPlay: BusinessSupportLastPlay | null;
  nowMs?: number;
}): BusinessSupportDiagnostics {
  let lastPlay = input.lastPlay;
  if (lastPlay && lastPlay.minutesAgo == null && lastPlay.occurredAt) {
    const t = Date.parse(lastPlay.occurredAt);
    const nowMs = input.nowMs ?? Date.now();
    lastPlay = {
      ...lastPlay,
      minutesAgo: Number.isFinite(t)
        ? Math.max(0, Math.floor((nowMs - t) / 60_000))
        : null,
    };
  }

  const issues = deriveSupportIssues({
    hasUser: input.hasUser,
    organizationId: input.organizationId,
    locationId: input.location?.id ?? null,
    players: input.players,
    lastPlay,
  });

  return {
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    location: input.location,
    players: [...input.players],
    lastPlay,
    issues,
    overall: pickOverall(issues),
    source: "a1_a2_pop",
  };
}

export function formatHeartbeatAgeRu(
  secondsSinceHeartbeat: number | null,
): string {
  if (secondsSinceHeartbeat == null) return "нет данных";
  if (secondsSinceHeartbeat < 60) {
    return `${Math.floor(secondsSinceHeartbeat)} с назад`;
  }
  const minutes = Math.floor(secondsSinceHeartbeat / 60);
  if (minutes < 120) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  return `${hours} ч назад`;
}

export function healthStatusLabelRu(status: string): string {
  if (status === "online") return "на связи";
  if (status === "stale") return "задержка";
  if (status === "offline") return "offline";
  if (status === "never_seen") return "не выходил на связь";
  return status;
}
