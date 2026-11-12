import "server-only";
import { getPracticeByAuthorAndSlug } from "@/lib/products/lookup";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublishedCatalogProducts, type CatalogProduct } from "@/lib/products/catalog";
import { loadListenSessionPayload } from "@/lib/listen/load-session-payload";
import { isCatalogGlobalPlayerSession } from "@/lib/listen/global-player-types";
import { GET_MUSIC_PASSPORT_BASIC_RPC, parseMusicPassportBasic, measuredNumeric } from "@/lib/music-passport/contract";
import { metadataProfile, rankRadioCandidates, withArtistProfile } from "./album-radio-ranking.mjs";
import type { PlaylistQueueEntry } from "@/lib/playlists/player-queue-types";

type Profile = ReturnType<typeof metadataProfile>;
const productText = (p: CatalogProduct) => [p.format, p.subtitle, p.description].filter(Boolean).join(" ");

/** Optional enrichment only. No analysis jobs, no rights inference, no raw tags. */
async function profileFor(audioId: string, fallback: Profile): Promise<Profile> {
  try {
    const { data, error } = await createServiceRoleClient().rpc(GET_MUSIC_PASSPORT_BASIC_RPC, { p_audio_item_id: audioId }).abortSignal(AbortSignal.timeout(1200));
    if (error) return fallback;
    const passport = parseMusicPassportBasic(data);
    if (!passport.passport) return fallback;
    const text = (key: string) => {
      const value = passport.passport!.interpreted[key] ?? passport.passport!.measured[key];
      return (Array.isArray(value) ? value : value ? [value] : [])
        .filter((item) => item.confidence === null || item.confidence >= 0.7)
        .flatMap((item) => item.value_text ? [item.value_text] : []);
    };
    const labels = metadataProfile([...text("genre_class"), ...text("mood")].join(" "));
    const role = text("vocal_role")[0];
    return {
      genres: labels.genres.length ? labels.genres : fallback.genres,
      styles: fallback.styles,
      moods: labels.moods.length ? labels.moods : fallback.moods,
      bpm: (() => {
        const slot = passport.passport!.measured.bpm;
        return slot && !Array.isArray(slot) && (slot.confidence ?? 0) >= 0.7
          ? measuredNumeric(passport, "bpm") ?? fallback.bpm : fallback.bpm;
      })(),
      vocal: role === "instrumental" ? "instrumental" : role === "vocal" ? "vocal" : fallback.vocal,
    };
  } catch { return fallback; }
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
  if (!loaded.ok || !isCatalogGlobalPlayerSession(loaded.session) || loaded.session.isAuthorPreview) return null;
  if (input.enabled === false) return { title: album.title, trackIds: loaded.session.tracks.map((track) => track.id), entries: [] };
  const lastTrack = loaded.session.tracks.at(-1);
  if (!lastTrack) return null;
  const albumProfile = (product: CatalogProduct, extra = "") => withArtistProfile(
    metadataProfile(`${productText(product)} ${extra}`),
    products.filter((p) => p.authorId === product.authorId).map((p) => metadataProfile(productText(p))),
  );
  const sourceProfile = await profileFor(lastTrack.id, albumProfile(album, lastTrack.description ?? ""));
  let previousProfile = sourceProfile;
  const previousId = input.exclude.at(-1);
  if (previousId) {
    const { data: previous } = await supabase.from("audio_items").select("practice_id, description")
      .eq("id", previousId).eq("status", "published").maybeSingle();
    const previousAlbum = products.find((p) => p.id === previous?.practice_id);
    if (previousAlbum) previousProfile = await profileFor(previousId, albumProfile(previousAlbum, previous?.description ?? ""));
  }
  const source = { practiceId: album.id, authorId: album.authorId, profile: sourceProfile };
  // Bound session/access and optional passport work. Metadata first, sound first.
  const shortlist = products.filter((p) => p.id !== album.id && p.authorSlug)
    .map((p) => ({ product: p, audioItemId: p.id, practiceId: p.id, authorId: p.authorId,
      profile: albumProfile(p) }));
  // Include candidates with absent metadata for optional Passport enrichment.
  const ordered = rankRadioCandidates(source, shortlist).map((c) => c.product);
  const remaining = shortlist.map((c) => c.product).filter((p) => !ordered.some((o) => o.id === p.id));
  const candidates: Array<{ audioItemId: string; practiceId: string; authorId: string; profile: Profile; entry: PlaylistQueueEntry }> = [];
  const deadline = Date.now() + 8000;
  for (const product of [...ordered, ...remaining].slice(0, 24)) {
    if (Date.now() > deadline) break;
    const result = await loadListenSessionPayload(supabase, product.authorSlug!, product.slug, userId, { forceStartAtBeginning: true });
    if (!result.ok || !isCatalogGlobalPlayerSession(result.session) || result.session.isAuthorPreview || result.session.albumRadioEligible !== true || result.session.playbackMode === "preview") continue;
    const tracks = result.session.tracks.filter((track) => !track.id.startsWith("legacy-") && !input.exclude.includes(track.id)).slice(0, 12);
    const enriched = await Promise.all(tracks.map(async (track) => ({ track, profile: await profileFor(track.id, albumProfile(product, track.description ?? "")) })));
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
