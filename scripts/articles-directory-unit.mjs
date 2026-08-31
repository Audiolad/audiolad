#!/usr/bin/env node
/**
 * Public /articles directory unit checks — no DB, no network.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARTICLES_DIRECTORY_H1,
  ARTICLES_DIRECTORY_INTRO,
  ARTICLES_DIRECTORY_META_DESCRIPTION,
  ARTICLES_DIRECTORY_PATH,
  ARTICLES_DIRECTORY_SEO_TITLE,
  buildArticlesDirectoryJsonLdGraph,
  buildArticlesDirectoryMetadata,
  buildArticlePath,
  compareArticlesByPublishedAtDesc,
  getArticleBySlug,
  isArticleDirectoryListed,
  listArticleDefinitions,
  listArticleDirectoryCards,
  listArticleDirectoryTopicHubs,
  listListenDirectoryCards,
  listArticleSlugs,
  loadArticleDirectoryPageData,
  resolveArticleDirectoryDescription,
} from "../src/lib/seo/articles/index.ts";
import { listIndexableListenPageDefinitions } from "../src/lib/seo/listens/index.ts";
import { DENEZHNAYA_MEDITATSIYA_SLUSHAT_ONLAYN_BESPLATNO_PAGE } from "../src/lib/seo/listens/content/denezhnaya-meditatsiya-slushat-onlayn-besplatno.ts";
import { MEDITATSIYA_NA_DENGI_SLUSHAT_ONLAYN_BESPLATNO_PAGE } from "../src/lib/seo/listens/content/meditatsiya-na-dengi-slushat-onlayn-besplatno.ts";
import { MEDITATSIYA_NA_BOGATSTVO_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/meditatsiya-na-bogatstvo-slushat-onlayn.ts";
import { MEDITATSIYA_NA_IZOBILIE_SLUSHAT_ONLAYN_BESPLATNO_PAGE } from "../src/lib/seo/listens/content/meditatsiya-na-izobilie-slushat-onlayn-besplatno.ts";
import { MEDITATSIYA_DLYA_PRIVLECHENIYA_DENEG_BOGATSTVA_I_IZOBILIYA_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-privlecheniya-deneg-bogatstva-i-izobiliya.ts";
import { MEDITATSIYA_NA_DENEZHNYY_POTOK_SLUSHAT_ONLAYN_BESPLATNO_PAGE } from "../src/lib/seo/listens/content/meditatsiya-na-denezhnyy-potok-slushat-onlayn-besplatno.ts";
import { MEDITATSIYA_DLYA_DENEG_I_IZOBILIYA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-deneg-i-izobiliya-slushat-onlayn.ts";
import { MEDITATSIYA_NA_DENGI_I_IZOBILIE_DLYA_ZHENSHCHIN_PAGE } from "../src/lib/seo/listens/content/meditatsiya-na-dengi-i-izobilie-dlya-zhenshchin.ts";
import { UTRENNYAYA_MEDITATSIYA_NA_DENGI_I_IZOBILIE_PAGE } from "../src/lib/seo/listens/content/utrennyaya-meditatsiya-na-dengi-i-izobilie.ts";
import { MEDITATSIYA_IZOBILIYA_I_BOGATSTVA_DLYA_SNA_PAGE } from "../src/lib/seo/listens/content/meditatsiya-izobiliya-i-bogatstva-dlya-sna.ts";
import { SHUM_VODY_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/shum-vody-slushat-onlayn.ts";
import { ZHURCHANIE_VODY_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/zhurchanie-vody-slushat-onlayn.ts";
import { ZVUK_VODOPADA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/zvuk-vodopada-slushat-onlayn.ts";
import { ZVUK_RUCHYA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/zvuk-ruchya-slushat-onlayn.ts";
import { SHUM_VODY_DLYA_SNA_PAGE } from "../src/lib/seo/listens/content/shum-vody-dlya-sna.ts";
import { ZVUK_LYUSHCHEYSYA_VODY_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/zvuk-lyushcheysya-vody-slushat-onlayn.ts";
import { BELYY_SHUM_VODY_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/belyy-shum-vody-slushat-onlayn.ts";
import { SHUM_VODY_DLYA_DETEY_PAGE } from "../src/lib/seo/listens/content/shum-vody-dlya-detey.ts";
import { SHUM_VODY_DLYA_NOVOROZHDENNYH_PAGE } from "../src/lib/seo/listens/content/shum-vody-dlya-novorozhdennyh.ts";
import { SHUM_VODY_IZ_KRANA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/shum-vody-iz-krana-slushat-onlayn.ts";
import { MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-dlya-sna-slushat-onlayn.ts";
import { USPOKAIVAYUSHCHAYA_MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/uspokaivayushchaya-muzyka-dlya-sna-slushat-onlayn.ts";
import { USYPLYAYUSHCHAYA_MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/usyplyayushchaya-muzyka-dlya-sna-slushat-onlayn.ts";
import { MUZYKA_DLYA_SNA_BEZ_SLOV_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-dlya-sna-bez-slov-slushat-onlayn.ts";
import { MEDITATSIYA_DLYA_SNA_SLUSHAT_ONLAYN_BESPLATNO_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-sna-slushat-onlayn-besplatno.ts";
import { MEDITATSIYA_PERED_SNOM_SLUSHAT_ONLAYN_BESPLATNO_PAGE } from "../src/lib/seo/listens/content/meditatsiya-pered-snom-slushat-onlayn-besplatno.ts";
import { MEDITATSIYA_DLYA_SNA_I_RASSLABLENIYA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-sna-i-rasslableniya-slushat-onlayn.ts";
import { MEDITATSIYA_DLYA_GLUBOKOGO_SNA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-glubokogo-sna-slushat-onlayn.ts";
import { MEDITATSIYA_NA_NOCH_SLUSHAT_PERED_SNOM_PAGE } from "../src/lib/seo/listens/content/meditatsiya-na-noch-slushat-pered-snom.ts";
import { MEDITATSIYA_DLYA_HOROSHEGO_I_SPOKOYNOGO_SNA_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-horoshego-i-spokoynogo-sna.ts";
import { MEDITATSIYA_DLYA_SNA_S_GOLOSOM_SLUSHAT_BESPLATNO_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-sna-s-golosom-slushat-besplatno.ts";
import { MEDITATSIYA_DLYA_SNA_BEZ_GOLOSA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-sna-bez-golosa-slushat-onlayn.ts";
import { MEDITATSIYA_DLYA_SNA_BEZ_REKLAMY_SLUSHAT_BESPLATNO_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-sna-bez-reklamy-slushat-besplatno.ts";
import { MEDITATSIYA_DLYA_SNA_I_USPOKOENIYA_NERVNOY_SISTEMY_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-sna-i-uspokoeniya-nervnoy-sistemy.ts";
import { MEDITATSIYA_DLYA_SNA_DLYA_ZHENSHCHIN_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-sna-dlya-zhenshchin-slushat-onlayn.ts";
import { MEDITATSIYA_DLYA_ZASYPANIYA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-zasypaniya-slushat-onlayn.ts";
import { MEDITATSIYA_DLYA_SNA_OT_STRESSA_I_TREVOGI_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-sna-ot-stressa-i-trevogi.ts";
import { MEDITATSIYA_DLYA_SNA_I_VOSSTANOVLENIYA_SIL_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-sna-i-vosstanovleniya-sil.ts";
import { DETSKAYA_MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/detskaya-muzyka-dlya-sna-slushat-onlayn.ts";
import { MUZYKA_DLYA_SNA_DLYA_MALYSHEY_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-dlya-sna-dlya-malyshey-slushat-onlayn.ts";
import { MUZYKA_DLYA_NOVOROZHDENNYH_DLYA_SNA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-dlya-novorozhdennyh-dlya-sna-slushat-onlayn.ts";
import { MUZYKA_DLYA_SNA_MLADENCEV_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-dlya-sna-mladencev-slushat-onlayn.ts";
import { MUZYKA_DLYA_SNA_GRUDNICHKOV_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-dlya-sna-grudnichkov-slushat-onlayn.ts";
import { USPOKAIVAYUSHCHAYA_MUZYKA_DLYA_DETEY_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/uspokaivayushchaya-muzyka-dlya-detey-slushat-onlayn.ts";
import { KOLYBELNYE_DLYA_MALYSHEY_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/kolybelnye-dlya-malyshey-slushat-onlayn.ts";
import { MUZYKA_DLYA_SNA_DETYAM_BEZ_SLOV_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-dlya-sna-detyam-bez-slov-slushat-onlayn.ts";
import { RELAKS_MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/relaks-muzyka-dlya-sna-slushat-onlayn.ts";
import { RASSLABLYAYUSHCHAYA_MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/rasslablyayushchaya-muzyka-dlya-sna-slushat-onlayn.ts";
import { SPOKOYNAYA_MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/spokoynaya-muzyka-dlya-sna-slushat-onlayn.ts";
import { MUZYKA_DLYA_SNYATIYA_STRESSA_I_RASSLABLENIYA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-dlya-snyatiya-stressa-i-rasslableniya-slushat-onlayn.ts";
import { RASSLABLYAYUSHCHAYA_MUZYKA_BEZ_SLOV_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/rasslablyayushchaya-muzyka-bez-slov-slushat-onlayn.ts";
import { MUZYKA_DLYA_SNA_I_MEDITACII_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-dlya-sna-i-meditacii-slushat-onlayn.ts";
import { TARO_DENGI_PAGE } from "../src/lib/seo/listens/content/taro-dengi.ts";
import { TARO_BOLSHIH_DENEG_PAGE } from "../src/lib/seo/listens/content/taro-bolshih-deneg.ts";
import { TARO_BOGATSTVA_I_DENGI_PAGE } from "../src/lib/seo/listens/content/taro-bogatstva-i-dengi.ts";
import { KARTA_TARO_NA_DENGI_PAGE } from "../src/lib/seo/listens/content/karta-taro-na-dengi.ts";
import { TARO_PRIVLECHENIE_DENEG_PAGE } from "../src/lib/seo/listens/content/taro-privlechenie-deneg.ts";
import { KARTA_TARO_DLYA_PRIVLECHENIYA_DENEG_PAGE } from "../src/lib/seo/listens/content/karta-taro-dlya-privlecheniya-deneg.ts";
import { TARO_NA_DENGI_NA_ZASTAVKU_TELEFONA_PAGE } from "../src/lib/seo/listens/content/taro-na-dengi-na-zastavku-telefona.ts";
import { RASKLAD_TARO_NA_DENGI_PAGE } from "../src/lib/seo/listens/content/rasklad-taro-na-dengi.ts";
import { TARO_NA_DENGI_I_UDACHU_PAGE } from "../src/lib/seo/listens/content/taro-na-dengi-i-udachu.ts";
import { BUDUT_LI_DENGI_TARO_PAGE } from "../src/lib/seo/listens/content/budut-li-dengi-taro.ts";
import { TARO_NA_DENGI_V_BLIZHAYSHEE_VREMYA_PAGE } from "../src/lib/seo/listens/content/taro-na-dengi-v-blizhayshee-vremya.ts";
import { TARO_DOHODY_PAGE } from "../src/lib/seo/listens/content/taro-dohody.ts";
import { TARO_RABOTA_I_FINANSY_PAGE } from "../src/lib/seo/listens/content/taro-rabota-i-finansy.ts";
import { TARO_RABOTA_PAGE } from "../src/lib/seo/listens/content/taro-rabota.ts";
import { TARO_NA_RABOTU_PAGE } from "../src/lib/seo/listens/content/taro-na-rabotu.ts";
import { RASKLAD_TARO_NA_RABOTU_PAGE } from "../src/lib/seo/listens/content/rasklad-taro-na-rabotu.ts";
import { KARTY_TARO_NA_RABOTU_PAGE } from "../src/lib/seo/listens/content/karty-taro-na-rabotu.ts";
import { TARO_NOVAYA_RABOTA_PAGE } from "../src/lib/seo/listens/content/taro-novaya-rabota.ts";
import { RASKLAD_TARO_NA_NOVUYU_RABOTU_PAGE } from "../src/lib/seo/listens/content/rasklad-taro-na-novuyu-rabotu.ts";
import { TARO_BYVSHAYA_RABOTA_PAGE } from "../src/lib/seo/listens/content/taro-byvshaya-rabota.ts";
import { TARO_RABOTA_BLIZHAYSHEE_BUDUSHCHEE_PAGE } from "../src/lib/seo/listens/content/taro-rabota-blizhayshee-budushchee.ts";
import { TARO_NA_RABOTU_NA_BLIZHAYSHEE_BUDUSHCHEE_PAGE } from "../src/lib/seo/listens/content/taro-na-rabotu-na-blizhayshee-budushchee.ts";
import { VOPROSY_TARO_NA_RABOTU_PAGE } from "../src/lib/seo/listens/content/voprosy-taro-na-rabotu.ts";
import { TARO_KAKAYA_RABOTA_MNE_PODHODIT_PAGE } from "../src/lib/seo/listens/content/taro-kakaya-rabota-mne-podhodit.ts";
import { TARO_NA_SITUATSIYU_NA_RABOTE_PAGE } from "../src/lib/seo/listens/content/taro-na-situatsiyu-na-rabote.ts";
import { TARO_POISK_RABOTY_PAGE } from "../src/lib/seo/listens/content/taro-poisk-raboty.ts";
import { NAYDU_LI_YA_RABOTU_TARO_PAGE } from "../src/lib/seo/listens/content/naydu-li-ya-rabotu-taro.ts";
import { VOZMUT_LI_MENYA_NA_RABOTU_TARO_PAGE } from "../src/lib/seo/listens/content/vozmut-li-menya-na-rabotu-taro.ts";
import { TARO_MENYAT_LI_RABOTU_PAGE } from "../src/lib/seo/listens/content/taro-menyat-li-rabotu.ts";
import { TARO_RABOTA_I_KARERA_PAGE } from "../src/lib/seo/listens/content/taro-rabota-i-karera.ts";
import { TARO_PERSPEKTIVY_NA_RABOTE_PAGE } from "../src/lib/seo/listens/content/taro-perspektivy-na-rabote.ts";
import { TARO_OTNOSHENIYA_NA_RABOTE_PAGE } from "../src/lib/seo/listens/content/taro-otnosheniya-na-rabote.ts";
import { TARO_BIZNES_PAGE } from "../src/lib/seo/listens/content/taro-biznes.ts";
import { KARTY_TARO_BIZNES_PAGE } from "../src/lib/seo/listens/content/karty-taro-biznes.ts";
import { ZNACHENIE_TARO_V_BIZNESE_PAGE } from "../src/lib/seo/listens/content/znachenie-taro-v-biznese.ts";
import { RASKLAD_TARO_NA_BIZNES_PAGE } from "../src/lib/seo/listens/content/rasklad-taro-na-biznes.ts";
import { GADANIE_TARO_NA_BIZNES_PAGE } from "../src/lib/seo/listens/content/gadanie-taro-na-biznes.ts";
import { VOPROSY_TARO_PRO_BIZNES_PAGE } from "../src/lib/seo/listens/content/voprosy-taro-pro-biznes.ts";
import { RABOTA_I_BIZNES_TARO_PAGE } from "../src/lib/seo/listens/content/rabota-i-biznes-taro.ts";
import { TARO_BIZNES_I_DENGI_PAGE } from "../src/lib/seo/listens/content/taro-biznes-i-dengi.ts";
import { RASKLAD_TARO_NA_BIZNES_I_DENGI_PAGE } from "../src/lib/seo/listens/content/rasklad-taro-na-biznes-i-dengi.ts";
import { MUZYKA_SNA_DLYA_ZASYPANIYA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-sna-dlya-zasypaniya-slushat-onlayn.ts";
import { MUZYKA_DLYA_BYSTROGO_SNA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-dlya-bystrogo-sna-slushat-onlayn.ts";
import { MUZYKA_DLYA_GLUBOKOGO_SNA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-dlya-glubokogo-sna-slushat-onlayn.ts";
import { MUZYKA_DLYA_BYSTROGO_ZASYPANIYA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-dlya-bystrogo-zasypaniya-slushat-onlayn.ts";
import { MUZYKA_DLYA_KREPKOGO_SNA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-dlya-krepkogo-sna-slushat-onlayn.ts";
import { MUZYKA_DLYA_SNA_S_DOZHDEM_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-dlya-sna-s-dozhdem-slushat-onlayn.ts";
import { MUZYKA_DLYA_SNA_S_SHUMOM_DOZHDYA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-dlya-sna-s-shumom-dozhdya-slushat-onlayn.ts";
import { USPOKAIVAYUSHCHAYA_MUZYKA_DLYA_SNA_S_DOZHDEM_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/uspokaivayushchaya-muzyka-dlya-sna-s-dozhdem-slushat-onlayn.ts";
import { MUZYKA_DLYA_SNA_SO_ZVUKAMI_DOZHDYA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-dlya-sna-so-zvukami-dozhdya-slushat-onlayn.ts";
import { SPOKOYNAYA_MUZYKA_DLYA_SNA_S_DOZHDEM_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/spokoynaya-muzyka-dlya-sna-s-dozhdem-slushat-onlayn.ts";
import { RASSLABLYAYUSHCHAYA_MUZYKA_S_DOZHDEM_DLYA_SNA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/rasslablyayushchaya-muzyka-s-dozhdem-dlya-sna-slushat-onlayn.ts";
import { RELAKS_MUZYKA_S_DOZHDEM_DLYA_SNA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/relaks-muzyka-s-dozhdem-dlya-sna-slushat-onlayn.ts";
import { MUZYKA_DOZHDYA_I_GROZY_DLYA_SNA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-dozhdya-i-grozy-dlya-sna-slushat-onlayn.ts";
import { MUZYKA_S_KAPLYAMI_DOZHDYA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-s-kaplyami-dozhdya-dlya-sna-slushat-onlayn.ts";
import { USPOKAIVAYUSHCHAYA_MUZYKA_DLYA_SNA_S_DOZHDEM_I_PIANINO_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/uspokaivayushchaya-muzyka-dlya-sna-s-dozhdem-i-pianino-slushat-onlayn.ts";
import { RASSLABLYAYUSHCHAYA_MUZYKA_DLYA_SNA_S_KAPLYAMI_DOZHDYA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/rasslablyayushchaya-muzyka-dlya-sna-s-kaplyami-dozhdya-slushat-onlayn.ts";
import { listTopicHubDefinitions } from "../src/lib/seo/topic-hubs/index.ts";
import { STATIC_SITEMAP_PAGES } from "../src/lib/seo/sitemap-data.ts";
import {
  getVisiblePublicFooterLinks,
  PUBLIC_FOOTER_LINKS,
} from "../src/lib/navigation/public-footer-links.ts";
import { KAK_RAZVIT_LYUBOV_K_SEBE_ARTICLE } from "../src/lib/seo/articles/content/kak-razvit-lyubov-k-sebe.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relPath) {
  return readFileSync(join(ROOT, relPath), "utf8");
}

function testRouteExists() {
  const page = read("src/app/(platform)/(listener)/articles/page.tsx");
  assert(page.includes("ArticleDirectoryPageView"), "directory page uses view");
  assert(page.includes("loadArticleDirectoryPageData"), "directory page loads selector data");
  assert(page.includes("buildArticlesDirectoryMetadata"), "directory page sets metadata");
  assert(!page.includes("ARTICLE_DEFINITIONS"), "page does not embed a second registry");
}

function testH1AndCopy() {
  const data = loadArticleDirectoryPageData();
  assert(data.h1 === "Полезные материалы", "H1 copy");
  assert(data.h1 === ARTICLES_DIRECTORY_H1, "H1 constant");
  assert(data.intro.includes("медитациях"), "intro mentions meditations");
  assert(data.intro === ARTICLES_DIRECTORY_INTRO, "intro constant");
  assert(data.path === "/articles", "directory path");
  assert(data.path === ARTICLES_DIRECTORY_PATH, "path constant");

  const view = read("src/components/articles/ArticleDirectoryPageView.tsx");
  assert(view.includes("{data.h1}"), "view renders H1 from data");
  assert(view.includes('aria-labelledby="articles-list-heading"'), "articles section labelled");
  assert(view.includes("<ul"), "semantic article list");
}

function testMetadata() {
  const metadata = buildArticlesDirectoryMetadata();
  assert(metadata.title === ARTICLES_DIRECTORY_SEO_TITLE, "SEO title");
  assert(
    metadata.description === ARTICLES_DIRECTORY_META_DESCRIPTION,
    "meta description",
  );
  assert(
    metadata.alternates?.canonical === "https://audiolad.ru/articles",
    "self-referencing canonical",
  );
  assert(metadata.robots?.index === true, "indexable");
  assert(metadata.robots?.follow === true, "follow");
  assert(metadata.openGraph?.url === "https://audiolad.ru/articles", "OG url");
  assert(metadata.openGraph?.type === "website", "OG type website, not article");
}

function testRegistryIsSingleSource() {
  const registry = read("src/lib/seo/articles/registry.ts");
  const directory = read("src/lib/seo/articles/directory.ts");
  const page = read("src/app/(platform)/(listener)/articles/page.tsx");

  assert(registry.includes("ARTICLE_DEFINITIONS"), "central registry exists");
  assert(directory.includes("listArticleDefinitions()"), "selector reads registry");
  assert(
    directory.includes("listIndexableListenPageDefinitions()"),
    "selector reads listen registry",
  );
  assert(!directory.includes("ARTICLE_DEFINITIONS ="), "selector has no second array");
  assert(!page.includes('slug: "'), "page has no hardcoded article slugs");

  const cards = listArticleDirectoryCards();
  const registrySlugs = new Set(listArticleSlugs());

  for (const card of cards) {
    assert(registrySlugs.has(card.slug), `card ${card.slug} comes from registry`);
  }

  assert(
    cards.length === listArticleDefinitions().filter(isArticleDirectoryListed).length,
    "card count matches listed registry rows",
  );
}

function testOnlyListedArticlesShown() {
  const base = getArticleBySlug("kak-razvit-lyubov-k-sebe");
  assert(base, "base article exists");

  const draft = { ...base, slug: "draft-future-article", status: "draft" };
  const noindex = {
    ...base,
    slug: "noindex-future-article",
    indexable: false,
  };
  const broken = {
    ...base,
    slug: "broken article!!",
    title: "",
    publishedAt: "not-a-date",
  };

  assert(!isArticleDirectoryListed(draft), "draft excluded");
  assert(!isArticleDirectoryListed(noindex), "noindex excluded");
  assert(!isArticleDirectoryListed(broken), "broken entry excluded");

  const cards = listArticleDirectoryCards([base, draft, noindex, broken]);
  assert(cards.length === 1, "only listed article remains");
  assert(cards[0].slug === base.slug, "listed slug preserved");
}

function testSortNewestFirst() {
  const older = {
    ...KAK_RAZVIT_LYUBOV_K_SEBE_ARTICLE,
    slug: "older-article-sort-fixture",
    publishedAt: "2026-07-01T00:00:00.000Z",
  };
  const newer = {
    ...KAK_RAZVIT_LYUBOV_K_SEBE_ARTICLE,
    slug: "newer-article-sort-fixture",
    publishedAt: "2026-07-20T00:00:00.000Z",
  };

  assert(
    compareArticlesByPublishedAtDesc(newer, older) < 0,
    "newer sorts before older",
  );

  const cards = listArticleDirectoryCards([older, newer]);
  assert(cards[0].slug === "newer-article-sort-fixture", "newest first in selector");
  assert(cards[1].slug === "older-article-sort-fixture", "older second");
}

function testNewArticleAppearsAutomatically() {
  const existing = listArticleDirectoryCards();
  const existingSlugs = new Set(existing.map((card) => card.slug));
  const synthetic = {
    ...KAK_RAZVIT_LYUBOV_K_SEBE_ARTICLE,
    slug: "auto-listed-new-article-fixture",
    title: "Новая статья для каталога",
    publishedAt: "2099-01-01T00:00:00.000Z",
    metaDescription: "Короткое описание новой статьи для проверки каталога.",
  };

  assert(!existingSlugs.has(synthetic.slug), "fixture not in production registry");

  const withNew = listArticleDirectoryCards([
    ...listArticleDefinitions(),
    synthetic,
  ]);

  assert(
    withNew.some((card) => card.slug === synthetic.slug),
    "new published registry article appears automatically",
  );
  assert(withNew[0].slug === synthetic.slug, "newest synthetic article sorts first");
  assert(
    withNew.length === existing.length + 1,
    "selector grows without page edits",
  );
}

function testCardsHaveValidHrefsAndNoDuplicateSlugs() {
  const cards = listArticleDirectoryCards();
  assert(cards.length >= 1, "at least one published article");

  const seen = new Set();

  for (const card of cards) {
    assert(card.href === buildArticlePath(card.slug), `href for ${card.slug}`);
    assert(card.href.startsWith("/articles/"), `public href for ${card.slug}`);
    assert(card.title.trim().length > 0, `title for ${card.slug}`);
    assert(card.description.trim().length > 0, `description for ${card.slug}`);
    assert(card.readingTimeMinutes >= 1, `reading time for ${card.slug}`);
    assert(!seen.has(card.slug), `no duplicate slug ${card.slug}`);
    seen.add(card.slug);
  }
}

function testDescriptionFallback() {
  const withMeta = resolveArticleDirectoryDescription({
    title: "Заголовок",
    metaDescription: "Мета описание статьи.",
    shortAnswer: "Короткий ответ длиннее и не должен выиграть.",
    leadBeforeAudio: "Лид.",
  });
  assert(withMeta === "Мета описание статьи.", "metaDescription preferred");

  const withShort = resolveArticleDirectoryDescription({
    title: "Заголовок",
    metaDescription: "   ",
    shortAnswer: "Короткий подходящий ответ.",
    leadBeforeAudio: "Лид не нужен.",
  });
  assert(withShort === "Короткий подходящий ответ.", "shortAnswer fallback");

  const withLead = resolveArticleDirectoryDescription({
    title: "Заголовок",
    metaDescription: "",
    shortAnswer: "A".repeat(300),
    leadBeforeAudio:
      "Это достаточно длинный лид статьи, который должен стать безопасным fallback описанием карточки без полного текста.",
  });
  assert(withLead.includes("длинный лид"), "lead fallback used");
  assert(withLead.length < 200, "lead fallback truncated");
  assert(!withLead.includes("A".repeat(50)), "oversized shortAnswer skipped");

  const titleOnly = resolveArticleDirectoryDescription({
    title: "Только заголовок",
    metaDescription: "",
    shortAnswer: "",
    leadBeforeAudio: "",
  });
  assert(
    titleOnly.includes("Только заголовок"),
    "title-based safe fallback",
  );
}

function testTopicHubsFromRegistry() {
  const hubs = listArticleDirectoryTopicHubs();
  const registrySlugs = new Set(
    listTopicHubDefinitions().map((hub) => hub.slug),
  );

  assert(hubs.length === listTopicHubDefinitions().length, "all public hubs listed");

  for (const hub of hubs) {
    assert(registrySlugs.has(hub.slug), `hub ${hub.slug} from registry`);
    assert(hub.href === `/topics/${hub.slug}`, `hub href ${hub.slug}`);
    assert(hub.title.trim().length > 0, `hub title ${hub.slug}`);
  }

  const pageSource = read("src/components/articles/ArticleDirectoryPageView.tsx");
  assert(pageSource.includes("Темы"), "topics block heading");
  assert(!pageSource.includes("Популярные темы"), "no false popularity claim");
}

function testFooterContainsArticlesOnce() {
  const footer = read("src/components/LegalFooter.tsx");
  assert(
    footer.includes("getVisiblePublicFooterLinks"),
    "footer uses public links visibility helper",
  );
  assert(footer.includes('aria-label="Разделы платформы"'), "public nav label");
  assert(
    footer.includes("auth.getUser()"),
    "footer reads current user email on the server",
  );

  const articlesLinks = PUBLIC_FOOTER_LINKS.filter(
    (item) => item.href === "/articles",
  );
  assert(articlesLinks.length === 1, "exactly one /articles footer link");
  assert(articlesLinks[0].title === "Статьи", "footer label Статьи");

  const guestLinks = getVisiblePublicFooterLinks(null);
  const otherUserLinks = getVisiblePublicFooterLinks("user@example.com");
  const ownerLinks = getVisiblePublicFooterLinks("1@audiolad.ru");
  assert(
    guestLinks.every((item) => item.href !== "/articles"),
    "guest footer omits /articles",
  );
  assert(
    otherUserLinks.every((item) => item.href !== "/articles"),
    "other signed-in user footer omits /articles",
  );
  assert(
    ownerLinks.filter((item) => item.href === "/articles").length === 1,
    "owner email keeps one /articles footer link",
  );
  assert(
    ownerLinks.find((item) => item.href === "/articles")?.title === "Статьи",
    "owner footer keeps label Статьи",
  );
  assert(
    getVisiblePublicFooterLinks("1@Audiolad.ru").every(
      (item) => item.href !== "/articles",
    ),
    "articles footer link uses exact email match",
  );

  const helpLinks = PUBLIC_FOOTER_LINKS.filter((item) => item.href === "/help");
  assert(helpLinks.length === 1, "exactly one /help footer link");
  assert(
    helpLinks[0].title === "Помощь и поддержка",
    "footer label Помощь и поддержка",
  );
  assert(
    PUBLIC_FOOTER_LINKS.findIndex((item) => item.href === "/for-authors") <
      PUBLIC_FOOTER_LINKS.findIndex((item) => item.href === "/articles") &&
      PUBLIC_FOOTER_LINKS.findIndex((item) => item.href === "/articles") <
        PUBLIC_FOOTER_LINKS.findIndex((item) => item.href === "/help"),
    "footer order keeps for-authors before articles before help",
  );

  const hrefs = PUBLIC_FOOTER_LINKS.map((item) => item.href);
  assert(new Set(hrefs).size === hrefs.length, "no duplicate footer hrefs");

  const matches = footer.match(/\/articles/g) ?? [];
  assert(matches.length === 0, "LegalFooter has no hardcoded /articles string");
}

function testSitemapContainsDirectory() {
  assert(
    STATIC_SITEMAP_PAGES.some((page) => page.path === "/articles"),
    "/articles in STATIC_SITEMAP_PAGES",
  );

  const sitemapSource = read("src/lib/seo/sitemap-data.ts");
  const articlesStaticCount = (sitemapSource.match(/path: "\/articles"/g) ?? [])
    .length;
  assert(articlesStaticCount === 1, "no duplicate /articles static sitemap entry");
}

function testStructuredData() {
  const data = loadArticleDirectoryPageData();
  const graph = buildArticlesDirectoryJsonLdGraph(data);
  assert(graph["@context"] === "https://schema.org", "schema context");

  const nodes = graph["@graph"];
  assert(Array.isArray(nodes), "graph array");

  const collection = nodes.find((node) => node["@type"] === "CollectionPage");
  assert(collection, "CollectionPage present");
  assert(collection.url === "https://audiolad.ru/articles", "collection url");

  const itemList = collection.mainEntity;
  assert(itemList?.["@type"] === "ItemList", "ItemList present");
  assert(
    itemList.numberOfItems === data.articles.length,
    "ItemList count matches visible cards",
  );
  assert(
    itemList.numberOfItems !== 123 || data.articles.length === 123,
    "numberOfItems is not a stale hardcoded 123",
  );
  assert(
    itemList.itemListElement.length === data.articles.length,
    "ItemList elements match visible cards",
  );

  for (const [index, item] of itemList.itemListElement.entries()) {
    assert(item.position === index + 1, `ItemList position ${index + 1}`);
    assert(
      item.url === `https://audiolad.ru${data.articles[index].href}`,
      `ItemList url ${index + 1}`,
    );
    assert(item.name === data.articles[index].title, `ItemList name ${index + 1}`);
  }

  const breadcrumbs = nodes.find((node) => node["@type"] === "BreadcrumbList");
  assert(breadcrumbs, "BreadcrumbList present");
  assert(
    !nodes.some((node) => node["@type"] === "Article"),
    "no Article schema on directory page",
  );
}

function testListenPagesAppearInDirectory() {
  const data = loadArticleDirectoryPageData();
  const listenHref = "/listens/meditatsiya-na-dengi-slushat-onlayn-besplatno";
  const listenCard = data.articles.find((card) => card.href === listenHref);

  assert(listenCard, "indexable listen page is listed");
  assert(
    listenCard.title === "Медитация на деньги: слушать онлайн бесплатно",
    "listen directory title",
  );
  assert(
    listenCard.description === MEDITATSIYA_NA_DENGI_SLUSHAT_ONLAYN_BESPLATNO_PAGE.description,
    "listen directory description",
  );
  assert(listenCard.topicTitle === null, "listen has no invented topic");
  assert(listenCard.publishedAt == null, "listen has no invented publishedAt");
  assert(listenCard.readingTimeMinutes >= 1, "listen reading time from content");
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-na-dengi-slushat-onlayn-besplatno",
    ),
    "no /articles duplicate for listen slug",
  );

  const graph = buildArticlesDirectoryJsonLdGraph(data);
  const collection = graph["@graph"].find((node) => node["@type"] === "CollectionPage");
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${listenHref}`,
    ),
    "directory JSON-LD uses listen href",
  );
  assert(
    !collection.mainEntity.itemListElement.some((item) =>
      item.url.endsWith("/articles/meditatsiya-na-dengi-slushat-onlayn-besplatno"),
    ),
    "directory JSON-LD has no /articles listen duplicate",
  );

  const secondListenHref = "/listens/denezhnaya-meditatsiya-slushat-onlayn-besplatno";
  const secondListenCard = data.articles.find((card) => card.href === secondListenHref);
  assert(secondListenCard, "second indexable listen page is listed");
  assert(
    secondListenCard.title === "Денежная медитация: слушать онлайн бесплатно",
    "second listen directory title",
  );
  assert(
    secondListenCard.description === DENEZHNAYA_MEDITATSIYA_SLUSHAT_ONLAYN_BESPLATNO_PAGE.description,
    "second listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/denezhnaya-meditatsiya-slushat-onlayn-besplatno",
    ),
    "no /articles duplicate for second listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${secondListenHref}`,
    ),
    "directory JSON-LD includes second listen href",
  );

  const thirdListenHref = "/listens/meditatsiya-na-izobilie-slushat-onlayn-besplatno";
  const thirdListenCard = data.articles.find((card) => card.href === thirdListenHref);
  assert(thirdListenCard, "third indexable listen page is listed");
  assert(
    thirdListenCard.title === "Медитация на изобилие: слушать онлайн бесплатно",
    "third listen directory title",
  );
  assert(
    thirdListenCard.description === MEDITATSIYA_NA_IZOBILIE_SLUSHAT_ONLAYN_BESPLATNO_PAGE.description,
    "third listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-na-izobilie-slushat-onlayn-besplatno",
    ),
    "no /articles duplicate for third listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${thirdListenHref}`,
    ),
    "directory JSON-LD includes third listen href",
  );

  const fourthListenHref = "/listens/meditatsiya-na-bogatstvo-slushat-onlayn";
  const fourthListenCard = data.articles.find((card) => card.href === fourthListenHref);
  assert(fourthListenCard, "fourth indexable listen page is listed");
  assert(
    fourthListenCard.title === "Медитация на богатство: слушать онлайн | АудиоЛад",
    "fourth listen directory title",
  );
  assert(
    fourthListenCard.description === MEDITATSIYA_NA_BOGATSTVO_SLUSHAT_ONLAYN_PAGE.description,
    "fourth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-na-bogatstvo-slushat-onlayn",
    ),
    "no /articles duplicate for fourth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fourthListenHref}`,
    ),
    "directory JSON-LD includes fourth listen href",
  );

  const fifthListenHref = "/listens/meditatsiya-dlya-privlecheniya-deneg-bogatstva-i-izobiliya";
  const fifthListenCard = data.articles.find((card) => card.href === fifthListenHref);
  assert(fifthListenCard, "fifth indexable listen page is listed");
  assert(
    fifthListenCard.title === "Медитация для привлечения денег, богатства и изобилия | АудиоЛад",
    "fifth listen directory title",
  );
  assert(
    fifthListenCard.description === MEDITATSIYA_DLYA_PRIVLECHENIYA_DENEG_BOGATSTVA_I_IZOBILIYA_PAGE.description,
    "fifth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-privlecheniya-deneg-bogatstva-i-izobiliya",
    ),
    "no /articles duplicate for fifth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fifthListenHref}`,
    ),
    "directory JSON-LD includes fifth listen href",
  );

  const sixthListenHref = "/listens/meditatsiya-na-denezhnyy-potok-slushat-onlayn-besplatno";
  const sixthListenCard = data.articles.find((card) => card.href === sixthListenHref);
  assert(sixthListenCard, "sixth indexable listen page is listed");
  assert(
    sixthListenCard.title === "Медитация на денежный поток: слушать онлайн бесплатно | АудиоЛад",
    "sixth listen directory title",
  );
  assert(
    sixthListenCard.description === MEDITATSIYA_NA_DENEZHNYY_POTOK_SLUSHAT_ONLAYN_BESPLATNO_PAGE.description,
    "sixth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-na-denezhnyy-potok-slushat-onlayn-besplatno",
    ),
    "no /articles duplicate for sixth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${sixthListenHref}`,
    ),
    "directory JSON-LD includes sixth listen href",
  );

  const seventhListenHref = "/listens/meditatsiya-dlya-deneg-i-izobiliya-slushat-onlayn";
  const seventhListenCard = data.articles.find((card) => card.href === seventhListenHref);
  assert(seventhListenCard, "seventh indexable listen page is listed");
  assert(
    seventhListenCard.title === "Медитация для денег и изобилия: слушать онлайн | АудиоЛад",
    "seventh listen directory title",
  );
  assert(
    seventhListenCard.description === MEDITATSIYA_DLYA_DENEG_I_IZOBILIYA_SLUSHAT_ONLAYN_PAGE.description,
    "seventh listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-deneg-i-izobiliya-slushat-onlayn",
    ),
    "no /articles duplicate for seventh listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${seventhListenHref}`,
    ),
    "directory JSON-LD includes seventh listen href",
  );

  const eighthListenHref = "/listens/meditatsiya-na-dengi-i-izobilie-dlya-zhenshchin";
  const eighthListenCard = data.articles.find((card) => card.href === eighthListenHref);
  assert(eighthListenCard, "eighth indexable listen page is listed");
  assert(
    eighthListenCard.title === "Медитация на деньги и изобилие для женщин | АудиоЛад",
    "eighth listen directory title",
  );
  assert(
    eighthListenCard.description === MEDITATSIYA_NA_DENGI_I_IZOBILIE_DLYA_ZHENSHCHIN_PAGE.description,
    "eighth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-na-dengi-i-izobilie-dlya-zhenshchin",
    ),
    "no /articles duplicate for eighth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${eighthListenHref}`,
    ),
    "directory JSON-LD includes eighth listen href",
  );

  const ninthListenHref = "/listens/utrennyaya-meditatsiya-na-dengi-i-izobilie";
  const ninthListenCard = data.articles.find((card) => card.href === ninthListenHref);
  assert(ninthListenCard, "ninth indexable listen page is listed");
  assert(
    ninthListenCard.title === "Утренняя медитация на деньги и изобилие | АудиоЛад",
    "ninth listen directory title",
  );
  assert(
    ninthListenCard.description === UTRENNYAYA_MEDITATSIYA_NA_DENGI_I_IZOBILIE_PAGE.description,
    "ninth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/utrennyaya-meditatsiya-na-dengi-i-izobilie",
    ),
    "no /articles duplicate for ninth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${ninthListenHref}`,
    ),
    "directory JSON-LD includes ninth listen href",
  );

  const tenthListenHref = "/listens/meditatsiya-izobiliya-i-bogatstva-dlya-sna";
  const tenthListenCard = data.articles.find((card) => card.href === tenthListenHref);
  assert(tenthListenCard, "tenth indexable listen page is listed");
  assert(
    tenthListenCard.title === "Медитация изобилия и богатства для сна | АудиоЛад",
    "tenth listen directory title",
  );
  assert(
    tenthListenCard.description === MEDITATSIYA_IZOBILIYA_I_BOGATSTVA_DLYA_SNA_PAGE.description,
    "tenth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-izobiliya-i-bogatstva-dlya-sna",
    ),
    "no /articles duplicate for tenth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${tenthListenHref}`,
    ),
    "directory JSON-LD includes tenth listen href",
  );


  const eleventhListenHref = "/listens/shum-vody-slushat-onlayn";
  const eleventhListenCard = data.articles.find((card) => card.href === eleventhListenHref);
  assert(eleventhListenCard, "eleventh indexable listen page is listed");
  assert(
    eleventhListenCard.title === "Шум воды – слушать звуки воды онлайн бесплатно | АудиоЛад",
    "eleventh listen directory title",
  );
  assert(
    eleventhListenCard.description === SHUM_VODY_SLUSHAT_ONLAYN_PAGE.description,
    "eleventh listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/shum-vody-slushat-onlayn",
    ),
    "no /articles duplicate for eleventh listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${eleventhListenHref}`,
    ),
    "directory JSON-LD includes eleventh listen href",
  );

  const twelfthListenHref = "/listens/zhurchanie-vody-slushat-onlayn";
  const twelfthListenCard = data.articles.find((card) => card.href === twelfthListenHref);
  assert(twelfthListenCard, "twelfth indexable listen page is listed");
  assert(
    twelfthListenCard.title === "Журчание воды – слушать онлайн бесплатно | АудиоЛад",
    "twelfth listen directory title",
  );
  assert(
    twelfthListenCard.description === ZHURCHANIE_VODY_SLUSHAT_ONLAYN_PAGE.description,
    "twelfth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/zhurchanie-vody-slushat-onlayn",
    ),
    "no /articles duplicate for twelfth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twelfthListenHref}`,
    ),
    "directory JSON-LD includes twelfth listen href",
  );

  const thirteenthListenHref = "/listens/zvuk-vodopada-slushat-onlayn";
  const thirteenthListenCard = data.articles.find((card) => card.href === thirteenthListenHref);
  assert(thirteenthListenCard, "thirteenth indexable listen page is listed");
  assert(
    thirteenthListenCard.title === "Звук водопада – слушать шум водопада онлайн бесплатно | АудиоЛад",
    "thirteenth listen directory title",
  );
  assert(
    thirteenthListenCard.description === ZVUK_VODOPADA_SLUSHAT_ONLAYN_PAGE.description,
    "thirteenth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/zvuk-vodopada-slushat-onlayn",
    ),
    "no /articles duplicate for thirteenth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${thirteenthListenHref}`,
    ),
    "directory JSON-LD includes thirteenth listen href",
  );

  const fourteenthListenHref = "/listens/zvuk-ruchya-slushat-onlayn";
  const fourteenthListenCard = data.articles.find((card) => card.href === fourteenthListenHref);
  assert(fourteenthListenCard, "fourteenth indexable listen page is listed");
  assert(
    fourteenthListenCard.title === "Звук ручья – слушать журчание ручья онлайн бесплатно | АудиоЛад",
    "fourteenth listen directory title",
  );
  assert(
    fourteenthListenCard.description === ZVUK_RUCHYA_SLUSHAT_ONLAYN_PAGE.description,
    "fourteenth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/zvuk-ruchya-slushat-onlayn",
    ),
    "no /articles duplicate for fourteenth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fourteenthListenHref}`,
    ),
    "directory JSON-LD includes fourteenth listen href",
  );

  const fifteenthListenHref = "/listens/shum-vody-dlya-sna";
  const fifteenthListenCard = data.articles.find((card) => card.href === fifteenthListenHref);
  assert(fifteenthListenCard, "fifteenth indexable listen page is listed");
  assert(
    fifteenthListenCard.title === "Шум воды для сна – слушать онлайн бесплатно | АудиоЛад",
    "fifteenth listen directory title",
  );
  assert(
    fifteenthListenCard.description === SHUM_VODY_DLYA_SNA_PAGE.description,
    "fifteenth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/shum-vody-dlya-sna",
    ),
    "no /articles duplicate for fifteenth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fifteenthListenHref}`,
    ),
    "directory JSON-LD includes fifteenth listen href",
  );

  const sixteenthListenHref = "/listens/zvuk-lyushcheysya-vody-slushat-onlayn";
  const sixteenthListenCard = data.articles.find((card) => card.href === sixteenthListenHref);
  assert(sixteenthListenCard, "sixteenth indexable listen page is listed");
  assert(
    sixteenthListenCard.title === "Звук льющейся воды – слушать шум текущей воды онлайн | АудиоЛад",
    "sixteenth listen directory title",
  );
  assert(
    sixteenthListenCard.description === ZVUK_LYUSHCHEYSYA_VODY_SLUSHAT_ONLAYN_PAGE.description,
    "sixteenth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/zvuk-lyushcheysya-vody-slushat-onlayn",
    ),
    "no /articles duplicate for sixteenth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${sixteenthListenHref}`,
    ),
    "directory JSON-LD includes sixteenth listen href",
  );

  const seventeenthListenHref = "/listens/belyy-shum-vody-slushat-onlayn";
  const seventeenthListenCard = data.articles.find((card) => card.href === seventeenthListenHref);
  assert(seventeenthListenCard, "seventeenth indexable listen page is listed");
  assert(
    seventeenthListenCard.title === "Белый шум воды – слушать онлайн для сна бесплатно | АудиоЛад",
    "seventeenth listen directory title",
  );
  assert(
    seventeenthListenCard.description === BELYY_SHUM_VODY_SLUSHAT_ONLAYN_PAGE.description,
    "seventeenth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/belyy-shum-vody-slushat-onlayn",
    ),
    "no /articles duplicate for seventeenth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${seventeenthListenHref}`,
    ),
    "directory JSON-LD includes seventeenth listen href",
  );

  const eighteenthListenHref = "/listens/shum-vody-dlya-detey";
  const eighteenthListenCard = data.articles.find((card) => card.href === eighteenthListenHref);
  assert(eighteenthListenCard, "eighteenth indexable listen page is listed");
  assert(
    eighteenthListenCard.title === "Шум воды для детей – слушать онлайн для сна | АудиоЛад",
    "eighteenth listen directory title",
  );
  assert(
    eighteenthListenCard.description === SHUM_VODY_DLYA_DETEY_PAGE.description,
    "eighteenth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/shum-vody-dlya-detey",
    ),
    "no /articles duplicate for eighteenth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${eighteenthListenHref}`,
    ),
    "directory JSON-LD includes eighteenth listen href",
  );


  const nineteenthListenHref = "/listens/shum-vody-dlya-novorozhdennyh";
  const nineteenthListenCard = data.articles.find((card) => card.href === nineteenthListenHref);
  assert(nineteenthListenCard, "nineteenth indexable listen page is listed");
  assert(
    nineteenthListenCard.title === "Шум воды для новорождённых – слушать онлайн для сна | АудиоЛад",
    "nineteenth listen directory title",
  );
  assert(
    nineteenthListenCard.description === SHUM_VODY_DLYA_NOVOROZHDENNYH_PAGE.description,
    "nineteenth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/shum-vody-dlya-novorozhdennyh",
    ),
    "no /articles duplicate for nineteenth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${nineteenthListenHref}`,
    ),
    "directory JSON-LD includes nineteenth listen href",
  );

  const twentiethListenHref = "/listens/shum-vody-iz-krana-slushat-onlayn";
  const twentiethListenCard = data.articles.find((card) => card.href === twentiethListenHref);
  assert(twentiethListenCard, "twentieth indexable listen page is listed");
  assert(
    twentiethListenCard.title === "Шум воды из крана – слушать онлайн бесплатно | АудиоЛад",
    "twentieth listen directory title",
  );
  assert(
    twentiethListenCard.description === SHUM_VODY_IZ_KRANA_SLUSHAT_ONLAYN_PAGE.description,
    "twentieth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/shum-vody-iz-krana-slushat-onlayn",
    ),
    "no /articles duplicate for twentieth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twentiethListenHref}`,
    ),
    "directory JSON-LD includes twentieth listen href",
  );

  const twentyFirstListenHref = "/listens/muzyka-dlya-sna-slushat-onlayn";
  const twentyFirstListenCard = data.articles.find((card) => card.href === twentyFirstListenHref);
  assert(twentyFirstListenCard, "twenty-first indexable listen page is listed");
  assert(
    twentyFirstListenCard.title === "Музыка для сна – слушать онлайн бесплатно | АудиоЛад",
    "twenty-first listen directory title",
  );
  assert(
    twentyFirstListenCard.description === MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE.description,
    "twenty-first listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/muzyka-dlya-sna-slushat-onlayn",
    ),
    "no /articles duplicate for twenty-first listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twentyFirstListenHref}`,
    ),
    "directory JSON-LD includes twenty-first listen href",
  );

  const twentySecondListenHref = "/listens/uspokaivayushchaya-muzyka-dlya-sna-slushat-onlayn";
  const twentySecondListenCard = data.articles.find((card) => card.href === twentySecondListenHref);
  assert(twentySecondListenCard, "twenty-second indexable listen page is listed");
  assert(
    twentySecondListenCard.title === "Успокаивающая музыка для сна – слушать онлайн бесплатно | АудиоЛад",
    "twenty-second listen directory title",
  );
  assert(
    twentySecondListenCard.description === USPOKAIVAYUSHCHAYA_MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE.description,
    "twenty-second listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/uspokaivayushchaya-muzyka-dlya-sna-slushat-onlayn",
    ),
    "no /articles duplicate for twenty-second listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twentySecondListenHref}`,
    ),
    "directory JSON-LD includes twenty-second listen href",
  );

  const twentyThirdListenHref = "/listens/usyplyayushchaya-muzyka-dlya-sna-slushat-onlayn";
  const twentyThirdListenCard = data.articles.find((card) => card.href === twentyThirdListenHref);
  assert(twentyThirdListenCard, "twenty-third indexable listen page is listed");
  assert(
    twentyThirdListenCard.title === "Усыпляющая музыка для сна – слушать онлайн бесплатно | АудиоЛад",
    "twenty-third listen directory title",
  );
  assert(
    twentyThirdListenCard.description === USYPLYAYUSHCHAYA_MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE.description,
    "twenty-third listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/usyplyayushchaya-muzyka-dlya-sna-slushat-onlayn",
    ),
    "no /articles duplicate for twenty-third listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twentyThirdListenHref}`,
    ),
    "directory JSON-LD includes twenty-third listen href",
  );

  const twentyFourthListenHref = "/listens/muzyka-dlya-sna-bez-slov-slushat-onlayn";
  const twentyFourthListenCard = data.articles.find((card) => card.href === twentyFourthListenHref);
  assert(twentyFourthListenCard, "twenty-fourth indexable listen page is listed");
  assert(
    twentyFourthListenCard.title === "Музыка для сна без слов – слушать онлайн бесплатно | АудиоЛад",
    "twenty-fourth listen directory title",
  );
  assert(
    twentyFourthListenCard.description === MUZYKA_DLYA_SNA_BEZ_SLOV_SLUSHAT_ONLAYN_PAGE.description,
    "twenty-fourth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/muzyka-dlya-sna-bez-slov-slushat-onlayn",
    ),
    "no /articles duplicate for twenty-fourth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twentyFourthListenHref}`,
    ),
    "directory JSON-LD includes twenty-fourth listen href",
  );


  const twentyFifthListenHref = "/listens/meditatsiya-dlya-sna-slushat-onlayn-besplatno";
  const twentyFifthListenCard = data.articles.find((card) => card.href === twentyFifthListenHref);
  assert(twentyFifthListenCard, "twenty-fifth indexable listen page is listed");
  assert(
    twentyFifthListenCard.title === "Медитация для сна – слушать онлайн бесплатно | АудиоЛад",
    "twenty-fifth listen directory title",
  );
  assert(
    twentyFifthListenCard.description === MEDITATSIYA_DLYA_SNA_SLUSHAT_ONLAYN_BESPLATNO_PAGE.description,
    "twenty-fifth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-sna-slushat-onlayn-besplatno",
    ),
    "no /articles duplicate for twenty-fifth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twentyFifthListenHref}`,
    ),
    "directory JSON-LD includes twenty-fifth listen href",
  );


  const twentySixthListenHref = "/listens/meditatsiya-pered-snom-slushat-onlayn-besplatno";
  const twentySixthListenCard = data.articles.find((card) => card.href === twentySixthListenHref);
  assert(twentySixthListenCard, "twenty-sixth indexable listen page is listed");
  assert(
    twentySixthListenCard.title === "Медитация перед сном – слушать онлайн бесплатно | АудиоЛад",
    "twenty-sixth listen directory title",
  );
  assert(
    twentySixthListenCard.description === MEDITATSIYA_PERED_SNOM_SLUSHAT_ONLAYN_BESPLATNO_PAGE.description,
    "twenty-sixth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-pered-snom-slushat-onlayn-besplatno",
    ),
    "no /articles duplicate for twenty-sixth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twentySixthListenHref}`,
    ),
    "directory JSON-LD includes twenty-sixth listen href",
  );


  const twentySeventhListenHref = "/listens/meditatsiya-dlya-sna-i-rasslableniya-slushat-onlayn";
  const twentySeventhListenCard = data.articles.find((card) => card.href === twentySeventhListenHref);
  assert(twentySeventhListenCard, "twenty-seventh indexable listen page is listed");
  assert(
    twentySeventhListenCard.title === "Медитация для сна и расслабления – слушать онлайн | АудиоЛад",
    "twenty-seventh listen directory title",
  );
  assert(
    twentySeventhListenCard.description === MEDITATSIYA_DLYA_SNA_I_RASSLABLENIYA_SLUSHAT_ONLAYN_PAGE.description,
    "twenty-seventh listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-sna-i-rasslableniya-slushat-onlayn",
    ),
    "no /articles duplicate for twenty-seventh listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twentySeventhListenHref}`,
    ),
    "directory JSON-LD includes twenty-seventh listen href",
  );


  const twentyEighthListenHref = "/listens/meditatsiya-dlya-glubokogo-sna-slushat-onlayn";
  const twentyEighthListenCard = data.articles.find((card) => card.href === twentyEighthListenHref);
  assert(twentyEighthListenCard, "twenty-eighth indexable listen page is listed");
  assert(
    twentyEighthListenCard.title === "Медитация для глубокого сна – слушать онлайн | АудиоЛад",
    "twenty-eighth listen directory title",
  );
  assert(
    twentyEighthListenCard.description === MEDITATSIYA_DLYA_GLUBOKOGO_SNA_SLUSHAT_ONLAYN_PAGE.description,
    "twenty-eighth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-glubokogo-sna-slushat-onlayn",
    ),
    "no /articles duplicate for twenty-eighth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twentyEighthListenHref}`,
    ),
    "directory JSON-LD includes twenty-eighth listen href",
  );


  const twentyNinthListenHref = "/listens/meditatsiya-na-noch-slushat-pered-snom";
  const twentyNinthListenCard = data.articles.find((card) => card.href === twentyNinthListenHref);
  assert(twentyNinthListenCard, "twenty-ninth indexable listen page is listed");
  assert(
    twentyNinthListenCard.title === "Медитация на ночь – слушать перед сном онлайн | АудиоЛад",
    "twenty-ninth listen directory title",
  );
  assert(
    twentyNinthListenCard.description === MEDITATSIYA_NA_NOCH_SLUSHAT_PERED_SNOM_PAGE.description,
    "twenty-ninth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-na-noch-slushat-pered-snom",
    ),
    "no /articles duplicate for twenty-ninth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twentyNinthListenHref}`,
    ),
    "directory JSON-LD includes twenty-ninth listen href",
  );

  const thirtiethListenHref = "/listens/meditatsiya-dlya-horoshego-i-spokoynogo-sna";
  const thirtiethListenCard = data.articles.find((card) => card.href === thirtiethListenHref);
  assert(thirtiethListenCard, "thirtieth indexable listen page is listed");
  assert(
    thirtiethListenCard.title === "Медитация для хорошего и спокойного сна – слушать онлайн | АудиоЛад",
    "thirtieth listen directory title",
  );
  assert(
    thirtiethListenCard.description === MEDITATSIYA_DLYA_HOROSHEGO_I_SPOKOYNOGO_SNA_PAGE.description,
    "thirtieth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-horoshego-i-spokoynogo-sna",
    ),
    "no /articles duplicate for thirtieth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${thirtiethListenHref}`,
    ),
    "directory JSON-LD includes thirtieth listen href",
  );

  const thirtyFirstListenHref = "/listens/meditatsiya-dlya-sna-s-golosom-slushat-besplatno";
  const thirtyFirstListenCard = data.articles.find((card) => card.href === thirtyFirstListenHref);
  assert(thirtyFirstListenCard, "thirty-first indexable listen page is listed");
  assert(
    thirtyFirstListenCard.title === "Медитация для сна с голосом – слушать бесплатно | АудиоЛад",
    "thirty-first listen directory title",
  );
  assert(
    thirtyFirstListenCard.description === MEDITATSIYA_DLYA_SNA_S_GOLOSOM_SLUSHAT_BESPLATNO_PAGE.description,
    "thirty-first listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-sna-s-golosom-slushat-besplatno",
    ),
    "no /articles duplicate for thirty-first listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${thirtyFirstListenHref}`,
    ),
    "directory JSON-LD includes thirty-first listen href",
  );


  const thirtySecondListenHref = "/listens/meditatsiya-dlya-sna-bez-golosa-slushat-onlayn";
  const thirtySecondListenCard = data.articles.find((card) => card.href === thirtySecondListenHref);
  assert(thirtySecondListenCard, "thirty-second indexable listen page is listed");
  assert(
    thirtySecondListenCard.title === "Медитация для сна без голоса – слушать онлайн | АудиоЛад",
    "thirty-second listen directory title",
  );
  assert(
    thirtySecondListenCard.description === MEDITATSIYA_DLYA_SNA_BEZ_GOLOSA_SLUSHAT_ONLAYN_PAGE.description,
    "thirty-second listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-sna-bez-golosa-slushat-onlayn",
    ),
    "no /articles duplicate for thirty-second listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${thirtySecondListenHref}`,
    ),
    "directory JSON-LD includes thirty-second listen href",
  );




  const thirtyThirdListenHref = "/listens/meditatsiya-dlya-sna-bez-reklamy-slushat-besplatno";
  const thirtyThirdListenCard = data.articles.find((card) => card.href === thirtyThirdListenHref);
  assert(thirtyThirdListenCard, "thirty-third indexable listen page is listed");
  assert(
    thirtyThirdListenCard.title === "Медитация для сна без рекламы – слушать бесплатно | АудиоЛад",
    "thirty-third listen directory title",
  );
  assert(
    thirtyThirdListenCard.description === MEDITATSIYA_DLYA_SNA_BEZ_REKLAMY_SLUSHAT_BESPLATNO_PAGE.description,
    "thirty-third listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-sna-bez-reklamy-slushat-besplatno",
    ),
    "no /articles duplicate for thirty-third listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${thirtyThirdListenHref}`,
    ),
    "directory JSON-LD includes thirty-third listen href",
  );

  const thirtyFourthListenHref = "/listens/meditatsiya-dlya-sna-i-uspokoeniya-nervnoy-sistemy";
  const thirtyFourthListenCard = data.articles.find((card) => card.href === thirtyFourthListenHref);
  assert(thirtyFourthListenCard, "thirty-fourth indexable listen page is listed");
  assert(
    thirtyFourthListenCard.title === "Медитация для сна и успокоения нервной системы | АудиоЛад",
    "thirty-fourth listen directory title",
  );
  assert(
    thirtyFourthListenCard.description === MEDITATSIYA_DLYA_SNA_I_USPOKOENIYA_NERVNOY_SISTEMY_PAGE.description,
    "thirty-fourth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-sna-i-uspokoeniya-nervnoy-sistemy",
    ),
    "no /articles duplicate for thirty-fourth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${thirtyFourthListenHref}`,
    ),
    "directory JSON-LD includes thirty-fourth listen href",
  );

  const thirtyFifthListenHref = "/listens/meditatsiya-dlya-sna-dlya-zhenshchin-slushat-onlayn";
  const thirtyFifthListenCard = data.articles.find((card) => card.href === thirtyFifthListenHref);
  assert(thirtyFifthListenCard, "thirty-fifth indexable listen page is listed");
  assert(
    thirtyFifthListenCard.title === "Медитация для сна для женщин – слушать онлайн | АудиоЛад",
    "thirty-fifth listen directory title",
  );
  assert(
    thirtyFifthListenCard.description === MEDITATSIYA_DLYA_SNA_DLYA_ZHENSHCHIN_SLUSHAT_ONLAYN_PAGE.description,
    "thirty-fifth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-sna-dlya-zhenshchin-slushat-onlayn",
    ),
    "no /articles duplicate for thirty-fifth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${thirtyFifthListenHref}`,
    ),
    "directory JSON-LD includes thirty-fifth listen href",
  );

  const thirtySixthListenHref = "/listens/meditatsiya-dlya-zasypaniya-slushat-onlayn";
  const thirtySixthListenCard = data.articles.find((card) => card.href === thirtySixthListenHref);
  assert(thirtySixthListenCard, "thirty-sixth indexable listen page is listed");
  assert(
    thirtySixthListenCard.title === "Медитация для засыпания – слушать онлайн | АудиоЛад",
    "thirty-sixth listen directory title",
  );
  assert(
    thirtySixthListenCard.description === MEDITATSIYA_DLYA_ZASYPANIYA_SLUSHAT_ONLAYN_PAGE.description,
    "thirty-sixth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-zasypaniya-slushat-onlayn",
    ),
    "no /articles duplicate for thirty-sixth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${thirtySixthListenHref}`,
    ),
    "directory JSON-LD includes thirty-sixth listen href",
  );

  const thirtySeventhListenHref = "/listens/meditatsiya-dlya-sna-ot-stressa-i-trevogi";
  const thirtySeventhListenCard = data.articles.find((card) => card.href === thirtySeventhListenHref);
  assert(thirtySeventhListenCard, "thirty-seventh indexable listen page is listed");
  assert(
    thirtySeventhListenCard.title === "Медитация для сна от стресса и тревоги | АудиоЛад",
    "thirty-seventh listen directory title",
  );
  assert(
    thirtySeventhListenCard.description === MEDITATSIYA_DLYA_SNA_OT_STRESSA_I_TREVOGI_PAGE.description,
    "thirty-seventh listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-sna-ot-stressa-i-trevogi",
    ),
    "no /articles duplicate for thirty-seventh listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${thirtySeventhListenHref}`,
    ),
    "directory JSON-LD includes thirty-seventh listen href",
  );

  const thirtyEighthListenHref = "/listens/meditatsiya-dlya-sna-i-vosstanovleniya-sil";
  const thirtyEighthListenCard = data.articles.find((card) => card.href === thirtyEighthListenHref);
  assert(thirtyEighthListenCard, "thirty-eighth indexable listen page is listed");
  assert(
    thirtyEighthListenCard.title === "Медитация для сна и восстановления сил | АудиоЛад",
    "thirty-eighth listen directory title",
  );
  assert(
    thirtyEighthListenCard.description === MEDITATSIYA_DLYA_SNA_I_VOSSTANOVLENIYA_SIL_PAGE.description,
    "thirty-eighth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-sna-i-vosstanovleniya-sil",
    ),
    "no /articles duplicate for thirty-eighth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${thirtyEighthListenHref}`,
    ),
    "directory JSON-LD includes thirty-eighth listen href",
  );


  const thirtyNinthListenHref = "/listens/detskaya-muzyka-dlya-sna-slushat-onlayn";
  const thirtyNinthListenCard = data.articles.find((card) => card.href === thirtyNinthListenHref);
  assert(thirtyNinthListenCard, "thirty-ninth indexable listen page is listed");
  assert(
    thirtyNinthListenCard.title === "Детская музыка для сна – слушать онлайн бесплатно | АудиоЛад",
    "thirty-ninth listen directory title",
  );
  assert(
    thirtyNinthListenCard.description === DETSKAYA_MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE.description,
    "thirty-ninth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/detskaya-muzyka-dlya-sna-slushat-onlayn",
    ),
    "no /articles duplicate for thirty-ninth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${thirtyNinthListenHref}`,
    ),
    "directory JSON-LD includes thirty-ninth listen href",
  );


  const fortiethListenHref = "/listens/muzyka-dlya-sna-dlya-malyshey-slushat-onlayn";
  const fortiethListenCard = data.articles.find((card) => card.href === fortiethListenHref);
  assert(fortiethListenCard, "fortieth indexable listen page is listed");
  assert(
    fortiethListenCard.title === "Музыка для сна для малышей – слушать онлайн бесплатно | АудиоЛад",
    "fortieth listen directory title",
  );
  assert(
    fortiethListenCard.description === MUZYKA_DLYA_SNA_DLYA_MALYSHEY_SLUSHAT_ONLAYN_PAGE.description,
    "fortieth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/muzyka-dlya-sna-dlya-malyshey-slushat-onlayn",
    ),
    "no /articles duplicate for fortieth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fortiethListenHref}`,
    ),
    "directory JSON-LD includes fortieth listen href",
  );



  const fortyFirstListenHref = "/listens/muzyka-dlya-novorozhdennyh-dlya-sna-slushat-onlayn";
  const fortyFirstListenCard = data.articles.find((card) => card.href === fortyFirstListenHref);
  assert(fortyFirstListenCard, "forty-first indexable listen page is listed");
  assert(
    fortyFirstListenCard.title === "Музыка для новорождённых для сна – слушать онлайн бесплатно | АудиоЛад",
    "forty-first listen directory title",
  );
  assert(
    fortyFirstListenCard.description === MUZYKA_DLYA_NOVOROZHDENNYH_DLYA_SNA_SLUSHAT_ONLAYN_PAGE.description,
    "forty-first listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/muzyka-dlya-novorozhdennyh-dlya-sna-slushat-onlayn",
    ),
    "no /articles duplicate for forty-first listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fortyFirstListenHref}`,
    ),
    "directory JSON-LD includes forty-first listen href",
  );

  const fortySecondListenHref = "/listens/muzyka-dlya-sna-mladencev-slushat-onlayn";
  const fortySecondListenCard = data.articles.find((card) => card.href === fortySecondListenHref);
  assert(fortySecondListenCard, "forty-second indexable listen page is listed");
  assert(
    fortySecondListenCard.title === "Музыка для сна младенцев – слушать онлайн бесплатно | АудиоЛад",
    "forty-second listen directory title",
  );
  assert(
    fortySecondListenCard.description === MUZYKA_DLYA_SNA_MLADENCEV_SLUSHAT_ONLAYN_PAGE.description,
    "forty-second listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/muzyka-dlya-sna-mladencev-slushat-onlayn",
    ),
    "no /articles duplicate for forty-second listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fortySecondListenHref}`,
    ),
    "directory JSON-LD includes forty-second listen href",
  );


  const fortyThirdListenHref = "/listens/muzyka-dlya-sna-grudnichkov-slushat-onlayn";
  const fortyThirdListenCard = data.articles.find((card) => card.href === fortyThirdListenHref);
  assert(fortyThirdListenCard, "forty-third indexable listen page is listed");
  assert(
    fortyThirdListenCard.title === "Музыка для сна грудничков – слушать онлайн бесплатно | АудиоЛад",
    "forty-third listen directory title",
  );
  assert(
    fortyThirdListenCard.description === MUZYKA_DLYA_SNA_GRUDNICHKOV_SLUSHAT_ONLAYN_PAGE.description,
    "forty-third listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/muzyka-dlya-sna-grudnichkov-slushat-onlayn",
    ),
    "no /articles duplicate for forty-third listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fortyThirdListenHref}`,
    ),
    "directory JSON-LD includes forty-third listen href",
  );





  const fortyFourthListenHref = "/listens/uspokaivayushchaya-muzyka-dlya-detey-slushat-onlayn";
  const fortyFourthListenCard = data.articles.find((card) => card.href === fortyFourthListenHref);
  assert(fortyFourthListenCard, "forty-fourth indexable listen page is listed");
  assert(
    fortyFourthListenCard.title === "Успокаивающая музыка для детей – слушать онлайн бесплатно | АудиоЛад",
    "forty-fourth listen directory title",
  );
  assert(
    fortyFourthListenCard.description === USPOKAIVAYUSHCHAYA_MUZYKA_DLYA_DETEY_SLUSHAT_ONLAYN_PAGE.description,
    "forty-fourth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/uspokaivayushchaya-muzyka-dlya-detey-slushat-onlayn",
    ),
    "no /articles duplicate for forty-fourth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fortyFourthListenHref}`,
    ),
    "directory JSON-LD includes forty-fourth listen href",
  );




  const fortyFifthListenHref = "/listens/kolybelnye-dlya-malyshey-slushat-onlayn";
  const fortyFifthListenCard = data.articles.find((card) => card.href === fortyFifthListenHref);
  assert(fortyFifthListenCard, "forty-fifth indexable listen page is listed");
  assert(
    fortyFifthListenCard.title === "Колыбельные для малышей – слушать онлайн бесплатно | АудиоЛад",
    "forty-fifth listen directory title",
  );
  assert(
    fortyFifthListenCard.description === KOLYBELNYE_DLYA_MALYSHEY_SLUSHAT_ONLAYN_PAGE.description,
    "forty-fifth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/kolybelnye-dlya-malyshey-slushat-onlayn",
    ),
    "no /articles duplicate for forty-fifth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fortyFifthListenHref}`,
    ),
    "directory JSON-LD includes forty-fifth listen href",
  );



  const fortySixthListenHref = "/listens/muzyka-dlya-sna-detyam-bez-slov-slushat-onlayn";
  const fortySixthListenCard = data.articles.find((card) => card.href === fortySixthListenHref);
  assert(fortySixthListenCard, "forty-sixth indexable listen page is listed");
  assert(
    fortySixthListenCard.title === "Музыка для сна детям без слов – слушать онлайн бесплатно | АудиоЛад",
    "forty-sixth listen directory title",
  );
  assert(
    fortySixthListenCard.description === MUZYKA_DLYA_SNA_DETYAM_BEZ_SLOV_SLUSHAT_ONLAYN_PAGE.description,
    "forty-sixth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/muzyka-dlya-sna-detyam-bez-slov-slushat-onlayn",
    ),
    "no /articles duplicate for forty-sixth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fortySixthListenHref}`,
    ),
    "directory JSON-LD includes forty-sixth listen href",
  );



  const fortySeventhListenHref = "/listens/relaks-muzyka-dlya-sna-slushat-onlayn";
  const fortySeventhListenCard = data.articles.find((card) => card.href === fortySeventhListenHref);
  assert(fortySeventhListenCard, "forty-seventh indexable listen page is listed");
  assert(
    fortySeventhListenCard.title === "Релакс музыка для сна – слушать онлайн бесплатно | АудиоЛад",
    "forty-seventh listen directory title",
  );
  assert(
    fortySeventhListenCard.description === RELAKS_MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE.description,
    "forty-seventh listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/relaks-muzyka-dlya-sna-slushat-onlayn",
    ),
    "no /articles duplicate for forty-seventh listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fortySeventhListenHref}`,
    ),
    "directory JSON-LD includes forty-seventh listen href",
  );

  const fortyEighthListenHref = "/listens/rasslablyayushchaya-muzyka-dlya-sna-slushat-onlayn";
  const fortyEighthListenCard = data.articles.find((card) => card.href === fortyEighthListenHref);
  assert(fortyEighthListenCard, "forty-eighth indexable listen page is listed");
  assert(
    fortyEighthListenCard.title === "Расслабляющая музыка для сна – слушать онлайн бесплатно | АудиоЛад",
    "forty-eighth listen directory title",
  );
  assert(
    fortyEighthListenCard.description === RASSLABLYAYUSHCHAYA_MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE.description,
    "forty-eighth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/rasslablyayushchaya-muzyka-dlya-sna-slushat-onlayn",
    ),
    "no /articles duplicate for forty-eighth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fortyEighthListenHref}`,
    ),
    "directory JSON-LD includes forty-eighth listen href",
  );

  const fortyNinthListenHref = "/listens/spokoynaya-muzyka-dlya-sna-slushat-onlayn";
  const fortyNinthListenCard = data.articles.find((card) => card.href === fortyNinthListenHref);
  assert(fortyNinthListenCard, "forty-ninth indexable listen page is listed");
  assert(
    fortyNinthListenCard.title === "Спокойная музыка для сна – слушать онлайн бесплатно | АудиоЛад",
    "forty-ninth listen directory title",
  );
  assert(
    fortyNinthListenCard.description === SPOKOYNAYA_MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE.description,
    "forty-ninth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/spokoynaya-muzyka-dlya-sna-slushat-onlayn",
    ),
    "no /articles duplicate for forty-ninth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fortyNinthListenHref}`,
    ),
    "directory JSON-LD includes forty-ninth listen href",
  );




  const fiftiethListenHref = "/listens/muzyka-dlya-snyatiya-stressa-i-rasslableniya-slushat-onlayn";
  const fiftiethListenCard = data.articles.find((card) => card.href === fiftiethListenHref);
  assert(fiftiethListenCard, "fiftieth indexable listen page is listed");
  assert(
    fiftiethListenCard.title === "Музыка для снятия стресса и расслабления – слушать онлайн бесплатно | АудиоЛад",
    "fiftieth listen directory title",
  );
  assert(
    fiftiethListenCard.description === MUZYKA_DLYA_SNYATIYA_STRESSA_I_RASSLABLENIYA_SLUSHAT_ONLAYN_PAGE.description,
    "fiftieth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/muzyka-dlya-snyatiya-stressa-i-rasslableniya-slushat-onlayn",
    ),
    "no /articles duplicate for fiftieth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fiftiethListenHref}`,
    ),
    "directory JSON-LD includes fiftieth listen href",
  );

  const fiftyFirstListenHref = "/listens/rasslablyayushchaya-muzyka-bez-slov-slushat-onlayn";
  const fiftyFirstListenCard = data.articles.find((card) => card.href === fiftyFirstListenHref);
  assert(fiftyFirstListenCard, "fifty-first indexable listen page is listed");
  assert(
    fiftyFirstListenCard.title === "Расслабляющая музыка без слов – слушать онлайн бесплатно | АудиоЛад",
    "fifty-first listen directory title",
  );
  assert(
    fiftyFirstListenCard.description === RASSLABLYAYUSHCHAYA_MUZYKA_BEZ_SLOV_SLUSHAT_ONLAYN_PAGE.description,
    "fifty-first listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/rasslablyayushchaya-muzyka-bez-slov-slushat-onlayn",
    ),
    "no /articles duplicate for fifty-first listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fiftyFirstListenHref}`,
    ),
    "directory JSON-LD includes fifty-first listen href",
  );

  const fiftySecondListenHref = "/listens/muzyka-dlya-sna-i-meditacii-slushat-onlayn";
  const fiftySecondListenCard = data.articles.find((card) => card.href === fiftySecondListenHref);
  assert(fiftySecondListenCard, "fifty-second indexable listen page is listed");
  assert(
    fiftySecondListenCard.title === "Музыка для сна и медитации – слушать онлайн бесплатно | АудиоЛад",
    "fifty-second listen directory title",
  );
  assert(
    fiftySecondListenCard.description === MUZYKA_DLYA_SNA_I_MEDITACII_SLUSHAT_ONLAYN_PAGE.description,
    "fifty-second listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/muzyka-dlya-sna-i-meditacii-slushat-onlayn",
    ),
    "no /articles duplicate for fifty-second listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fiftySecondListenHref}`,
    ),
    "directory JSON-LD includes fifty-second listen href",
  );

  const fiftyThirdListenHref = "/listens/taro-dengi";
  const fiftyThirdListenCard = data.articles.find((card) => card.href === fiftyThirdListenHref);
  assert(fiftyThirdListenCard, "fifty-third indexable listen page is listed");
  assert(
    fiftyThirdListenCard.title === "Таро деньги – карты и финансовая ситуация | АудиоЛад",
    "fifty-third listen directory title",
  );
  assert(
    fiftyThirdListenCard.description === TARO_DENGI_PAGE.description,
    "fifty-third listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-dengi",
    ),
    "no /articles duplicate for fifty-third listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fiftyThirdListenHref}`,
    ),
    "directory JSON-LD includes fifty-third listen href",
  );

  const fiftyFourthListenHref = "/listens/taro-bolshih-deneg";
  const fiftyFourthListenCard = data.articles.find((card) => card.href === fiftyFourthListenHref);
  assert(fiftyFourthListenCard, "fifty-fourth indexable listen page is listed");
  assert(
    fiftyFourthListenCard.title === "Таро больших денег – крупные финансовые цели | АудиоЛад",
    "fifty-fourth listen directory title",
  );
  assert(
    fiftyFourthListenCard.description === TARO_BOLSHIH_DENEG_PAGE.description,
    "fifty-fourth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-bolshih-deneg",
    ),
    "no /articles duplicate for fifty-fourth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fiftyFourthListenHref}`,
    ),
    "directory JSON-LD includes fifty-fourth listen href",
  );

  const fiftyFifthListenHref = "/listens/taro-bogatstva-i-dengi";
  const fiftyFifthListenCard = data.articles.find((card) => card.href === fiftyFifthListenHref);
  assert(fiftyFifthListenCard, "fifty-fifth indexable listen page is listed");
  assert(
    fiftyFifthListenCard.title === "Таро богатства и деньги – достаток и благополучие | АудиоЛад",
    "fifty-fifth listen directory title",
  );
  assert(
    fiftyFifthListenCard.description === TARO_BOGATSTVA_I_DENGI_PAGE.description,
    "fifty-fifth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-bogatstva-i-dengi",
    ),
    "no /articles duplicate for fifty-fifth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fiftyFifthListenHref}`,
    ),
    "directory JSON-LD includes fifty-fifth listen href",
  );



  const fiftySixthListenHref = "/listens/karta-taro-na-dengi";
  const fiftySixthListenCard = data.articles.find((card) => card.href === fiftySixthListenHref);
  assert(fiftySixthListenCard, "fifty-sixth indexable listen page is listed");
  assert(
    fiftySixthListenCard.title === "Карта Таро на деньги – какие карты означают финансы | АудиоЛад",
    "fifty-sixth listen directory title",
  );
  assert(
    fiftySixthListenCard.description === KARTA_TARO_NA_DENGI_PAGE.description,
    "fifty-sixth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/karta-taro-na-dengi",
    ),
    "no /articles duplicate for fifty-sixth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fiftySixthListenHref}`,
    ),
    "directory JSON-LD includes fifty-sixth listen href",
  );

  const fiftySeventhListenHref = "/listens/taro-privlechenie-deneg";
  const fiftySeventhListenCard = data.articles.find((card) => card.href === fiftySeventhListenHref);
  assert(fiftySeventhListenCard, "fifty-seventh indexable listen page is listed");
  assert(
    fiftySeventhListenCard.title === "Таро привлечение денег – карты и финансовые возможности | АудиоЛад",
    "fifty-seventh listen directory title",
  );
  assert(
    fiftySeventhListenCard.description === TARO_PRIVLECHENIE_DENEG_PAGE.description,
    "fifty-seventh listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-privlechenie-deneg",
    ),
    "no /articles duplicate for fifty-seventh listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fiftySeventhListenHref}`,
    ),
    "directory JSON-LD includes fifty-seventh listen href",
  );

  const fiftyEighthListenHref = "/listens/karta-taro-dlya-privlecheniya-deneg";
  const fiftyEighthListenCard = data.articles.find((card) => card.href === fiftyEighthListenHref);
  assert(fiftyEighthListenCard, "fifty-eighth indexable listen page is listed");
  assert(
    fiftyEighthListenCard.title === "Карта Таро для привлечения денег – какие карты выбирают | АудиоЛад",
    "fifty-eighth listen directory title",
  );
  assert(
    fiftyEighthListenCard.description === KARTA_TARO_DLYA_PRIVLECHENIYA_DENEG_PAGE.description,
    "fifty-eighth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/karta-taro-dlya-privlecheniya-deneg",
    ),
    "no /articles duplicate for fifty-eighth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fiftyEighthListenHref}`,
    ),
    "directory JSON-LD includes fifty-eighth listen href",
  );

  const fiftyNinthListenHref = "/listens/taro-na-dengi-na-zastavku-telefona";
  const fiftyNinthListenCard = data.articles.find((card) => card.href === fiftyNinthListenHref);
  assert(fiftyNinthListenCard, "fifty-ninth indexable listen page is listed");
  assert(
    fiftyNinthListenCard.title === "Таро на деньги на заставку телефона – какую карту выбрать | АудиоЛад",
    "fifty-ninth listen directory title",
  );
  assert(
    fiftyNinthListenCard.description === TARO_NA_DENGI_NA_ZASTAVKU_TELEFONA_PAGE.description,
    "fifty-ninth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-na-dengi-na-zastavku-telefona",
    ),
    "no /articles duplicate for fifty-ninth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fiftyNinthListenHref}`,
    ),
    "directory JSON-LD includes fifty-ninth listen href",
  );

  const sixtiethListenHref = "/listens/rasklad-taro-na-dengi";
  const sixtiethListenCard = data.articles.find((card) => card.href === sixtiethListenHref);
  assert(sixtiethListenCard, "sixtieth indexable listen page is listed");
  assert(
    sixtiethListenCard.title === "Расклад Таро на деньги – схема и вопросы о финансах | АудиоЛад",
    "sixtieth listen directory title",
  );
  assert(
    sixtiethListenCard.description === RASKLAD_TARO_NA_DENGI_PAGE.description,
    "sixtieth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/rasklad-taro-na-dengi",
    ),
    "no /articles duplicate for sixtieth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${sixtiethListenHref}`,
    ),
    "directory JSON-LD includes sixtieth listen href",
  );

  const sixtyFirstListenHref = "/listens/taro-na-dengi-i-udachu";
  const sixtyFirstListenCard = data.articles.find((card) => card.href === sixtyFirstListenHref);
  assert(sixtyFirstListenCard, "sixty-first indexable listen page is listed");
  assert(
    sixtyFirstListenCard.title === "Таро на деньги и удачу – карты, возможности и финансы | АудиоЛад",
    "sixty-first listen directory title",
  );
  assert(
    sixtyFirstListenCard.description === TARO_NA_DENGI_I_UDACHU_PAGE.description,
    "sixty-first listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-na-dengi-i-udachu",
    ),
    "no /articles duplicate for sixty-first listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${sixtyFirstListenHref}`,
    ),
    "directory JSON-LD includes sixty-first listen href",
  );



  const sixtySecondListenHref = "/listens/budut-li-dengi-taro";
  const sixtySecondListenCard = data.articles.find((card) => card.href === sixtySecondListenHref);
  assert(sixtySecondListenCard, "sixty-second indexable listen page is listed");
  assert(
    sixtySecondListenCard.title === "Будут ли деньги – Таро и финансовая ситуация | АудиоЛад",
    "sixty-second listen directory title",
  );
  assert(
    sixtySecondListenCard.description === BUDUT_LI_DENGI_TARO_PAGE.description,
    "sixty-second listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/budut-li-dengi-taro",
    ),
    "no /articles duplicate for sixty-second listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${sixtySecondListenHref}`,
    ),
    "directory JSON-LD includes sixty-second listen href",
  );

  const sixtyThirdListenHref = "/listens/taro-na-dengi-v-blizhayshee-vremya";
  const sixtyThirdListenCard = data.articles.find((card) => card.href === sixtyThirdListenHref);
  assert(sixtyThirdListenCard, "sixty-third indexable listen page is listed");
  assert(
    sixtyThirdListenCard.title === "Таро на деньги в ближайшее время – финансовый период | АудиоЛад",
    "sixty-third listen directory title",
  );
  assert(
    sixtyThirdListenCard.description === TARO_NA_DENGI_V_BLIZHAYSHEE_VREMYA_PAGE.description,
    "sixty-third listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-na-dengi-v-blizhayshee-vremya",
    ),
    "no /articles duplicate for sixty-third listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${sixtyThirdListenHref}`,
    ),
    "directory JSON-LD includes sixty-third listen href",
  );


  const sixtyFourthListenHref = "/listens/taro-dohody";
  const sixtyFourthListenCard = data.articles.find((card) => card.href === sixtyFourthListenHref);
  assert(sixtyFourthListenCard, "sixty-fourth indexable listen page is listed");
  assert(
    sixtyFourthListenCard.title === "Таро доходы – заработок и источники денег | АудиоЛад",
    "sixty-fourth listen directory title",
  );
  assert(
    sixtyFourthListenCard.description === TARO_DOHODY_PAGE.description,
    "sixty-fourth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-dohody",
    ),
    "no /articles duplicate for sixty-fourth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${sixtyFourthListenHref}`,
    ),
    "directory JSON-LD includes sixty-fourth listen href",
  );

  const sixtyFifthListenHref = "/listens/taro-rabota-i-finansy";
  const sixtyFifthListenCard = data.articles.find((card) => card.href === sixtyFifthListenHref);
  assert(sixtyFifthListenCard, "sixty-fifth indexable listen page is listed");
  assert(
    sixtyFifthListenCard.title === "Таро работа и финансы – работа, деньги и заработок | АудиоЛад",
    "sixty-fifth listen directory title",
  );
  assert(
    sixtyFifthListenCard.description === TARO_RABOTA_I_FINANSY_PAGE.description,
    "sixty-fifth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-rabota-i-finansy",
    ),
    "no /articles duplicate for sixty-fifth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${sixtyFifthListenHref}`,
    ),
    "directory JSON-LD includes sixty-fifth listen href",
  );

  const sixtySixthListenHref = "/listens/taro-rabota";
  const sixtySixthListenCard = data.articles.find((card) => card.href === sixtySixthListenHref);
  assert(sixtySixthListenCard, "sixty-sixth indexable listen page is listed");
  assert(
    sixtySixthListenCard.title === "Таро работа – что происходит в работе и на что обратить внимание | АудиоЛад",
    "sixty-sixth listen directory title",
  );
  assert(
    sixtySixthListenCard.description === TARO_RABOTA_PAGE.description,
    "sixty-sixth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-rabota",
    ),
    "no /articles duplicate for sixty-sixth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${sixtySixthListenHref}`,
    ),
    "directory JSON-LD includes sixty-sixth listen href",
  );

  const sixtySeventhListenHref = "/listens/taro-na-rabotu";
  const sixtySeventhListenCard = data.articles.find((card) => card.href === sixtySeventhListenHref);
  assert(sixtySeventhListenCard, "sixty-seventh indexable listen page is listed");
  assert(
    sixtySeventhListenCard.title === "Таро на работу – рабочая ситуация и вопросы к картам | АудиоЛад",
    "sixty-seventh listen directory title",
  );
  assert(
    sixtySeventhListenCard.description === TARO_NA_RABOTU_PAGE.description,
    "sixty-seventh listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-na-rabotu",
    ),
    "no /articles duplicate for sixty-seventh listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${sixtySeventhListenHref}`,
    ),
    "directory JSON-LD includes sixty-seventh listen href",
  );

  const sixtyEighthListenHref = "/listens/rasklad-taro-na-rabotu";
  const sixtyEighthListenCard = data.articles.find((card) => card.href === sixtyEighthListenHref);
  assert(sixtyEighthListenCard, "sixty-eighth indexable listen page is listed");
  assert(
    sixtyEighthListenCard.title === "Расклад Таро на работу – схема и позиции карт | АудиоЛад",
    "sixty-eighth listen directory title",
  );
  assert(
    sixtyEighthListenCard.description === RASKLAD_TARO_NA_RABOTU_PAGE.description,
    "sixty-eighth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/rasklad-taro-na-rabotu",
    ),
    "no /articles duplicate for sixty-eighth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${sixtyEighthListenHref}`,
    ),
    "directory JSON-LD includes sixty-eighth listen href",
  );

  const sixtyNinthListenHref = "/listens/karty-taro-na-rabotu";
  const sixtyNinthListenCard = data.articles.find((card) => card.href === sixtyNinthListenHref);
  assert(sixtyNinthListenCard, "sixty-ninth indexable listen page is listed");
  assert(
    sixtyNinthListenCard.title === "Карты Таро на работу – значения карт в рабочих вопросах | АудиоЛад",
    "sixty-ninth listen directory title",
  );
  assert(
    sixtyNinthListenCard.description === KARTY_TARO_NA_RABOTU_PAGE.description,
    "sixty-ninth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/karty-taro-na-rabotu",
    ),
    "no /articles duplicate for sixty-ninth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${sixtyNinthListenHref}`,
    ),
    "directory JSON-LD includes sixty-ninth listen href",
  );

  const seventiethListenHref = "/listens/taro-novaya-rabota";
  const seventiethListenCard = data.articles.find((card) => card.href === seventiethListenHref);
  assert(seventiethListenCard, "seventieth indexable listen page is listed");
  assert(
    seventiethListenCard.title === "Таро новая работа – переход и новое место через карты | АудиоЛад",
    "seventieth listen directory title",
  );
  assert(
    seventiethListenCard.description === TARO_NOVAYA_RABOTA_PAGE.description,
    "seventieth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-novaya-rabota",
    ),
    "no /articles duplicate for seventieth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${seventiethListenHref}`,
    ),
    "directory JSON-LD includes seventieth listen href",
  );

  const seventyFirstListenHref = "/listens/rasklad-taro-na-novuyu-rabotu";
  const seventyFirstListenCard = data.articles.find((card) => card.href === seventyFirstListenHref);
  assert(seventyFirstListenCard, "seventy-first indexable listen page is listed");
  assert(
    seventyFirstListenCard.title === "Расклад Таро на новую работу – схема на новое место | АудиоЛад",
    "seventy-first listen directory title",
  );
  assert(
    seventyFirstListenCard.description === RASKLAD_TARO_NA_NOVUYU_RABOTU_PAGE.description,
    "seventy-first listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/rasklad-taro-na-novuyu-rabotu",
    ),
    "no /articles duplicate for seventy-first listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${seventyFirstListenHref}`,
    ),
    "directory JSON-LD includes seventy-first listen href",
  );

  const seventySecondListenHref = "/listens/taro-byvshaya-rabota";
  const seventySecondListenCard = data.articles.find((card) => card.href === seventySecondListenHref);
  assert(seventySecondListenCard, "seventy-second indexable listen page is listed");
  assert(
    seventySecondListenCard.title === "Таро бывшая работа – прошлое место и незавершённые вопросы | АудиоЛад",
    "seventy-second listen directory title",
  );
  assert(
    seventySecondListenCard.description === TARO_BYVSHAYA_RABOTA_PAGE.description,
    "seventy-second listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-byvshaya-rabota",
    ),
    "no /articles duplicate for seventy-second listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${seventySecondListenHref}`,
    ),
    "directory JSON-LD includes seventy-second listen href",
  );

  const seventyThirdListenHref = "/listens/taro-rabota-blizhayshee-budushchee";
  const seventyThirdListenCard = data.articles.find((card) => card.href === seventyThirdListenHref);
  assert(seventyThirdListenCard, "seventy-third indexable listen page is listed");
  assert(
    seventyThirdListenCard.title === "Таро работа – ближайшее будущее и рабочая ситуация | АудиоЛад",
    "seventy-third listen directory title",
  );
  assert(
    seventyThirdListenCard.description === TARO_RABOTA_BLIZHAYSHEE_BUDUSHCHEE_PAGE.description,
    "seventy-third listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-rabota-blizhayshee-budushchee",
    ),
    "no /articles duplicate for seventy-third listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${seventyThirdListenHref}`,
    ),
    "directory JSON-LD includes seventy-third listen href",
  );

  const seventyFourthListenHref = "/listens/taro-na-rabotu-na-blizhayshee-budushchee";
  const seventyFourthListenCard = data.articles.find((card) => card.href === seventyFourthListenHref);
  assert(seventyFourthListenCard, "seventy-fourth indexable listen page is listed");
  assert(
    seventyFourthListenCard.title === "Таро на работу на ближайшее будущее – рабочий период | АудиоЛад",
    "seventy-fourth listen directory title",
  );
  assert(
    seventyFourthListenCard.description === TARO_NA_RABOTU_NA_BLIZHAYSHEE_BUDUSHCHEE_PAGE.description,
    "seventy-fourth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-na-rabotu-na-blizhayshee-budushchee",
    ),
    "no /articles duplicate for seventy-fourth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${seventyFourthListenHref}`,
    ),
    "directory JSON-LD includes seventy-fourth listen href",
  );


  const seventyFifthListenHref = "/listens/voprosy-taro-na-rabotu";
  const seventyFifthListenCard = data.articles.find((card) => card.href === seventyFifthListenHref);
  assert(seventyFifthListenCard, "seventy-fifth indexable listen page is listed");
  assert(
    seventyFifthListenCard.title === "Вопросы Таро на работу – как правильно спрашивать карты | АудиоЛад",
    "seventy-fifth listen directory title",
  );
  assert(
    seventyFifthListenCard.description === VOPROSY_TARO_NA_RABOTU_PAGE.description,
    "seventy-fifth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/voprosy-taro-na-rabotu",
    ),
    "no /articles duplicate for seventy-fifth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${seventyFifthListenHref}`,
    ),
    "directory JSON-LD includes seventy-fifth listen href",
  );

  const seventySixthListenHref = "/listens/taro-kakaya-rabota-mne-podhodit";
  const seventySixthListenCard = data.articles.find((card) => card.href === seventySixthListenHref);
  assert(seventySixthListenCard, "seventy-sixth indexable listen page is listed");
  assert(
    seventySixthListenCard.title === "Таро – какая работа мне подходит и какую сферу выбрать | АудиоЛад",
    "seventy-sixth listen directory title",
  );
  assert(
    seventySixthListenCard.description === TARO_KAKAYA_RABOTA_MNE_PODHODIT_PAGE.description,
    "seventy-sixth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-kakaya-rabota-mne-podhodit",
    ),
    "no /articles duplicate for seventy-sixth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${seventySixthListenHref}`,
    ),
    "directory JSON-LD includes seventy-sixth listen href",
  );


  const seventySeventhListenHref = "/listens/taro-na-situatsiyu-na-rabote";
  const seventySeventhListenCard = data.articles.find((card) => card.href === seventySeventhListenHref);
  assert(seventySeventhListenCard, "seventy-seventh indexable listen page is listed");
  assert(
    seventySeventhListenCard.title === "Таро на ситуацию на работе – разбор рабочей проблемы | АудиоЛад",
    "seventy-seventh listen directory title",
  );
  assert(
    seventySeventhListenCard.description === TARO_NA_SITUATSIYU_NA_RABOTE_PAGE.description,
    "seventy-seventh listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-na-situatsiyu-na-rabote",
    ),
    "no /articles duplicate for seventy-seventh listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${seventySeventhListenHref}`,
    ),
    "directory JSON-LD includes seventy-seventh listen href",
  );


  const seventyEighthListenHref = "/listens/taro-poisk-raboty";
  const seventyEighthListenCard = data.articles.find((card) => card.href === seventyEighthListenHref);
  assert(seventyEighthListenCard, "seventy-eighth indexable listen page is listed");
  assert(
    seventyEighthListenCard.title === "Таро поиск работы – расклад и вопросы во время поиска | АудиоЛад",
    "seventy-eighth listen directory title",
  );
  assert(
    seventyEighthListenCard.description === TARO_POISK_RABOTY_PAGE.description,
    "seventy-eighth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-poisk-raboty",
    ),
    "no /articles duplicate for seventy-eighth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${seventyEighthListenHref}`,
    ),
    "directory JSON-LD includes seventy-eighth listen href",
  );


  const seventyNinthListenHref = "/listens/naydu-li-ya-rabotu-taro";
  const seventyNinthListenCard = data.articles.find((card) => card.href === seventyNinthListenHref);
  assert(seventyNinthListenCard, "seventy-ninth indexable listen page is listed");
  assert(
    seventyNinthListenCard.title === "Найду ли я работу – Таро, поиск и трудоустройство | АудиоЛад",
    "seventy-ninth listen directory title",
  );
  assert(
    seventyNinthListenCard.description === NAYDU_LI_YA_RABOTU_TARO_PAGE.description,
    "seventy-ninth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/naydu-li-ya-rabotu-taro",
    ),
    "no /articles duplicate for seventy-ninth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${seventyNinthListenHref}`,
    ),
    "directory JSON-LD includes seventy-ninth listen href",
  );

  const eightiethListenHref = "/listens/vozmut-li-menya-na-rabotu-taro";
  const eightiethListenCard = data.articles.find((card) => card.href === eightiethListenHref);
  assert(eightiethListenCard, "eightieth indexable listen page is listed");
  assert(
    eightiethListenCard.title === "Возьмут ли меня на работу – Таро после собеседования | АудиоЛад",
    "eightieth listen directory title",
  );
  assert(
    eightiethListenCard.description === VOZMUT_LI_MENYA_NA_RABOTU_TARO_PAGE.description,
    "eightieth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/vozmut-li-menya-na-rabotu-taro",
    ),
    "no /articles duplicate for eightieth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${eightiethListenHref}`,
    ),
    "directory JSON-LD includes eightieth listen href",
  );


  const eightyFirstListenHref = "/listens/taro-menyat-li-rabotu";
  const eightyFirstListenCard = data.articles.find((card) => card.href === eightyFirstListenHref);
  assert(eightyFirstListenCard, "eighty-first indexable listen page is listed");
  assert(
    eightyFirstListenCard.title === "Таро – менять ли работу, уходить или остаться | АудиоЛад",
    "eighty-first listen directory title",
  );
  assert(
    eightyFirstListenCard.description === TARO_MENYAT_LI_RABOTU_PAGE.description,
    "eighty-first listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-menyat-li-rabotu",
    ),
    "no /articles duplicate for eighty-first listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${eightyFirstListenHref}`,
    ),
    "directory JSON-LD includes eighty-first listen href",
  );

  const eightySecondListenHref = "/listens/taro-rabota-i-karera";
  const eightySecondListenCard = data.articles.find((card) => card.href === eightySecondListenHref);
  assert(eightySecondListenCard, "eighty-second indexable listen page is listed");
  assert(
    eightySecondListenCard.title === "Таро работа и карьера – расклад на профессиональный путь | АудиоЛад",
    "eighty-second listen directory title",
  );
  assert(
    eightySecondListenCard.description === TARO_RABOTA_I_KARERA_PAGE.description,
    "eighty-second listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-rabota-i-karera",
    ),
    "no /articles duplicate for eighty-second listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${eightySecondListenHref}`,
    ),
    "directory JSON-LD includes eighty-second listen href",
  );

  const eightyThirdListenHref = "/listens/taro-perspektivy-na-rabote";
  const eightyThirdListenCard = data.articles.find((card) => card.href === eightyThirdListenHref);
  assert(eightyThirdListenCard, "eighty-third indexable listen page is listed");
  assert(
    eightyThirdListenCard.title === "Таро перспективы на работе – успех, рост и повышение | АудиоЛад",
    "eighty-third listen directory title",
  );
  assert(
    eightyThirdListenCard.description === TARO_PERSPEKTIVY_NA_RABOTE_PAGE.description,
    "eighty-third listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-perspektivy-na-rabote",
    ),
    "no /articles duplicate for eighty-third listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${eightyThirdListenHref}`,
    ),
    "directory JSON-LD includes eighty-third listen href",
  );

  const eightyFourthListenHref = "/listens/taro-otnosheniya-na-rabote";
  const eightyFourthListenCard = data.articles.find((card) => card.href === eightyFourthListenHref);
  assert(eightyFourthListenCard, "eighty-fourth indexable listen page is listed");
  assert(
    eightyFourthListenCard.title === "Таро отношения на работе – коллеги и начальство | АудиоЛад",
    "eighty-fourth listen directory title",
  );
  assert(
    eightyFourthListenCard.description === TARO_OTNOSHENIYA_NA_RABOTE_PAGE.description,
    "eighty-fourth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-otnosheniya-na-rabote",
    ),
    "no /articles duplicate for eighty-fourth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${eightyFourthListenHref}`,
    ),
    "directory JSON-LD includes eighty-fourth listen href",
  );


  const eightyFifthListenHref = "/listens/taro-biznes";
  const eightyFifthListenCard = data.articles.find((card) => card.href === eightyFifthListenHref);
  assert(eightyFifthListenCard, "eighty-fifth indexable listen page is listed");
  assert(
    eightyFifthListenCard.title === "Таро бизнес – вопросы о своём деле и развитии | АудиоЛад",
    "eighty-fifth listen directory title",
  );
  assert(
    eightyFifthListenCard.description === TARO_BIZNES_PAGE.description,
    "eighty-fifth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/taro-biznes",
    ),
    "no /articles duplicate for eighty-fifth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${eightyFifthListenHref}`,
    ),
    "directory JSON-LD includes eighty-fifth listen href",
  );

  const eightySixthListenHref = "/listens/karty-taro-biznes";
  const eightySixthListenCard = data.articles.find((card) => card.href === eightySixthListenHref);
  assert(eightySixthListenCard, "eighty-sixth indexable listen page is listed");
  assert(
    eightySixthListenCard.title === "Карты Таро бизнес – карты для вопросов о своём деле | АудиоЛад",
    "eighty-sixth listen directory title",
  );
  assert(
    eightySixthListenCard.description === KARTY_TARO_BIZNES_PAGE.description,
    "eighty-sixth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/karty-taro-biznes",
    ),
    "no /articles duplicate for eighty-sixth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${eightySixthListenHref}`,
    ),
    "directory JSON-LD includes eighty-sixth listen href",
  );

  const eightySeventhListenHref = "/listens/znachenie-taro-v-biznese";
  const eightySeventhListenCard = data.articles.find((card) => card.href === eightySeventhListenHref);
  assert(eightySeventhListenCard, "eighty-seventh indexable listen page is listed");
  assert(
    eightySeventhListenCard.title === "Значение Таро в бизнесе – как трактовать карты | АудиоЛад",
    "eighty-seventh listen directory title",
  );
  assert(
    eightySeventhListenCard.description === ZNACHENIE_TARO_V_BIZNESE_PAGE.description,
    "eighty-seventh listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/znachenie-taro-v-biznese",
    ),
    "no /articles duplicate for eighty-seventh listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${eightySeventhListenHref}`,
    ),
    "directory JSON-LD includes eighty-seventh listen href",
  );

  const eightyEighthListenHref = "/listens/rasklad-taro-na-biznes";
  const eightyEighthListenCard = data.articles.find((card) => card.href === eightyEighthListenHref);
  assert(eightyEighthListenCard, "eighty-eighth indexable listen page is listed");
  assert(
    eightyEighthListenCard.title === "Расклад Таро на бизнес – схема и позиции расклада | АудиоЛад",
    "eighty-eighth listen directory title",
  );
  assert(
    eightyEighthListenCard.description === RASKLAD_TARO_NA_BIZNES_PAGE.description,
    "eighty-eighth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/rasklad-taro-na-biznes",
    ),
    "no /articles duplicate for eighty-eighth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${eightyEighthListenHref}`,
    ),
    "directory JSON-LD includes eighty-eighth listen href",
  );

  const eightyNinthListenHref = "/listens/gadanie-taro-na-biznes";
  const eightyNinthListenCard = data.articles.find((card) => card.href === eightyNinthListenHref);
  assert(eightyNinthListenCard, "eighty-ninth indexable listen page is listed");
  assert(
    eightyNinthListenCard.title === "Гадание Таро на бизнес – вопросы о своём деле | АудиоЛад",
    "eighty-ninth listen directory title",
  );
  assert(
    eightyNinthListenCard.description === GADANIE_TARO_NA_BIZNES_PAGE.description,
    "eighty-ninth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/gadanie-taro-na-biznes",
    ),
    "no /articles duplicate for eighty-ninth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${eightyNinthListenHref}`,
    ),
    "directory JSON-LD includes eighty-ninth listen href",
  );


  const ninetiethListenHref = "/listens/voprosy-taro-pro-biznes";
  const ninetiethListenCard = data.articles.find((card) => card.href === ninetiethListenHref);
  assert(ninetiethListenCard, "ninetieth indexable listen page is listed");
  assert(
    ninetiethListenCard.title === "Вопросы Таро про бизнес – что спрашивать о своём деле | АудиоЛад",
    "ninetieth listen directory title",
  );
  assert(
    ninetiethListenCard.description === VOPROSY_TARO_PRO_BIZNES_PAGE.description,
    "ninetieth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/voprosy-taro-pro-biznes",
    ),
    "no /articles duplicate for ninetieth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${ninetiethListenHref}`,
    ),
    "directory JSON-LD includes ninetieth listen href",
  );

  const ninetyFirstListenHref = "/listens/rabota-i-biznes-taro";
  const ninetyFirstListenCard = data.articles.find((card) => card.href === ninetyFirstListenHref);
  assert(ninetyFirstListenCard, "ninety-first indexable listen page is listed");
  assert(
    ninetyFirstListenCard.title === "Работа и бизнес Таро – наём или своё дело | АудиоЛад",
    "ninety-first listen directory title",
  );
  assert(
    ninetyFirstListenCard.description === RABOTA_I_BIZNES_TARO_PAGE.description,
    "ninety-first listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/rabota-i-biznes-taro",
    ),
    "no /articles duplicate for ninety-first listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${ninetyFirstListenHref}`,
    ),
    "directory JSON-LD includes ninety-first listen href",
  );

  const ninetySecondListenHref = "/listens/taro-biznes-i-dengi";
  const ninetySecondListenCard = data.articles.find((card) => card.href === ninetySecondListenHref);
  assert(ninetySecondListenCard, "ninety-second indexable listen page is listed");
  assert(
    ninetySecondListenCard.title === "Таро бизнес и деньги – финансы своего дела через карты | АудиоЛад",
    "ninety-second listen directory title",
  );
  assert(
    ninetySecondListenCard.description === TARO_BIZNES_I_DENGI_PAGE.description,
    "ninety-second listen directory description",
  );
  assert(
    !data.articles.some((card) => card.href === "/articles/taro-biznes-i-dengi"),
    "no /articles duplicate for ninety-second listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some((item) => item.url === `https://audiolad.ru${ninetySecondListenHref}`),
    "directory JSON-LD includes ninety-second listen href",
  );

  const ninetyThirdListenHref = "/listens/rasklad-taro-na-biznes-i-dengi";
  const ninetyThirdListenCard = data.articles.find((card) => card.href === ninetyThirdListenHref);
  assert(ninetyThirdListenCard, "ninety-third indexable listen page is listed");
  assert(
    ninetyThirdListenCard.title === "Расклад Таро на бизнес и деньги – схема на 7 карт | АудиоЛад",
    "ninety-third listen directory title",
  );
  assert(
    ninetyThirdListenCard.description === RASKLAD_TARO_NA_BIZNES_I_DENGI_PAGE.description,
    "ninety-third listen directory description",
  );
  assert(
    !data.articles.some((card) => card.href === "/articles/rasklad-taro-na-biznes-i-dengi"),
    "no /articles duplicate for ninety-third listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some((item) => item.url === `https://audiolad.ru${ninetyThirdListenHref}`),
    "directory JSON-LD includes ninety-third listen href",
  );

  const ninetyFourthListenHref = "/listens/muzyka-sna-dlya-zasypaniya-slushat-onlayn";
  const ninetyFourthListenCard = data.articles.find((card) => card.href === ninetyFourthListenHref);
  assert(ninetyFourthListenCard, "ninety-fourth indexable listen page is listed");
  assert(
    ninetyFourthListenCard.title === "Музыка сна для засыпания – слушать онлайн бесплатно | АудиоЛад",
    "ninety-fourth listen directory title",
  );
  assert(
    ninetyFourthListenCard.description === MUZYKA_SNA_DLYA_ZASYPANIYA_SLUSHAT_ONLAYN_PAGE.description,
    "ninety-fourth listen directory description",
  );
  assert(
    !data.articles.some((card) => card.href === "/articles/muzyka-sna-dlya-zasypaniya-slushat-onlayn"),
    "no /articles duplicate for ninety-fourth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some((item) => item.url === `https://audiolad.ru${ninetyFourthListenHref}`),
    "directory JSON-LD includes ninety-fourth listen href",
  );

  const ninetyFifthListenHref = "/listens/muzyka-dlya-bystrogo-sna-slushat-onlayn";
  const ninetyFifthListenCard = data.articles.find((card) => card.href === ninetyFifthListenHref);
  assert(ninetyFifthListenCard, "ninety-fifth indexable listen page is listed");
  assert(
    ninetyFifthListenCard.title === "Музыка для быстрого сна – слушать онлайн бесплатно | АудиоЛад",
    "ninety-fifth listen directory title",
  );
  assert(
    ninetyFifthListenCard.description === MUZYKA_DLYA_BYSTROGO_SNA_SLUSHAT_ONLAYN_PAGE.description,
    "ninety-fifth listen directory description",
  );
  assert(
    !data.articles.some((card) => card.href === "/articles/muzyka-dlya-bystrogo-sna-slushat-onlayn"),
    "no /articles duplicate for ninety-fifth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some((item) => item.url === `https://audiolad.ru${ninetyFifthListenHref}`),
    "directory JSON-LD includes ninety-fifth listen href",
  );

  const ninetySixthListenHref = "/listens/muzyka-dlya-glubokogo-sna-slushat-onlayn";
  const ninetySixthListenCard = data.articles.find((card) => card.href === ninetySixthListenHref);
  assert(ninetySixthListenCard, "ninety-sixth indexable listen page is listed");
  assert(
    ninetySixthListenCard.title === "Музыка для глубокого сна – слушать онлайн бесплатно | АудиоЛад",
    "ninety-sixth listen directory title",
  );
  assert(
    ninetySixthListenCard.description === MUZYKA_DLYA_GLUBOKOGO_SNA_SLUSHAT_ONLAYN_PAGE.description,
    "ninety-sixth listen directory description",
  );
  assert(
    !data.articles.some((card) => card.href === "/articles/muzyka-dlya-glubokogo-sna-slushat-onlayn"),
    "no /articles duplicate for ninety-sixth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some((item) => item.url === `https://audiolad.ru${ninetySixthListenHref}`),
    "directory JSON-LD includes ninety-sixth listen href",
  );

  const ninetySeventhListenHref = "/listens/muzyka-dlya-bystrogo-zasypaniya-slushat-onlayn";
  const ninetySeventhListenCard = data.articles.find((card) => card.href === ninetySeventhListenHref);
  assert(ninetySeventhListenCard, "ninety-seventh indexable listen page is listed");
  assert(
    ninetySeventhListenCard.title === "Музыка для быстрого засыпания – слушать онлайн бесплатно | АудиоЛад",
    "ninety-seventh listen directory title",
  );
  assert(
    ninetySeventhListenCard.description === MUZYKA_DLYA_BYSTROGO_ZASYPANIYA_SLUSHAT_ONLAYN_PAGE.description,
    "ninety-seventh listen directory description",
  );
  assert(
    !data.articles.some((card) => card.href === "/articles/muzyka-dlya-bystrogo-zasypaniya-slushat-onlayn"),
    "no /articles duplicate for ninety-seventh listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some((item) => item.url === `https://audiolad.ru${ninetySeventhListenHref}`),
    "directory JSON-LD includes ninety-seventh listen href",
  );

  const ninetyEighthListenHref = "/listens/muzyka-dlya-krepkogo-sna-slushat-onlayn";
  const ninetyEighthListenCard = data.articles.find((card) => card.href === ninetyEighthListenHref);
  assert(ninetyEighthListenCard, "ninety-eighth indexable listen page is listed");
  assert(
    ninetyEighthListenCard.title === "Музыка для крепкого сна – слушать онлайн бесплатно | АудиоЛад",
    "ninety-eighth listen directory title",
  );
  assert(
    ninetyEighthListenCard.description === MUZYKA_DLYA_KREPKOGO_SNA_SLUSHAT_ONLAYN_PAGE.description,
    "ninety-eighth listen directory description",
  );
  assert(
    !data.articles.some((card) => card.href === "/articles/muzyka-dlya-krepkogo-sna-slushat-onlayn"),
    "no /articles duplicate for ninety-eighth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some((item) => item.url === `https://audiolad.ru${ninetyEighthListenHref}`),
    "directory JSON-LD includes ninety-eighth listen href",
  );

  const ninetyNinthListenHref = "/listens/muzyka-dlya-sna-s-dozhdem-slushat-onlayn";
  const ninetyNinthListenCard = data.articles.find((card) => card.href === ninetyNinthListenHref);
  assert(ninetyNinthListenCard, "ninety-ninth indexable listen page is listed");
  assert(
    ninetyNinthListenCard.title === "Музыка для сна с дождём – слушать онлайн бесплатно | АудиоЛад",
    "ninety-ninth listen directory title",
  );
  assert(
    ninetyNinthListenCard.description === MUZYKA_DLYA_SNA_S_DOZHDEM_SLUSHAT_ONLAYN_PAGE.description,
    "ninety-ninth listen directory description",
  );
  assert(
    !data.articles.some((card) => card.href === "/articles/muzyka-dlya-sna-s-dozhdem-slushat-onlayn"),
    "no /articles duplicate for ninety-ninth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some((item) => item.url === `https://audiolad.ru${ninetyNinthListenHref}`),
    "directory JSON-LD includes ninety-ninth listen href",
  );

  const hundredthListenHref = "/listens/muzyka-dlya-sna-s-shumom-dozhdya-slushat-onlayn";
  const hundredthListenCard = data.articles.find((card) => card.href === hundredthListenHref);
  assert(hundredthListenCard, "hundredth indexable listen page is listed");
  assert(
    hundredthListenCard.title === "Музыка для сна с шумом дождя – слушать онлайн бесплатно | АудиоЛад",
    "hundredth listen directory title",
  );
  assert(
    hundredthListenCard.description === MUZYKA_DLYA_SNA_S_SHUMOM_DOZHDYA_SLUSHAT_ONLAYN_PAGE.description,
    "hundredth listen directory description",
  );
  assert(
    !data.articles.some((card) => card.href === "/articles/muzyka-dlya-sna-s-shumom-dozhdya-slushat-onlayn"),
    "no /articles duplicate for hundredth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some((item) => item.url === `https://audiolad.ru${hundredthListenHref}`),
    "directory JSON-LD includes hundredth listen href",
  );

  const hundredFirstListenHref = "/listens/uspokaivayushchaya-muzyka-dlya-sna-s-dozhdem-slushat-onlayn";
  const hundredFirstListenCard = data.articles.find((card) => card.href === hundredFirstListenHref);
  assert(hundredFirstListenCard, "hundred-first indexable listen page is listed");
  assert(
    hundredFirstListenCard.title === "Успокаивающая музыка для сна с дождём – слушать онлайн бесплатно | АудиоЛад",
    "hundred-first listen directory title",
  );
  assert(
    hundredFirstListenCard.description === USPOKAIVAYUSHCHAYA_MUZYKA_DLYA_SNA_S_DOZHDEM_SLUSHAT_ONLAYN_PAGE.description,
    "hundred-first listen directory description",
  );
  assert(
    !data.articles.some((card) => card.href === "/articles/uspokaivayushchaya-muzyka-dlya-sna-s-dozhdem-slushat-onlayn"),
    "no /articles duplicate for hundred-first listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some((item) => item.url === `https://audiolad.ru${hundredFirstListenHref}`),
    "directory JSON-LD includes hundred-first listen href",
  );

  const hundredSecondListenHref = "/listens/muzyka-dlya-sna-so-zvukami-dozhdya-slushat-onlayn";
  const hundredSecondListenCard = data.articles.find((card) => card.href === hundredSecondListenHref);
  assert(hundredSecondListenCard, "hundred-second indexable listen page is listed");
  assert(
    hundredSecondListenCard.title === "Музыка для сна со звуками дождя – слушать онлайн бесплатно | АудиоЛад",
    "hundred-second listen directory title",
  );
  assert(
    hundredSecondListenCard.description === MUZYKA_DLYA_SNA_SO_ZVUKAMI_DOZHDYA_SLUSHAT_ONLAYN_PAGE.description,
    "hundred-second listen directory description",
  );
  assert(
    !data.articles.some((card) => card.href === "/articles/muzyka-dlya-sna-so-zvukami-dozhdya-slushat-onlayn"),
    "no /articles duplicate for hundred-second listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some((item) => item.url === `https://audiolad.ru${hundredSecondListenHref}`),
    "directory JSON-LD includes hundred-second listen href",
  );

  const hundredThirdListenHref = "/listens/spokoynaya-muzyka-dlya-sna-s-dozhdem-slushat-onlayn";
  const hundredThirdListenCard = data.articles.find((card) => card.href === hundredThirdListenHref);
  assert(hundredThirdListenCard, "hundred-third indexable listen page is listed");
  assert(
    hundredThirdListenCard.title === "Спокойная музыка для сна с дождём – слушать онлайн бесплатно | АудиоЛад",
    "hundred-third listen directory title",
  );
  assert(
    hundredThirdListenCard.description === SPOKOYNAYA_MUZYKA_DLYA_SNA_S_DOZHDEM_SLUSHAT_ONLAYN_PAGE.description,
    "hundred-third listen directory description",
  );
  assert(
    !data.articles.some((card) => card.href === "/articles/spokoynaya-muzyka-dlya-sna-s-dozhdem-slushat-onlayn"),
    "no /articles duplicate for hundred-third listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some((item) => item.url === `https://audiolad.ru${hundredThirdListenHref}`),
    "directory JSON-LD includes hundred-third listen href",
  );

  const hundredFourthListenHref = "/listens/rasslablyayushchaya-muzyka-s-dozhdem-dlya-sna-slushat-onlayn";
  const hundredFourthListenCard = data.articles.find((card) => card.href === hundredFourthListenHref);
  assert(hundredFourthListenCard, "hundred-fourth indexable listen page is listed");
  assert(
    hundredFourthListenCard.title === "Расслабляющая музыка с дождём для сна – слушать онлайн бесплатно | АудиоЛад",
    "hundred-fourth listen directory title",
  );
  assert(
    hundredFourthListenCard.description === RASSLABLYAYUSHCHAYA_MUZYKA_S_DOZHDEM_DLYA_SNA_SLUSHAT_ONLAYN_PAGE.description,
    "hundred-fourth listen directory description",
  );
  assert(
    !data.articles.some((card) => card.href === "/articles/rasslablyayushchaya-muzyka-s-dozhdem-dlya-sna-slushat-onlayn"),
    "no /articles duplicate for hundred-fourth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some((item) => item.url === `https://audiolad.ru${hundredFourthListenHref}`),
    "directory JSON-LD includes hundred-fourth listen href",
  );

const articleCards = listArticleDirectoryCards();
  const articleHrefs = new Set(articleCards.map((card) => card.href));
  for (const card of articleCards) {
    assert(
      data.articles.some((item) => item.href === card.href),
      `existing article ${card.slug} remains listed`,
    );
  }

  const noindex = {
    ...MEDITATSIYA_NA_DENGI_SLUSHAT_ONLAYN_BESPLATNO_PAGE,
    slug: "noindex-listen-directory-fixture",
    indexable: false,
  };
  const future = {
    ...MEDITATSIYA_NA_DENGI_SLUSHAT_ONLAYN_BESPLATNO_PAGE,
    slug: "future-listen-directory-fixture",
    title: "Будущая listen-страница",
    description: "Описание будущей listen-страницы для каталога.",
  };
  const mixed = loadArticleDirectoryPageData(
    listArticleDefinitions(),
    listTopicHubDefinitions(),
    [...listIndexableListenPageDefinitions(), noindex, future],
  );

  assert(
    mixed.articles.some((card) => card.href === "/listens/future-listen-directory-fixture"),
    "new indexable listen appears automatically",
  );
  assert(
    !mixed.articles.some((card) => card.href === "/listens/noindex-listen-directory-fixture"),
    "indexable:false listen is excluded",
  );
  assert(
    mixed.articles.filter((card) => card.href === listenHref).length === 1,
    "listen href is unique",
  );
  assert(
    articleHrefs.size === articleCards.length,
    "article href set size matches article cards",
  );

  const listenOnly = listListenDirectoryCards([future, noindex]);
  assert(listenOnly.length === 1, "listen selector excludes noindex");
  assert(listenOnly[0].href === "/listens/future-listen-directory-fixture", "listen href namespace");
}

function testEmptyState() {
  const empty = loadArticleDirectoryPageData([], listTopicHubDefinitions(), []);
  assert(empty.articles.length === 0, "empty articles");
  assert(empty.hubs.length > 0, "hubs still available when articles empty");

  const view = read("src/components/articles/ArticleDirectoryPageView.tsx");
  assert(view.includes("опубликованных материалов ещё нет"), "empty state copy");
}


function collectListenLinks(definition) {
  return (definition.sections ?? [])
    .flatMap((section) => section.blocks ?? [])
    .filter((block) => block.kind === "rich_paragraph")
    .flatMap((block) => (block.segments ?? []).filter((segment) => "href" in segment));
}

function testListenKidsClusterInternalLinks() {
  const hubHref = "/listens/detskaya-muzyka-dlya-sna-slushat-onlayn";
  const pages = [
    DETSKAYA_MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE,
    MUZYKA_DLYA_SNA_DLYA_MALYSHEY_SLUSHAT_ONLAYN_PAGE,
    MUZYKA_DLYA_NOVOROZHDENNYH_DLYA_SNA_SLUSHAT_ONLAYN_PAGE,
    MUZYKA_DLYA_SNA_MLADENCEV_SLUSHAT_ONLAYN_PAGE,
    MUZYKA_DLYA_SNA_GRUDNICHKOV_SLUSHAT_ONLAYN_PAGE,
    USPOKAIVAYUSHCHAYA_MUZYKA_DLYA_DETEY_SLUSHAT_ONLAYN_PAGE,
    KOLYBELNYE_DLYA_MALYSHEY_SLUSHAT_ONLAYN_PAGE,
    MUZYKA_DLYA_SNA_DETYAM_BEZ_SLOV_SLUSHAT_ONLAYN_PAGE,
  ];
  const dests = [
    "/listens/muzyka-dlya-sna-dlya-malyshey-slushat-onlayn",
    "/listens/muzyka-dlya-novorozhdennyh-dlya-sna-slushat-onlayn",
    "/listens/muzyka-dlya-sna-mladencev-slushat-onlayn",
    "/listens/muzyka-dlya-sna-grudnichkov-slushat-onlayn",
    "/listens/uspokaivayushchaya-muzyka-dlya-detey-slushat-onlayn",
    "/listens/kolybelnye-dlya-malyshey-slushat-onlayn",
    "/listens/muzyka-dlya-sna-detyam-bez-slov-slushat-onlayn",
  ];
  const hubLinks = collectListenLinks(DETSKAYA_MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE);
  const hubHrefs = new Set(hubLinks.map((link) => link.href));
  assert(hubHrefs.size === 7, "hub has 7 unique cluster dests");
  for (const href of dests) {
    assert(hubHrefs.has(href), `hub links ${href}`);
  }
  assert(
    hubLinks.some((link) => link.href === dests[0] && link.label === "музыка для сна для малышей"),
    "hub malyshey label",
  );
  assert(
    collectListenLinks(MUZYKA_DLYA_SNA_GRUDNICHKOV_SLUSHAT_ONLAYN_PAGE).some(
      (link) => link.href === hubHref && link.label === "детская музыка для сна",
    ),
    "grud links hub",
  );
  for (const page of pages) {
    const hrefs = collectListenLinks(page).map((link) => link.href);
    assert(new Set(hrefs).size === hrefs.length, `${page.slug} no duplicate href`);
    for (const link of collectListenLinks(page)) {
      assert(!String(link.label).includes("http") && !String(link.label).includes("/listens/"), `${page.slug} no raw URL label`);
    }
  }
}

function testIndividualArticlesStillWork() {
  assert(
    getArticleBySlug("kak-razvit-lyubov-k-sebe")?.title.includes("любовь к себе"),
    "individual article still resolvable",
  );
  assert(
    listArticleSlugs().includes("kak-privlech-dengi-v-svoyu-zhizn"),
    "latest known article still registered",
  );

  const articlePage = read("src/app/(platform)/(listener)/articles/[slug]/page.tsx");
  assert(articlePage.includes("ArticlePageView"), "article detail route intact");
}

function testOneHundredFifthListenInDirectory() {
  const data = loadArticleDirectoryPageData(
    listArticleDefinitions(),
    listTopicHubDefinitions(),
    listIndexableListenPageDefinitions(),
  );
  const href = "/listens/relaks-muzyka-s-dozhdem-dlya-sna-slushat-onlayn";
  const card = data.articles.find((item) => item.href === href);

  assert(card, "one-hundred-fifth indexable listen page is listed");
  assert(
    card.title === RELAKS_MUZYKA_S_DOZHDEM_DLYA_SNA_SLUSHAT_ONLAYN_PAGE.title,
    "one-hundred-fifth directory title",
  );
  assert(
    card.description === RELAKS_MUZYKA_S_DOZHDEM_DLYA_SNA_SLUSHAT_ONLAYN_PAGE.description,
    "one-hundred-fifth directory description",
  );
  assert(
    !data.articles.some((item) => item.href === "/articles/relaks-muzyka-s-dozhdem-dlya-sna-slushat-onlayn"),
    "no /articles duplicate for one-hundred-fifth listen slug",
  );
}

function testOneHundredSixthListenInDirectory() {
  const data = loadArticleDirectoryPageData(
    listArticleDefinitions(),
    listTopicHubDefinitions(),
    listIndexableListenPageDefinitions(),
  );
  const href = "/listens/muzyka-dozhdya-i-grozy-dlya-sna-slushat-onlayn";
  const card = data.articles.find((item) => item.href === href);
  assert(card, "one-hundred-sixth indexable listen page is listed");
  assert(card.title === MUZYKA_DOZHDYA_I_GROZY_DLYA_SNA_SLUSHAT_ONLAYN_PAGE.title, "one-hundred-sixth directory title");
  assert(card.description === MUZYKA_DOZHDYA_I_GROZY_DLYA_SNA_SLUSHAT_ONLAYN_PAGE.description, "one-hundred-sixth directory description");
  assert(!data.articles.some((item) => item.href === "/articles/muzyka-dozhdya-i-grozy-dlya-sna-slushat-onlayn"), "no /articles duplicate for one-hundred-sixth listen slug");
}

function testOneHundredEighthListenInDirectory() {
  const data = loadArticleDirectoryPageData(
    listArticleDefinitions(),
    listTopicHubDefinitions(),
    listIndexableListenPageDefinitions(),
  );
  const href = "/listens/muzyka-s-kaplyami-dozhdya-dlya-sna-slushat-onlayn";
  const card = data.articles.find((item) => item.href === href);
  assert(card, "one-hundred-eighth indexable listen page is listed");
  assert(card.title === MUZYKA_S_KAPLYAMI_DOZHDYA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE.title, "one-hundred-eighth directory title");
  assert(card.description === MUZYKA_S_KAPLYAMI_DOZHDYA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE.description, "one-hundred-eighth directory description");
  assert(!data.articles.some((item) => item.href === "/articles/muzyka-s-kaplyami-dozhdya-dlya-sna-slushat-onlayn"), "no /articles duplicate for one-hundred-eighth listen slug");
}

function testOneHundredNinthListenInDirectory() {
  const data = loadArticleDirectoryPageData(
    listArticleDefinitions(),
    listTopicHubDefinitions(),
    listIndexableListenPageDefinitions(),
  );
  const href = "/listens/uspokaivayushchaya-muzyka-dlya-sna-s-dozhdem-i-pianino-slushat-onlayn";
  const card = data.articles.find((item) => item.href === href);
  assert(card, "one-hundred-ninth indexable listen page is listed");
  assert(card.title === USPOKAIVAYUSHCHAYA_MUZYKA_DLYA_SNA_S_DOZHDEM_I_PIANINO_SLUSHAT_ONLAYN_PAGE.title, "one-hundred-ninth directory title");
  assert(card.description === USPOKAIVAYUSHCHAYA_MUZYKA_DLYA_SNA_S_DOZHDEM_I_PIANINO_SLUSHAT_ONLAYN_PAGE.description, "one-hundred-ninth directory description");
  assert(!data.articles.some((item) => item.href === "/articles/uspokaivayushchaya-muzyka-dlya-sna-s-dozhdem-i-pianino-slushat-onlayn"), "no /articles duplicate for one-hundred-ninth listen slug");
}

function testOneHundredTenthListenInDirectory() {
  const data = loadArticleDirectoryPageData(
    listArticleDefinitions(),
    listTopicHubDefinitions(),
    listIndexableListenPageDefinitions(),
  );
  const href = "/listens/rasslablyayushchaya-muzyka-dlya-sna-s-kaplyami-dozhdya-slushat-onlayn";
  const card = data.articles.find((item) => item.href === href);
  assert(card, "one-hundred-tenth indexable listen page is listed");
  assert(card.title === RASSLABLYAYUSHCHAYA_MUZYKA_DLYA_SNA_S_KAPLYAMI_DOZHDYA_SLUSHAT_ONLAYN_PAGE.title, "one-hundred-tenth directory title");
  assert(card.description === RASSLABLYAYUSHCHAYA_MUZYKA_DLYA_SNA_S_KAPLYAMI_DOZHDYA_SLUSHAT_ONLAYN_PAGE.description, "one-hundred-tenth directory description");
  assert(!data.articles.some((item) => item.href === "/articles/rasslablyayushchaya-muzyka-dlya-sna-s-kaplyami-dozhdya-slushat-onlayn"), "no /articles duplicate for one-hundred-tenth listen slug");
}

const tests = [
  ["route exists", testRouteExists],
  ["H1 and copy", testH1AndCopy],
  ["metadata", testMetadata],
  ["registry single source", testRegistryIsSingleSource],
  ["only listed articles", testOnlyListedArticlesShown],
  ["sort newest first", testSortNewestFirst],
  ["new article auto-listed", testNewArticleAppearsAutomatically],
  ["cards hrefs and unique slugs", testCardsHaveValidHrefsAndNoDuplicateSlugs],
  ["description fallback", testDescriptionFallback],
  ["topic hubs from registry", testTopicHubsFromRegistry],
  ["footer /articles once", testFooterContainsArticlesOnce],
  ["sitemap /articles", testSitemapContainsDirectory],
  ["structured data", testStructuredData],
  ["listen pages in directory", testListenPagesAppearInDirectory],
  ["one-hundred-fifth listen page in directory", testOneHundredFifthListenInDirectory],
  ["one-hundred-sixth listen page in directory", testOneHundredSixthListenInDirectory],
  ["one-hundred-eighth listen page in directory", testOneHundredEighthListenInDirectory],
  ["one-hundred-ninth listen page in directory", testOneHundredNinthListenInDirectory],
  ["one-hundred-tenth listen page in directory", testOneHundredTenthListenInDirectory],
  ["listen kids cluster internal links", testListenKidsClusterInternalLinks],
  ["empty state", testEmptyState],
  ["individual articles still work", testIndividualArticlesStillWork],
];

let failed = 0;

for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`fail - ${name}: ${error instanceof Error ? error.message : error}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} articles-directory test(s) failed`);
  process.exit(1);
}

console.log(`\n${tests.length} articles-directory tests passed`);
