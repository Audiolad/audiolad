/**
 * Stage 3 listen page framework + playlist embed — no DB, no network.
 * Run: npx --yes tsx scripts/playlists-stage3-validation-smoke.mjs
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPublicPlaylistQueue,
  isSafeInternalReturnHref,
} from "../src/lib/playlists/build-playlist-queue.ts";
import {
  DEFAULT_PLAYLIST_QUEUE_NAVIGATION_POLICY,
  getPlaylistQueueNavigationPolicy,
  shouldNavigateOnQueueAdvance,
} from "../src/lib/playlists/player-queue-types.ts";
import {
  isPlatformEditorialPublicPlaylist,
  isPlayablePublicPlaylistItem,
} from "../src/lib/playlists/public-seo.ts";
import {
  buildListenPageJsonLdGraph,
  buildListenPageMetadata,
  buildListenPagePath,
  buildListenPreviewSsrFields,
  evaluateListenPlaylistGate,
  formatListenPreviewExpandLabel,
  getListenPageBySlug,
  getListenPreviewExpandCount,
  getListenPreviewItems,
  isValidListenPageSlug,
  parseListenPageDefinition,
  resolveListenPageFromPlaylist,
} from "../src/lib/seo/listens/index.ts";
import {
  mapListenPageDefinitionsToSitemapEntries,
  mapPlaylistRowsToSitemapEntries,
} from "../src/lib/seo/sitemap-data.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function read(relPath) {
  return readFileSync(join(ROOT, relPath), "utf8");
}

function listFiles(relDir) {
  const abs = join(ROOT, relDir);
  return readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const next = join(relDir, entry.name);
    return entry.isDirectory() ? listFiles(next) : [next];
  });
}

function makeItem(index, overrides = {}) {
  const n = String(index).padStart(2, "0");
  return {
    practiceId: `11111111-1111-4111-8111-1111111111${n}`,
    position: index,
    title: `Practice ${index}`,
    authorName: `Author ${index}`,
    authorSlug: `author-${index}`,
    formatLabel: null,
    metaLabel: `${8 + index} мин`,
    durationLabel: `${8 + index} мин`,
    durationSeconds: (8 + index) * 60,
    productSlug: `practice-${index}`,
    productHref: `/practice/author-${index}/practice-${index}`,
    coverUrl: null,
    coverImage: null,
    updatedAt: null,
    available: true,
    href: `/listen/author-${index}/practice-${index}`,
    ...overrides,
  };
}

function makePlaylist(overrides = {}) {
  const items = overrides.items ?? [makeItem(1), makeItem(2), makeItem(3)];
  const { items: _ignored, playlist: playlistOverrides, ...rest } = overrides;
  return {
    playlist: {
      title: "Editorial playlist",
      slug: "editorial-gift-set",
      visibility: "public",
      published_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
      isEditorial: true,
      isPlatformOwned: true,
      description: "Short editorial description",
      ...playlistOverrides,
    },
    items,
    itemsCount: items.length,
    availableCount: items.filter((item) => item.available).length,
    totalDurationLabel: "40 мин",
    hasUnavailable: false,
    allUnavailable: false,
    coverUrl: null,
    mosaicCoverUrls: [],
    ownerLabel: "Плейлист АудиоЛада",
    ...rest,
  };
}

const fixtureDefinition = {
  type: "listen",
  slug: "fixture-listen-page",
  title: "Fixture listen title – АудиоЛад",
  description: "Fixture listen description for tests only.",
  h1: "Fixture listen H1",
  intro: ["First intro paragraph.", "Second intro paragraph."],
  playlistSlug: "editorial-gift-set",
  sections: [
    {
      id: "body",
      title: "О подборке",
      paragraphs: ["Body paragraph for the listen page."],
    },
  ],
  faq: [
    {
      question: "Можно ли слушать на странице?",
      answer: "Да, через общий плеер платформы.",
    },
  ],
  indexable: false,
};

function testDefinitions() {
  assert(isValidListenPageSlug("fixture-listen-page"), "valid listen slug");
  assert(!isValidListenPageSlug("Fixture"), "rejects uppercase slug");
  assert(
    buildListenPagePath("Fixture-Listen-Page") === "/listens/fixture-listen-page",
    "listen path",
  );

  const parsed = parseListenPageDefinition(fixtureDefinition);
  assert(parsed.ok, "valid listen definition");
  assert(parsed.definition.type === "listen", "explicit type=listen");
  assert(parsed.definition.playlistSlug === "editorial-gift-set", "playlistSlug");
  assert(!("items" in parsed.definition), "no items on definition");

  assert(
    parseListenPageDefinition({ ...fixtureDefinition, type: "practice" }).ok ===
      false,
    "practice type rejected",
  );
  assert(
    parseListenPageDefinition({
      ...fixtureDefinition,
      type: undefined,
    }).reason === "type_must_be_listen",
    "missing type rejected",
  );
  assert(
    parseListenPageDefinition({
      ...fixtureDefinition,
      playlistSlug: "",
    }).reason === "playlist_slug_required",
    "empty playlistSlug rejected",
  );
  assert(
    parseListenPageDefinition({
      ...fixtureDefinition,
      items: [{ title: "hardcoded" }],
    }).reason === "hardcoded_items_forbidden",
    "hardcoded items rejected",
  );
  assert(
    parseListenPageDefinition({
      ...fixtureDefinition,
      practiceSlugs: ["a"],
    }).reason === "hardcoded_items_forbidden",
    "practice slugs rejected",
  );
  assert(
    parseListenPageDefinition({
      ...fixtureDefinition,
      itemIds: ["x"],
    }).reason === "hardcoded_items_forbidden",
    "item ids rejected",
  );

  assert(getListenPageBySlug("fixture-listen-page") === null, "fixture not registered");
  assert(getListenPageBySlug("test-listen") === null, "no test production page");
}

function testServerLoad() {
  const publishedEditorial = makePlaylist();
  const resolved = resolveListenPageFromPlaylist({
    definition: fixtureDefinition,
    loaded: { ok: true, detail: publishedEditorial },
  });
  assert(resolved, "published platform editorial loads");
  assert(resolved.playlist.playlist.slug === "editorial-gift-set", "slug from DB");
  assert(resolved.path === "/listens/fixture-listen-page", "listen path");
  assert(
    resolved.canonicalUrl.endsWith("/listens/fixture-listen-page"),
    "self canonical",
  );

  assert(
    resolveListenPageFromPlaylist({
      definition: fixtureDefinition,
      loaded: {
        ok: true,
        detail: makePlaylist({
          playlist: {
            slug: "editorial-gift-set",
            isEditorial: false,
            isPlatformOwned: false,
          },
        }),
      },
    }) === null,
    "user playlist rejected",
  );

  assert(
    resolveListenPageFromPlaylist({
      definition: fixtureDefinition,
      loaded: {
        ok: true,
        detail: makePlaylist({
          playlist: {
            visibility: "public",
            published_at: null,
            isEditorial: true,
            isPlatformOwned: true,
          },
        }),
      },
    }) === null,
    "unpublished editorial rejected",
  );

  assert(
    resolveListenPageFromPlaylist({
      definition: fixtureDefinition,
      loaded: { ok: false, reason: "not_found" },
    }) === null,
    "missing playlist fail closed",
  );

  assert(
    resolveListenPageFromPlaylist({
      definition: fixtureDefinition,
      loaded: {
        ok: true,
        detail: makePlaylist({
          playlist: { slug: "other-editorial-slug" },
        }),
      },
    }) === null,
    "slug mismatch fail closed",
  );

  assert(
    resolveListenPageFromPlaylist({
      definition: fixtureDefinition,
      loaded: {
        ok: true,
        detail: makePlaylist({
          items: [
            makeItem(1, { available: false, href: null }),
            makeItem(2, {
              available: true,
              href: "/practice/author-2/practice-2",
            }),
          ],
        }),
      },
    }) === null,
    "empty/unplayable fail closed",
  );

  assert(
    evaluateListenPlaylistGate({
      found: true,
      slugMatches: true,
      isPlatformOwned: true,
      isEditorial: true,
      isPublic: true,
      isPublished: true,
      playableCount: 3,
    }).ok,
    "gate accepts playable editorial",
  );
  assert(
    evaluateListenPlaylistGate({
      found: true,
      slugMatches: true,
      isPlatformOwned: false,
      isEditorial: false,
      isPublic: true,
      isPublished: true,
      playableCount: 3,
    }).reason === "not_platform_owned",
    "gate rejects user playlist",
  );
  assert(
    evaluateListenPlaylistGate({
      found: true,
      slugMatches: true,
      isPlatformOwned: true,
      isEditorial: false,
      isPublic: true,
      isPublished: true,
      playableCount: 3,
    }).reason === "not_editorial",
    "gate rejects non-editorial platform",
  );
  assert(
    evaluateListenPlaylistGate({
      found: false,
      slugMatches: false,
      isPlatformOwned: false,
      isEditorial: false,
      isPublic: false,
      isPublished: false,
      playableCount: 0,
    }).reason === "missing",
    "gate missing",
  );
}

function testSsrPreview() {
  const items = Array.from({ length: 12 }, (_, index) => makeItem(index + 1));
  const preview = getListenPreviewItems(items);
  assert(preview.length === 7, "preview caps at 7");
  assert(preview[0].title === "Practice 1", "first preview title");
  assert(preview[6].title === "Practice 7", "seventh preview title");
  assert(getListenPreviewItems(items.slice(0, 4)).length === 4, "fewer than 7 shows all");
  assert(getListenPreviewExpandCount(7) === 2, "mobile expand 2");
  assert(getListenPreviewExpandCount(6) === 1, "mobile expand remainder 1");
  assert(getListenPreviewExpandCount(5) === 0, "no expand at 5");
  assert(getListenPreviewExpandCount(3) === 0, "no expand below 5");
  assert(
    formatListenPreviewExpandLabel(2) === "Показать ещё 2",
    "expand label 2",
  );
  assert(
    formatListenPreviewExpandLabel(1) === "Показать ещё 1",
    "expand label remainder",
  );

  const fields = preview.map(buildListenPreviewSsrFields);
  assert(
    fields.every(
      (item) => item.title && item.authorName && item.durationLabel && item.productHref,
    ),
    "SSR fields include title author duration product link",
  );
  assert(fields[0].position === 1, "SSR position 1");
  assert(fields[6].position === 7, "SSR position 7");

  const embed = read("src/components/playlists/PublicPlaylistEmbedPreview.tsx");
  assert(embed.includes("getListenPreviewItems"), "embed uses preview helper");
  assert(embed.includes("item.productHref"), "title uses product page");
  assert(embed.includes("item.durationLabel"), "duration in row");
  assert(embed.includes("item.authorName"), "author in row");
  assert(embed.includes("data-listen-preview-item"), "preview items marked");
  assert(embed.includes("max-[390px]:hidden"), "mobile hides extra via CSS");
  assert(embed.includes("Показать ещё") || embed.includes("formatListenPreviewExpandLabel"), "expand control");
  assert(!embed.includes("<audio"), "no second audio in embed");
  assert(!embed.includes("useEffect"), "no client fetch of composition");
  assert(embed.includes("playlist.items"), "play uses full playlist items");
  assert(!embed.includes("previewItems") || embed.includes("buildPublicPlaylistQueue"), "queue from full entity");

  const embedServer = read("src/components/playlists/PublicPlaylistEmbed.tsx");
  assert(embedServer.includes("PublicPlaylistEmbed"), "named PublicPlaylistEmbed");
  assert(!embedServer.includes("ArticlePlaylist"), "not ArticlePlaylist");
  assert(embedServer.includes("playlist.playlist.title"), "playlist title SSR");
  assert(embedServer.includes("СЛУШАЙТЕ ПРЯМО СЕЙЧАС"), "universal eyebrow");
  assert(
    embedServer.includes("Слушайте всё сразу или начните с любой строки."),
    "universal short copy",
  );
  assert(!embedServer.includes("itemsCount"), "header has no itemsCount");
  assert(!embedServer.includes("totalDurationLabel"), "header has no duration");
  assert(
    !embedServer.includes("playlist.playlist.description"),
    "header has no playlist.description",
  );
}

function testPlayback() {
  const items = Array.from({ length: 12 }, (_, index) => makeItem(index + 1));
  const playAll = buildPublicPlaylistQueue({
    playlistSlug: "editorial-gift-set",
    title: "Editorial playlist",
    items,
    returnHref: "/listens/fixture-listen-page",
    navigationPolicy: "stay_on_source",
  });
  assert(playAll.ok, "play all builds");
  assert(playAll.queue.entries.length === 12, "full queue > preview 7");
  assert(playAll.queue.currentIndex === 0, "play all starts at 0");
  assert(
    playAll.queue.navigationPolicy === "stay_on_source",
    "listens stay_on_source",
  );
  assert(
    playAll.queue.source.returnHref === "/listens/fixture-listen-page",
    "returnHref is listen page",
  );
  assert(
    isSafeInternalReturnHref("/listens/fixture-listen-page"),
    "listens return href allowed",
  );

  const rowN = buildPublicPlaylistQueue({
    playlistSlug: "editorial-gift-set",
    title: "Editorial playlist",
    items,
    startIndex: 4,
    returnHref: "/listens/fixture-listen-page",
    navigationPolicy: "stay_on_source",
  });
  assert(rowN.ok, "row N builds");
  assert(rowN.queue.entries.length === 12, "row N still full queue");
  assert(rowN.queue.currentIndex === 4, "row N startIndex");
  assert(
    rowN.queue.entries[4].practiceId === items[4].practiceId,
    "row N starts that product",
  );
  assert(
    rowN.queue.entries[5].practiceId === items[5].practiceId,
    "next continues after N",
  );

  const hundred = buildPublicPlaylistQueue({
    playlistSlug: "editorial-gift-set",
    title: "Editorial playlist",
    items: Array.from({ length: 100 }, (_, index) => makeItem(index + 1)),
    startIndex: 67,
    returnHref: "/listens/fixture-listen-page",
    navigationPolicy: "stay_on_source",
  });
  assert(hundred.ok, "100-item queue ok");
  assert(hundred.queue.entries.length === 100, "queue can be 100");
  assert(hundred.queue.currentIndex === 67, "startIndex inside 100");

  const existing = buildPublicPlaylistQueue({
    playlistSlug: "user-public",
    title: "User PL",
    items: [makeItem(1)],
  });
  assert(existing.ok, "existing public consumer still builds");
  assert(existing.queue.currentIndex === 0, "existing start 0");
  assert(
    existing.queue.navigationPolicy === "follow_listen_route",
    "existing default navigation",
  );
  assert(existing.queue.source.returnHref === "/p/user-public", "existing /p return");
  assert(
    getPlaylistQueueNavigationPolicy({}) === DEFAULT_PLAYLIST_QUEUE_NAVIGATION_POLICY,
    "omitted policy defaults",
  );
  assert(shouldNavigateOnQueueAdvance({}), "default advances to listen route");
  assert(
    !shouldNavigateOnQueueAdvance({ navigationPolicy: "stay_on_source" }),
    "stay_on_source does not auto-navigate",
  );

  const provider = read("src/components/audio/GlobalAudioPlayerProvider.tsx");
  assert(provider.includes("queue.currentIndex"), "loadPlaylistQueue uses currentIndex");
  assert(provider.includes("shouldNavigateOnQueueAdvance"), "queue policy wired");
  assert(provider.includes('returnHref.startsWith("/listens/")'), "return to listens");
  assert(
    provider.includes("stayOnSource || loaded.session.suppressListenUrlSync") ||
      provider.includes("suppressListenUrlSync"),
    "stay_on_source suppresses listen URL sync",
  );

  const playAllButton = read("src/components/playlists/PlayAllButton.tsx");
  assert(playAllButton.includes("navigationPolicy"), "Play All accepts policy");
  assert(playAllButton.includes("startIndex"), "Play All accepts startIndex");

  const embed = read("src/components/playlists/PublicPlaylistEmbedPreview.tsx");
  assert(embed.includes('navigationPolicy'), "embed passes policy");
  assert(embed.includes("buildPublicPlaylistQueue"), "row play builds queue");
  assert(embed.includes("currentIndex"), "row play sets start index");
  assert(!embed.includes('href={item.listenHref'), "play is not a /listen link");
  assert(!embed.includes("<audio"), "embed has no audio element");
}

function testSeo() {
  const playlist = makePlaylist({
    items: Array.from({ length: 8 }, (_, index) => makeItem(index + 1)),
  });
  const data = resolveListenPageFromPlaylist({
    definition: { ...fixtureDefinition, indexable: true },
    loaded: { ok: true, detail: playlist },
  });
  assert(data, "indexable fixture resolves");

  const metadata = buildListenPageMetadata(data);
  assert(
    String(metadata.alternates?.canonical).endsWith("/listens/fixture-listen-page"),
    "/listens self canonical",
  );
  assert(metadata.robots?.index === true, "indexable definition indexes");

  const noindexData = resolveListenPageFromPlaylist({
    definition: fixtureDefinition,
    loaded: { ok: true, detail: playlist },
  });
  const noindexMeta = buildListenPageMetadata(noindexData);
  assert(noindexMeta.robots?.index === false, "indexable false → noindex");
  assert(noindexMeta.robots?.follow === true, "noindex still follow");

  const emptySitemap = mapListenPageDefinitionsToSitemapEntries([], "https://audiolad.ru");
  assert(emptySitemap.length === 0, "empty page list means no sitemap entries");

  const sitemapAware = mapListenPageDefinitionsToSitemapEntries(
    [
      { slug: "indexable-listen", indexable: true },
      { slug: "hidden-listen", indexable: false },
    ],
    "https://audiolad.ru",
  );
  assert(sitemapAware.length === 1, "only indexable listens in sitemap");
  assert(
    sitemapAware[0].url === "https://audiolad.ru/listens/indexable-listen",
    "listen sitemap url",
  );

  const editorialP = mapPlaylistRowsToSitemapEntries(
    [
      {
        slug: "editorial-gift-set",
        updated_at: "2026-04-01T08:00:00.000Z",
        published_at: "2026-03-30T08:00:00.000Z",
        is_editorial: true,
        owner_type: "platform",
      },
    ],
    "https://audiolad.ru",
  );
  assert(editorialP.length === 0, "editorial /p excluded from sitemap");

  const userPublicP = mapPlaylistRowsToSitemapEntries(
    [
      {
        slug: "user-public-gift",
        updated_at: "2026-04-01T08:00:00.000Z",
        published_at: "2026-03-30T08:00:00.000Z",
        is_editorial: false,
        owner_type: "user",
      },
    ],
    "https://audiolad.ru",
  );
  assert(userPublicP.length === 1, "user-public /p unchanged in sitemap");
  assert(userPublicP[0].url.endsWith("/p/user-public-gift"), "user /p url");

  assert(
    isPlatformEditorialPublicPlaylist({
      isEditorial: true,
      ownerType: "platform",
    }),
    "editorial platform helper",
  );
  assert(
    !isPlatformEditorialPublicPlaylist({
      isEditorial: false,
      ownerType: "user",
    }),
    "user public is not editorial platform",
  );

  const pPage = read("src/app/(platform)/p/[slug]/page.tsx");
  assert(pPage.includes("isPlatformEditorialPublicPlaylist"), "/p uses editorial helper");
  assert(pPage.includes("index: false"), "editorial /p noindex");
  assert(pPage.includes("follow: true"), "editorial /p follow");
  assert(pPage.includes("buildPublicPlaylistCanonicalUrl"), "/p keeps self canonical");
  assert(!pPage.includes("/listens/"), "/p does not canonicalize onto /listens");

  const graph = buildListenPageJsonLdGraph(data, "https://audiolad.ru");
  const serialized = JSON.stringify(graph);
  assert(graph["@graph"], "listen json-ld graph");
  assert(serialized.includes('"ItemList"'), "ItemList structured data");
  assert(!serialized.includes("MusicPlaylist"), "not MusicPlaylist");
  assert(serialized.includes("Practice 1"), "ItemList includes preview title");
  assert(serialized.includes("/practice/author-1/practice-1"), "ItemList product link");
  assert(serialized.includes("Author 1"), "ItemList author");
  assert(serialized.includes("#article"), "Article json-ld for page");
  assert(serialized.includes("#webpage"), "WebPage json-ld for page");
  assert(!serialized.includes("CollectionPage"), "no CollectionPage conflict on listens");

  const listenPage = read("src/app/(platform)/(listener)/listens/[slug]/page.tsx");
  assert(listenPage.includes("force-dynamic"), "listen route is dynamic");
  assert(listenPage.includes("loadListenPageData"), "server load");
  assert(listenPage.includes("notFound"), "fail closed notFound");
  assert(!listenPage.includes("ArticlePageView"), "not articles renderer");
}

function testRegression() {
  const articlePage = read("src/app/(platform)/(listener)/articles/[slug]/page.tsx");
  assert(articlePage.includes("ArticlePageView"), "articles route unchanged");
  assert(!articlePage.includes("ListenPageView"), "articles has no listen view");
  assert(!articlePage.includes('type: "listen"'), "articles does not guess listen");

  const articleView = read("src/components/articles/ArticlePageView.tsx");
  assert(!articleView.includes("PublicPlaylistEmbed"), "ArticlePageView not a monolith");
  assert(!articleView.includes("ListenPageDefinition"), "no listen branch in articles");

  const listenRoute = read("src/app/(platform)/listen/[...segments]/page.tsx");
  assert(listenRoute.length > 0, "fullscreen listen route remains");

  const publicP = read("src/app/(platform)/p/[slug]/page.tsx");
  assert(publicP.includes("PublicPlaylistPageView"), "/p product page remains");
  assert(publicP.includes("force-dynamic"), "/p stays dynamic");

  const playAll = read("src/components/playlists/PlayAllButton.tsx");
  assert(playAll.includes("Слушать всё"), "Play All label remains");

  const mini = read("src/components/audio/GlobalMiniPlayer.tsx");
  assert(mini.includes("openFullPlayer"), "mini player can open fullscreen");
  assert(mini.includes("<audio") === false, "mini player uses shared engine");

  const provider = read("src/components/audio/GlobalAudioPlayerProvider.tsx");
  assert(provider.includes("<audio"), "single persistent audio remains");
  assert(provider.includes("writeDesktopPlayerLastSession"), "desktop persistence remains");

  const articleTypes = read("src/lib/seo/articles/types.ts");
  assert(articleTypes.includes("PracticeArticleDefinition"), "practice articles remain");
  assert(articleTypes.includes("CreatorArticleDefinition"), "creator articles remain");
  assert(!articleTypes.includes('type: "listen"'), "listen is not an article type");

  const stage1 = existsSync("scripts/playlists-stage1-validation-smoke.mjs");
  const stage2 = existsSync("scripts/playlists-stage2-validation-smoke.mjs");
  const stage21 = existsSync("scripts/playlists-stage21-validation-smoke.mjs");
  assert(stage1 && stage2 && stage21, "previous playlist stage tests remain");

  const packageJson = read("package.json");
  assert(packageJson.includes("test:playlists-stage3"), "stage3 wired");
  assert(packageJson.includes("test:playlists-stage1"), "stage1 still wired");
  assert(packageJson.includes("test:playlists-stage21"), "stage21 still wired");

  const seoFiles = listFiles("src/lib/seo/listens");
  assert(
    seoFiles.some((file) => file.endsWith("registry.ts")),
    "listens registry exists",
  );
}

function testPlayableHelper() {
  assert(
    isPlayablePublicPlaylistItem({
      available: true,
      href: "/listen/a/b",
    }),
    "listen href playable",
  );
  assert(
    !isPlayablePublicPlaylistItem({
      available: true,
      href: "/practice/a/b",
    }),
    "product page only is not playable",
  );
}

const tests = [
  ["definitions", testDefinitions],
  ["server load", testServerLoad],
  ["SSR preview", testSsrPreview],
  ["playback", testPlayback],
  ["SEO", testSeo],
  ["regression", testRegression],
  ["playable helper", testPlayableHelper],
];

for (const [name, fn] of tests) {
  fn();
  console.log(`ok  ${name}`);
}

console.log(`playlists-stage3: ${tests.length} groups passed`);
