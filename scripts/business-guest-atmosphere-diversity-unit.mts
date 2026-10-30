/**
 * «Звучание своей кофейни» → «Слушать атмосферу»: the 12 tracks come ONLY from music admitted to
 * AudioLad Business for cafés, from at least 3 (ideally 4) different artists, spread out, and
 * degrade gracefully when the admitted pool has fewer artists (Sergey 29.10.2026: all 12 tracks
 * were «Джаз Релакс»).
 *
 * Fixture = the admitted free café pool on production 29.10.2026 (read-only): artist, album,
 * track durations. Track ids/titles are synthetic.
 */
import assert from "node:assert/strict";
import {
  GUEST_COFFEE_ATMOSPHERE_ARTIST_CAP,
  GUEST_COFFEE_ATMOSPHERE_MIN_ARTISTS,
  GUEST_COFFEE_ATMOSPHERE_TARGET_ARTISTS,
  assembleGuestCoffeeAtmosphere,
  guestCoffeeArtistKey,
  spreadGuestCoffeeArtists,
} from "../src/lib/business-app/guest-coffee/atmosphere";
import {
  buildGuestCoffeeShelf,
  guestCoffeeShelfArtistCount,
  inferGuestCoffeeEditorialTags,
  type GuestCoffeeCatalogProduct,
} from "../src/lib/business-app/guest-coffee/shelf";
import {
  GUEST_COFFEE_CHARACTERS,
  GUEST_COFFEE_DAYPARTS,
  GUEST_COFFEE_DIRECTIONS,
  type GuestCoffeePlaylist,
  type GuestCoffeeProfile,
} from "../src/lib/business-app/guest-coffee/catalog";

type Row = [authorSlug: string, authorName: string, productSlug: string, title: string, durations: number[]];
const PROD_POOL: Row[] = [
["chili-na-vinile", "Чили на виниле", "fonovaya-muzyka-lo-fi", "Фоновая музыка lo fi", [153, 151, 188, 101, 131, 200, 146, 209, 152, 122]],
["chili-na-vinile", "Чили на виниле", "lou-fay-dlya-ucheby", "Лоу фай для учебы", [96, 95, 96, 185, 124, 150, 129, 110, 117, 99]],
["chili-na-vinile", "Чили на виниле", "muzyka-dlya-kalyannoy", "Музыка для кальянной", [118, 154, 141, 138, 128, 138, 142, 102, 122, 172]],
["cital-nyj-svet", "Настольная лампа", "muzyka-dlya-restorana-dzhaz-odin-den-v-zvukah", "Музыка для ресторана | Джаз", [215, 218, 235, 230, 258, 224, 191, 267, 299, 268]],
["cital-nyj-svet", "Настольная лампа", "muzyka-dlya-sna-so-zvukami-dozhdya", "Музыка для сна со звуками дождя", [148, 245, 137, 227, 189, 177, 241, 170, 290]],
["cital-nyj-svet", "Настольная лампа", "relaks-muzyka-dlya-horoshego-sna", "Релакс музыка для хорошего сна", [236, 184, 245, 187, 159, 177, 203, 238, 187, 210]],
["djazmanov", "Джазманов", "legkiy-utrenniy-dzhaz", "Легкий утренний джаз", [37, 174, 143, 109, 124, 157, 156, 210, 130, 180]],
["jazz-relax", "Джаз Релакс", "dzhaz-dlya-otdyha", "Джаз для отдыха", [225, 177, 216, 217, 188, 162, 193, 158, 172, 173]],
["jazz-relax", "Джаз Релакс", "dzhaz-dlya-raboty", "Джаз для работы", [185, 213, 142, 223, 185, 175, 121, 157, 214, 135]],
["jazz-relax", "Джаз Релакс", "dzhaz-dlya-sna", "Джаз для сна", [274, 224, 233, 172, 190, 203, 204, 215, 255]],
["jazz-relax", "Джаз Релакс", "dzhaz-launzh", "Джаз лаунж", [196, 195, 132, 228, 225, 148, 220, 173, 170, 189]],
["jazz-relax", "Джаз Релакс", "dzhaz-na-saksofone", "Джаз на саксофоне", [223, 192, 199, 220, 169, 205, 208, 236, 214, 174]],
["jazz-relax", "Джаз Релакс", "instrumentalnyy-dzhaz", "Инструментальный джаз", [143, 180, 180, 144, 168, 179, 168, 140, 157, 119]],
["jazz-relax", "Джаз Релакс", "italyanskiy-dzhaz", "Итальянский джаз", [114, 106, 183, 153, 145, 140, 101, 128, 173]],
["jazz-relax", "Джаз Релакс", "muzyka-dlya-osenney-progulki", "Музыка для осенней прогулки", [160, 158, 169, 154, 177, 110, 213, 165, 185, 179]],
["jazz-relax", "Джаз Релакс", "myagkiy-dzhaz", "Мягкий джаз", [208, 158, 214, 204, 175, 173, 175, 210, 205, 153]],
["jazz-relax", "Джаз Релакс", "romanticheskiy-dzhaz", "Романтический джаз", [133, 176, 152, 195, 138, 166, 192, 178, 176, 206]],
["jazz-relax", "Джаз Релакс", "vecherniy-dzhaz", "Вечерний джаз", [178, 136, 206, 132, 110, 217, 156, 90, 196, 162]],
["kofeynik", "Кофейник", "dzhaz-dlya-oteley", "Джаз для отелей", [144, 180, 180, 124, 211, 133, 227, 105, 189, 163]],
["kofeynik", "Кофейник", "frantsuzskiy-utrenniy-dzhaz", "Французский утренний джаз", [114, 125, 133, 153, 141, 144, 143, 146, 125, 138]],
["kofeynik", "Кофейник", "italyanskiy-restorannyy-dzhaz", "Итальянский ресторанный джаз", [146, 95, 190, 158, 109, 96, 153, 204, 162, 119]],
["kofeynik", "Кофейник", "utrenniy-dzhaz-bossa-nova", "Утренний джаз босса нова", [125, 95, 130, 118, 117, 140, 132, 121, 166, 163]],
["kofeynik", "Кофейник", "uyutnaya-muzyka-dlya-kofeyni", "Уютная музыка для кофейни", [166, 147, 261, 146, 193, 127, 160, 147, 158, 157]],
["lara-larina", "Лара Ларина", "dzhaz-v-polnochnom-kafe", "Джаз в полночном кафе: джаз для кафе и ресторанов", [163, 176, 130, 123, 179, 181, 206, 177, 169, 209]],
["lara-larina", "Лара Ларина", "osennyaya-uyutnaya-muzyka", "Осенняя уютная музыка", [119, 120, 139, 109, 174, 140, 145, 132, 120, 130, 108, 133]],
["liniya-dnya", "Линия дня", "fonovaya-muzyka-dlya-kontsentratsii", "Фоновая музыка для концентрации", [1500]],
["liniya-dnya", "Линия дня", "fonovaya-muzyka-dlya-tvorchestva", "Фоновая музыка для творчества", [147, 162, 179, 164, 203, 187, 199, 172]],
["liniya-dnya", "Линия дня", "muzyka-dlya-zanyatiy-tvorchestvom", "Музыка для занятий творчеством", [203, 231, 187, 205, 202, 191, 179, 186]],
["liniya-dnya", "Линия дня", "spokoynaya-fonovaya-muzyka-dlya-chteniya", "Спокойная фоновая музыка для чтения", [150, 238, 159, 191, 255, 161, 190, 192]],
["liniya-dnya", "Линия дня", "spokoynaya-muzyka-dlya-raboty-v-ofise", "Спокойная музыка для работы в офисе", [186, 187, 202, 189, 174, 184, 202, 196]],
["liniya-dnya", "Линия дня", "uyutnaya-muzyka-dlya-raboty", "Уютная музыка для работы", [184, 200, 162, 175, 195, 194, 182, 170]],
["teplyy-takt", "Тёплый такт", "dzhazovaya-muzyka-dlya-kofeen", "Джазовая музыка для кофеен", [220, 239, 233, 180, 199, 189, 194]],
["teplyy-takt", "Тёплый такт", "muzyka-dlya-kofeyni-dzhaz", "Музыка для кофейни джаз", [230, 232, 189, 193, 228, 200, 195]],
["teplyy-takt", "Тёплый такт", "muzyka-dlya-relaksa-dzhaz", "Музыка для релакса джаз", [173, 224, 144, 219, 152, 205, 188, 198]],
["teplyy-takt", "Тёплый такт", "osenniy-dzhaz-muzyka-dlya-otdyha", "Осенний джаз музыка для отдыха", [194, 183, 190, 154, 213, 203, 217, 199]],
["teplyy-takt", "Тёплый такт", "uyutnaya-muzyka-kofeyni", "Уютная музыка кофейни", [150, 191, 229, 227, 220, 173, 212, 210]],
];

const products: GuestCoffeeCatalogProduct[] = PROD_POOL.map(([authorSlug, authorName, slug, title, d]) => ({
  id: `p-${slug}`, title, slug, authorSlug, authorName, authorId: `a-${authorSlug}`,
  href: `/${authorSlug}/${slug}`, coverUrl: null, isFree: true, audioCount: d.length,
}));
// Not admitted music that must never reach the guest: a whole artist and one track.
products.push({ id: "p-not-admitted", title: "Уютный джаз для кофейни", slug: "not-admitted", authorSlug: "olga", authorName: "Ольга", authorId: "a-olga", href: "/o", coverUrl: null, isFree: true, audioCount: 12 });
const tracksOf = (slug: string) => {
  if (slug === "not-admitted") return Array.from({ length: 12 }, (_, i) => ({ audioItemId: `na-${i}`, title: `na ${i}`, durationSeconds: 180 }));
  const row = PROD_POOL.find((r) => r[2] === slug)!;
  return row[4].map((durationSeconds, i) => ({ audioItemId: `${slug}-t${i}`, title: `${row[3]} ${i + 1}`, durationSeconds }));
};
const DENIED_TRACK = "dzhaz-dlya-otdyha-t0";
const admittedAuthors = new Set(PROD_POOL.map((r) => `a-${r[0]}`));
const deps = {
  loadPublishedProducts: async () => products,
  loadFullTracks: async ({ productSlug }: { productSlug: string }) => tracksOf(productSlug),
  loadAdmissions: async () => ({ authorIds: admittedAuthors, practiceIds: new Set<string>() }),
  admittedTrackIds: async (ids: readonly string[]) => new Set(ids.filter((id) => !id.startsWith("na-") && id !== DENIED_TRACK)),
};
const shelf = await buildGuestCoffeeShelf(deps);
const admittedIds = new Set(shelf.flatMap((p) => p.tracks.map((t) => t.audioItemId)));
assert.equal(guestCoffeeShelfArtistCount(shelf), 8, "8 admitted artists as on production");
assert.ok(!shelf.some((p) => p.id === "p-not-admitted"), "not admitted artist never on the shelf");
assert.ok(!admittedIds.has(DENIED_TRACK), "not admitted track never on the shelf");

const profiles: GuestCoffeeProfile[] = [];
for (const c of GUEST_COFFEE_CHARACTERS) for (const d of GUEST_COFFEE_DIRECTIONS) for (const t of GUEST_COFFEE_DAYPARTS)
  profiles.push({ character: c.id, direction: d.id, daypart: t.id } as GuestCoffeeProfile);

const perArtist = (tracks: readonly { authorName?: string | null }[]) => {
  const m = new Map<string, number>();
  for (const t of tracks) m.set(t.authorName ?? "", (m.get(t.authorName ?? "") ?? 0) + 1);
  return m;
};

// 1) Production-like pool: every one of the 64 profiles → 12 admitted tracks, ≥3 artists,
// ≤4 per artist, never the same artist twice in a row.
for (const profile of profiles) {
  const a = assembleGuestCoffeeAtmosphere(shelf, profile);
  const label = JSON.stringify(profile);
  assert.ok(a, label);
  assert.equal(a.tracks.length, 12, `${label}: 12 tracks`);
  assert.ok(a.tracks.every((t) => admittedIds.has(t.audioItemId)), `${label}: only admitted tracks`);
  const counts = perArtist(a.tracks);
  assert.ok(counts.size >= GUEST_COFFEE_ATMOSPHERE_MIN_ARTISTS, `${label}: ≥3 artists, got ${counts.size}`);
  assert.equal(a.diversity.artists, counts.size);
  assert.equal(a.diversity.fallback, false, label);
  assert.ok(Math.max(...counts.values()) <= GUEST_COFFEE_ATMOSPHERE_ARTIST_CAP, `${label}: cap per artist`);
  assert.ok(a.tracks.every((t, i) => i === 0 || t.authorName !== a.tracks[i - 1].authorName), `${label}: no artist twice in a row`);
  assert.equal(new Set(a.tracks.map((t) => t.audioItemId)).size, 12, `${label}: no repeats`);
}
// The reported case: cozy jazz all day – not all «Джаз Релакс» any more, 4 artists.
{
  const a = assembleGuestCoffeeAtmosphere(shelf, { character: "cozy", direction: "jazz", daypart: "allday" } as GuestCoffeeProfile)!;
  assert.ok(a.diversity.artists >= GUEST_COFFEE_ATMOSPHERE_TARGET_ARTISTS, "ideally 4+ artists");
  assert.ok((perArtist(a.tracks).get("Джаз Релакс") ?? 0) <= 4);
  assert.equal(a.match.direction.state, "all", "relevance kept: all sources fit the chosen sound");
}

// 2) A dominant artist (many fitting albums) does not take all 12 when others are admitted.
{
  const dominant: GuestCoffeePlaylist[] = [
    ...Array.from({ length: 10 }, (_, n) => album(`dom-${n}`, "jazz-relax", "Джаз Релакс", "jazz", 10)),
    album("b", "teplyy-takt", "Тёплый такт", "sax", 10),
    album("c", "kofeynik", "Кофейник", "bossa", 10),
  ];
  const a = assembleGuestCoffeeAtmosphere(dominant, { character: "cozy", direction: "jazz", daypart: "allday" } as GuestCoffeeProfile)!;
  assert.equal(a.tracks.length, 12);
  assert.equal(a.diversity.artists, 3);
  assert.equal(a.diversity.fallback, false);
  assert.ok(Math.max(...perArtist(a.tracks).values()) <= 4);
}

// 3) Graceful fallback: 1 or 2 admitted artists → still 12 tracks (best matches), flagged.
{
  const one = [album("x1", "jazz-relax", "Джаз Релакс", "jazz", 6), album("x2", "jazz-relax", "Джаз Релакс", "jazz", 8)];
  const a = assembleGuestCoffeeAtmosphere(one, { character: "cozy", direction: "jazz", daypart: "allday" } as GuestCoffeeProfile)!;
  assert.equal(a.tracks.length, 12, "one artist: still a full atmosphere, never empty");
  assert.deepEqual(a.diversity, { artists: 1, fallback: true });
  const two = [album("y1", "jazz-relax", "Джаз Релакс", "jazz", 10), album("y2", "kofeynik", "Кофейник", "bossa", 3)];
  const b = assembleGuestCoffeeAtmosphere(two, { character: "cozy", direction: "jazz", daypart: "allday" } as GuestCoffeeProfile)!;
  assert.equal(b.tracks.length, 12, "two artists, one small: cap lifted to fill 12");
  assert.deepEqual(b.diversity, { artists: 2, fallback: true });
  assert.equal(perArtist(b.tracks).get("Кофейник"), 3, "the small artist gives everything it has");
  assert.equal(assembleGuestCoffeeAtmosphere([], { character: "cozy", direction: "jazz", daypart: "allday" } as GuestCoffeeProfile), null);
}

// 4) Spreading keeps per-artist order and avoids neighbours when possible.
{
  const t = (authorName: string, n: number) => ({ authorName, playlistId: authorName, n });
  const out = spreadGuestCoffeeArtists([t("A", 1), t("A", 2), t("A", 3), t("B", 1), t("B", 2), t("C", 1)]);
  assert.deepEqual(out.map((x) => x.authorName + x.n), ["A1", "B1", "A2", "B2", "A3", "C1"]);
  assert.deepEqual(spreadGuestCoffeeArtists([t("A", 1), t("A", 2)]).map((x) => x.n), [1, 2], "single artist: order kept");
}

// 5) Artist key and title-derived tags for admitted albums outside the curated list.
assert.equal(guestCoffeeArtistKey({ id: "p", authorSlug: "s", authorName: "N" } as GuestCoffeePlaylist), "s");
assert.equal(guestCoffeeArtistKey({ id: "p", authorSlug: "", authorName: "N" } as GuestCoffeePlaylist), "N");
assert.equal(inferGuestCoffeeEditorialTags("Джаз на саксофоне").direction, "sax");
assert.equal(inferGuestCoffeeEditorialTags("Утренний джаз и босса-нова").direction, "bossa");
assert.deepEqual(inferGuestCoffeeEditorialTags("Фоновая музыка lo fi").sounds, ["rhythm"]);
assert.ok(inferGuestCoffeeEditorialTags("Вечерний джаз").dayparts.includes("evening"));
assert.deepEqual(inferGuestCoffeeEditorialTags("Без примет").characters, ["cozy"]);

function album(id: string, authorSlug: string, authorName: string, direction: GuestCoffeePlaylist["direction"], n: number): GuestCoffeePlaylist {
  return {
    id, authorSlug, authorName, productSlug: id, title: id, href: "", coverUrl: null, coverImage: null, updatedAt: null, format: null,
    direction, dayparts: ["morning", "day", "evening"], characters: ["cozy"],
    tracks: Array.from({ length: n }, (_, i) => ({ audioItemId: `${id}-${i}`, title: `${id} ${i}`, durationSeconds: 180 })),
  } as GuestCoffeePlaylist;
}

console.log("business-guest-atmosphere-diversity-unit: OK");
