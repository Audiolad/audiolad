/**
 * a8240527 (Sergey 17.10.2026 23:21) – «Собрать атмосферу»: the visitor picks the sound
 * settings, presses ONE button and gets ONE ready playlist («Ваша атмосфера») assembled from
 * the curated shelf of real free catalogue albums. Pure / browser-safe, deterministic.
 *
 * How the assembly works:
 * 1. Albums come ranked by the recommendation module (guest-coffee/recommend.ts): on the
 *    server by the sound of the tracks (music passports, hidden) with the editorial tags as
 *    the reserve, delivered as a client-safe plan; without a plan – by the editorial tags.
 *    Albums that fit the chosen sound type are used first; closer albums are added only when
 *    the fitting ones do not give enough tracks. No sound type is ever an empty shelf; when
 *    nothing fits, the closest albums are used and this is said openly (directionFallback).
 * 2. Up to GUEST_COFFEE_ATMOSPHERE_MAX_SOURCES albums are taken artist-aware (Sergey
 *    29.10.2026): first the best album of each different artist, then by relevance. Tracks
 *    (best fitting first) are taken from the artists in turn – never the same artist twice in
 *    a row while another can play – with at most GUEST_COFFEE_ATMOSPHERE_ARTIST_CAP tracks per
 *    artist once 3+ artists are available. With fewer artists in the pool the cap is lifted
 *    and the best matches fill the playlist (diversity.fallback) – never an empty playlist.
 * 3. Collection stops at ~GUEST_COFFEE_ATMOSPHERE_TARGET_SECONDS or
 *    GUEST_COFFEE_ATMOSPHERE_MAX_TRACKS tracks. Long-form single tracks (one 30-minute piece)
 *    are used only when nothing shorter exists – one of them would take the whole guest limit.
 * 4. The match is reported per setting honestly, per album (yes / no from the plan); no
 *    technical passport details are shown.
 *
 * Every track is a real track of a shelf album – and the shelf holds only tracks admitted to
 * AudioLad Business for cafés (guest-coffee/shelf.ts), so the existing guest stream-URL route
 * (/api/business/guest/coffee/track-url, shelf membership + 30-minute server limit) plays it
 * unchanged. Nothing is invented and nothing is stored on the server.
 */
import {
  GUEST_COFFEE_CHARACTERS,
  GUEST_COFFEE_DAYPARTS,
  GUEST_COFFEE_DIRECTIONS,
  type GuestCoffeePlaylist,
  type GuestCoffeeProfile,
  type GuestCoffeeTrack,
} from "./catalog";
import { guestCoffeeProfileKey, guestCoffeeRecommendation, type GuestCoffeeRecommendationPlan } from "./recommend";
import { isInstrumentalForBusiness } from "../../music-analyzer-runs/vocal-eligibility.mjs";

type BusinessVocalLookup = {
  get(audioItemId: string): { value?: unknown; source?: unknown; status?: unknown } | null | undefined;
};

export const GUEST_COFFEE_ATMOSPHERE_MAX_SOURCES = 6;
/** At least this many different artists whenever the pool has them (Sergey 29.10.2026). */
export const GUEST_COFFEE_ATMOSPHERE_MIN_ARTISTS = 3;
/** Preferred number of different artists among sound-fitting albums. */
export const GUEST_COFFEE_ATMOSPHERE_TARGET_ARTISTS = 4;
/** No artist gives more than this many of the 12 tracks while 3+ artists are available. */
export const GUEST_COFFEE_ATMOSPHERE_ARTIST_CAP = 4;
export const GUEST_COFFEE_ATMOSPHERE_MAX_TRACKS = 12;
export const GUEST_COFFEE_ATMOSPHERE_TARGET_SECONDS = 40 * 60;
/** A track this long is a long-form piece; it would use up the 30-minute guest listening alone. */
export const GUEST_COFFEE_ATMOSPHERE_LONG_TRACK_SECONDS = 15 * 60;
/** Unknown duration counts as 4 minutes for the target length. */
const UNKNOWN_TRACK_SECONDS = 240;

export type GuestCoffeeAtmosphereTrack = GuestCoffeeTrack & {
  playlistId: string;
  albumTitle: string;
  authorName: string | null;
};

export type GuestCoffeeAtmosphereSource = {
  id: string;
  title: string;
  authorName: string | null;
  tracksUsed: number;
};

export type GuestCoffeeAxisMatch = {
  /** all – every source album fits; some – part of them; none – no album fits. */
  state: "all" | "some" | "none";
  matched: number;
  of: number;
  label: string;
};

export type GuestCoffeeAtmosphere = {
  /** Settings this atmosphere was assembled for (see guestCoffeeAtmosphereKey). */
  key: string;
  profile: GuestCoffeeProfile;
  name: string;
  tracks: GuestCoffeeAtmosphereTrack[];
  sources: GuestCoffeeAtmosphereSource[];
  /** Sum of known track durations, seconds. */
  totalSeconds: number;
  /** Every track's duration is known – only then the total length is shown. */
  durationKnown: boolean;
  /** true when no album of the chosen direction exists – the closest ones were used. */
  directionFallback: boolean;
  /** Different artists in the playlist; fallback = the pool did not allow the target variety. */
  diversity: { artists: number; fallback: boolean };
  match: {
    direction: GuestCoffeeAxisMatch;
    daypart: GuestCoffeeAxisMatch;
    character: GuestCoffeeAxisMatch;
  };
};

/** Artist identity of an album: the author's slug (stable), else the display name. */
export function guestCoffeeArtistKey(p: Pick<GuestCoffeePlaylist, "authorSlug" | "authorName" | "id">): string {
  return p.authorSlug || p.authorName || p.id;
}

/**
 * Re-orders the picked tracks in place so the same artist never plays twice in a row when it
 * can be avoided: the earliest (most relevant) next track of another artist goes next; an
 * artist is taken out of turn only when otherwise its remaining tracks could not be spread.
 */
export function spreadGuestCoffeeArtists<T extends Pick<GuestCoffeeAtmosphereTrack, "authorName" | "playlistId">>(tracks: T[]): T[] {
  const keyOf = (t: T) => t.authorName ?? t.playlistId;
  const queues = new Map<string, { at: number; t: T }[]>();
  tracks.forEach((t, at) => {
    const k = keyOf(t);
    queues.set(k, [...(queues.get(k) ?? []), { at, t }]);
  });
  const out: T[] = [];
  let last: string | null = null;
  for (let left = tracks.length; left > 0; left--) {
    let pick: string | null = null;
    for (const [k, q] of queues) if (q.length > 0 && k !== last && q.length * 2 > left) pick = k;
    if (pick === null) {
      let best = Infinity;
      for (const [k, q] of queues) if (q.length > 0 && k !== last && q[0].at < best) [pick, best] = [k, q[0].at];
    }
    if (pick === null) pick = last!;
    out.push(queues.get(pick)!.shift()!.t);
    last = pick;
  }
  tracks.splice(0, tracks.length, ...out);
  return tracks;
}

function labelOf(options: readonly { id: string; label: string }[], id: string): string {
  return options.find((o) => o.id === id)?.label ?? id;
}

export function guestCoffeeAtmosphereKey(profile: GuestCoffeeProfile): string {
  return guestCoffeeProfileKey(profile);
}

/** «Уютная кофейня · Джаз · Вечер» */
export function guestCoffeeAtmosphereName(profile: GuestCoffeeProfile): string {
  return [
    `${labelOf(GUEST_COFFEE_CHARACTERS, profile.character)} кофейня`,
    labelOf(GUEST_COFFEE_DIRECTIONS, profile.direction),
    labelOf(GUEST_COFFEE_DAYPARTS, profile.daypart),
  ].join(" · ");
}

function axis(matched: number, of: number, label: string): GuestCoffeeAxisMatch {
  return { state: of > 0 && matched === of ? "all" : matched > 0 ? "some" : "none", matched, of, label };
}

export function assembleGuestCoffeeAtmosphere(
  available: readonly GuestCoffeePlaylist[],
  profile: GuestCoffeeProfile,
  plan?: GuestCoffeeRecommendationPlan | null,
  /** Automatic instrumental playlist. Omitted for the curated shelf, which does not read vocal_role. */
  vocalByAudioItemId?: BusinessVocalLookup | null,
): GuestCoffeeAtmosphere | null {
  const { albums, soundFallback } = guestCoffeeRecommendation(available, profile, plan);
  if (albums.length === 0) return null;
  const directionFallback = soundFallback;

  const isLong = (t: GuestCoffeeTrack) => typeof t.durationSeconds === "number" && t.durationSeconds >= GUEST_COFFEE_ATMOSPHERE_LONG_TRACK_SECONDS;
  // Absent map: every curated track stays. A map uses equality to instrumental, never "not vocal".
  const allows = (t: GuestCoffeeTrack) =>
    vocalByAudioItemId == null || isInstrumentalForBusiness(vocalByAudioItemId.get(t.audioItemId) ?? null);
  const hasShort = albums.some((a) => a.tracks.some((t) => allows(t) && !isLong(t)));
  const usable = (t: GuestCoffeeTrack) => allows(t) && (!hasShort || !isLong(t));
  const candidates = albums.filter((a) => a.tracks.some(usable));
  const fitting = (a: (typeof candidates)[number]) => directionFallback || a.fits.sound;

  // Sergey 29.10.2026: not twelve tracks of one artist. Sources are chosen artist-aware:
  // first the best album of each different artist (sound-fitting albums first, up to
  // TARGET_ARTISTS; a closer album of a new artist only to reach MIN_ARTISTS), then the
  // usual relevance order fills the remaining source slots.
  const chosen: typeof candidates = [];
  const chosenArtists = new Set<string>();
  const pickNewArtists = (list: typeof candidates, upTo: number) => {
    for (const a of list) {
      if (chosen.length >= GUEST_COFFEE_ATMOSPHERE_MAX_SOURCES || chosenArtists.size >= upTo) return;
      const artist = guestCoffeeArtistKey(a.playlist);
      if (chosenArtists.has(artist)) continue;
      chosenArtists.add(artist);
      chosen.push(a);
    }
  };
  pickNewArtists(candidates.filter(fitting), GUEST_COFFEE_ATMOSPHERE_TARGET_ARTISTS);
  pickNewArtists(candidates.filter((a) => !fitting(a)), GUEST_COFFEE_ATMOSPHERE_MIN_ARTISTS);
  let usableTracks = chosen.reduce((sum, a) => sum + a.tracks.filter(usable).length, 0);
  for (const a of candidates) {
    if (chosen.length >= GUEST_COFFEE_ATMOSPHERE_MAX_SOURCES) break;
    if (chosen.includes(a)) continue;
    // Closer (non-fitting) albums only while the playlist still lacks tracks.
    if (!fitting(a) && usableTracks >= GUEST_COFFEE_ATMOSPHERE_MAX_TRACKS) break;
    chosen.push(a);
    usableTracks += a.tracks.filter(usable).length;
  }
  const fitsById = new Map(chosen.map((a) => [a.playlist.id, a.fits]));

  // Per artist (in order of their best album): two queues – tracks of sound-fitting albums and
  // of closer ones, the artist's best album first (its best fitting tracks first).
  type Item = { track: GuestCoffeeTrack; source: GuestCoffeePlaylist };
  const queueOf = (list: typeof chosen): Item[] =>
    list.flatMap((a) => a.tracks.filter(usable).map((track) => ({ track, source: a.playlist })));
  const artistOrder: string[] = [];
  for (const a of chosen) {
    const k = guestCoffeeArtistKey(a.playlist);
    if (!artistOrder.includes(k)) artistOrder.push(k);
  }
  const lanes = artistOrder.map((k) => {
    const own = chosen.filter((a) => guestCoffeeArtistKey(a.playlist) === k);
    return { artist: k, tiers: [queueOf(own.filter(fitting)), queueOf(own.filter((a) => !fitting(a)))], taken: 0 };
  });
  // Cap per artist: with 3+ artists no artist gives more than 4 of 12 (3 each with 4 artists
  // by the rotation); with 2 artists – half each. Lifted only when nothing else is left.
  const cap =
    lanes.length >= GUEST_COFFEE_ATMOSPHERE_MIN_ARTISTS
      ? GUEST_COFFEE_ATMOSPHERE_ARTIST_CAP
      : Math.ceil(GUEST_COFFEE_ATMOSPHERE_MAX_TRACKS / Math.max(1, lanes.length));

  const seen = new Set<string>();
  const tracks: GuestCoffeeAtmosphereTrack[] = [];
  const used = new Map<string, number>();
  let planned = 0;
  let total = 0;
  let capLifted = false;
  let rotation = 0;
  let lastArtist: string | null = null;
  const full = () => tracks.length >= GUEST_COFFEE_ATMOSPHERE_MAX_TRACKS || planned >= GUEST_COFFEE_ATMOSPHERE_TARGET_SECONDS;
  const head = (lane: (typeof lanes)[number], tier: number): Item | undefined => {
    const q = lane.tiers[tier];
    while (q.length > 0 && seen.has(q[0].track.audioItemId)) q.shift();
    return q[0];
  };
  // Priority: fitting under the cap → closer under the cap → (fallback) fitting over the cap →
  // closer over the cap. Within one level the artists take turns and the same artist is never
  // played twice in a row while another one can play.
  const levels: { tier: number; capped: boolean }[] = [
    { tier: 0, capped: true },
    { tier: 1, capped: true },
    { tier: 0, capped: false },
    { tier: 1, capped: false },
  ];
  while (!full()) {
    let picked: { lane: number; item: Item; capped: boolean } | null = null;
    for (const level of levels) {
      const ready: number[] = [];
      for (let step = 0; step < lanes.length; step++) {
        const i = (rotation + step) % lanes.length;
        if (level.capped && lanes[i].taken >= cap) continue;
        if (head(lanes[i], level.tier)) ready.push(i);
      }
      if (ready.length === 0) continue;
      const i = ready.find((n) => lanes[n].artist !== lastArtist) ?? ready[0];
      picked = { lane: i, item: head(lanes[i], level.tier)!, capped: level.capped };
      lanes[i].tiers[level.tier].shift();
      break;
    }
    if (!picked) break;
    const { track, source } = picked.item;
    if (!picked.capped) capLifted = true;
    seen.add(track.audioItemId);
    tracks.push({ ...track, playlistId: source.id, albumTitle: source.title, authorName: source.authorName });
    used.set(source.id, (used.get(source.id) ?? 0) + 1);
    lanes[picked.lane].taken += 1;
    lastArtist = lanes[picked.lane].artist;
    rotation = (picked.lane + 1) % lanes.length;
    const known = typeof track.durationSeconds === "number" && track.durationSeconds > 0 ? track.durationSeconds : 0;
    total += known;
    planned += known || UNKNOWN_TRACK_SECONDS;
  }
  const sources = chosen.map((a) => a.playlist);
  spreadGuestCoffeeArtists(tracks);
  if (tracks.length === 0) return null;

  // Only albums that actually gave tracks count as sources of the match report.
  const contributing = sources.filter((p) => used.has(p.id));
  const n = contributing.length;
  const artists = new Set(contributing.map(guestCoffeeArtistKey)).size;
  return {
    key: guestCoffeeAtmosphereKey(profile),
    profile: { ...profile },
    name: guestCoffeeAtmosphereName(profile),
    tracks,
    sources: contributing.map((p) => ({ id: p.id, title: p.title, authorName: p.authorName, tracksUsed: used.get(p.id) ?? 0 })),
    totalSeconds: total,
    durationKnown: tracks.every((t) => typeof t.durationSeconds === "number" && t.durationSeconds > 0),
    directionFallback,
    diversity: {
      artists,
      // Fewer than MIN_ARTISTS different artists, or the per-artist cap had to be lifted:
      // the admitted pool did not allow more variety – best matches were used instead.
      fallback: artists < GUEST_COFFEE_ATMOSPHERE_MIN_ARTISTS || capLifted,
    },
    match: {
      direction: axis(contributing.filter((p) => fitsById.get(p.id)?.sound).length, n, labelOf(GUEST_COFFEE_DIRECTIONS, profile.direction)),
      daypart: axis(contributing.filter((p) => fitsById.get(p.id)?.daypart).length, n, labelOf(GUEST_COFFEE_DAYPARTS, profile.daypart)),
      character: axis(contributing.filter((p) => fitsById.get(p.id)?.character).length, n, labelOf(GUEST_COFFEE_CHARACTERS, profile.character)),
    },
  };
}

export function guestCoffeeTracksWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "трек";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "трека";
  return "треков";
}

/** Genitive after «из»: из 1 альбома, из 3 альбомов, из 21 альбома. */
function albumsGenitive(n: number): string {
  return n % 10 === 1 && n % 100 !== 11 ? "альбома" : "альбомов";
}

/** «12 треков · 38 мин · из 3 альбомов» */
export function guestCoffeeAtmosphereMeta(a: Pick<GuestCoffeeAtmosphere, "tracks" | "totalSeconds" | "durationKnown" | "sources">): string {
  const parts = [`${a.tracks.length} ${guestCoffeeTracksWord(a.tracks.length)}`];
  // A partial sum would understate the length: show minutes only when every duration is known.
  if (a.durationKnown && a.totalSeconds > 0) parts.push(`${Math.max(1, Math.round(a.totalSeconds / 60))} мин`);
  parts.push(`из ${a.sources.length} ${albumsGenitive(a.sources.length)}`);
  return parts.join(" · ");
}

/** «3:05»; null when the duration is unknown. */
export function guestCoffeeTrackClock(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Honest «что совпало» lines, one per setting (en dashes only). */
export function guestCoffeeAtmosphereMatchLines(a: Pick<GuestCoffeeAtmosphere, "match" | "directionFallback">): {
  id: "direction" | "daypart" | "character";
  state: GuestCoffeeAxisMatch["state"];
  text: string;
}[] {
  const { direction, daypart, character } = a.match;
  const part = (m: GuestCoffeeAxisMatch, what: string, rest: string) =>
    m.state === "all"
      ? `${what} «${m.label}» – подходит по звучанию всех альбомов подборки.`
      : m.state === "some"
        ? `${what} «${m.label}» – ${m.matched % 10 === 1 && m.matched % 100 !== 11 ? "подходит" : "подходят"} ${m.matched} из ${m.of} альбомов, остальные – ${rest}.`
        : `${what} «${m.label}» – отдельных альбомов пока нет, взяли ${rest}.`;
  return [
    {
      id: "direction",
      state: a.directionFallback ? "none" : direction.state,
      text: a.directionFallback
        ? `Тип звучания «${direction.label}» – подходящих альбомов пока нет, собрали самое близкое по звучанию.`
        : part(direction, "Тип звучания", "близкие по звучанию"),
    },
    { id: "daypart", state: daypart.state, text: part(daypart, "Время суток", "ближайшие по звучанию") },
    { id: "character", state: character.state, text: part(character, "Характер заведения", "ближайшие по звучанию и времени суток") },
  ];
}
