/**
 * t1578u: cross-check of an inspector's recording against the hall play log.
 *
 * The matcher tells which catalog track sounds in the recording and at which track position
 * (segments). The play log tells when each track was played and from which position (plays).
 * If the recording started at absolute time R, a segment heard at recording offset r with track
 * position p was played at R + r, i.e. the track started at R + r − p. A play started the track
 * at estTrackStartAt. So every (segment, play) pair of the same track proposes
 * R = estTrackStartAt + (p − r). The R agreed by most segments is the recording start; each
 * segment is then confirmed (a play fits within the tolerance) or not.
 */

export type MatchSegment = {
  code: string;
  kind: "catalog" | "control" | "claimed" | string;
  rec_from_s: number;
  rec_to_s: number;
  track_from_s: number;
  track_to_s: number;
  confidence?: string;
};

export type LogPlay = {
  code: string | null;
  estTrackStartAt: string;
  firstAt: string;
  lastAt: string;
  posFromMs: number;
  posToMs: number;
  playerCode: string | null;
};

export type SegmentCheck = {
  segment: number;
  code: string;
  recFromS: number;
  recToS: number;
  confirmed: boolean;
  play: number | null;
  playerCode: string | null;
  deltaS: number | null;
  heardFromUtc: string | null;
  heardToUtc: string | null;
};

export type Concordance = {
  recordingStartUtc: string | null;
  claimedStartUtc: string | null;
  claimedDeltaS: number | null;
  catalogSegments: number;
  confirmedSegments: number;
  orderConsistent: boolean | null;
  checks: SegmentCheck[];
  toleranceS: number;
};

export const CONCORDANCE_TOLERANCE_S = 15;
/**
 * The play must cover the whole heard interval, in time (track start or first fact … last fact) and
 * in track position (posFrom … posTo seen by the log), give or take this slack (facts are sampled
 * every 5–15 s).
 */
export const COVER_SLACK_S = 20;

type Pair = { seg: number; play: number; r: number };

export function concordance(
  segments: readonly MatchSegment[],
  plays: readonly LogPlay[],
  claimedStart: Date | null,
  toleranceS = CONCORDANCE_TOLERANCE_S,
): Concordance {
  const segs = segments
    .map((s, i) => ({ s, i }))
    .filter((x) => x.s.kind === "catalog");
  const playTimes = plays.map((p) => ({
    start: Date.parse(p.estTrackStartAt) / 1000,
    first: Date.parse(p.firstAt) / 1000,
    last: Date.parse(p.lastAt) / 1000,
  }));
  /** Whether play j covers segment i if the recording started at `start` (time and position). */
  const covers = (i: number, j: number, start: number) => {
    const s = segments[i];
    const p = plays[j];
    const heardFrom = start + s.rec_from_s;
    const heardTo = start + s.rec_to_s;
    const coverFrom = Math.min(playTimes[j].start, playTimes[j].first) - COVER_SLACK_S;
    const coverTo = playTimes[j].last + COVER_SLACK_S;
    if (heardFrom < coverFrom || heardTo > coverTo) return false;
    // …and the positions the log saw must cover the heard track positions.
    return !(s.track_from_s < p.posFromMs / 1000 - COVER_SLACK_S || s.track_to_s > p.posToMs / 1000 + COVER_SLACK_S);
  };
  const pairs: Pair[] = [];
  for (const { s, i } of segs) {
    plays.forEach((p, j) => {
      if (!p.code || p.code !== s.code) return;
      const r = playTimes[j].start + (s.track_from_s - s.rec_from_s);
      if (covers(i, j, r)) pairs.push({ seg: i, play: j, r });
    });
  }
  // Segments a common start would confirm: within the tolerance of it and covered by the log at
  // that start (one pair per segment, the closest). Used both to rank candidate starts and for the
  // final selection, so the chosen start is the one that really confirms the most.
  const pick = (center: number) => {
    const m = new Map<number, Pair>();
    for (const p of pairs) {
      if (Math.abs(p.r - center) > toleranceS || !covers(p.seg, p.play, center)) continue;
      const prev = m.get(p.seg);
      if (!prev || Math.abs(p.r - center) < Math.abs(prev.r - center)) m.set(p.seg, p);
    }
    return m;
  };
  const claimed = claimedStart ? claimedStart.getTime() / 1000 : null;
  let best: { r: number; count: number; dur: number; skew: number } | null = null;
  for (const cand of pairs) {
    const hit = pick(cand.r);
    let dur = 0;
    for (const seg of hit.keys()) dur += segments[seg].rec_to_s - segments[seg].rec_from_s;
    const skew = claimed === null ? 0 : Math.abs(cand.r - claimed);
    const better =
      !best ||
      hit.size > best.count ||
      (hit.size === best.count && dur > best.dur + 1e-9) ||
      (hit.size === best.count && Math.abs(dur - best.dur) <= 1e-9 && skew < best.skew);
    if (better) best = { r: cand.r, count: hit.size, dur, skew };
  }
  // Refine R as the median of the confirmed pairs; keep it only if it confirms no fewer segments.
  let r: number | null = null;
  let chosen = new Map<number, Pair>();
  if (best) {
    r = best.r;
    for (let iter = 0; iter < 5; iter++) {
      const sel = pick(r);
      const rs = [...sel.values()].map((p) => p.r).sort((a, b) => a - b);
      const m = Math.floor(rs.length / 2);
      const med = rs.length % 2 ? rs[m] : (rs[m - 1] + rs[m]) / 2;
      if (Math.abs(med - r) < 1e-6) break;
      // Keep the median only if it does not lose segments agreed at the current centre.
      if (pick(med).size < sel.size) break;
      r = med;
    }
    chosen = pick(r);
  }
  const iso = (sec: number) => new Date(Math.round(sec * 1000)).toISOString();
  const checks: SegmentCheck[] = segs.map(({ s, i }) => {
    const p = chosen.get(i);
    if (!p || r === null) {
      return {
        segment: i, code: s.code, recFromS: s.rec_from_s, recToS: s.rec_to_s, confirmed: false, play: null,
        playerCode: null, deltaS: null,
        heardFromUtc: r === null ? null : iso(r + s.rec_from_s), heardToUtc: r === null ? null : iso(r + s.rec_to_s),
      };
    }
    return {
      segment: i, code: s.code, recFromS: s.rec_from_s, recToS: s.rec_to_s, confirmed: true, play: p.play,
      playerCode: plays[p.play].playerCode, deltaS: Math.round((p.r - r) * 10) / 10,
      heardFromUtc: iso(r + s.rec_from_s), heardToUtc: iso(r + s.rec_to_s),
    };
  });
  const confirmed = checks.filter((c) => c.confirmed);
  let orderConsistent: boolean | null = null;
  if (confirmed.length >= 2) {
    orderConsistent = true;
    for (let k = 1; k < confirmed.length; k++) {
      const a = playTimes[confirmed[k - 1].play as number].start;
      const b = playTimes[confirmed[k].play as number].start;
      if (b + 1e-6 < a) orderConsistent = false;
    }
  }
  return {
    recordingStartUtc: r === null ? null : iso(r),
    claimedStartUtc: claimed === null ? null : iso(claimed),
    claimedDeltaS: r === null || claimed === null ? null : Math.round(r - claimed),
    catalogSegments: segs.length,
    confirmedSegments: confirmed.length,
    orderConsistent,
    checks,
    toleranceS,
  };
}
