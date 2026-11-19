// t1578u: recording ↔ play-log concordance.
import assert from "node:assert/strict";
import { concordance, type LogPlay, type MatchSegment } from "../src/lib/evidence/concordance";

const T = Date.parse("2026-11-10T09:00:00.000Z") / 1000;
const iso = (s: number) => new Date((T + s) * 1000).toISOString();
const play = (code: string, start: number, dur = 200, player = "AL-P-000000001"): LogPlay => ({
  code, estTrackStartAt: iso(start), firstAt: iso(start + 10), lastAt: iso(start + dur), posFromMs: 0, posToMs: dur * 1000,
  playerCode: player,
});
// Log: A 0..200, B 200..400, C 400..600, A again 900..1100.
const plays = [play("A", 0), play("B", 200), play("C", 400), play("A", 900)];
// Recording started at T+150 (unknown to the tool): hears A at track pos 150..200 (rec 0..50),
// B at pos 0..200 (rec 50..250), C pos 0..30 (rec 250..280). Matcher offsets jitter ±1 s.
const segs: MatchSegment[] = [
  { code: "A", kind: "catalog", rec_from_s: 0, rec_to_s: 50, track_from_s: 150.5, track_to_s: 200 },
  { code: "B", kind: "catalog", rec_from_s: 50, rec_to_s: 250, track_from_s: 0, track_to_s: 200 },
  { code: "CTRL-1", kind: "control", rec_from_s: 250, rec_to_s: 260, track_from_s: 5, track_to_s: 15 },
  { code: "C", kind: "catalog", rec_from_s: 250, rec_to_s: 280, track_from_s: 0.8, track_to_s: 30 },
];
{
  const c = concordance(segs, plays, new Date((T + 120) * 1000));
  assert.equal(c.catalogSegments, 3);
  assert.equal(c.confirmedSegments, 3);
  assert.ok(Math.abs(Date.parse(c.recordingStartUtc!) / 1000 - (T + 150)) <= 1.5, c.recordingStartUtc!);
  assert.ok(c.claimedDeltaS! >= 29 && c.claimedDeltaS! <= 32, String(c.claimedDeltaS));
  assert.equal(c.orderConsistent, true);
  assert.equal(c.checks[0].play, 0);
  assert.equal(c.checks[1].play, 1);
  assert.equal(c.checks[2].play, 2);
  assert.equal(c.checks[0].playerCode, "AL-P-000000001");
}
// Without a claimed time the alignment is found too.
{
  const c = concordance(segs, plays, null);
  assert.equal(c.confirmedSegments, 3);
  assert.equal(c.claimedDeltaS, null);
}
// A catalog track that the log does not have at that moment stays unconfirmed.
{
  const extra: MatchSegment[] = [...segs, { code: "D", kind: "catalog", rec_from_s: 280, rec_to_s: 300, track_from_s: 40, track_to_s: 60 }];
  const c = concordance(extra, plays, null);
  assert.equal(c.catalogSegments, 4);
  assert.equal(c.confirmedSegments, 3);
  const d = c.checks.find((x) => x.code === "D")!;
  assert.equal(d.confirmed, false);
  assert.ok(d.heardFromUtc);
}
// Wrong order in the log is detected.
{
  const swapped = [play("B", 0), play("A", 200 + 150), play("C", 600)];
  const s2: MatchSegment[] = [
    { code: "A", kind: "catalog", rec_from_s: 0, rec_to_s: 20, track_from_s: 10, track_to_s: 30 },
    { code: "B", kind: "catalog", rec_from_s: 30, rec_to_s: 50, track_from_s: 30 + 160, track_to_s: 210 },
  ];
  // A heard at rec 0 pos 10 → R = 350 − 10 + ... only one of them can align; confirmed ≤ 1.
  const c = concordance(s2, swapped, null);
  assert.ok(c.confirmedSegments <= 1);
}
// Nothing in the log.
{
  const c = concordance(segs, [], null);
  assert.equal(c.recordingStartUtc, null);
  assert.equal(c.confirmedSegments, 0);
  assert.equal(c.orderConsistent, null);
}
// The log must cover the whole heard interval: a 10 s play does not confirm a 200 s fragment.
{
  const short: LogPlay[] = [{ ...play("B", 200, 10) }];
  const c = concordance([{ code: "B", kind: "catalog", rec_from_s: 50, rec_to_s: 250, track_from_s: 0, track_to_s: 200 }], short, null);
  assert.equal(c.confirmedSegments, 0);
}
// The log saw only positions 300–320 s: a fragment heard at positions 0–100 s is not confirmed.
{
  const late: LogPlay[] = [{ ...play("A", 0, 400), firstAt: iso(300), lastAt: iso(320), posFromMs: 300_000, posToMs: 320_000 }];
  const c = concordance([{ code: "A", kind: "catalog", rec_from_s: 0, rec_to_s: 100, track_from_s: 0, track_to_s: 100 }], late, null);
  assert.equal(c.confirmedSegments, 0);
  const ok = concordance([{ code: "A", kind: "catalog", rec_from_s: 0, rec_to_s: 15, track_from_s: 302, track_to_s: 317 }], late, null);
  assert.equal(ok.confirmedSegments, 1);
}
// Coverage is checked at the final common start too: a neighbour shifts the start by 14 s, and the
// fragment whose log ends right at its own end is then no longer covered.
{
  const ps = [play("A", 0, 100), { ...play("B", 1000, 40), lastAt: iso(1030) }, play("C", 2000, 100)];
  const ss: MatchSegment[] = [
    { code: "A", kind: "catalog", rec_from_s: 10, rec_to_s: 40, track_from_s: 10 + 14, track_to_s: 40 + 14 },
    { code: "B", kind: "catalog", rec_from_s: 1010, rec_to_s: 1040, track_from_s: 10, track_to_s: 40 },
    { code: "C", kind: "catalog", rec_from_s: 2010, rec_to_s: 2040, track_from_s: 10 + 14, track_to_s: 40 + 14 },
  ];
  const c = concordance(ss, ps, null);
  const start = Date.parse(c.recordingStartUtc!) / 1000 - T;
  for (const ch of c.checks) {
    if (!ch.confirmed) continue;
    const p = ps[ch.play!];
    assert.ok(start + ch.recToS <= Date.parse(p.lastAt) / 1000 - T + 20 + 1e-6, JSON.stringify({ start, ch }));
  }
}
// Candidate starts are ranked with coverage: offsets 14, 0, 0 where the start 14 would leave two
// fragments uncovered; the start 0 confirms all three even with the claimed time favouring 14.
{
  const ps = [play("A", 0, 100), { ...play("B", 1000, 40), lastAt: iso(1030) }, { ...play("C", 2000, 40), lastAt: iso(2030) }];
  const ss: MatchSegment[] = [
    { code: "A", kind: "catalog", rec_from_s: 10, rec_to_s: 40, track_from_s: 10 + 14, track_to_s: 40 + 14 },
    { code: "B", kind: "catalog", rec_from_s: 1010, rec_to_s: 1040, track_from_s: 10, track_to_s: 40 },
    { code: "C", kind: "catalog", rec_from_s: 2010, rec_to_s: 2040, track_from_s: 10, track_to_s: 40 },
  ];
  const c = concordance(ss, ps, new Date((T + 14) * 1000));
  assert.equal(c.confirmedSegments, 3, JSON.stringify(c));
}
// Every confirmed segment stays within the tolerance of the reported start (offsets −15, 0, 15, 15).
{
  const ps = [play("A", 0, 100), play("B", 1000, 100), play("C", 2000, 100), play("D", 3000, 100)];
  const offs = [-15, 0, 15, 15];
  const ss: MatchSegment[] = ["A", "B", "C", "D"].map((code, k) => ({
    code, kind: "catalog", rec_from_s: k * 1000 + 10, rec_to_s: k * 1000 + 40, track_from_s: 10 - offs[k], track_to_s: 40 - offs[k],
  }));
  const c = concordance(ss, ps, null);
  for (const ch of c.checks) if (ch.confirmed) assert.ok(Math.abs(ch.deltaS!) <= c.toleranceS + 1e-9, JSON.stringify(ch));
  assert.ok(c.confirmedSegments >= 3);
}
console.log("evidence-concordance-unit OK");
