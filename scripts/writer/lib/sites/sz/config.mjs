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
  // Same wording as angel-hranitel (stage 24); a brief may override it with `phones`.
  phones: "При острой необходимости звоните 112. При психологическом кризисе – телефон доверия 8-800-7000-600. При опасных телесных симптомах (боль в груди, сильная одышка) – 103 или 112.",
  disclaimer: "Эта статья не заменяет консультацию психолога или врача. Эзотерические представления описаны как культурные и духовные традиции, а не как наука; упражнения не являются лечением.",
  specialistHeading: "Когда стоит обратиться к специалисту",
  readmoreHeading: "Читайте также",
  storyEndingLead: "**Чем закончилась история.** ",
  // Examples only – the site has no topic registry (frontmatter `topic` is a free label).
  topics: ["napravleniya-ezoteriki", "vera-i-nauka", "znaki-i-simvoly"],
  limits: {
    story: [200, 400],
    mainBody: [880, 1400],
    total: [1600, 2200],
    faqAnswer: [40, 80],
    faqCount: 5,
    practiceIntroWords: 50,
    checklistWords: 12,
    seoTitleMax: 60,
    description: [140, 160],
    mainQuery: [2, 4],
    bodyH2: [4, 6],
    contextualLinks: [2, 5],
  },
};
