/**
 * a8240527 – guest coffee cabinet: the setup questions and the curated shelf of REAL
 * AudioLad catalogue albums ("подборки") for coffee shops. Pure / browser-safe.
 *
 * Every entry is a published, FREE music album of the AudioLad catalogue (checked
 * read-only against production on 17.10.2026). At render time each entry is resolved
 * again against the published catalogue and the existing listen-session loader; an
 * album that was unpublished, became paid or lost its audio is silently dropped –
 * nothing is invented and no placeholder sound is ever played.
 *
 * HOW TO CHANGE THE SHELF: put the album's two slugs from its public page
 * https://audiolad.ru/practice/<authorSlug>/<productSlug> below and tag it.
 */

export const GUEST_COFFEE_CHARACTERS = [
  { id: "cozy", label: "Уютная", hint: "книги, диваны, долгие разговоры" },
  { id: "city", label: "Городская", hint: "кофе с собой, живой поток гостей" },
  { id: "classic", label: "Классическая", hint: "эспрессо-бар, европейская кофейня" },
  { id: "evening", label: "Вечерняя", hint: "приглушённый свет, атмосфера бара" },
] as const;

/**
 * Sergey 17.10.2026 (passport stage): the four understandable SOUND TYPES of the simple
 * 4 × 4 × 4 setup. Working labels – rename here only (one constant), ids stay stable.
 */
export const GUEST_COFFEE_SOUND_LABELS = {
  jazz: "Джаз",
  calm: "Спокойный фон",
  rhythm: "Лёгкий ритм",
  melodic: "Мелодичная музыка",
} as const;

/** The sound-type axis of the setup (kept under the historical name «direction»). */
export const GUEST_COFFEE_DIRECTIONS = [
  { id: "jazz", label: GUEST_COFFEE_SOUND_LABELS.jazz },
  { id: "calm", label: GUEST_COFFEE_SOUND_LABELS.calm },
  { id: "rhythm", label: GUEST_COFFEE_SOUND_LABELS.rhythm },
  { id: "melodic", label: GUEST_COFFEE_SOUND_LABELS.melodic },
] as const;

/**
 * Editorial genre shelf of an album (hand tags of 17.10.2026). Since the passport stage it is
 * only the RESERVE basis of the recommendations (no passport / low confidence / partial
 * coverage), mapped onto the sound types by guest-coffee/recommend.ts.
 */
export type GuestCoffeeEditorialStyle = "jazz" | "bossa" | "sax" | "calm";

export const GUEST_COFFEE_DAYPARTS = [
  { id: "morning", label: "Утро" },
  { id: "day", label: "День" },
  { id: "evening", label: "Вечер" },
  { id: "allday", label: "Весь день" },
] as const;

export type GuestCoffeeCharacter = (typeof GUEST_COFFEE_CHARACTERS)[number]["id"];
export type GuestCoffeeDirection = (typeof GUEST_COFFEE_DIRECTIONS)[number]["id"];
export type GuestCoffeeDaypart = (typeof GUEST_COFFEE_DAYPARTS)[number]["id"];

export type GuestCoffeeProfile = {
  character: GuestCoffeeCharacter;
  direction: GuestCoffeeDirection;
  daypart: GuestCoffeeDaypart;
};

export const GUEST_COFFEE_DEFAULT_PROFILE: GuestCoffeeProfile = {
  character: "cozy",
  direction: "jazz",
  daypart: "allday",
};

export type GuestCoffeeShelfRef = {
  authorSlug: string;
  productSlug: string;
  /** Editorial genre shelf (reserve basis, see GuestCoffeeEditorialStyle). */
  direction: GuestCoffeeEditorialStyle;
  /**
   * Editorial sound types stated explicitly by the album's own title (e.g. «Мягкий джаз» –
   * also a calm background). Optional; the editorial style gives the rest.
   */
  sounds?: readonly GuestCoffeeDirection[];
  /** Dayparts the album suits; "allday" albums also fit every daypart. */
  dayparts: readonly Exclude<GuestCoffeeDaypart, "allday">[] | "allday";
  characters: readonly GuestCoffeeCharacter[];
};

export const GUEST_COFFEE_SHELF: readonly GuestCoffeeShelfRef[] = [
  // ---- Джаз
  { authorSlug: "teplyy-takt", productSlug: "dzhazovaya-muzyka-dlya-kofeen", direction: "jazz", dayparts: "allday", characters: ["cozy", "city", "classic"] },
  { authorSlug: "teplyy-takt", productSlug: "muzyka-dlya-kofeyni-dzhaz", direction: "jazz", dayparts: ["morning", "day"], characters: ["city", "classic"] },
  { authorSlug: "teplyy-takt", productSlug: "uyutnaya-muzyka-kofeyni", direction: "jazz", dayparts: ["morning", "day"], characters: ["cozy"] },
  { authorSlug: "jazz-relax", productSlug: "dzhaz-dlya-raboty", direction: "jazz", sounds: ["rhythm"], dayparts: ["morning", "day"], characters: ["city"] },
  { authorSlug: "jazz-relax", productSlug: "myagkiy-dzhaz", direction: "jazz", sounds: ["calm"], dayparts: ["morning", "day", "evening"], characters: ["cozy"] },
  { authorSlug: "jazz-relax", productSlug: "italyanskiy-dzhaz", direction: "jazz", dayparts: ["day"], characters: ["classic"] },
  { authorSlug: "jazz-relax", productSlug: "instrumentalnyy-dzhaz", direction: "jazz", dayparts: ["day"], characters: ["classic", "city"] },
  { authorSlug: "jazz-relax", productSlug: "dzhaz-dlya-otdyha", direction: "jazz", sounds: ["calm"], dayparts: ["day"], characters: ["cozy"] },
  { authorSlug: "jazz-relax", productSlug: "vecherniy-dzhaz", direction: "jazz", dayparts: ["evening"], characters: ["evening", "cozy"] },
  { authorSlug: "jazz-relax", productSlug: "romanticheskiy-dzhaz", direction: "jazz", sounds: ["melodic"], dayparts: ["evening"], characters: ["evening", "classic"] },
  { authorSlug: "cital-nyj-svet", productSlug: "muzyka-dlya-restorana-dzhaz-odin-den-v-zvukah", direction: "jazz", dayparts: "allday", characters: ["classic", "evening"] },
  { authorSlug: "ol-ga", productSlug: "osenniy-dzhaz-dlya-uyutnogo-chteniya", direction: "jazz", dayparts: ["day", "evening"], characters: ["cozy"] },
  { authorSlug: "irina-vedanina", productSlug: "uyutnaya-dzhazovaya-muzyka", direction: "jazz", dayparts: ["morning"], characters: ["cozy"] },
  // ---- Босса-нова
  { authorSlug: "tonolia", productSlug: "bossa-nova-muzyka-dlya-kofeyni", direction: "bossa", dayparts: "allday", characters: ["cozy", "city", "classic", "evening"] },
  // ---- Саксофон и лаунж
  { authorSlug: "jazz-relax", productSlug: "dzhaz-launzh", direction: "sax", dayparts: ["day", "evening"], characters: ["evening", "city"] },
  { authorSlug: "jazz-relax", productSlug: "dzhaz-na-saksofone", direction: "sax", dayparts: ["evening"], characters: ["evening", "classic"] },
  { authorSlug: "tonolia", productSlug: "chasy-otelya-muzyka-dlya-oteley-i-restoranov", direction: "sax", dayparts: "allday", characters: ["classic", "evening"] },
  { authorSlug: "ludmimla", productSlug: "muzyka-dlya-relaksa-saksofon", direction: "sax", sounds: ["calm"], dayparts: ["day"], characters: ["cozy"] },
  { authorSlug: "ludmimla", productSlug: "osenniy-saksofon", direction: "sax", dayparts: ["evening"], characters: ["cozy", "evening"] },
  { authorSlug: "muzyka-dla-dusi", productSlug: "charuyuschiy-saksofon", direction: "sax", dayparts: ["evening"], characters: ["evening"] },
  // ---- Фортепиано и спокойный фон
  { authorSlug: "tihii-chas", productSlug: "muzyka-dlya-relaksa-pianino", direction: "calm", sounds: ["melodic"], dayparts: ["morning"], characters: ["cozy"] },
  { authorSlug: "ol-ga", productSlug: "uyutnoe-fortepiano-dlya-chteniya-i-otdyha", direction: "calm", sounds: ["melodic"], dayparts: ["morning", "day"], characters: ["cozy"] },
  { authorSlug: "irina-vedanina", productSlug: "spokoynaya-muzyka-dlya-kofeyni", direction: "calm", dayparts: ["morning", "day"], characters: ["cozy", "city"] },
  { authorSlug: "irina-vedanina", productSlug: "fonovaya-muzyka-dlya-kofeyni", direction: "calm", dayparts: ["day"], characters: ["city"] },
  { authorSlug: "irina-vedanina", productSlug: "utrennyaya-muzyka-dlya-horoshego-nastroeniya", direction: "calm", sounds: ["rhythm"], dayparts: ["morning"], characters: ["city"] },
  { authorSlug: "ludmimla", productSlug: "spokoynaya-uyutnaya-muzyka", direction: "calm", dayparts: ["morning", "day"], characters: ["cozy"] },
  { authorSlug: "ludmimla", productSlug: "muzyka-dlya-uyutnogo-vechera", direction: "calm", dayparts: ["evening"], characters: ["cozy", "evening"] },
];

export const GUEST_COFFEE_MAX_RESULTS = 6;

/** A shelf album resolved against the live catalogue (only playable ones exist here). */
export type GuestCoffeeTrack = {
  audioItemId: string;
  title: string;
  durationSeconds: number | null;
};

export type GuestCoffeePlaylist = {
  id: string;
  authorSlug: string;
  productSlug: string;
  title: string;
  authorName: string | null;
  href: string;
  coverUrl: string | null;
  coverImage: unknown;
  updatedAt: string | null;
  format: string | null;
  direction: GuestCoffeeEditorialStyle;
  sounds?: readonly GuestCoffeeDirection[];
  dayparts: GuestCoffeeShelfRef["dayparts"];
  characters: readonly GuestCoffeeCharacter[];
  tracks: GuestCoffeeTrack[];
};

export function isGuestCoffeeProfileValue<T extends { id: string }>(
  options: readonly T[],
  value: unknown,
): value is T["id"] {
  return typeof value === "string" && options.some((option) => option.id === value);
}

export function guestCoffeePlaylistMinutes(playlist: Pick<GuestCoffeePlaylist, "tracks">): number | null {
  const known = playlist.tracks.filter((t) => typeof t.durationSeconds === "number" && t.durationSeconds > 0);
  if (known.length === 0) return null;
  return Math.max(1, Math.round(known.reduce((sum, t) => sum + (t.durationSeconds ?? 0), 0) / 60));
}

export function findGuestCoffeeTrack(
  playlists: readonly GuestCoffeePlaylist[],
  audioItemId: string,
): { playlist: GuestCoffeePlaylist; track: GuestCoffeeTrack } | null {
  for (const playlist of playlists) {
    const track = playlist.tracks.find((t) => t.audioItemId === audioItemId);
    if (track) return { playlist, track };
  }
  return null;
}
