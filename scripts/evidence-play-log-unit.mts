// t1578u: play-log reconstruction and CSV layout for the evidence extract.
import assert from "node:assert/strict";
import {
  factsCsv,
  localInputToUtc,
  playsCsv,
  reconstructPlays,
  toCsv,
  type EvidenceFact,
} from "../src/lib/evidence/play-log";

const T0 = Date.parse("2026-11-10T09:00:00.000Z");
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
let n = 0;
const fact = (s: number, track: string, posS: number, player = "p1", key = "k1"): EvidenceFact => ({
  id: `f${++n}`, occurred_at: at(s), audio_item_id: track, player_id: player, listened_ms: 10_000,
  position_ms: posS * 1000, listening_key: key,
});

// Track A from 0 s, samples each 10 s up to 180 s, then track B, then A again after a pause.
const facts: EvidenceFact[] = [];
for (let s = 10; s <= 180; s += 10) facts.push(fact(s, "A", s));
for (let s = 190; s <= 300; s += 10) facts.push(fact(s, "B", s - 180, "p1", "k2"));
for (let s = 500; s <= 540; s += 10) facts.push(fact(s, "A", s - 480, "p1", "k3"));
// Another player in another zone at the same time.
for (let s = 15; s <= 75; s += 10) facts.push(fact(s, "C", s + 100, "p2", "k9"));
// Shuffled input must not matter.
facts.reverse();

const plays = reconstructPlays(facts);
assert.equal(plays.length, 4);
const [a1, c, b, a2] = plays;
assert.equal(a1.audioItemId, "A");
assert.equal(c.audioItemId, "C");
assert.equal(b.audioItemId, "B");
assert.equal(a2.audioItemId, "A");
assert.equal(a1.facts, 18);
assert.equal(a1.estTrackStartAt, at(0));
assert.equal(b.estTrackStartAt, at(180));
assert.equal(a2.estTrackStartAt, at(480));
assert.equal(c.estTrackStartAt, at(-100));
assert.equal(a1.posToMs, 180_000);
assert.equal(a1.listenedMs, 180_000);

// Position jumping back (repeat of the same track) splits a play.
{
  const f: EvidenceFact[] = [fact(10, "X", 100), fact(20, "X", 110), fact(30, "X", 5), fact(40, "X", 15)];
  const p = reconstructPlays(f);
  assert.equal(p.length, 2);
}
// Gap > 60 s splits too.
{
  const p = reconstructPlays([fact(10, "Y", 10), fact(200, "Y", 20)]);
  assert.equal(p.length, 2);
}

// CSV: quoting and formula neutralisation.
assert.equal(toCsv(["a", "b"], [["x,y", '=HYPERLINK("e")']]), 'a,b\r\n"x,y","\'=HYPERLINK(""e"")"\r\n');
const labels = new Map([["A", { code: "AL-T-000000001", title: "Утро, кофе" }]]);
const pc = playsCsv(plays, labels, new Map([["p1", "AL-P-000000001"]]), "Europe/Moscow");
const lines = pc.trim().split("\r\n");
assert.equal(lines.length, 5);
assert.match(lines[1], /^1,p1,AL-P-000000001,AL-T-000000001,"Утро, кофе",A,2026-11-10T09:00:10.000Z,/);
assert.match(lines[1], /2026-11-10 12:00:10/);
const fc = factsCsv(facts, labels, "Europe/Moscow");
assert.equal(fc.trim().split("\r\n").length, facts.length + 1);

// Venue-local input → UTC.
assert.equal(localInputToUtc("2026-11-10T12:00", "Europe/Moscow")?.toISOString(), "2026-11-10T09:00:00.000Z");
assert.equal(localInputToUtc("2026-07-01T12:00", "Europe/Berlin")?.toISOString(), "2026-07-01T10:00:00.000Z");
assert.equal(localInputToUtc("2026-01-01T12:00", "Europe/Berlin")?.toISOString(), "2026-01-01T11:00:00.000Z");
assert.equal(localInputToUtc("bad", "Europe/Moscow"), null);

console.log("evidence-play-log-unit OK");
