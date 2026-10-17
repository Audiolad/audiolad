/**
 * a8240527 (Sergey 17.10.2026 23:21) – «Собрать атмосферу»: the visitor picks the sound
 * settings, presses ONE button and gets ONE ready playlist («Ваша атмосфера») assembled from
 * the curated shelf of real free catalogue albums. Pure / browser-safe, deterministic.
 *
 * How the assembly works:
 * 1. Albums are ranked with the same score as the shelf (direction → time of day → venue
 *    character). Only albums of the chosen direction are used when there are any; otherwise
 *    the closest albums are used and this is said openly (directionFallback).
 * 2. Up to GUEST_COFFEE_ATMOSPHERE_MAX_SOURCES best albums are taken and their tracks are
 *    interleaved (one track from each album in turn), so the playlist is varied.
 * 3. Collection stops at ~GUEST_COFFEE_ATMOSPHERE_TARGET_SECONDS or
 *    GUEST_COFFEE_ATMOSPHERE_MAX_TRACKS tracks. Long-form single tracks (one 30-minute piece)
 *    are used only when nothing shorter exists – one of them would take the whole guest limit.
 * 4. The match is reported per setting honestly: the catalogue knows the setting of an ALBUM
 *    (shelf tags), not of every single track.
 *
 * Every track is a real track of a shelf album, so the existing guest stream-URL route
 * (/api/business/guest/coffee/track-url, shelf membership + 30-minute server limit) plays it
 * unchanged. Nothing is invented and nothing is stored on the server.
 */
import {
  GUEST_COFFEE_CHARACTERS,
  GUEST_COFFEE_DAYPARTS,
  GUEST_COFFEE_DIRECTIONS,
  scoreGuestCoffeePlaylist,
  type GuestCoffeeDaypart,
  type GuestCoffeePlaylist,
  type GuestCoffeeProfile,
  type GuestCoffeeShelfRef,
  type GuestCoffeeTrack,
} from "./catalog";

export const GUEST_COFFEE_ATMOSPHERE_MAX_SOURCES = 4;
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
  /** true when no album of the chosen direction exists – the closest ones were used. */
  directionFallback: boolean;
  match: {
    direction: GuestCoffeeAxisMatch;
    daypart: GuestCoffeeAxisMatch;
    character: GuestCoffeeAxisMatch;
  };
};

function labelOf(options: readonly { id: string; label: string }[], id: string): string {
  return options.find((o) => o.id === id)?.label ?? id;
}

export function guestCoffeeAtmosphereKey(profile: GuestCoffeeProfile): string {
  return `${profile.character}|${profile.direction}|${profile.daypart}`;
}

/** «Уютная кофейня · Джаз · Вечер» */
export function guestCoffeeAtmosphereName(profile: GuestCoffeeProfile): string {
  return [
    `${labelOf(GUEST_COFFEE_CHARACTERS, profile.character)} кофейня`,
    labelOf(GUEST_COFFEE_DIRECTIONS, profile.direction),
    labelOf(GUEST_COFFEE_DAYPARTS, profile.daypart),
  ].join(" · ");
}

function fitsDaypart(dayparts: GuestCoffeeShelfRef["dayparts"], daypart: GuestCoffeeDaypart): boolean {
  if (dayparts === "allday") return true;
  if (daypart === "allday") return false;
  return dayparts.includes(daypart);
}

function axis(matched: number, of: number, label: string): GuestCoffeeAxisMatch {
  return { state: of > 0 && matched === of ? "all" : matched > 0 ? "some" : "none", matched, of, label };
}

export function assembleGuestCoffeeAtmosphere(
  available: readonly GuestCoffeePlaylist[],
  profile: GuestCoffeeProfile,
): GuestCoffeeAtmosphere | null {
  const order = new Map(available.map((p, i) => [p.id, i]));
  const ranked = available
    .filter((p) => p.tracks.length > 0)
    .map((playlist) => ({ playlist, score: scoreGuestCoffeePlaylist(playlist, profile) }))
    .sort((a, b) => b.score - a.score || (order.get(a.playlist.id) ?? 0) - (order.get(b.playlist.id) ?? 0))
    .map((r) => r.playlist);
  if (ranked.length === 0) return null;
  const sameDirection = ranked.filter((p) => p.direction === profile.direction);
  const directionFallback = sameDirection.length === 0;
  const pool = directionFallback ? ranked : sameDirection;

  const isLong = (t: GuestCoffeeTrack) => typeof t.durationSeconds === "number" && t.durationSeconds >= GUEST_COFFEE_ATMOSPHERE_LONG_TRACK_SECONDS;
  const hasShort = pool.some((p) => p.tracks.some((t) => !isLong(t)));
  const usable = (t: GuestCoffeeTrack) => !hasShort || !isLong(t);
  const sources = pool.filter((p) => p.tracks.some(usable)).slice(0, GUEST_COFFEE_ATMOSPHERE_MAX_SOURCES);

  const queues = sources.map((p) => p.tracks.filter(usable));
  const seen = new Set<string>();
  const tracks: GuestCoffeeAtmosphereTrack[] = [];
  const used = new Map<string, number>();
  let planned = 0;
  let total = 0;
  for (let round = 0; tracks.length < GUEST_COFFEE_ATMOSPHERE_MAX_TRACKS && planned < GUEST_COFFEE_ATMOSPHERE_TARGET_SECONDS; round++) {
    let took = false;
    for (let s = 0; s < sources.length; s++) {
      if (tracks.length >= GUEST_COFFEE_ATMOSPHERE_MAX_TRACKS || planned >= GUEST_COFFEE_ATMOSPHERE_TARGET_SECONDS) break;
      const track = queues[s][round];
      if (!track || seen.has(track.audioItemId)) continue;
      seen.add(track.audioItemId);
      const source = sources[s];
      tracks.push({ ...track, playlistId: source.id, albumTitle: source.title, authorName: source.authorName });
      used.set(source.id, (used.get(source.id) ?? 0) + 1);
      const known = typeof track.durationSeconds === "number" && track.durationSeconds > 0 ? track.durationSeconds : 0;
      total += known;
      planned += known || UNKNOWN_TRACK_SECONDS;
      took = true;
    }
    if (!took && queues.every((q) => q.length <= round)) break;
  }
  if (tracks.length === 0) return null;

  // Only albums that actually gave tracks count as sources of the match report.
  const contributing = sources.filter((p) => used.has(p.id));
  const n = contributing.length;
  return {
    key: guestCoffeeAtmosphereKey(profile),
    profile: { ...profile },
    name: guestCoffeeAtmosphereName(profile),
    tracks,
    sources: contributing.map((p) => ({ id: p.id, title: p.title, authorName: p.authorName, tracksUsed: used.get(p.id) ?? 0 })),
    totalSeconds: total,
    directionFallback,
    match: {
      direction: axis(contributing.filter((p) => p.direction === profile.direction).length, n, labelOf(GUEST_COFFEE_DIRECTIONS, profile.direction)),
      daypart: axis(contributing.filter((p) => fitsDaypart(p.dayparts, profile.daypart)).length, n, labelOf(GUEST_COFFEE_DAYPARTS, profile.daypart)),
      character: axis(contributing.filter((p) => p.characters.includes(profile.character)).length, n, labelOf(GUEST_COFFEE_CHARACTERS, profile.character)),
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
export function guestCoffeeAtmosphereMeta(a: Pick<GuestCoffeeAtmosphere, "tracks" | "totalSeconds" | "sources">): string {
  const parts = [`${a.tracks.length} ${guestCoffeeTracksWord(a.tracks.length)}`];
  if (a.totalSeconds > 0) parts.push(`${Math.max(1, Math.round(a.totalSeconds / 60))} мин`);
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
      ? `${what} «${m.label}» – подходит по описанию всех альбомов подборки.`
      : m.state === "some"
        ? `${what} «${m.label}» – подходят ${m.matched} из ${m.of} альбомов, остальные – ${rest}.`
        : `${what} «${m.label}» – отдельных альбомов пока нет, взяли ${rest}.`;
  return [
    {
      id: "direction",
      state: a.directionFallback ? "none" : direction.state,
      text: a.directionFallback
        ? `Направление «${direction.label}» – альбомов пока нет, собрали самое близкое по времени суток и характеру.`
        : part(direction, "Направление", "близкие по звучанию"),
    },
    { id: "daypart", state: daypart.state, text: part(daypart, "Время суток", "ближайшие по направлению") },
    { id: "character", state: character.state, text: part(character, "Характер заведения", "ближайшие по направлению и времени суток") },
  ];
}
