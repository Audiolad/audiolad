import Image from "next/image";

import { SchoolTariffsAnchorLink } from "@/components/school/SchoolTariffsAnchorLink";

type SchoolBonus = {
  id: string;
  title: string;
  price: string;
  image: string;
  alt: string;
  description: readonly string[];
};

const TITLE = "Бонусы для участников «Премиум» и VIP";

const INTRO =
  "Дополнительные материалы помогут быстрее выбрать своё направление, увереннее создавать и публиковать аудиопродукты и спокойнее развивать своё авторское дело.";

const GIFT_LABEL = "В подарок";

const BONUSES: readonly SchoolBonus[] = [
  {
    id: "ideas",
    title: "50 готовых идей для авторских аудиопродуктов",
    price: "5 555 ₽",
    image: "/school/bonuses/50-audio-product-ideas.webp",
    alt: "Обложка «50 готовых идей для авторских аудиопродуктов»",
    description: [
      "Вы получите подборку из 50 востребованных тем для создания медитаций, аудиопрактик, аудиокурсов и программ.",
      "Этот бонус поможет быстро выбрать своё направление и больше никогда не задаваться вопросом: «О чём мне записывать?»",
    ],
  },
  {
    id: "confident",
    title: "Аудиопрограмма «Уверенный автор»",
    price: "7 777 ₽",
    image: "/school/bonuses/confident-author.webp",
    alt: "Обложка аудиопрограммы «Уверенный автор»",
    description: [
      "Комплекс авторских аудиопрактик, который поможет преодолеть сомнения, страх публикации, внутреннего критика и перфекционизм, чтобы увереннее создавать и публиковать собственные аудиопродукты.",
    ],
  },
  {
    id: "money",
    title: "Аудиопрограмма «Денежное мышление автора»",
    price: "9 999 ₽",
    image: "/school/bonuses/author-money-mindset.webp",
    alt: "Обложка аудиопрограммы «Денежное мышление автора»",
    description: [
      "Комплекс авторских аудиопрактик, который поможет изменить отношение к деньгам, легче принимать оплату за свои знания, спокойнее говорить о стоимости продуктов и постепенно расширять свою финансовую ёмкость.",
    ],
  },
] as const;

const TOTAL_TITLE = "Общая стоимость бонусов";
const TOTAL_PRICE = "22 331 ₽";
const TOTAL_NOTE = "Все три бонуса уже входят в варианты «Премиум» и VIP.";
const TOTAL_ACCENT = "Стоимость бонусов выше стоимости варианта «Премиум».";
const CTA_LABEL = "Выбрать вариант участия";

export default function SchoolBonusesScreen() {
  return (
    <section
      className="school-bonuses"
      aria-label="Бонусы для участников Премиум и VIP"
    >
      <div className="school-bonuses__header">
        <h2 className="school-bonuses__title">{TITLE}</h2>
        <p className="school-bonuses__intro">{INTRO}</p>
      </div>

      <div className="school-bonuses__grid">
        {BONUSES.map((bonus) => (
          <article key={bonus.id} className="school-bonuses__card">
            <div className="school-bonuses__cover">
              <Image
                src={bonus.image}
                alt={bonus.alt}
                width={1254}
                height={1254}
                className="school-bonuses__image"
                sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 360px"
              />
            </div>

            <div className="school-bonuses__body">
              <p className="school-bonuses__gift">{GIFT_LABEL}</p>
              <h3 className="school-bonuses__name">{bonus.title}</h3>
              <p className="school-bonuses__price">
                <span className="school-number">{bonus.price}</span>
              </p>
              <div className="school-bonuses__description">
                {bonus.description.map((paragraph) => (
                  <p key={paragraph} className="school-bonuses__text">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="school-bonuses__total">
        <h3 className="school-bonuses__total-title">{TOTAL_TITLE}</h3>
        <p className="school-bonuses__total-price">
          <span className="school-number">{TOTAL_PRICE}</span>
        </p>
        <p className="school-bonuses__total-note">{TOTAL_NOTE}</p>
        <p className="school-bonuses__total-accent">{TOTAL_ACCENT}</p>
      </div>

      <SchoolTariffsAnchorLink className="school-bonuses__cta">
        {CTA_LABEL}
      </SchoolTariffsAnchorLink>
    </section>
  );
}
