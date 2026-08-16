/**
 * Stage 4 first listen page + embed presentation — no DB, no network.
 * Run: npx --yes tsx scripts/listens-stage4-validation-smoke.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPublicPlaylistQueue } from "../src/lib/playlists/build-playlist-queue.ts";
import { MEDITATSIYA_NA_DENGI_SLUSHAT_ONLAYN_BESPLATNO_PAGE } from "../src/lib/seo/listens/content/meditatsiya-na-dengi-slushat-onlayn-besplatno.ts";
import {
  buildListenPageJsonLdGraph,
  getListenPageBySlug,
  listIndexableListenPageDefinitions,
  listListenPageDefinitions,
  parseListenPageDefinition,
  resolveListenPageFromPlaylist,
} from "../src/lib/seo/listens/index.ts";
import { mapListenPageDefinitionsToSitemapEntries } from "../src/lib/seo/sitemap-data.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE_SLUG = "meditatsiya-na-dengi-slushat-onlayn-besplatno";
const PLAYLIST_SLUG = "meditaciya-na-dengi";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function read(relPath) {
  return readFileSync(join(ROOT, relPath), "utf8");
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
  const items = overrides.items ?? Array.from({ length: 8 }, (_, index) => makeItem(index + 1));
  const { items: _ignored, playlist: playlistOverrides, ...rest } = overrides;
  return {
    playlist: {
      title: "Медитация на деньги | Денежная медитация | Медитация на изобилие",
      slug: PLAYLIST_SLUG,
      visibility: "public",
      published_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
      isEditorial: true,
      isPlatformOwned: true,
      description: "Практики на деньги и изобилие — не show this in embed.",
      ...playlistOverrides,
    },
    items,
    itemsCount: items.length,
    availableCount: items.filter((item) => item.available).length,
    totalDurationLabel: "47 мин",
    hasUnavailable: false,
    allUnavailable: false,
    coverUrl: "https://example.test/cover.jpg",
    mosaicCoverUrls: [],
    ownerLabel: "Плейлист АудиоЛада",
    ...rest,
  };
}

const EXPECTED_INTRO = [
  "На этой странице можно бесплатно слушать медитации на деньги онлайн. Выберите практику, которая подходит вам по голосу, темпу и текущему состоянию, и включите её прямо на АудиоЛаде.",
  "Медитация на деньги может помочь спокойнее посмотреть на финансовую тему, заметить собственные установки и вернуть внимание к решениям, которые зависят от вас.",
  "Выберите подходящую медитацию и начните слушать.",
];

const EXPECTED_SECTION_TITLES = [
  "Что такое медитация на деньги",
  "Как выбрать медитацию на деньги",
  "Как слушать медитацию на деньги",
  "Нужно ли слушать медитацию каждый день",
  "Когда лучше слушать медитацию на деньги",
  "Что делать во время медитации",
  "Медитация на деньги и реальные финансовые действия",
  "Можно ли слушать медитацию на деньги бесплатно",
  "Как понять, подходит ли вам конкретная медитация",
  "Итог",
];

const EXPECTED_FAQ = [
  {
    question: "Можно ли слушать медитацию на деньги бесплатно?",
    answer:
      "Да. На этой странице доступна подборка для бесплатного онлайн-прослушивания. Выберите подходящую практику в плейлисте и включите её.",
  },
  {
    question: "Как часто нужно слушать медитацию на деньги?",
    answer:
      "Строгого правила нет. Можно слушать одну практику несколько дней подряд, возвращаться к ней периодически или менять медитации в зависимости от состояния.",
  },
  {
    question: "Когда лучше слушать медитацию на деньги – утром или вечером?",
    answer:
      "Подходят оба варианта. Утром практика может помочь настроиться на день, вечером – переключиться после напряжения. Выбирайте время, когда вас меньше отвлекают.",
  },
  {
    question: "Нужно ли использовать наушники?",
    answer:
      "Нет. Наушники могут помочь лучше слышать голос и меньше отвлекаться, но использовать их необязательно.",
  },
  {
    question: "Можно ли слушать несколько медитаций на деньги подряд?",
    answer:
      "Можно, если это комфортно. Но необходимости слушать много практик за один раз нет – часто полезнее выбрать одну и дать себе время после неё.",
  },
  {
    question: "Сколько должна длиться медитация на деньги?",
    answer:
      "Универсальной продолжительности нет. Важнее, чтобы вы могли спокойно пройти практику целиком и её темп был для вас удобным.",
  },
  {
    question: "Можно ли слушать медитацию на деньги перед сном?",
    answer:
      "Можно, если конкретная практика помогает расслабиться и не требует активной концентрации. Если она, наоборот, побуждает к планированию и действиям, лучше выбрать другое время.",
  },
  {
    question: "Помогает ли медитация привлечь деньги?",
    answer:
      "Медитация не гарантирует приток денег и не заменяет финансовые действия. Она может помочь спокойнее относиться к теме денег, замечать собственные установки, формулировать намерения и сосредоточиться на решениях, которые зависят от вас.",
  },
];

const FORBIDDEN_COMPOSITION_KEYS = [
  "items",
  "itemIds",
  "practiceIds",
  "practiceSlugs",
  "practices",
  "tracks",
];

function testDefinition() {
  const parsed = parseListenPageDefinition(
    MEDITATSIYA_NA_DENGI_SLUSHAT_ONLAYN_BESPLATNO_PAGE,
  );
  assert(parsed.ok, "production definition valid");
  assert(parsed.definition.slug === PAGE_SLUG, "exact page slug");
  assert(parsed.definition.playlistSlug === PLAYLIST_SLUG, "exact playlistSlug");
  assert(
    parsed.definition.playlistSlug !== "meditatsiya-na-dengi",
    "playlistSlug is not slugifyTitle form",
  );
  assert(
    parsed.definition.h1 ===
      "Медитация на деньги: слушать онлайн бесплатно",
    "h1 exact",
  );
  assert(parsed.definition.title === parsed.definition.h1, "title equals H1");
  assert(
    parsed.definition.description === EXPECTED_INTRO[0],
    "description equals first intro paragraph",
  );
  assert(parsed.definition.intro.length === 3, "three intro paragraphs");
  assert(
    parsed.definition.intro[0] === EXPECTED_INTRO[0] &&
      parsed.definition.intro[1] === EXPECTED_INTRO[1] &&
      parsed.definition.intro[2] === EXPECTED_INTRO[2],
    "intro[0..2] verbatim",
  );
  assert(parsed.definition.sections.length === 10, "10 sections");
  assert(
    parsed.definition.sections.map((section) => section.title).join("\n") ===
      EXPECTED_SECTION_TITLES.join("\n"),
    "10 section titles verbatim",
  );
  assert(parsed.definition.faq.length === 8, "8 FAQ items");
  assert(
    parsed.definition.faq.every(
      (item, index) =>
        item.question === EXPECTED_FAQ[index].question &&
        item.answer === EXPECTED_FAQ[index].answer,
    ),
    "8 FAQ verbatim",
  );
  assert(!("internalLinks" in parsed.definition), "no internalLinks");
  assert(!("cta" in parsed.definition), "no cta");
  for (const key of FORBIDDEN_COMPOSITION_KEYS) {
    assert(!(key in parsed.definition), `no static ${key}`);
  }
}

function testRegistryAndSitemap() {
  const pages = listListenPageDefinitions();
  assert(
    pages.some((page) => page.slug === PAGE_SLUG),
    "registry contains listen page",
  );
  assert(getListenPageBySlug(PAGE_SLUG)?.playlistSlug === PLAYLIST_SLUG, "lookup");
  assert(
    listIndexableListenPageDefinitions().some((page) => page.slug === PAGE_SLUG),
    "page is indexable",
  );

  const sitemap = mapListenPageDefinitionsToSitemapEntries(
    undefined,
    "https://audiolad.ru",
  );
  assert(
    sitemap.some(
      (entry) =>
        entry.url === `https://audiolad.ru/listens/${PAGE_SLUG}`,
    ),
    "sitemap contains listen canonical",
  );
}

function testListenPageViewOrder() {
  const view = read("src/components/listens/ListenPageView.tsx");
  const body = view.slice(view.indexOf("export default function ListenPageView"));
  const introAt = body.indexOf("definition.intro");
  const embedAt = body.indexOf("PublicPlaylistEmbed");
  const sectionsAt = body.indexOf("definition.sections.map");
  const faqAt = body.indexOf("definition.faq.length");
  assert(introAt > 0 && embedAt > introAt, "ListenPageView: intro → embed");
  assert(sectionsAt > embedAt, "ListenPageView: embed → sections");
  assert(faqAt > sectionsAt, "ListenPageView: sections → FAQ");
  assert(!view.includes("primaryPractice"), "listen view has no primaryPractice");
  assert(!view.includes("ArticleAudioBlock"), "listen view has no ArticleAudioBlock");
  assert(!view.includes("CreatorPathsCta"), "listen view has no CreatorPathsCta");
  assert(!view.includes("Студи"), "listen view has no Studio continuation");
  assert(!view.includes("Школ"), "listen view has no School continuation");
}

function testEmbedPresentation() {
  const embed = read("src/components/playlists/PublicPlaylistEmbed.tsx");
  const preview = read("src/components/playlists/PublicPlaylistEmbedPreview.tsx");

  assert(!embed.includes("playlist.playlist.description"), "no playlist.description in JSX");
  assert(!embed.includes("playlist.description"), "no playlist.description alias");
  assert(!embed.includes("itemsCount"), "no count in header");
  assert(!embed.includes("totalDurationLabel"), "no duration in header");
  assert(embed.includes("СЛУШАЙТЕ ПРЯМО СЕЙЧАС"), "eyebrow present");
  assert(
    embed.includes("Слушайте всё сразу или начните с любой строки."),
    "universal short copy present",
  );
  assert(!embed.includes("Практики на деньги и изобилие"), "no theme-specific copy");
  assert(preview.includes("Перейти в плейлист"), "footer label");
  assert(!preview.includes("Открыть весь плейлист"), "old footer removed");
  assert(embed.includes("PlaylistCover"), "playlist cover");
  assert(preview.includes("ProductCoverThumbnail"), "track cover thumbnail");
  assert(preview.includes("item.coverUrl"), "uses item.coverUrl");
  assert(preview.includes("item.coverImage"), "uses item.coverImage");
  assert(preview.includes("item.updatedAt"), "uses item.updatedAt");
  assert(embed.includes("customCoverUrl={playlist.coverUrl}"), "playlist.coverUrl");
  assert(
    embed.includes("mosaicCoverUrls={playlist.mosaicCoverUrls}"),
    "playlist mosaic covers",
  );
  assert(!embed.includes("cover_path"), "does not use cover_path");
  assert(!embed.includes('"use client"'), "embed stays server component");
  assert(!preview.includes("useEffect"), "no client fetch of composition");
  assert(!preview.includes("formatLabel"), "row has no formatLabel");
}

function testPlayback() {
  const embed = read("src/components/playlists/PublicPlaylistEmbed.tsx");
  const preview = read("src/components/playlists/PublicPlaylistEmbedPreview.tsx");
  assert(embed.includes("startIndex={0}"), "Play All index 0");
  assert(embed.includes("stay_on_source") || embed.includes("navigationPolicy"), "policy passed");
  assert(preview.includes("currentIndex"), "row play sets selected index");
  assert(preview.includes("buildPublicPlaylistQueue"), "row uses public queue builder");
  assert(preview.includes("playlist.items"), "row queue from full playlist");

  const items = Array.from({ length: 8 }, (_, index) => makeItem(index + 1));
  const playAll = buildPublicPlaylistQueue({
    playlistSlug: PLAYLIST_SLUG,
    title: "Медитация на деньги | Денежная медитация | Медитация на изобилие",
    items,
    startIndex: 0,
    returnHref: `/listens/${PAGE_SLUG}`,
    navigationPolicy: "stay_on_source",
  });
  assert(playAll.ok, "play all builds");
  assert(playAll.queue.currentIndex === 0, "play all starts at 0");
  assert(playAll.queue.navigationPolicy === "stay_on_source", "stay_on_source");

  const row = buildPublicPlaylistQueue({
    playlistSlug: PLAYLIST_SLUG,
    title: "Медитация на деньги | Денежная медитация | Медитация на изобилие",
    items,
    startIndex: 3,
    returnHref: `/listens/${PAGE_SLUG}`,
    navigationPolicy: "stay_on_source",
  });
  assert(row.ok && row.queue.currentIndex === 3, "row play selected index");
}

function testJsonLd() {
  const data = resolveListenPageFromPlaylist({
    definition: MEDITATSIYA_NA_DENGI_SLUSHAT_ONLAYN_BESPLATNO_PAGE,
    loaded: { ok: true, detail: makePlaylist() },
  });
  assert(data, "production page resolves against editorial playlist");
  const graph = buildListenPageJsonLdGraph(data, "https://audiolad.ru");
  const serialized = JSON.stringify(graph);
  assert(serialized.includes('"Article"'), "Article");
  assert(serialized.includes('"WebPage"'), "WebPage");
  assert(serialized.includes('"Organization"'), "Organization");
  assert(serialized.includes('"BreadcrumbList"'), "BreadcrumbList");
  assert(serialized.includes('"ItemList"'), "ItemList");
  assert(serialized.includes('"FAQPage"'), "FAQPage");
  assert(!serialized.includes("MusicPlaylist"), "no MusicPlaylist");
  assert(!serialized.includes("AudioObject"), "no AudioObject");
  assert(!serialized.includes("primaryPractice"), "no primaryPractice");
}

function testArticleIsolation() {
  const articleTypes = read("src/lib/seo/articles/types.ts");
  assert(!articleTypes.includes('type: "listen"'), "articles/types has no listen");
  const articleView = read("src/components/articles/ArticlePageView.tsx");
  assert(!articleView.includes("PublicPlaylistEmbed"), "ArticlePageView has no embed");
}

const tests = [
  ["definition", testDefinition],
  ["registry and sitemap", testRegistryAndSitemap],
  ["ListenPageView order", testListenPageViewOrder],
  ["embed presentation", testEmbedPresentation],
  ["playback", testPlayback],
  ["JSON-LD", testJsonLd],
  ["article isolation", testArticleIsolation],
];

for (const [name, fn] of tests) {
  fn();
  console.log(`ok  ${name}`);
}

console.log(`listens-stage4: ${tests.length} groups passed`);
