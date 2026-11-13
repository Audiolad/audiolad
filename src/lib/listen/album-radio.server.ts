import "server-only";
import { getPracticeByAuthorAndSlug } from "@/lib/products/lookup";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublishedCatalogProducts, type CatalogProduct } from "@/lib/products/catalog";
import { loadListenSessionPayload } from "@/lib/listen/load-session-payload";
import { isCatalogGlobalPlayerSession } from "@/lib/listen/global-player-types";
import { isAlbumRadioAccessAllowed } from "@/lib/listen/album-radio-preference.mjs";
import { chunkIds } from "@/lib/supabase/chunk";
import {
  aggregateRadioProfile, metadataProfile, passportProfile, radioSimilarity, rankRadioCandidates,
  withArtistProfile, withTextFallback, type RadioProfile,
} from "./album-radio-ranking.mjs";
import { queryRadioPassportFeatures, type RadioPassportClient, type RadioPassportFeatures } from "./album-radio-passport";
import type { PlaylistQueueEntry } from "@/lib/playlists/player-queue-types";

type Profile = RadioProfile;
const productText = (p: CatalogProduct) => [p.format, p.subtitle, p.description].filter(Boolean).join(" ");

const PASSPORT_CACHE_MS = 5 * 60 * 1000;
/** Passport enrichment is bounded; on timeout the radio ranks on author text this time. */
const PASSPORT_LOAD_TIMEOUT_MS = 4000;
let passportCache: { at: number; key: string; value: Map<string, RadioPassportFeatures> } | null = null;
let passportInFlight: { key: string; value: Promise<{ features: Map<string, RadioPassportFeatures>; complete: boolean }> } | null = null;

/** Passport sound features of catalogue tracks. Empty map on any source error or timeout:
 * the radio then ranks on author text, exactly as before the passport existed. Only a
 * complete read is cached; concurrent requests share one in-flight read. */
async function loadPassportFeatures(trackIds: string[]): Promise<Map<string, RadioPassportFeatures>> {
  const key = [...new Set(trackIds)].sort().join(",");
  if (passportCache && passportCache.key === key && Date.now() - passportCache.at < PASSPORT_CACHE_MS) return passportCache.value;
  let flight = passportInFlight && passportInFlight.key === key ? passportInFlight : null;
  if (!flight) {
    const value = Promise.resolve().then(() => queryRadioPassportFeatures(createServiceRoleClient() as unknown as RadioPassportClient, trackIds));
    const entry = { key, value };
    flight = passportInFlight = entry;
    void value.then((result) => {
      if (result.complete) passportCache = { at: Date.now(), key, value: result.features };
    }, () => undefined).finally(() => { if (passportInFlight === entry) passportInFlight = null; });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      flight.value,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("album_radio_passport_timeout")), PASSPORT_LOAD_TIMEOUT_MS); }),
    ]);
    return result.features;
  } catch (error) {
    console.error("[album-radio] passports unavailable, text basis", error instanceof Error ? error.message : "unknown");
    return new Map();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Published tracks of the catalogue albums (ids + author text), batched by album. */
async function loadCatalogTracks(supabase: SupabaseClient, practiceIds: string[]) {
  const rows = (await Promise.all(chunkIds(practiceIds, 25).map(async (chunk) => {
    try {
      const { data, error } = await supabase.from("audio_items").select("id, practice_id, description")
        .in("practice_id", chunk).eq("status", "published");
      if (error || !Array.isArray(data)) return [];
      return data as Array<{ id: string; practice_id: string; description: string | null }>;
    } catch { return []; }
  }))).flat();
  const byPractice = new Map<string, Array<{ id: string; description: string | null }>>();
  for (const row of rows) byPractice.set(row.practice_id, [...(byPractice.get(row.practice_id) ?? []), row]);
  return byPractice;
}

export async function selectAlbumRadio(input: {
  supabase: SupabaseClient; userId: string | null; author: string; slug: string; exclude: string[]; enabled?: boolean;
}): Promise<{ title: string; entries: PlaylistQueueEntry[]; trackIds: string[] } | null> {
  const { supabase, userId } = input;
  const lookup = await getPracticeByAuthorAndSlug(supabase, input.author, input.slug);
  if (lookup.error || !lookup.practice || lookup.practice.product_kind !== "music" || (lookup.practice.publication_class != null && lookup.practice.publication_class !== "release")) return null;
  // Listed-only ordinary consumer catalog: no Business admission/rights logic.
  const products = (await getPublishedCatalogProducts(supabase, {
    productKind: "music", throwOnStorageError: true,
  })).filter((p) => p.productKind === "music" && (p.publicationClass == null || p.publicationClass === "release"));
  const album = products.find((p) => p.authorSlug === input.author && p.slug === input.slug);
  if (!album) return null;
  const loaded = await loadListenSessionPayload(supabase, input.author, input.slug, userId, { forceStartAtBeginning: true });
  if (!loaded.ok || !isCatalogGlobalPlayerSession(loaded.session) || !isAlbumRadioAccessAllowed(loaded.session)) return null;
  if (input.enabled === false) return { title: album.title, trackIds: loaded.session.tracks.map((track) => track.id), entries: [] };
  const lastTrack = loaded.session.tracks.at(-1);
  if (!lastTrack) return null;
  // Author text fallback, computed once per album / artist for this request.
  const textByAuthor = new Map<string, Profile[]>();
  for (const p of products) textByAuthor.set(p.authorId, [...(textByAuthor.get(p.authorId) ?? []), metadataProfile(productText(p))]);
  const albumProfile = (product: CatalogProduct, extra = "") => withArtistProfile(
    metadataProfile(`${productText(product)} ${extra}`), textByAuthor.get(product.authorId) ?? [],
  );
  const catalogTracks = await loadCatalogTracks(supabase, products.map((p) => p.id));
  const passports = await loadPassportFeatures([...catalogTracks.values()].flatMap((tracks) => tracks.map((t) => t.id)));
  // Passport first: every field the sealed passport has wins; author text fills the rest.
  const trackProfile = (trackId: string, product: CatalogProduct, description: string | null | undefined): Profile =>
    withTextFallback(passportProfile(passports.get(trackId)), albumProfile(product, description ?? ""));
  const sourceProfile = trackProfile(lastTrack.id, album, lastTrack.description);
  let previousProfile = sourceProfile;
  const previousId = input.exclude.at(-1);
  if (previousId) {
    const { data: previous } = await supabase.from("audio_items").select("practice_id, description")
      .eq("id", previousId).eq("status", "published").maybeSingle();
    const previousAlbum = products.find((p) => p.id === previous?.practice_id);
    if (previousAlbum) previousProfile = trackProfile(previousId, previousAlbum, previous?.description);
  }
  const source = { practiceId: album.id, authorId: album.authorId, profile: sourceProfile };
  // Album shortlist by the album-level passport (mean of its track passports), text otherwise.
  // Bounded session/access work below; similar albums are opened first.
  const shortlist = products.filter((p) => p.id !== album.id && p.authorSlug).map((p) => {
    const tracks = catalogTracks.get(p.id) ?? [];
    const profile = aggregateRadioProfile(tracks.map((t) => trackProfile(t.id, p, t.description)));
    const fallback = albumProfile(p);
    return { product: p, score: radioSimilarity(sourceProfile, profile ? withTextFallback(profile, fallback) : fallback) };
  });
  const ordered = shortlist.filter((c) => c.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0) ||
    Number(a.product.authorId === album.authorId) - Number(b.product.authorId === album.authorId) ||
    a.product.id.localeCompare(b.product.id)).map((c) => c.product);
  const remaining = shortlist.filter((c) => c.score === null).map((c) => c.product);
  const candidates: Array<{ audioItemId: string; practiceId: string; authorId: string; profile: Profile; entry: PlaylistQueueEntry }> = [];
  const deadline = Date.now() + 8000;
  for (const product of [...ordered, ...remaining].slice(0, 24)) {
    if (Date.now() > deadline) break;
    const result = await loadListenSessionPayload(supabase, product.authorSlug!, product.slug, userId, { forceStartAtBeginning: true });
    if (!result.ok || !isCatalogGlobalPlayerSession(result.session) || !isAlbumRadioAccessAllowed(result.session) || result.session.albumRadioEligible !== true || result.session.playbackMode === "preview") continue;
    // An author member's session also lists drafts: radio takes only published audio_items (t1437u).
    const published = new Set((catalogTracks.get(product.id) ?? []).map((t) => t.id));
    const tracks = result.session.tracks.filter((track) => (!result.session.isAuthorPreview || published.has(track.id)) && !track.id.startsWith("legacy-") && !input.exclude.includes(track.id)).slice(0, 12);
    const enriched = tracks.map((track) => ({ track, profile: trackProfile(track.id, product, track.description) }));
    for (const { track, profile } of enriched) {
      if (candidates.length >= 72) break;
      candidates.push({ audioItemId: track.id, practiceId: product.id, authorId: product.authorId, profile,
        entry: { kind: "audio_item", practiceId: product.id, audioItemId: track.id,
          authorSlug: product.authorSlug, productSlug: product.slug, title: track.title,
          listenHref: `/listen/${product.authorSlug}/${product.slug}`, fullOnly: true } });
    }
    if (candidates.length >= 72) break;
  }
  return { title: album.title, trackIds: loaded.session.tracks.map((track) => track.id), entries: rankRadioCandidates(source, candidates, input.exclude, previousProfile).slice(0, 8).map((c) => c.entry) };
}
