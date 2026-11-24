/**
 * t1670u (Sergey 24.11.2026) – the guest «Собрать атмосферу» preview plays the CLOSED catalogue
 * «АудиоЛад Кофейня» (the music of the halls), not the public catalogue: the page promises legal
 * music with rights directly from the rights holder. Pure / browser-safe, deterministic.
 *
 * t1671u: vocal albums (manual label «С вокалом», practices.business_has_vocals) may sound in the
 * preview as an example – at most GUEST_COFFEE_PREVIEW_VOCAL_TRACKS of the 12 tracks, only from
 * vocal albums that fit the chosen sound type; when fewer fit, instrumental tracks fill the
 * places. The hall pool is NOT changed by this module (vocals stay out of halls).
 *
 * Exposure: the server assembles the atmospheres of all 64 settings and sends the browser only
 * the albums / tracks those atmospheres use (never the whole closed catalogue), and the guest
 * stream-URL route signs only those tracks.
 */
import {
  GUEST_COFFEE_CHARACTERS,
  GUEST_COFFEE_DAYPARTS,
  GUEST_COFFEE_DIRECTIONS,
  type GuestCoffeePlaylist,
  type GuestCoffeeProfile,
  type GuestCoffeeTrack,
} from "./catalog";
import {
  GUEST_COFFEE_ATMOSPHERE_MAX_TRACKS,
  assembleGuestCoffeeAtmosphere,
  guestCoffeeAtmosphereName,
  type GuestCoffeeAtmosphere,
  type GuestCoffeeAtmosphereTrack,
  type GuestCoffeeAxisMatch,
} from "./atmosphere";
import {
  allGuestCoffeeProfiles,
  guestCoffeeProfileKey,
  guestCoffeeRecommendation,
  type GuestCoffeeRecommendationPlan,
} from "./recommend";
import { inferGuestCoffeeEditorialTags } from "./shelf";

/** Vocal tracks in one 12-track preview (Sergey t1671u: 2 with vocals, 10 without). */
export const GUEST_COFFEE_PREVIEW_VOCAL_TRACKS = 2;

/** One closed album as the server loader read it (only admitted, approved, playable tracks). */
export type GuestCoffeeClosedAlbum = {
  id: string;
  title: string;
  authorName: string | null;
  hasVocals: boolean;
  /** Token-free same-origin cover URL (guest cover route) or null. */
  coverUrl: string | null;
  tracks: GuestCoffeeTrack[];
};

/** Closed albums → shelf playlists. No public page: slugs and href stay empty. */
export function buildGuestCoffeeClosedShelf(albums: readonly GuestCoffeeClosedAlbum[]): GuestCoffeePlaylist[] {
  const seen = new Set<string>();
  const out: GuestCoffeePlaylist[] = [];
  for (const album of albums) {
    if (!album.id || seen.has(album.id) || album.tracks.length === 0) continue;
    seen.add(album.id);
    const tags = inferGuestCoffeeEditorialTags(album.title);
    out.push({
      id: album.id,
      authorSlug: "",
      productSlug: "",
      title: album.title,
      authorName: album.authorName,
      href: "",
      coverUrl: album.coverUrl,
      coverImage: null,
      updatedAt: null,
      format: null,
      direction: tags.direction,
      ...(tags.sounds ? { sounds: tags.sounds } : {}),
      dayparts: tags.dayparts,
      characters: tags.characters,
      tracks: [...album.tracks],
      closed: true,
      hasVocals: album.hasVocals === true,
    });
  }
  return out;
}

function axis(matched: number, of: number, label: string): GuestCoffeeAxisMatch {
  return { state: of > 0 && matched === of ? "all" : matched > 0 ? "some" : "none", matched, of, label };
}

function labelOf(options: readonly { id: string; label: string }[], id: string): string {
  return options.find((o) => o.id === id)?.label ?? id;
}

/** Places of the vocal tracks spread over the playlist (12 tracks, 2 vocal → 4th and 8th). */
export function guestCoffeeVocalSlots(total: number, vocal: number): number[] {
  const slots: number[] = [];
  for (let i = 0; i < vocal; i++) {
    const slot = Math.min(total - 1, Math.max(0, Math.round(((i + 1) * total) / (vocal + 1)) - 1));
    slots.push(slots.includes(slot) ? Math.min(total - 1, slot + 1) : slot);
  }
  return slots;
}

/**
 * The preview atmosphere: up to 2 vocal tracks from sound-fitting vocal albums plus
 * instrumental tracks up to 12. Without vocal albums (today) – exactly the usual assembly.
 */
export function assembleGuestCoffeePreviewAtmosphere(
  available: readonly GuestCoffeePlaylist[],
  profile: GuestCoffeeProfile,
  plan?: GuestCoffeeRecommendationPlan | null,
): GuestCoffeeAtmosphere | null {
  const plainPool = available.filter((p) => p.hasVocals !== true);
  const vocalPool = available.filter((p) => p.hasVocals === true);
  // Vocal tracks only from albums that fit the chosen sound type – never «closest» vocal albums.
  const fittingVocal = vocalPool.length > 0
    ? guestCoffeeRecommendation(vocalPool, profile, plan).albums.filter((a) => a.fits.sound).map((a) => a.playlist)
    : [];
  const vocal = fittingVocal.length > 0
    ? assembleGuestCoffeeAtmosphere(fittingVocal, profile, plan, null, { maxTracks: GUEST_COFFEE_PREVIEW_VOCAL_TRACKS, byCount: true })
    : null;
  const vocalCount = vocal?.tracks.length ?? 0;
  const plain = plainPool.length > 0
    ? assembleGuestCoffeeAtmosphere(plainPool, profile, plan, null, { maxTracks: GUEST_COFFEE_ATMOSPHERE_MAX_TRACKS - vocalCount, byCount: true })
    : null;
  if (!plain) return vocal;
  if (!vocal) return plain;

  const total = plain.tracks.length + vocal.tracks.length;
  const slots = guestCoffeeVocalSlots(total, vocal.tracks.length);
  const tracks: GuestCoffeeAtmosphereTrack[] = [];
  const plainQueue = [...plain.tracks];
  const vocalQueue = [...vocal.tracks];
  for (let i = 0; i < total; i++) {
    const next = slots.includes(i) ? vocalQueue.shift() ?? plainQueue.shift() : plainQueue.shift() ?? vocalQueue.shift();
    if (next) tracks.push(next);
  }
  const sum = (k: "direction" | "daypart" | "character", label: string) =>
    axis(plain.match[k].matched + vocal.match[k].matched, plain.match[k].of + vocal.match[k].of, label);
  return {
    ...plain,
    tracks,
    // Vocal tracks come only from sound-fitting albums: with them the sound type is never a fallback.
    directionFallback: plain.directionFallback && vocal.tracks.length === 0,
    sources: [...plain.sources, ...vocal.sources],
    totalSeconds: plain.totalSeconds + vocal.totalSeconds,
    durationKnown: plain.durationKnown && vocal.durationKnown,
    diversity: {
      artists: plain.diversity.artists + vocal.diversity.artists,
      fallback: plain.diversity.fallback,
    },
    match: {
      direction: sum("direction", labelOf(GUEST_COFFEE_DIRECTIONS, profile.direction)),
      daypart: sum("daypart", labelOf(GUEST_COFFEE_DAYPARTS, profile.daypart)),
      character: sum("character", labelOf(GUEST_COFFEE_CHARACTERS, profile.character)),
    },
  };
}

/**
 * An atmosphere as sent to the browser, compact (64 of them ride in the page): track and album
 * positions in the trimmed playlists; labels, name and settings are derived from the key.
 */
export type GuestCoffeePresetAtmosphere = {
  /** Track positions in the flattened track list of the playlists (album order, track order). */
  t: number[];
  /** Source albums: [playlist position, tracks used]. */
  s: [number, number][];
  /** totalSeconds. */
  ts: number;
  /** durationKnown, directionFallback, diversity.fallback (0 / 1). */
  f: [0 | 1, 0 | 1, 0 | 1];
  /** diversity.artists. */
  a: number;
  /** direction, daypart, character: [state, matched, of]. */
  m: [GuestCoffeeAxisMatch["state"], number, number][];
};
export type GuestCoffeePresets = Record<string, GuestCoffeePresetAtmosphere>;

export type GuestCoffeePreview = {
  /** Only the albums / tracks used by some preset (the signing allow-list of the guest route). */
  playlists: GuestCoffeePlaylist[];
  presets: GuestCoffeePresets;
};

const bit = (v: boolean): 0 | 1 => (v ? 1 : 0);

/** Assembles all 64 settings on the server and trims the shelf to the tracks they use. */
export function buildGuestCoffeePreview(
  shelf: readonly GuestCoffeePlaylist[],
  plan?: GuestCoffeeRecommendationPlan | null,
): GuestCoffeePreview {
  const assembled: [string, GuestCoffeeAtmosphere][] = [];
  const used = new Set<string>();
  for (const profile of allGuestCoffeeProfiles()) {
    const a = assembleGuestCoffeePreviewAtmosphere(shelf, profile, plan);
    if (!a) continue;
    assembled.push([guestCoffeeProfileKey(profile), a]);
    for (const t of a.tracks) used.add(t.audioItemId);
  }
  const playlists = shelf
    .map((p) => ({ ...p, tracks: p.tracks.filter((t) => used.has(t.audioItemId)) }))
    .filter((p) => p.tracks.length > 0);
  const trackPos = new Map(playlists.flatMap((p) => p.tracks).map((t, i) => [t.audioItemId, i]));
  const albumPos = new Map(playlists.map((p, i) => [p.id, i]));
  const presets: GuestCoffeePresets = {};
  for (const [key, a] of assembled) {
    presets[key] = {
      t: a.tracks.map((t) => trackPos.get(t.audioItemId)!),
      s: a.sources.map((src) => [albumPos.get(src.id)!, src.tracksUsed]),
      ts: a.totalSeconds,
      f: [bit(a.durationKnown), bit(a.directionFallback), bit(a.diversity.fallback)],
      a: a.diversity.artists,
      m: [a.match.direction, a.match.daypart, a.match.character].map((x) => [x.state, x.matched, x.of]),
    };
  }
  return { playlists, presets };
}

const isIndex = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const AXIS_STATES = new Set(["all", "some", "none"]);

function validPreset(p: unknown): p is GuestCoffeePresetAtmosphere {
  if (!p || typeof p !== "object") return false;
  const x = p as Record<string, unknown>;
  return (
    Array.isArray(x.t) && x.t.length > 0 && x.t.every(isIndex) && new Set(x.t).size === x.t.length &&
    Array.isArray(x.s) && x.s.every((e) => Array.isArray(e) && e.length === 2 && isIndex(e[0]) && isCount(e[1])) &&
    isCount(x.ts) && isCount(x.a) &&
    Array.isArray(x.f) && x.f.length === 3 && x.f.every((b) => b === 0 || b === 1) &&
    Array.isArray(x.m) && x.m.length === 3 &&
    x.m.every((e) => Array.isArray(e) && e.length === 3 && AXIS_STATES.has(e[0] as string) && isCount(e[1]) && isCount(e[2]))
  );
}

/** Browser: the ready atmosphere of one setting (null when the preset is missing or broken). */
export function guestCoffeeAtmosphereFromPreset(
  key: string,
  preset: GuestCoffeePresetAtmosphere | null | undefined,
  playlists: readonly GuestCoffeePlaylist[],
): GuestCoffeeAtmosphere | null {
  const profile = allGuestCoffeeProfiles().find((p) => guestCoffeeProfileKey(p) === key);
  if (!profile || !validPreset(preset)) return null;
  const flat = playlists.flatMap((p) =>
    p.tracks.map((t): GuestCoffeeAtmosphereTrack => ({ ...t, playlistId: p.id, albumTitle: p.title, authorName: p.authorName })),
  );
  const tracks = preset.t.flatMap((i) => (flat[i] ? [flat[i]] : []));
  if (tracks.length === 0 || tracks.length !== preset.t.length) return null;
  const sources = preset.s.flatMap(([i, tracksUsed]) => {
    const p = playlists[i];
    return p ? [{ id: p.id, title: p.title, authorName: p.authorName, tracksUsed }] : [];
  });
  const [d, dp, c] = preset.m;
  const labels = [
    labelOf(GUEST_COFFEE_DIRECTIONS, profile.direction),
    labelOf(GUEST_COFFEE_DAYPARTS, profile.daypart),
    labelOf(GUEST_COFFEE_CHARACTERS, profile.character),
  ];
  return {
    key,
    profile: { ...profile },
    name: guestCoffeeAtmosphereName(profile),
    tracks,
    sources,
    totalSeconds: preset.ts,
    durationKnown: preset.f[0] === 1,
    directionFallback: preset.f[1] === 1,
    diversity: { artists: preset.a, fallback: preset.f[2] === 1 },
    match: {
      direction: { state: d[0], matched: d[1], of: d[2], label: labels[0] },
      daypart: { state: dp[0], matched: dp[1], of: dp[2], label: labels[1] },
      character: { state: c[0], matched: c[1], of: c[2], label: labels[2] },
    },
  };
}
