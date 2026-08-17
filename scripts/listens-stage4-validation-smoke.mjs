/**
 * Stage 4 first listen page + embed presentation — no DB, no network.
 * Run: npx --yes tsx scripts/listens-stage4-validation-smoke.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPublicPlaylistQueue } from "../src/lib/playlists/build-playlist-queue.ts";
import { DENEZHNAYA_MEDITATSIYA_SLUSHAT_ONLAYN_BESPLATNO_PAGE } from "../src/lib/seo/listens/content/denezhnaya-meditatsiya-slushat-onlayn-besplatno.ts";
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

const SECOND_PAGE_SLUG = "denezhnaya-meditatsiya-slushat-onlayn-besplatno";
const SECOND_PAGE_H1 = "Денежная медитация: слушать онлайн бесплатно";
const SECOND_PAGE_DESCRIPTION =
  "Слушайте денежные медитации онлайн бесплатно на АудиоЛаде. Выберите подходящую практику по теме, голосу и темпу и начните прослушивание.";

const SECOND_EXPECTED_INTRO = [
  "На этой странице можно бесплатно слушать денежные медитации онлайн. Выберите практику, которая подходит вам по теме, голосу и темпу, и включите её прямо на АудиоЛаде.",
  "Денежная медитация может помочь внимательнее посмотреть на своё отношение к деньгам, снизить напряжение вокруг финансовой темы и сосредоточиться на собственных решениях.",
  "Выберите подходящую практику и начните слушать.",
];

const SECOND_EXPECTED_SECTION_TITLES = [
  "Что такое денежная медитация",
  "Чем денежные медитации могут отличаться друг от друга",
  "Как выбрать денежную медитацию",
  "Как слушать денежную медитацию онлайн",
  "Нужно ли слушать денежную медитацию каждый день",
  "Когда лучше слушать денежную медитацию",
  "Денежная медитация и финансовые установки",
  "Денежная медитация не заменяет реальные действия",
  "Можно ли слушать денежные медитации бесплатно",
  "Как понять, что практика вам подходит",
  "Итог",
];

const SECOND_EXPECTED_FAQ = [
  {
    question: "Что такое денежная медитация?",
    answer:
      "Это аудиопрактика, направленная на внимание к теме денег, финансовым решениям, внутреннему состоянию и привычным установкам. Она не гарантирует получение денег или рост дохода.",
  },
  {
    question: "Можно ли слушать денежную медитацию бесплатно?",
    answer:
      "Да. На этой странице доступны денежные медитации для бесплатного онлайн-прослушивания. Выберите подходящую практику в плейлисте и включите её.",
  },
  {
    question: "Как часто нужно слушать денежные медитации?",
    answer:
      "Строгого правила нет. Можно повторять одну практику несколько дней, слушать периодически или менять медитации в зависимости от текущей задачи.",
  },
  {
    question: "Когда лучше слушать денежную медитацию?",
    answer:
      "Утром, вечером, перед финансовым планированием или в любой другой спокойный момент. Важнее возможность сосредоточиться, а не определённое время суток.",
  },
  {
    question: "Нужно ли слушать денежную медитацию в наушниках?",
    answer:
      "Нет. Наушники могут помочь меньше отвлекаться и лучше слышать голос, но использовать их необязательно.",
  },
  {
    question: "Можно ли слушать несколько денежных медитаций?",
    answer:
      "Можно, если это комфортно. Но необходимости слушать много практик подряд нет. Иногда полезнее выбрать одну и дать себе время осмыслить её.",
  },
  {
    question: "Можно ли слушать денежную медитацию перед сном?",
    answer:
      "Можно, если конкретная практика спокойная и не требует активной концентрации или планирования. Если она настраивает на действия, удобнее выбрать другое время.",
  },
  {
    question: "Действительно ли денежная медитация помогает привлечь деньги?",
    answer:
      "Медитация не гарантирует прямого привлечения денег. Она может помочь внимательнее относиться к финансовой теме, замечать свои установки, снизить напряжение и яснее формулировать решения. Финансовые результаты зависят от последующих действий, навыков, планирования и управления деньгами.",
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
  const ctaAt = body.indexOf("ListenSignupCta");
  assert(faqAt > sectionsAt, "ListenPageView: sections → FAQ");
  assert(ctaAt > faqAt, "ListenPageView: FAQ → ListenSignupCta");
  assert(body.includes("{!isAuthenticated ? <ListenSignupCta /> : null}"), "guest-only CTA");
  assert(!view.includes("Продолжайте в АудиоЛаде"), "no logged-in CTA copy");
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

function testSignupCta() {
  const cta = read("src/components/listens/ListenSignupCta.tsx");
  const page = read("src/app/(platform)/(listener)/listens/[slug]/page.tsx");
  const css = read("src/app/globals.css");

  assert(cta.includes("Создайте бесплатный аккаунт в АудиоЛаде"), "headline verbatim");
  assert(
    cta.includes("Сохраняйте любимые практики, слушайте медитации и музыку в одном"),
    "supporting text verbatim",
  );
  assert(cta.includes("Зарегистрироваться бесплатно"), "primary label");
  assert(cta.includes('href="/auth/sign-up"'), "primary href");
  assert(cta.includes("Открыть аудиотеку →"), "secondary label");
  assert(cta.includes('href="/my-practices"'), "secondary href");
  assert(cta.includes("Сохраняйте. Слушайте. Наполняйтесь."), "chip verbatim");
  assert(cta.includes("home-primary-cta home-primary-cta--compact"), "reuses home CTA");
  assert(cta.includes("UserIcon"), "reuses UserIcon");
  assert(cta.includes('aria-hidden="true"'), "decorative cluster hidden");
  assert(!cta.includes(".gif"), "no GIF");
  assert(!cta.includes("<video"), "no video");
  assert(!cta.includes("loadPlaylistQueue"), "no playlist queue");
  assert(!cta.includes("handlePlayPause"), "no play behavior");
  assert(page.includes("createClient"), "listen page uses createClient");
  assert(page.includes("getUser()"), "listen page uses getUser");
  assert(page.includes("isAuthenticated={isAuthenticated}"), "passes isAuthenticated");
  assert(css.includes("@media (prefers-reduced-motion: reduce)"), "reduced motion exists");
  assert(css.includes(".listen-signup-cta__glow,"), "CTA animations disabled on reduce");
}

function testArticleIsolation() {
  const articleTypes = read("src/lib/seo/articles/types.ts");
  assert(!articleTypes.includes('type: "listen"'), "articles/types has no listen");
  const articleView = read("src/components/articles/ArticlePageView.tsx");
  assert(!articleView.includes("PublicPlaylistEmbed"), "ArticlePageView has no embed");
}

function testSecondPage() {
  const parsed = parseListenPageDefinition(
    DENEZHNAYA_MEDITATSIYA_SLUSHAT_ONLAYN_BESPLATNO_PAGE,
  );
  assert(parsed.ok, "second production definition valid");
  assert(parsed.definition.slug === SECOND_PAGE_SLUG, "second page slug");
  assert(parsed.definition.playlistSlug === PLAYLIST_SLUG, "second playlistSlug");
  assert(
    parsed.definition.playlistSlug !== "meditatsiya-na-dengi",
    "second playlistSlug is not slugifyTitle form",
  );
  assert(parsed.definition.h1 === SECOND_PAGE_H1, "second h1 exact");
  assert(parsed.definition.title === parsed.definition.h1, "second title equals H1");
  assert(
    parsed.definition.description === SECOND_PAGE_DESCRIPTION,
    "second description equals TZ meta string",
  );
  assert(parsed.definition.intro.length === 3, "second page has three intro paragraphs");
  assert(
    parsed.definition.intro[0] === SECOND_EXPECTED_INTRO[0] &&
      parsed.definition.intro[1] === SECOND_EXPECTED_INTRO[1] &&
      parsed.definition.intro[2] === SECOND_EXPECTED_INTRO[2],
    "second intro[0..2] verbatim",
  );
  assert(parsed.definition.sections.length === 11, "second page has 11 sections");
  assert(
    parsed.definition.sections.map((section) => section.title).join("\n") ===
      SECOND_EXPECTED_SECTION_TITLES.join("\n"),
    "second page 11 section titles verbatim",
  );
  assert(parsed.definition.faq.length === 8, "second page has 8 FAQ items");
  assert(
    parsed.definition.faq.every(
      (item, index) =>
        item.question === SECOND_EXPECTED_FAQ[index].question &&
        item.answer === SECOND_EXPECTED_FAQ[index].answer,
    ),
    "second page 8 FAQ verbatim",
  );
  assert(!("internalLinks" in parsed.definition), "second page has no internalLinks");
  assert(!("cta" in parsed.definition), "second page has no cta");
  for (const key of FORBIDDEN_COMPOSITION_KEYS) {
    assert(!(key in parsed.definition), `second page has no static ${key}`);
  }

  const firstSection = parsed.definition.sections[0];
  const rich = (firstSection.blocks ?? []).find((block) => block.kind === "rich_paragraph");
  assert(rich, "first section contains a rich_paragraph");
  const link = rich.segments.find((segment) => "href" in segment);
  assert(
    link?.href === "/listens/meditatsiya-na-dengi-slushat-onlayn-besplatno",
    "rich_paragraph href is first listen path",
  );
  assert(
    link?.label ===
      "https://audiolad.ru/listens/meditatsiya-na-dengi-slushat-onlayn-besplatno",
    "rich_paragraph label is full first listen URL",
  );

  const slugs = listListenPageDefinitions().map((page) => page.slug);
  assert(slugs.includes(PAGE_SLUG), "registry contains first listen slug");
  assert(slugs.includes(SECOND_PAGE_SLUG), "registry contains second listen slug");
  assert(
    MEDITATSIYA_NA_DENGI_SLUSHAT_ONLAYN_BESPLATNO_PAGE.playlistSlug ===
      DENEZHNAYA_MEDITATSIYA_SLUSHAT_ONLAYN_BESPLATNO_PAGE.playlistSlug,
    "two listen pages may share the same playlistSlug",
  );
  assert(
    MEDITATSIYA_NA_DENGI_SLUSHAT_ONLAYN_BESPLATNO_PAGE.slug !==
      DENEZHNAYA_MEDITATSIYA_SLUSHAT_ONLAYN_BESPLATNO_PAGE.slug,
    "shared playlistSlug still uses distinct page slugs",
  );

  const sitemap = mapListenPageDefinitionsToSitemapEntries(
    undefined,
    "https://audiolad.ru",
  );
  const sitemapUrls = sitemap.map((entry) => entry.url);
  assert(
    sitemapUrls.includes(
      "https://audiolad.ru/listens/meditatsiya-na-dengi-slushat-onlayn-besplatno",
    ),
    "sitemap contains first listen canonical",
  );
  assert(
    sitemapUrls.includes(
      "https://audiolad.ru/listens/denezhnaya-meditatsiya-slushat-onlayn-besplatno",
    ),
    "sitemap contains second listen canonical",
  );

  const data = resolveListenPageFromPlaylist({
    definition: DENEZHNAYA_MEDITATSIYA_SLUSHAT_ONLAYN_BESPLATNO_PAGE,
    loaded: { ok: true, detail: makePlaylist() },
  });
  assert(data, "second page resolves against the same editorial playlist");
  const graph = buildListenPageJsonLdGraph(data, "https://audiolad.ru");
  const serialized = JSON.stringify(graph);
  assert(serialized.includes('"Article"'), "second JSON-LD Article");
  assert(serialized.includes('"WebPage"'), "second JSON-LD WebPage");
  assert(serialized.includes('"Organization"'), "second JSON-LD Organization");
  assert(serialized.includes('"BreadcrumbList"'), "second JSON-LD BreadcrumbList");
  assert(serialized.includes('"ItemList"'), "second JSON-LD ItemList");
  assert(serialized.includes('"FAQPage"'), "second JSON-LD FAQPage");
  assert(!serialized.includes("MusicPlaylist"), "second JSON-LD no MusicPlaylist");
  assert(!serialized.includes("AudioObject"), "second JSON-LD no AudioObject");
  assert(!serialized.includes("primaryPractice"), "second JSON-LD no primaryPractice");
}

const tests = [
  ["definition", testDefinition],
  ["registry and sitemap", testRegistryAndSitemap],
  ["second listen page", testSecondPage],
  ["ListenPageView order", testListenPageViewOrder],
  ["embed presentation", testEmbedPresentation],
  ["playback", testPlayback],
  ["JSON-LD", testJsonLd],
  ["signup CTA", testSignupCta],
  ["article isolation", testArticleIsolation],
];

for (const [name, fn] of tests) {
  fn();
  console.log(`ok  ${name}`);
}

console.log(`listens-stage4: ${tests.length} groups passed`);
