/**
 * t1578u: play-log evidence. Pure helpers (no server imports) so the reconstruction and the
 * CSV layout are unit-tested.
 *
 * Source of truth: playback_usage_facts (server-accepted samples of the hall player, every
 * 5–15 s: player, track, position in the track, server time). A «play» is a run of facts of one
 * player and one track in one listening session where the position keeps moving forward.
 */

export type EvidenceFact = {
  id: string;
  occurred_at: string;
  audio_item_id: string | null;
  player_id: string | null;
  zone_id?: string | null;
  listened_ms: number | string | null;
  position_ms: number | string | null;
  listening_key?: string | null;
  created_at?: string | null;
  phase?: string | null;
  sample_seq?: number | string | null;
  reject_reason?: string | null;
};

/** Columns read for the extract (playback_usage_facts). */
export const EVIDENCE_FACT_COLUMNS =
  "id, occurred_at, created_at, audio_item_id, player_id, zone_id, listened_ms, position_ms, listening_key, phase, sample_seq, reject_reason";

export type EvidencePlay = {
  playerId: string | null;
  audioItemId: string | null;
  listeningKey: string | null;
  firstAt: string;
  lastAt: string;
  posFromMs: number;
  posToMs: number;
  /** Median of (occurred_at − position_ms): when this play reached position 0 of the track. */
  estTrackStartAt: string;
  listenedMs: number;
  facts: number;
};

/** A new play starts after a pause longer than this or when the position jumps back. */
export const PLAY_GAP_MS = 60_000;
const BACKWARD_TOLERANCE_MS = 3_000;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function reconstructPlays(facts: readonly EvidenceFact[]): EvidencePlay[] {
  const sorted = [...facts]
    .map((f) => ({ f, t: Date.parse(f.occurred_at) }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t || String(a.f.id).localeCompare(String(b.f.id)));
  type Open = { play: EvidencePlay; lastT: number; lastPos: number; starts: number[] };
  const open = new Map<string, Open>();
  const done: Open[] = [];
  for (const { f, t } of sorted) {
    const key = `${f.player_id ?? "-"}`;
    const pos = num(f.position_ms);
    const cur = open.get(key);
    const same =
      cur &&
      cur.play.audioItemId === (f.audio_item_id ?? null) &&
      (cur.play.listeningKey ?? null) === (f.listening_key ?? null) &&
      t - cur.lastT <= PLAY_GAP_MS &&
      pos + BACKWARD_TOLERANCE_MS >= cur.lastPos;
    if (cur && same) {
      cur.play.lastAt = new Date(t).toISOString();
      cur.play.posToMs = Math.max(cur.play.posToMs, pos);
      cur.play.listenedMs += num(f.listened_ms);
      cur.play.facts += 1;
      cur.lastT = t;
      cur.lastPos = pos;
      cur.starts.push(t - pos);
      continue;
    }
    if (cur) done.push(cur);
    open.set(key, {
      play: {
        playerId: f.player_id ?? null,
        audioItemId: f.audio_item_id ?? null,
        listeningKey: f.listening_key ?? null,
        firstAt: new Date(t).toISOString(),
        lastAt: new Date(t).toISOString(),
        posFromMs: Math.max(0, pos - num(f.listened_ms)),
        posToMs: pos,
        estTrackStartAt: "",
        listenedMs: num(f.listened_ms),
        facts: 1,
      },
      lastT: t,
      lastPos: pos,
      starts: [t - pos],
    });
  }
  done.push(...open.values());
  return done
    .map((o) => ({ ...o.play, estTrackStartAt: new Date(Math.round(median(o.starts))).toISOString() }))
    .sort((a, b) => Date.parse(a.firstAt) - Date.parse(b.firstAt) || String(a.playerId).localeCompare(String(b.playerId)));
}

/** Local wall time of `iso` in `timeZone` as «YYYY-MM-DD HH:MM:SS». */
export function formatLocal(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}:${g("second")}`;
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Formula-like cells are prefixed so a spreadsheet never executes them.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",;\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export type TrackLabel = { code: string | null; title: string | null };

export const PLAYS_CSV_HEADER = [
  "n", "player_id", "player_code", "track_code", "track_title", "audio_item_id",
  "first_fact_utc", "last_fact_utc", "first_fact_local", "last_fact_local",
  "position_from_s", "position_to_s", "est_track_start_utc", "listened_s", "facts",
] as const;

export function playsCsv(
  plays: readonly EvidencePlay[],
  labels: ReadonlyMap<string, TrackLabel>,
  playerCodes: ReadonlyMap<string, string>,
  timeZone: string,
): string {
  return toCsv(
    PLAYS_CSV_HEADER,
    plays.map((p, i) => {
      const l = (p.audioItemId && labels.get(p.audioItemId)) || { code: null, title: null };
      return [
        i + 1, p.playerId, (p.playerId && playerCodes.get(p.playerId)) || "", l.code, l.title, p.audioItemId,
        p.firstAt, p.lastAt, formatLocal(p.firstAt, timeZone), formatLocal(p.lastAt, timeZone),
        (p.posFromMs / 1000).toFixed(1), (p.posToMs / 1000).toFixed(1), p.estTrackStartAt,
        (p.listenedMs / 1000).toFixed(1), p.facts,
      ];
    }),
  );
}

export const FACTS_CSV_HEADER = [
  "fact_id", "occurred_at_utc", "occurred_at_local", "player_id", "zone_id", "audio_item_id", "track_code",
  "position_ms", "listened_ms", "phase", "sample_seq", "reject_reason", "listening_key", "server_created_at_utc",
] as const;

export function factsCsv(
  facts: readonly EvidenceFact[],
  labels: ReadonlyMap<string, TrackLabel>,
  timeZone: string,
): string {
  return toCsv(
    FACTS_CSV_HEADER,
    facts.map((f) => [
      f.id, f.occurred_at, formatLocal(f.occurred_at, timeZone), f.player_id, f.zone_id ?? "", f.audio_item_id,
      (f.audio_item_id && labels.get(f.audio_item_id)?.code) || "", num(f.position_ms), num(f.listened_ms),
      f.phase ?? "", f.sample_seq ?? "", f.reject_reason ?? "", f.listening_key ?? "", f.created_at ?? "",
    ]),
  );
}

/** Venue-local «YYYY-MM-DDTHH:MM» → UTC Date, or null. Handles DST by two-pass offset. */
export function localInputToUtc(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  const offset = (ms: number) => {
    const s = formatLocal(new Date(ms).toISOString(), timeZone);
    const p = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s);
    if (!p) return 0;
    return Date.UTC(+p[1], +p[2] - 1, +p[3], +p[4], +p[5], +p[6]) - ms;
  };
  let guess = asUtc - offset(asUtc);
  guess = asUtc - offset(guess);
  const d = new Date(guess);
  if (!Number.isFinite(d.getTime())) return null;
  // Reject dates and wall times that do not exist (31 February, the hour skipped at a DST
  // change): the signed period must be exactly what was typed, never silently shifted.
  const want = `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] ?? "00"}`;
  return formatLocal(d.toISOString(), timeZone) === want ? d : null;
}
