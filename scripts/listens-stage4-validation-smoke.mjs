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
import { MEDITATSIYA_NA_BOGATSTVO_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/meditatsiya-na-bogatstvo-slushat-onlayn.ts";
import { MEDITATSIYA_NA_IZOBILIE_SLUSHAT_ONLAYN_BESPLATNO_PAGE } from "../src/lib/seo/listens/content/meditatsiya-na-izobilie-slushat-onlayn-besplatno.ts";
import { MEDITATSIYA_DLYA_PRIVLECHENIYA_DENEG_BOGATSTVA_I_IZOBILIYA_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-privlecheniya-deneg-bogatstva-i-izobiliya.ts";
import { MEDITATSIYA_NA_DENEZHNYY_POTOK_SLUSHAT_ONLAYN_BESPLATNO_PAGE } from "../src/lib/seo/listens/content/meditatsiya-na-denezhnyy-potok-slushat-onlayn-besplatno.ts";
import { MEDITATSIYA_DLYA_DENEG_I_IZOBILIYA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-deneg-i-izobiliya-slushat-onlayn.ts";
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

const THIRD_PAGE_SLUG = "meditatsiya-na-izobilie-slushat-onlayn-besplatno";
const THIRD_PAGE_H1 = "Медитация на изобилие: слушать онлайн бесплатно";
const THIRD_PAGE_DESCRIPTION =
  "Слушайте медитации на изобилие онлайн бесплатно на АудиоЛаде. Выберите подходящую практику из подборки и начните прослушивание.";

const THIRD_EXPECTED_INTRO = [
  "На этой странице можно бесплатно слушать медитации на изобилие онлайн. Выберите подходящую практику из подборки и включите её прямо на АудиоЛаде.",
  "Такая медитация может помочь направить внимание на внутреннюю устойчивость, доступные ресурсы, возможности и то состояние, которое вы хотите развивать.",
  "Выберите практику и начните слушать.",
];

const THIRD_EXPECTED_SECTION_TITLES = [
  "Что такое медитация на изобилие",
  "Чем изобилие отличается от идеи «просто получить больше денег»",
  "Как выбрать медитацию для изобилия",
  "Как слушать медитацию на изобилие онлайн",
  "Нужно ли слушать медитацию на изобилие каждый день",
  "Когда лучше слушать медитацию на изобилие",
  "Медитация на изобилие и чувство нехватки",
  "Медитация на финансовое изобилие",
  "Изобилие, процветание и реальные действия",
  "Можно ли слушать медитацию на изобилие бесплатно",
  "Как понять, что медитация вам подходит",
  "Итог",
];

const THIRD_EXPECTED_FAQ = [
  {
    question: "Что такое медитация на изобилие?",
    answer:
      "Это аудиопрактика, направленная на внимание к внутренней устойчивости, ресурсам, возможностям, ощущению достаточности и желаемому состоянию.",
  },
  {
    question: "Можно ли слушать медитацию на изобилие бесплатно?",
    answer:
      "Да. На этой странице доступны практики для бесплатного онлайн-прослушивания. Выберите подходящую медитацию в плейлисте и включите её.",
  },
  {
    question: "Чем медитация на изобилие отличается от медитации на деньги?",
    answer:
      "Медитация на изобилие может охватывать более широкий круг тем – ресурсы, время, поддержку, возможности, отношения и внутреннюю устойчивость. Финансовая тема может быть её частью, но не единственным смыслом.",
  },
  {
    question: "Как часто нужно слушать медитацию для изобилия?",
    answer:
      "Строгого правила нет. Можно слушать одну практику несколько дней, возвращаться к ней периодически или менять медитации в зависимости от состояния.",
  },
  {
    question: "Когда лучше слушать медитацию на изобилие?",
    answer:
      "В любое спокойное время: утром, вечером, перед планированием или после напряжённого дня. Главное – возможность сосредоточиться на практике.",
  },
  {
    question: "Можно ли слушать такую медитацию перед сном?",
    answer:
      "Можно, если конкретная практика спокойная и не требует активного размышления или планирования.",
  },
  {
    question: "Что такое медитация на финансовое изобилие?",
    answer:
      "Это практика, в которой внимание направляется прежде всего на отношение к деньгам, финансовым решениям, возможностям и желаемому финансовому состоянию.",
  },
  {
    question: "Помогает ли медитация привлечь изобилие?",
    answer:
      "Медитация не гарантирует прямого привлечения богатства, денег или других результатов. Она может помочь изменить фокус внимания, заметить доступные ресурсы, яснее сформулировать цели и спокойнее перейти к реальным действиям.",
  },
];


const FOURTH_PAGE_SLUG = "meditatsiya-na-bogatstvo-slushat-onlayn";
const FOURTH_PAGE_H1 = "Медитация на богатство: слушать онлайн";
const FOURTH_PAGE_TITLE = "Медитация на богатство: слушать онлайн | АудиоЛад";
const FOURTH_PAGE_DESCRIPTION =
  "Слушайте медитации на богатство онлайн на АудиоЛаде. Выберите подходящую практику из подборки и начните прослушивание бесплатно.";

const FOURTH_EXPECTED_INTRO = [
  "На этой странице можно выбрать медитацию на богатство и начать слушать её онлайн прямо на АудиоЛаде.",
  "Практика может помочь внимательнее посмотреть на своё представление о достатке, финансовой устойчивости, возможностях и желаемом образе жизни – без обещаний быстрого богатства или гарантированного результата.",
  "Выберите подходящую практику и начните слушать.",
];

const FOURTH_EXPECTED_SECTION_TITLES = [
  "Что такое медитация на богатство",
  "Что человек может понимать под богатством",
  "Как выбрать медитацию на богатство",
  "Как слушать медитацию на богатство",
  "Богатство и изобилие – это одно и то же?",
  "Нужно ли визуализировать богатство во время медитации",
  "Нужно ли слушать медитацию каждый день",
  "Когда лучше слушать медитацию на богатство",
  "Медитация на богатство и финансовые цели",
  "Можно ли слушать медитацию на богатство бесплатно",
  "Как понять, что практика вам подходит",
  "Итог",
];

const FOURTH_EXPECTED_FAQ = [
  {
    question: "Что такое медитация на богатство?",
    answer:
      "Это аудиопрактика, в которой внимание направляется на отношение к достатку, финансовой устойчивости, возможностям, ресурсам и желаемому образу жизни.",
  },
  {
    question: "Можно ли слушать медитацию на богатство бесплатно?",
    answer:
      "Да. На этой странице можно выбрать подходящую практику из плейлиста и слушать её онлайн.",
  },
  {
    question: "Чем медитация на богатство отличается от медитации на изобилие?",
    answer:
      "Медитация на богатство обычно сильнее связана с материальными ресурсами, финансовой устойчивостью и достатком. Изобилие может включать более широкий круг ресурсов – время, отношения, поддержку, знания и возможности.",
  },
  {
    question: "Как часто слушать медитацию на богатство?",
    answer:
      "Строгого правила нет. Можно повторять одну практику несколько дней, слушать периодически или выбирать разные медитации в зависимости от текущей задачи.",
  },
  {
    question: "Когда лучше слушать такую медитацию?",
    answer:
      "В любое спокойное время – утром, вечером, перед планированием или размышлением о финансовых целях. Важнее отсутствие отвлекающих факторов, а не конкретный час.",
  },
  {
    question: "Нужно ли визуализировать деньги и богатство?",
    answer:
      "Нет. Визуализация может использоваться, но она не обязательна. Можно сосредоточиться на словах, ощущениях, дыхании, целях или вопросах внутри практики.",
  },
  {
    question: "Можно ли слушать медитацию на богатство перед сном?",
    answer:
      "Можно, если выбранная практика спокойная и не требует активного планирования. Если она настраивает на действия и анализ целей, удобнее выбрать другое время.",
  },
  {
    question: "Помогает ли медитация стать богаче?",
    answer:
      "Медитация сама по себе не увеличивает доход и не гарантирует богатство. Она может помочь яснее сформулировать финансовые цели, заметить собственные установки и сосредоточиться на действиях, которые действительно зависят от вас.",
  },
];

const FIFTH_PAGE_SLUG = "meditatsiya-dlya-privlecheniya-deneg-bogatstva-i-izobiliya";
const FIFTH_PAGE_H1 = "Медитация для привлечения денег, богатства и изобилия";
const FIFTH_PAGE_TITLE = "Медитация для привлечения денег, богатства и изобилия | АудиоЛад";
const FIFTH_PAGE_DESCRIPTION =
  "Слушайте медитации для привлечения денег, богатства и изобилия онлайн на АудиоЛаде. Выберите подходящую практику и начните прослушивание.";

const FIFTH_EXPECTED_INTRO = [
  "На этой странице можно выбрать медитацию для привлечения денег, богатства и изобилия и начать слушать её онлайн прямо на АудиоЛаде.",
  "Такие практики могут использовать визуализацию, работу с вниманием, намерением и отношением к финансовой теме. При этом медитация сама по себе не гарантирует появления денег или определённого материального результата.",
  "Выберите подходящую практику и начните слушать.",
];

const FIFTH_EXPECTED_SECTION_TITLES = [
  "Что такое медитация для привлечения денег и изобилия",
  "Что в такой медитации означает «привлечение»",
  "Медитация для привлечения денег",
  "Медитация для привлечения богатства",
  "Медитация для привлечения изобилия",
  "Нужно ли верить в закон притяжения",
  "Как выбрать медитацию для привлечения денег, богатства или изобилия",
  "Как правильно слушать такую медитацию",
  "Как часто слушать медитацию для привлечения",
  "Медитация и реальные действия",
  "Можно ли слушать медитацию для привлечения денег бесплатно",
  "Как понять, что практика подходит именно вам",
  "Итог",
];

const FIFTH_EXPECTED_FAQ = [
  {
    question: "Что такое медитация для привлечения денег и изобилия?",
    answer:
      "Это аудиопрактика, в которой внимание направляется на желаемое состояние, отношение к деньгам, ресурсы, возможности и собственные действия.",
  },
  {
    question: "Действительно ли медитация может привлечь деньги?",
    answer:
      "Медитация сама по себе не гарантирует появления денег. Она может помочь яснее сформулировать цели, заметить собственные установки и сосредоточиться на возможностях и действиях.",
  },
  {
    question: "Чем медитация на деньги отличается от медитации на изобилие?",
    answer:
      "Медитация на деньги сильнее сосредоточена на финансовой теме. Изобилие может включать более широкий круг ресурсов – время, отношения, знания, поддержку, энергию и возможности.",
  },
  {
    question: "Как часто нужно слушать медитацию для привлечения богатства?",
    answer:
      "Универсального правила нет. Можно слушать одну практику несколько дней, возвращаться к ней периодически или менять медитации в зависимости от задачи.",
  },
  {
    question: "Нужно ли верить в закон притяжения?",
    answer:
      "Нет. Медитацию можно использовать как практику внимания, визуализации, намерения и подготовки к действиям без принятия какой-либо эзотерической концепции.",
  },
  {
    question: "Когда лучше слушать такую медитацию?",
    answer:
      "В любое спокойное время, когда вас меньше отвлекают. Это может быть утро, вечер, время перед планированием или перед конкретными действиями.",
  },
  {
    question: "Можно ли слушать медитацию для привлечения денег перед сном?",
    answer:
      "Можно, если выбранная практика спокойная и не требует активного планирования. Если после неё хочется записывать цели или принимать решения, удобнее выбрать другое время.",
  },
  {
    question: "Можно ли слушать такие медитации бесплатно?",
    answer:
      "Да. На этой странице можно выбрать практику из плейлиста и начать слушать её онлайн.",
  },
];

const SIXTH_PAGE_SLUG = "meditatsiya-na-denezhnyy-potok-slushat-onlayn-besplatno";
const SIXTH_PAGE_H1 = "Медитация на денежный поток: слушать онлайн бесплатно";
const SIXTH_PAGE_TITLE = "Медитация на денежный поток: слушать онлайн бесплатно | АудиоЛад";
const SIXTH_PAGE_DESCRIPTION =
  "Слушайте медитации на денежный поток онлайн бесплатно на АудиоЛаде. Выберите подходящую практику из подборки и начните прослушивание.";

const SIXTH_EXPECTED_INTRO = [
  "На этой странице можно выбрать медитацию на денежный поток и начать слушать её онлайн бесплатно прямо на АудиоЛаде.",
  "Такая практика может помочь внимательнее посмотреть на своё отношение к деньгам, возможностям, заработку и финансовым решениям – без обещаний, что прослушивание само по себе автоматически увеличит доход.",
  "Выберите подходящую практику и начните слушать.",
];

const SIXTH_EXPECTED_SECTION_TITLES = [
  "Что такое медитация на денежный поток",
  "Что означает «денежный поток»",
  "Как выбрать медитацию на денежный поток",
  "Как слушать медитацию на денежный поток онлайн",
  "Можно ли слушать медитацию на денежный поток бесплатно",
  "Нужно ли слушать медитацию каждый день",
  "Когда лучше слушать медитацию на денежный поток",
  "Денежный поток и изобилие",
  "Что может мешать ощущению денежного потока",
  "Медитация на денежный поток и реальные действия",
  "Как понять, что конкретная медитация вам подходит",
  "Итог",
];

const SIXTH_EXPECTED_FAQ = [
  {
    question: "Что такое медитация на денежный поток?",
    answer:
      "Это аудиопрактика, в которой внимание направляется на отношение к движению денег, заработку, расходам, возможностям и финансовым решениям.",
  },
  {
    question: "Можно ли слушать медитацию на денежный поток бесплатно?",
    answer:
      "Да. На этой странице можно выбрать подходящую практику из плейлиста и слушать её онлайн бесплатно.",
  },
  {
    question: "Как часто нужно слушать такую медитацию?",
    answer:
      "Строгого правила нет. Можно повторять одну практику несколько дней, возвращаться к ней периодически или менять медитации в зависимости от задачи.",
  },
  {
    question: "Когда лучше слушать медитацию на денежный поток?",
    answer:
      "В любое спокойное время – утром, вечером, перед работой, планированием или важным финансовым решением. Важнее возможность сосредоточиться, а не конкретный час.",
  },
  {
    question: "Чем денежный поток отличается от изобилия?",
    answer:
      "Денежный поток обычно относится прежде всего к движению финансов, заработку, расходам и возможностям. Изобилие может включать более широкий круг ресурсов – время, отношения, знания, поддержку и энергию.",
  },
  {
    question: "Можно ли слушать медитацию на денежный поток перед сном?",
    answer:
      "Можно, если выбранная практика спокойная и не требует активного планирования. Если она настраивает на действия, удобнее выбрать другое время.",
  },
  {
    question: "Нужно ли визуализировать деньги во время практики?",
    answer:
      "Нет. Визуализация может использоваться, но она необязательна. Можно работать с вниманием, словами, ощущениями и вопросами, которые предлагает практика.",
  },
  {
    question: "Помогает ли медитация открыть денежный поток?",
    answer:
      "Медитация не гарантирует «открытия денежного потока» или увеличения дохода. Она может помочь спокойнее посмотреть на финансовую тему, заметить свои реакции, сформулировать цели и настроиться на действия, от которых действительно зависят изменения.",
  },
];

const SEVENTH_PAGE_SLUG = "meditatsiya-dlya-deneg-i-izobiliya-slushat-onlayn";
const SEVENTH_PAGE_H1 = "Медитация для денег и изобилия: слушать онлайн";
const SEVENTH_PAGE_TITLE = "Медитация для денег и изобилия: слушать онлайн | АудиоЛад";
const SEVENTH_PAGE_DESCRIPTION =
  "Слушайте медитации для денег и изобилия онлайн на АудиоЛаде. Выберите подходящую практику из подборки и начните бесплатное прослушивание.";

const SEVENTH_EXPECTED_INTRO = [
  "На этой странице можно выбрать медитацию для денег и изобилия и начать слушать её онлайн прямо на АудиоЛаде. Практики из подборки доступны бесплатно.",
  "Такая медитация может соединять внимание к финансовой теме с более широким ощущением достаточности, возможностей и внутренней устойчивости – без обещаний быстрого увеличения дохода или гарантированного результата.",
  "Выберите подходящую практику и начните слушать.",
];

const SEVENTH_EXPECTED_SECTION_TITLES = [
  "Что такое медитация для денег и изобилия",
  "Чем деньги отличаются от изобилия",
  "Почему люди ищут медитации именно для денег и изобилия",
  "Как выбрать подходящую медитацию",
  "Как правильно слушать медитацию онлайн",
  "Нужно ли слушать медитацию каждый день",
  "Деньги, изобилие и реальные действия",
  "Можно ли слушать медитацию бесплатно",
  "Как понять, что медитация вам подходит",
  "Итог",
];

const SEVENTH_EXPECTED_FAQ = [
  {
    question: "Что такое медитация для денег и изобилия?",
    answer:
      "Это аудиопрактика, которая соединяет внимание к финансовой теме с более широким ощущением достаточности, ресурсов, возможностей и внутренней устойчивости.",
  },
  {
    question: "Можно ли слушать такую медитацию бесплатно?",
    answer:
      "Да. На этой странице можно выбрать подходящую практику из плейлиста и слушать её онлайн бесплатно.",
  },
  {
    question: "Чем деньги отличаются от изобилия?",
    answer:
      "Деньги – конкретный финансовый ресурс. Изобилие можно понимать шире: оно может включать время, отношения, поддержку, знания, энергию и другие доступные человеку ресурсы.",
  },
  {
    question: "Как часто нужно слушать такую практику?",
    answer:
      "Строгого правила нет. Можно слушать ежедневно, несколько раз в неделю или возвращаться к медитации по мере необходимости.",
  },
  {
    question: "Когда лучше слушать медитацию?",
    answer:
      "В любое спокойное время, когда вас меньше отвлекают. Это может быть утро, вечер, время перед планированием или перед важными финансовыми задачами.",
  },
  {
    question: "Можно ли слушать её перед сном?",
    answer:
      "Можно, если выбранная практика спокойная и не побуждает к активному планированию. Если после неё хочется записывать цели и решения, лучше выбрать другое время.",
  },
  {
    question: "Нужно ли использовать наушники?",
    answer:
      "Нет. Наушники могут помочь лучше сосредоточиться, но они не являются обязательным условием.",
  },
  {
    question: "Помогает ли медитация увеличить доход?",
    answer:
      "Медитация сама по себе не гарантирует увеличение дохода. Она может помочь снизить напряжение, яснее сформулировать финансовые цели и сосредоточиться на дальнейших действиях. Реальные финансовые изменения зависят от решений, работы, навыков и других практических шагов.",
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

function testThirdPage() {
  const parsed = parseListenPageDefinition(
    MEDITATSIYA_NA_IZOBILIE_SLUSHAT_ONLAYN_BESPLATNO_PAGE,
  );
  assert(parsed.ok, "third production definition valid");
  assert(parsed.definition.slug === THIRD_PAGE_SLUG, "third page slug");
  assert(parsed.definition.playlistSlug === PLAYLIST_SLUG, "third playlistSlug");
  assert(
    parsed.definition.playlistSlug !== "meditatsiya-na-dengi",
    "third playlistSlug is not slugifyTitle form",
  );
  assert(
    parsed.definition.playlistSlug !== "denezhnyy-potok-9288",
    "third playlistSlug is not denezhnyy-potok-9288",
  );
  assert(parsed.definition.h1 === THIRD_PAGE_H1, "third h1 exact");
  assert(parsed.definition.title === parsed.definition.h1, "third title equals H1");
  assert(
    parsed.definition.description === THIRD_PAGE_DESCRIPTION,
    "third description equals TZ meta string",
  );
  assert(parsed.definition.intro.length === 3, "third page has three intro paragraphs");
  assert(
    parsed.definition.intro[0] === THIRD_EXPECTED_INTRO[0] &&
      parsed.definition.intro[1] === THIRD_EXPECTED_INTRO[1] &&
      parsed.definition.intro[2] === THIRD_EXPECTED_INTRO[2],
    "third intro[0..2] verbatim",
  );
  assert(parsed.definition.sections.length === 12, "third page has 12 sections");
  assert(
    parsed.definition.sections.map((section) => section.title).join("\n") ===
      THIRD_EXPECTED_SECTION_TITLES.join("\n"),
    "third page 12 section titles verbatim",
  );
  assert(parsed.definition.faq.length === 8, "third page has 8 FAQ items");
  assert(
    parsed.definition.faq.every(
      (item, index) =>
        item.question === THIRD_EXPECTED_FAQ[index].question &&
        item.answer === THIRD_EXPECTED_FAQ[index].answer,
    ),
    "third page 8 FAQ verbatim",
  );
  assert(!("internalLinks" in parsed.definition), "third page has no internalLinks");
  assert(!("cta" in parsed.definition), "third page has no cta");
  for (const key of FORBIDDEN_COMPOSITION_KEYS) {
    assert(!(key in parsed.definition), `third page has no static ${key}`);
  }

  const financialSection = parsed.definition.sections.find(
    (section) => section.title === "Медитация на финансовое изобилие",
  );
  assert(financialSection, "financial section present");
  const richBlocks = (financialSection.blocks ?? []).filter(
    (block) => block.kind === "rich_paragraph",
  );
  assert(richBlocks.length >= 2, "financial section has both rich_paragraphs");
  const links = richBlocks.flatMap((block) =>
    (block.segments ?? []).filter((segment) => "href" in segment),
  );
  assert(
    links.some(
      (link) =>
        link.href === "/listens/meditatsiya-na-dengi-slushat-onlayn-besplatno" &&
        link.label ===
          "https://audiolad.ru/listens/meditatsiya-na-dengi-slushat-onlayn-besplatno",
    ),
    "financial section links first listen with full URL label",
  );
  assert(
    links.some(
      (link) =>
        link.href === "/listens/denezhnaya-meditatsiya-slushat-onlayn-besplatno" &&
        link.label ===
          "https://audiolad.ru/listens/denezhnaya-meditatsiya-slushat-onlayn-besplatno",
    ),
    "financial section links second listen with full URL label",
  );

  const slugs = listListenPageDefinitions().map((page) => page.slug);
  assert(slugs.includes(PAGE_SLUG), "registry contains first listen slug");
  assert(slugs.includes(SECOND_PAGE_SLUG), "registry contains second listen slug");
  assert(slugs.includes(THIRD_PAGE_SLUG), "registry contains third listen slug");
  assert(
    MEDITATSIYA_NA_DENGI_SLUSHAT_ONLAYN_BESPLATNO_PAGE.playlistSlug ===
      MEDITATSIYA_NA_IZOBILIE_SLUSHAT_ONLAYN_BESPLATNO_PAGE.playlistSlug &&
      DENEZHNAYA_MEDITATSIYA_SLUSHAT_ONLAYN_BESPLATNO_PAGE.playlistSlug ===
        MEDITATSIYA_NA_IZOBILIE_SLUSHAT_ONLAYN_BESPLATNO_PAGE.playlistSlug &&
      MEDITATSIYA_NA_IZOBILIE_SLUSHAT_ONLAYN_BESPLATNO_PAGE.playlistSlug ===
        PLAYLIST_SLUG,
    "three listen pages may share playlistSlug meditaciya-na-dengi",
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
  assert(
    sitemapUrls.includes(
      "https://audiolad.ru/listens/meditatsiya-na-izobilie-slushat-onlayn-besplatno",
    ),
    "sitemap contains third listen canonical",
  );

  const data = resolveListenPageFromPlaylist({
    definition: MEDITATSIYA_NA_IZOBILIE_SLUSHAT_ONLAYN_BESPLATNO_PAGE,
    loaded: { ok: true, detail: makePlaylist() },
  });
  assert(data, "third page resolves against the same editorial playlist");
  const graph = buildListenPageJsonLdGraph(data, "https://audiolad.ru");
  const serialized = JSON.stringify(graph);
  assert(serialized.includes('"Article"'), "third JSON-LD Article");
  assert(serialized.includes('"WebPage"'), "third JSON-LD WebPage");
  assert(serialized.includes('"Organization"'), "third JSON-LD Organization");
  assert(serialized.includes('"BreadcrumbList"'), "third JSON-LD BreadcrumbList");
  assert(serialized.includes('"ItemList"'), "third JSON-LD ItemList");
  assert(serialized.includes('"FAQPage"'), "third JSON-LD FAQPage");
  assert(!serialized.includes("MusicPlaylist"), "third JSON-LD no MusicPlaylist");
  assert(!serialized.includes("AudioObject"), "third JSON-LD no AudioObject");
  assert(!serialized.includes("primaryPractice"), "third JSON-LD no primaryPractice");
}


function testFourthPage() {
  const parsed = parseListenPageDefinition(
    MEDITATSIYA_NA_BOGATSTVO_SLUSHAT_ONLAYN_PAGE,
  );
  assert(parsed.ok, "fourth production definition valid");
  assert(parsed.definition.slug === FOURTH_PAGE_SLUG, "fourth page slug");
  assert(parsed.definition.playlistSlug === PLAYLIST_SLUG, "fourth playlistSlug");
  assert(
    parsed.definition.playlistSlug !== "meditatsiya-na-dengi",
    "fourth playlistSlug is not slugifyTitle form",
  );
  assert(
    parsed.definition.playlistSlug !== "denezhnyy-potok-9288",
    "fourth playlistSlug is not denezhnyy-potok-9288",
  );
  assert(parsed.definition.h1 === FOURTH_PAGE_H1, "fourth h1 exact");
  assert(parsed.definition.title === FOURTH_PAGE_TITLE, "fourth title is TZ Meta Title");
  assert(parsed.definition.title !== parsed.definition.h1, "fourth title keeps brand suffix");
  assert(
    parsed.definition.description === FOURTH_PAGE_DESCRIPTION,
    "fourth description equals TZ meta string",
  );
  assert(parsed.definition.intro.length === 3, "fourth page has three intro paragraphs");
  assert(
    parsed.definition.intro[0] === FOURTH_EXPECTED_INTRO[0] &&
      parsed.definition.intro[1] === FOURTH_EXPECTED_INTRO[1] &&
      parsed.definition.intro[2] === FOURTH_EXPECTED_INTRO[2],
    "fourth intro[0..2] verbatim",
  );
  assert(parsed.definition.sections.length === 12, "fourth page has 12 sections");
  assert(
    parsed.definition.sections.map((section) => section.title).join("\n") ===
      FOURTH_EXPECTED_SECTION_TITLES.join("\n"),
    "fourth page 12 section titles verbatim",
  );
  assert(parsed.definition.faq.length === 8, "fourth page has 8 FAQ items");
  assert(
    parsed.definition.faq.every(
      (item, index) =>
        item.question === FOURTH_EXPECTED_FAQ[index].question &&
        item.answer === FOURTH_EXPECTED_FAQ[index].answer,
    ),
    "fourth page 8 FAQ verbatim",
  );
  assert(!("internalLinks" in parsed.definition), "fourth page has no internalLinks");
  assert(!("cta" in parsed.definition), "fourth page has no cta");
  for (const key of FORBIDDEN_COMPOSITION_KEYS) {
    assert(!(key in parsed.definition), `fourth page has no static ${key}`);
  }

  const abundanceSection = parsed.definition.sections.find(
    (section) => section.title === "Богатство и изобилие – это одно и то же?",
  );
  assert(abundanceSection, "abundance compare section present");
  const abundanceLinks = (abundanceSection.blocks ?? [])
    .filter((block) => block.kind === "rich_paragraph")
    .flatMap((block) => (block.segments ?? []).filter((segment) => "href" in segment));
  assert(
    abundanceLinks.some(
      (link) =>
        link.href === "/listens/meditatsiya-na-izobilie-slushat-onlayn-besplatno" &&
        link.label === "Медитация на изобилие: слушать онлайн бесплатно",
    ),
    "abundance section links izobilie listen by page title",
  );

  const moneySection = parsed.definition.sections.find(
    (section) => section.title === "Медитация на богатство и финансовые цели",
  );
  assert(moneySection, "money goals section present");
  const moneyLinks = (moneySection.blocks ?? [])
    .filter((block) => block.kind === "rich_paragraph")
    .flatMap((block) => (block.segments ?? []).filter((segment) => "href" in segment));
  assert(
    moneyLinks.some(
      (link) =>
        link.href === "/listens/meditatsiya-na-dengi-slushat-onlayn-besplatno" &&
        link.label === "Медитация на деньги: слушать онлайн бесплатно",
    ),
    "money section links first listen by page title",
  );
  assert(
    moneyLinks.some(
      (link) =>
        link.href === "/listens/denezhnaya-meditatsiya-slushat-onlayn-besplatno" &&
        link.label === "Денежная медитация: слушать онлайн бесплатно",
    ),
    "money section links second listen by page title",
  );

  const slugs = listListenPageDefinitions().map((page) => page.slug);
  assert(slugs.includes(PAGE_SLUG), "registry contains first listen slug");
  assert(slugs.includes(SECOND_PAGE_SLUG), "registry contains second listen slug");
  assert(slugs.includes(THIRD_PAGE_SLUG), "registry contains third listen slug");
  assert(slugs.includes(FOURTH_PAGE_SLUG), "registry contains fourth listen slug");
  assert(
    new Set(slugs).size === slugs.length,
    "listen slugs stay unique",
  );
  assert(
    MEDITATSIYA_NA_BOGATSTVO_SLUSHAT_ONLAYN_PAGE.playlistSlug === PLAYLIST_SLUG &&
      MEDITATSIYA_NA_IZOBILIE_SLUSHAT_ONLAYN_BESPLATNO_PAGE.playlistSlug ===
        PLAYLIST_SLUG,
    "fourth page reuses playlistSlug meditaciya-na-dengi",
  );

  const sitemap = mapListenPageDefinitionsToSitemapEntries(
    undefined,
    "https://audiolad.ru",
  );
  const sitemapUrls = sitemap.map((entry) => entry.url);
  assert(
    sitemapUrls.filter((url) => url === `https://audiolad.ru/listens/${FOURTH_PAGE_SLUG}`).length === 1,
    "sitemap contains fourth listen canonical exactly once",
  );
  assert(
    sitemapUrls.includes(
      "https://audiolad.ru/listens/meditatsiya-na-izobilie-slushat-onlayn-besplatno",
    ),
    "sitemap still contains third listen canonical",
  );

  const data = resolveListenPageFromPlaylist({
    definition: MEDITATSIYA_NA_BOGATSTVO_SLUSHAT_ONLAYN_PAGE,
    loaded: { ok: true, detail: makePlaylist() },
  });
  assert(data, "fourth page resolves against the same editorial playlist");
  const graph = buildListenPageJsonLdGraph(data, "https://audiolad.ru");
  const serialized = JSON.stringify(graph);
  assert(serialized.includes('"Article"'), "fourth JSON-LD Article");
  assert(serialized.includes('"WebPage"'), "fourth JSON-LD WebPage");
  assert(serialized.includes('"Organization"'), "fourth JSON-LD Organization");
  assert(serialized.includes('"BreadcrumbList"'), "fourth JSON-LD BreadcrumbList");
  assert(serialized.includes('"ItemList"'), "fourth JSON-LD ItemList");
  assert(serialized.includes('"FAQPage"'), "fourth JSON-LD FAQPage");
  assert(!serialized.includes("MusicPlaylist"), "fourth JSON-LD no MusicPlaylist");
  assert(!serialized.includes("AudioObject"), "fourth JSON-LD no AudioObject");
  assert(!serialized.includes("primaryPractice"), "fourth JSON-LD no primaryPractice");
}


function testFifthPage() {
  const parsed = parseListenPageDefinition(
    MEDITATSIYA_DLYA_PRIVLECHENIYA_DENEG_BOGATSTVA_I_IZOBILIYA_PAGE,
  );
  assert(parsed.ok, "fifth production definition valid");
  assert(parsed.definition.slug === FIFTH_PAGE_SLUG, "fifth page slug");
  assert(parsed.definition.playlistSlug === PLAYLIST_SLUG, "fifth playlistSlug");
  assert(
    parsed.definition.playlistSlug !== "meditatsiya-na-dengi",
    "fifth playlistSlug is not slugifyTitle form",
  );
  assert(
    parsed.definition.playlistSlug !== "denezhnyy-potok-9288",
    "fifth playlistSlug is not denezhnyy-potok-9288",
  );
  assert(parsed.definition.h1 === FIFTH_PAGE_H1, "fifth h1 exact");
  assert(parsed.definition.title === FIFTH_PAGE_TITLE, "fifth title is TZ Meta Title");
  assert(parsed.definition.title !== parsed.definition.h1, "fifth title keeps brand suffix");
  assert(
    parsed.definition.description === FIFTH_PAGE_DESCRIPTION,
    "fifth description equals TZ meta string",
  );
  assert(parsed.definition.intro.length === 3, "fifth page has three intro paragraphs");
  assert(
    parsed.definition.intro[0] === FIFTH_EXPECTED_INTRO[0] &&
      parsed.definition.intro[1] === FIFTH_EXPECTED_INTRO[1] &&
      parsed.definition.intro[2] === FIFTH_EXPECTED_INTRO[2],
    "fifth intro[0..2] verbatim",
  );
  assert(parsed.definition.sections.length === 13, "fifth page has 13 sections");
  assert(
    parsed.definition.sections.map((section) => section.title).join("\n") ===
      FIFTH_EXPECTED_SECTION_TITLES.join("\n"),
    "fifth page 13 section titles verbatim",
  );
  assert(parsed.definition.faq.length === 8, "fifth page has 8 FAQ items");
  assert(
    parsed.definition.faq.every(
      (item, index) =>
        item.question === FIFTH_EXPECTED_FAQ[index].question &&
        item.answer === FIFTH_EXPECTED_FAQ[index].answer,
    ),
    "fifth page 8 FAQ verbatim",
  );
  assert(!("internalLinks" in parsed.definition), "fifth page has no internalLinks");
  assert(!("cta" in parsed.definition), "fifth page has no cta");
  for (const key of FORBIDDEN_COMPOSITION_KEYS) {
    assert(!(key in parsed.definition), `fifth page has no static ${key}`);
  }

  const allLinks = parsed.definition.sections
    .flatMap((section) => section.blocks ?? [])
    .filter((block) => block.kind === "rich_paragraph")
    .flatMap((block) => (block.segments ?? []).filter((segment) => "href" in segment));
  assert(allLinks.length === 4, "fifth page has four title-anchor links");
  for (const link of allLinks) {
    assert(!String(link.label).includes("https://"), `fifth link label is not a URL: ${link.label}`);
    assert(link.href.startsWith("/listens/"), `fifth href is site-relative: ${link.href}`);
  }
  assert(
    allLinks.some(
      (link) =>
        link.href === "/listens/meditatsiya-na-dengi-slushat-onlayn-besplatno" &&
        link.label === "Медитация на деньги: слушать онлайн бесплатно",
    ),
    "fifth page links dengi listen by page title",
  );
  assert(
    allLinks.some(
      (link) =>
        link.href === "/listens/denezhnaya-meditatsiya-slushat-onlayn-besplatno" &&
        link.label === "Денежная медитация: слушать онлайн бесплатно",
    ),
    "fifth page links denezhnaya listen by page title",
  );
  assert(
    allLinks.some(
      (link) =>
        link.href === "/listens/meditatsiya-na-bogatstvo-slushat-onlayn" &&
        link.label === "Медитация на богатство: слушать онлайн",
    ),
    "fifth page links bogatstvo listen by page title",
  );
  assert(
    allLinks.some(
      (link) =>
        link.href === "/listens/meditatsiya-na-izobilie-slushat-onlayn-besplatno" &&
        link.label === "Медитация на изобилие: слушать онлайн бесплатно",
    ),
    "fifth page links izobilie listen by page title",
  );

  const contentSource = read(
    "src/lib/seo/listens/content/meditatsiya-dlya-privlecheniya-deneg-bogatstva-i-izobiliya.ts",
  );
  assert(
    !contentSource.includes("https://audiolad.ru/listens/"),
    "fifth content file has no visible production listen URLs",
  );

  const slugs = listListenPageDefinitions().map((page) => page.slug);
  assert(slugs.includes(PAGE_SLUG), "registry contains first listen slug");
  assert(slugs.includes(SECOND_PAGE_SLUG), "registry contains second listen slug");
  assert(slugs.includes(THIRD_PAGE_SLUG), "registry contains third listen slug");
  assert(slugs.includes(FOURTH_PAGE_SLUG), "registry contains fourth listen slug");
  assert(slugs.includes(FIFTH_PAGE_SLUG), "registry contains fifth listen slug");
  assert(new Set(slugs).size === slugs.length, "listen slugs stay unique");
  assert(
    MEDITATSIYA_DLYA_PRIVLECHENIYA_DENEG_BOGATSTVA_I_IZOBILIYA_PAGE.playlistSlug === PLAYLIST_SLUG,
    "fifth page reuses playlistSlug meditaciya-na-dengi",
  );

  const sitemap = mapListenPageDefinitionsToSitemapEntries(
    undefined,
    "https://audiolad.ru",
  );
  const sitemapUrls = sitemap.map((entry) => entry.url);
  assert(
    sitemapUrls.filter((url) => url === `https://audiolad.ru/listens/${FIFTH_PAGE_SLUG}`).length === 1,
    "sitemap contains fifth listen canonical exactly once",
  );

  const data = resolveListenPageFromPlaylist({
    definition: MEDITATSIYA_DLYA_PRIVLECHENIYA_DENEG_BOGATSTVA_I_IZOBILIYA_PAGE,
    loaded: { ok: true, detail: makePlaylist() },
  });
  assert(data, "fifth page resolves against the same editorial playlist");
  const graph = buildListenPageJsonLdGraph(data, "https://audiolad.ru");
  const serialized = JSON.stringify(graph);
  assert(serialized.includes('"Article"'), "fifth JSON-LD Article");
  assert(serialized.includes('"WebPage"'), "fifth JSON-LD WebPage");
  assert(serialized.includes('"Organization"'), "fifth JSON-LD Organization");
  assert(serialized.includes('"BreadcrumbList"'), "fifth JSON-LD BreadcrumbList");
  assert(serialized.includes('"ItemList"'), "fifth JSON-LD ItemList");
  assert(serialized.includes('"FAQPage"'), "fifth JSON-LD FAQPage");
  assert(!serialized.includes("MusicPlaylist"), "fifth JSON-LD no MusicPlaylist");
  assert(!serialized.includes("AudioObject"), "fifth JSON-LD no AudioObject");
  assert(!serialized.includes("primaryPractice"), "fifth JSON-LD no primaryPractice");
}


function testSixthPage() {
  const parsed = parseListenPageDefinition(
    MEDITATSIYA_NA_DENEZHNYY_POTOK_SLUSHAT_ONLAYN_BESPLATNO_PAGE,
  );
  assert(parsed.ok, "sixth production definition valid");
  assert(parsed.definition.slug === SIXTH_PAGE_SLUG, "sixth page slug");
  assert(parsed.definition.playlistSlug === PLAYLIST_SLUG, "sixth playlistSlug");
  assert(
    parsed.definition.playlistSlug !== "meditatsiya-na-dengi",
    "sixth playlistSlug is not slugifyTitle form",
  );
  assert(
    parsed.definition.playlistSlug !== "denezhnyy-potok-9288",
    "sixth playlistSlug is not denezhnyy-potok-9288",
  );
  assert(parsed.definition.h1 === SIXTH_PAGE_H1, "sixth h1 exact");
  assert(parsed.definition.title === SIXTH_PAGE_TITLE, "sixth title is TZ Meta Title");
  assert(parsed.definition.title !== parsed.definition.h1, "sixth title keeps brand suffix");
  assert(
    parsed.definition.description === SIXTH_PAGE_DESCRIPTION,
    "sixth description equals TZ meta string",
  );
  assert(parsed.definition.intro.length === 3, "sixth page has three intro paragraphs");
  assert(
    parsed.definition.intro[0] === SIXTH_EXPECTED_INTRO[0] &&
      parsed.definition.intro[1] === SIXTH_EXPECTED_INTRO[1] &&
      parsed.definition.intro[2] === SIXTH_EXPECTED_INTRO[2],
    "sixth intro[0..2] verbatim",
  );
  assert(parsed.definition.sections.length === 12, "sixth page has 12 sections");
  assert(
    parsed.definition.sections.map((section) => section.title).join("\n") ===
      SIXTH_EXPECTED_SECTION_TITLES.join("\n"),
    "sixth page 12 section titles verbatim",
  );
  assert(parsed.definition.faq.length === 8, "sixth page has 8 FAQ items");
  assert(
    parsed.definition.faq.every(
      (item, index) =>
        item.question === SIXTH_EXPECTED_FAQ[index].question &&
        item.answer === SIXTH_EXPECTED_FAQ[index].answer,
    ),
    "sixth page 8 FAQ verbatim",
  );
  assert(!("internalLinks" in parsed.definition), "sixth page has no internalLinks");
  assert(!("cta" in parsed.definition), "sixth page has no cta");
  for (const key of FORBIDDEN_COMPOSITION_KEYS) {
    assert(!(key in parsed.definition), `sixth page has no static ${key}`);
  }

  const allLinks = parsed.definition.sections
    .flatMap((section) => section.blocks ?? [])
    .filter((block) => block.kind === "rich_paragraph")
    .flatMap((block) => (block.segments ?? []).filter((segment) => "href" in segment));
  assert(allLinks.length === 3, "sixth page has three title-anchor links");
  for (const link of allLinks) {
    assert(!String(link.label).includes("https://"), `sixth link label is not a URL: ${link.label}`);
    assert(link.href.startsWith("/listens/"), `sixth href is site-relative: ${link.href}`);
  }
  assert(
    allLinks.some(
      (link) =>
        link.href === "/listens/meditatsiya-na-izobilie-slushat-onlayn-besplatno" &&
        link.label === "Медитация на изобилие: слушать онлайн бесплатно",
    ),
    "sixth page links izobilie listen by page title",
  );
  assert(
    allLinks.some(
      (link) =>
        link.href === "/listens/meditatsiya-na-dengi-slushat-onlayn-besplatno" &&
        link.label === "Медитация на деньги: слушать онлайн бесплатно",
    ),
    "sixth page links dengi listen by page title",
  );
  assert(
    allLinks.some(
      (link) =>
        link.href === "/listens/meditatsiya-dlya-privlecheniya-deneg-bogatstva-i-izobiliya" &&
        link.label === "Медитация для привлечения денег, богатства и изобилия",
    ),
    "sixth page links privlecheniya listen by page title",
  );

  const contentSource = read(
    "src/lib/seo/listens/content/meditatsiya-na-denezhnyy-potok-slushat-onlayn-besplatno.ts",
  );
  assert(
    !contentSource.includes("https://audiolad.ru/listens/"),
    "sixth content file has no visible production listen URLs",
  );

  const slugs = listListenPageDefinitions().map((page) => page.slug);
  assert(slugs.includes(PAGE_SLUG), "registry contains first listen slug");
  assert(slugs.includes(SECOND_PAGE_SLUG), "registry contains second listen slug");
  assert(slugs.includes(THIRD_PAGE_SLUG), "registry contains third listen slug");
  assert(slugs.includes(FOURTH_PAGE_SLUG), "registry contains fourth listen slug");
  assert(slugs.includes(FIFTH_PAGE_SLUG), "registry contains fifth listen slug");
  assert(slugs.includes(SIXTH_PAGE_SLUG), "registry contains sixth listen slug");
  assert(new Set(slugs).size === slugs.length, "listen slugs stay unique");
  assert(
    MEDITATSIYA_NA_DENEZHNYY_POTOK_SLUSHAT_ONLAYN_BESPLATNO_PAGE.playlistSlug === PLAYLIST_SLUG,
    "sixth page reuses playlistSlug meditaciya-na-dengi",
  );

  const sitemap = mapListenPageDefinitionsToSitemapEntries(
    undefined,
    "https://audiolad.ru",
  );
  const sitemapUrls = sitemap.map((entry) => entry.url);
  assert(
    sitemapUrls.filter((url) => url === `https://audiolad.ru/listens/${SIXTH_PAGE_SLUG}`).length === 1,
    "sitemap contains sixth listen canonical exactly once",
  );

  const data = resolveListenPageFromPlaylist({
    definition: MEDITATSIYA_NA_DENEZHNYY_POTOK_SLUSHAT_ONLAYN_BESPLATNO_PAGE,
    loaded: { ok: true, detail: makePlaylist() },
  });
  assert(data, "sixth page resolves against the same editorial playlist");
  const graph = buildListenPageJsonLdGraph(data, "https://audiolad.ru");
  const serialized = JSON.stringify(graph);
  assert(serialized.includes('"Article"'), "sixth JSON-LD Article");
  assert(serialized.includes('"WebPage"'), "sixth JSON-LD WebPage");
  assert(serialized.includes('"Organization"'), "sixth JSON-LD Organization");
  assert(serialized.includes('"BreadcrumbList"'), "sixth JSON-LD BreadcrumbList");
  assert(serialized.includes('"ItemList"'), "sixth JSON-LD ItemList");
  assert(serialized.includes('"FAQPage"'), "sixth JSON-LD FAQPage");
  assert(!serialized.includes("MusicPlaylist"), "sixth JSON-LD no MusicPlaylist");
  assert(!serialized.includes("AudioObject"), "sixth JSON-LD no AudioObject");
  assert(!serialized.includes("primaryPractice"), "sixth JSON-LD no primaryPractice");
}


function testSeventhPage() {
  const parsed = parseListenPageDefinition(
    MEDITATSIYA_DLYA_DENEG_I_IZOBILIYA_SLUSHAT_ONLAYN_PAGE,
  );
  assert(parsed.ok, "seventh production definition valid");
  assert(parsed.definition.slug === SEVENTH_PAGE_SLUG, "seventh page slug");
  assert(parsed.definition.playlistSlug === PLAYLIST_SLUG, "seventh playlistSlug");
  assert(
    parsed.definition.playlistSlug !== "meditatsiya-na-dengi",
    "seventh playlistSlug is not slugifyTitle form",
  );
  assert(
    parsed.definition.playlistSlug !== "denezhnyy-potok-9288",
    "seventh playlistSlug is not denezhnyy-potok-9288",
  );
  assert(parsed.definition.h1 === SEVENTH_PAGE_H1, "seventh h1 exact");
  assert(parsed.definition.title === SEVENTH_PAGE_TITLE, "seventh title is TZ Meta Title");
  assert(parsed.definition.title !== parsed.definition.h1, "seventh title keeps brand suffix");
  assert(
    parsed.definition.description === SEVENTH_PAGE_DESCRIPTION,
    "seventh description equals TZ meta string",
  );
  assert(parsed.definition.intro.length === 3, "seventh page has three intro paragraphs");
  assert(
    parsed.definition.intro[0] === SEVENTH_EXPECTED_INTRO[0] &&
      parsed.definition.intro[1] === SEVENTH_EXPECTED_INTRO[1] &&
      parsed.definition.intro[2] === SEVENTH_EXPECTED_INTRO[2],
    "seventh intro[0..2] verbatim",
  );
  assert(parsed.definition.sections.length === 10, "seventh page has 10 sections");
  assert(
    parsed.definition.sections.map((section) => section.title).join("\n") ===
      SEVENTH_EXPECTED_SECTION_TITLES.join("\n"),
    "seventh page 10 section titles verbatim",
  );
  assert(parsed.definition.faq.length === 8, "seventh page has 8 FAQ items");
  assert(
    parsed.definition.faq.every(
      (item, index) =>
        item.question === SEVENTH_EXPECTED_FAQ[index].question &&
        item.answer === SEVENTH_EXPECTED_FAQ[index].answer,
    ),
    "seventh page 8 FAQ verbatim",
  );
  assert(!("internalLinks" in parsed.definition), "seventh page has no internalLinks");
  assert(!("cta" in parsed.definition), "seventh page has no cta");
  for (const key of FORBIDDEN_COMPOSITION_KEYS) {
    assert(!(key in parsed.definition), `seventh page has no static ${key}`);
  }

  const allLinks = parsed.definition.sections
    .flatMap((section) => section.blocks ?? [])
    .filter((block) => block.kind === "rich_paragraph")
    .flatMap((block) => (block.segments ?? []).filter((segment) => "href" in segment));
  assert(allLinks.length === 3, "seventh page has three title-anchor links");
  for (const link of allLinks) {
    assert(!String(link.label).includes("https://"), `seventh link label is not a URL: ${link.label}`);
    assert(link.href.startsWith("/listens/"), `seventh href is site-relative: ${link.href}`);
  }
  assert(
    allLinks.some(
      (link) =>
        link.href === "/listens/meditatsiya-na-dengi-slushat-onlayn-besplatno" &&
        link.label === "Медитация на деньги: слушать онлайн бесплатно",
    ),
    "seventh page links dengi listen by page title",
  );
  assert(
    allLinks.some(
      (link) =>
        link.href === "/listens/meditatsiya-na-izobilie-slushat-onlayn-besplatno" &&
        link.label === "Медитация на изобилие: слушать онлайн бесплатно",
    ),
    "seventh page links izobilie listen by page title",
  );
  assert(
    allLinks.some(
      (link) =>
        link.href === "/listens/denezhnaya-meditatsiya-slushat-onlayn-besplatno" &&
        link.label === "Денежная медитация: слушать онлайн бесплатно",
    ),
    "seventh page links denezhnaya listen by page title",
  );

  const contentSource = read(
    "src/lib/seo/listens/content/meditatsiya-dlya-deneg-i-izobiliya-slushat-onlayn.ts",
  );
  assert(
    !contentSource.includes("https://audiolad.ru/listens/"),
    "seventh content file has no visible production listen URLs",
  );

  const slugs = listListenPageDefinitions().map((page) => page.slug);
  assert(slugs.includes(PAGE_SLUG), "registry contains first listen slug");
  assert(slugs.includes(SECOND_PAGE_SLUG), "registry contains second listen slug");
  assert(slugs.includes(THIRD_PAGE_SLUG), "registry contains third listen slug");
  assert(slugs.includes(FOURTH_PAGE_SLUG), "registry contains fourth listen slug");
  assert(slugs.includes(FIFTH_PAGE_SLUG), "registry contains fifth listen slug");
  assert(slugs.includes(SIXTH_PAGE_SLUG), "registry contains sixth listen slug");
  assert(slugs.includes(SEVENTH_PAGE_SLUG), "registry contains seventh listen slug");
  assert(new Set(slugs).size === slugs.length, "listen slugs stay unique");
  assert(
    MEDITATSIYA_DLYA_DENEG_I_IZOBILIYA_SLUSHAT_ONLAYN_PAGE.playlistSlug === PLAYLIST_SLUG,
    "seventh page reuses playlistSlug meditaciya-na-dengi",
  );

  const sitemap = mapListenPageDefinitionsToSitemapEntries(
    undefined,
    "https://audiolad.ru",
  );
  const sitemapUrls = sitemap.map((entry) => entry.url);
  assert(
    sitemapUrls.filter((url) => url === `https://audiolad.ru/listens/${SEVENTH_PAGE_SLUG}`).length === 1,
    "sitemap contains seventh listen canonical exactly once",
  );

  const data = resolveListenPageFromPlaylist({
    definition: MEDITATSIYA_DLYA_DENEG_I_IZOBILIYA_SLUSHAT_ONLAYN_PAGE,
    loaded: { ok: true, detail: makePlaylist() },
  });
  assert(data, "seventh page resolves against the same editorial playlist");
  const graph = buildListenPageJsonLdGraph(data, "https://audiolad.ru");
  const serialized = JSON.stringify(graph);
  assert(serialized.includes('"Article"'), "seventh JSON-LD Article");
  assert(serialized.includes('"WebPage"'), "seventh JSON-LD WebPage");
  assert(serialized.includes('"Organization"'), "seventh JSON-LD Organization");
  assert(serialized.includes('"BreadcrumbList"'), "seventh JSON-LD BreadcrumbList");
  assert(serialized.includes('"ItemList"'), "seventh JSON-LD ItemList");
  assert(serialized.includes('"FAQPage"'), "seventh JSON-LD FAQPage");
  assert(!serialized.includes("MusicPlaylist"), "seventh JSON-LD no MusicPlaylist");
  assert(!serialized.includes("AudioObject"), "seventh JSON-LD no AudioObject");
  assert(!serialized.includes("primaryPractice"), "seventh JSON-LD no primaryPractice");
}

const tests = [
  ["definition", testDefinition],
  ["registry and sitemap", testRegistryAndSitemap],
  ["second listen page", testSecondPage],
  ["third listen page", testThirdPage],
  ["fourth listen page", testFourthPage],
  ["fifth listen page", testFifthPage],
  ["sixth listen page", testSixthPage],
  ["seventh listen page", testSeventhPage],
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
