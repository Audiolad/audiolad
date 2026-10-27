// sergey-zoya.ru site profile for «Райтер» (`--site sz`). Everything constant in an article
// lives here and is inserted by the assembler – the model never writes it.
export const SZ = {
  id: "sz",
  repo: process.env.WRITER_SZ_GITHUB_REPO ?? "Audiolad/sergey-zoya-site",
  host: "sergey-zoya.ru",
  author: "Зоя Петрова",
  practiceAuthor: "Сергей и Зоя",
  // Sergey's MAX rule: one MAX funnel per article – the site default link behind this label;
  // no ctaUrl, no max.ru / max-potok.ru in the text.
  maxLabel: "Выбрать ангела и получить послание в MAX",
  referenceGallerySlug: "kak-perestat-sebya-kritikovat",
  allAngelsImage: '<img src="/media/angels/four-angels-06-all-angels.webp" alt="Все четыре ангела вместе" width="1254" height="1254" loading="lazy">',
  // 8-800-7000-600 is the line for women who suffered domestic violence, not a general crisis line
  // (review of sergey-zoya-site #77). A brief may override the whole sentence with `phones`.
  phones: "При острой необходимости звоните 112. При домашнем насилии – Всероссийский телефон доверия для женщин 8-800-7000-600 (бесплатно, круглосуточно). При опасных телесных симптомах (боль в груди, сильная одышка) – 103 или 112.",
  disclaimer: "Эта статья не заменяет консультацию психолога или врача. Эзотерические представления описаны как культурные и духовные традиции, а не как наука; упражнения не являются лечением.",
  specialistHeading: "Когда стоит обратиться к специалисту",
  readmoreHeading: "Читайте также",
  storyEndingLead: "**Чем закончилась история.** ",
  // Examples only – the site has no topic registry (frontmatter `topic` is a free label).
  topics: ["napravleniya-ezoteriki", "vera-i-nauka", "znaki-i-simvoly"],
  limits: {
    story: [200, 400],
    // Prompt asks for about 1200. The gate still accepts 880 and keeps a sane ceiling.
    mainBody: [880, 1600],
    total: [1600, 2200],
    faqAnswer: [40, 80],
    faqCount: 5,
    practiceIntroWords: 50,
    checklistWords: 12,
    seoTitleMax: 60,
    description: [140, 160],
    mainQuery: [2, 4],
    bodyH2: [4, 6],
    // One rule for the brief, the draft prompt and the gate: a brief lists at most this
    // many contextual links, and the gate requires exactly that set.
    contextualLinks: [2, 5],
  },
  // Control run: 12 ₽ stops one article, 120 ₽ stops the run. Charged rubles, not a new model.
  articleRubCap: 12,
  runRubCap: 120,
};

// Control 14+15 (gpt-5.4-mini, --max-tokens 9000): bodies landed at 521–763 words.
// A ~25k-token prompt fit into the 12 ₽ cap leaves ~9450 output tokens, enough for
// well over 1200 Russian words, so the drafts were short because the prompt's old
// midpoint sat near 1000 and the model undershot it. The band below aims at ~1200.
// The gate still accepts 880–1600.
const rangeMid = ([min, max]) => (min + max) / 2;
export const SZ_BODY_PLAN = {
  target: [1100, 1300],
  sectionsBefore: { count: 2, wordsEach: [260, 300] },
  tableProse: [90, 110],
  stepsIntro: [50, 60],
  stepText: [80, 100],
  sectionsAfter: 0,
  specialistIntro: [50, 60],
  h2: 5,
  // Headings, table cells, specialist items, phones and disclaimer are inside the gate's
  // main-body count and are not part of the paragraph budgets above.
  chromeWords: 160,
};

export function szBodyPlanBudget(plan = SZ_BODY_PLAN) {
  const prose = (bound) => plan.sectionsBefore.count * plan.sectionsBefore.wordsEach[bound]
    + plan.tableProse[bound]
    + plan.stepsIntro[bound]
    + 3 * plan.stepText[bound]
    + plan.specialistIntro[bound];
  const low = prose(0) + plan.chromeWords;
  const high = prose(1) + plan.chromeWords;
  const mid = plan.sectionsBefore.count * rangeMid(plan.sectionsBefore.wordsEach)
    + rangeMid(plan.tableProse)
    + rangeMid(plan.stepsIntro)
    + 3 * rangeMid(plan.stepText)
    + rangeMid(plan.specialistIntro)
    + plan.chromeWords;
  return { low, mid, high };
}
