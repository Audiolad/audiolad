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
 * 2. Up to GUEST_COFFEE_ATMOSPHERE_MAX_SOURCES albums are taken and their tracks (best
 *    fitting first) are interleaved (one track from each album in turn), so the playlist is
 *    varied.
 * 3. Collection stops at ~GUEST_COFFEE_ATMOSPHERE_TARGET_SECONDS or
 *    GUEST_COFFEE_ATMOSPHERE_MAX_TRACKS tracks. Long-form single tracks (one 30-minute piece)
 *    are used only when nothing shorter exists – one of them would take the whole guest limit.
 * 4. The match is reported per setting honestly, per album (yes / no from the plan); no
 *    technical passport details are shown.
 *
 * Every track is a real track of a shelf album, so the existing guest stream-URL route
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
  /** Every track's duration is known – only then the total length is shown. */
  durationKnown: boolean;
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
): GuestCoffeeAtmosphere | null {
  const { albums, soundFallback } = guestCoffeeRecommendation(available, profile, plan);
  if (albums.length === 0) return null;
  const directionFallback = soundFallback;

  const isLong = (t: GuestCoffeeTrack) => typeof t.durationSeconds === "number" && t.durationSeconds >= GUEST_COFFEE_ATMOSPHERE_LONG_TRACK_SECONDS;
  const hasShort = albums.some((a) => a.tracks.some((t) => !isLong(t)));
  const usable = (t: GuestCoffeeTrack) => !hasShort || !isLong(t);
  // Sound-fitting albums first; closer ones only while the playlist still lacks tracks.
  const candidates = albums.filter((a) => a.tracks.some(usable));
  const chosen: typeof candidates = [];
  let usableTracks = 0;
  for (const a of candidates) {
    if (chosen.length >= GUEST_COFFEE_ATMOSPHERE_MAX_SOURCES) break;
    if (!directionFallback && !a.fits.sound && chosen.length > 0 && usableTracks >= GUEST_COFFEE_ATMOSPHERE_MAX_TRACKS) break;
    chosen.push(a);
    usableTracks += a.tracks.filter(usable).length;
  }
  const sources = chosen.map((a) => a.playlist);
  const fitsById = new Map(chosen.map((a) => [a.playlist.id, a.fits]));

  const queues = chosen.map((a) => a.tracks.filter(usable));
  const seen = new Set<string>();
  const tracks: GuestCoffeeAtmosphereTrack[] = [];
  const used = new Map<string, number>();
  let planned = 0;
  let total = 0;
  // Phase 1 interleaves the sound-fitting albums; phase 2 (closer albums) only tops up.
  const phases = directionFallback
    ? [chosen.map((_, i) => i)]
    : [chosen.flatMap((a, i) => (a.fits.sound ? [i] : [])), chosen.flatMap((a, i) => (a.fits.sound ? [] : [i]))];
  const full = () => tracks.length >= GUEST_COFFEE_ATMOSPHERE_MAX_TRACKS || planned >= GUEST_COFFEE_ATMOSPHERE_TARGET_SECONDS;
  for (const phase of phases) {
    for (let round = 0; !full(); round++) {
      let took = false;
      for (const s of phase) {
        if (full()) break;
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
      if (!took && phase.every((s) => queues[s].length <= round)) break;
    }
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
    durationKnown: tracks.every((t) => typeof t.durationSeconds === "number" && t.durationSeconds > 0),
    directionFallback,
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
