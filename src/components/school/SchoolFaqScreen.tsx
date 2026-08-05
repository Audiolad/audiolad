import SchoolFaqAccordion from "@/components/school/SchoolFaqAccordion";
import { SchoolTariffsAnchorLink } from "@/components/school/SchoolTariffsAnchorLink";
import { SCHOOL_FAQ_ITEMS } from "@/lib/school/faq";

const TITLE = "Часто задаваемые вопросы";

const INTRO =
  "Здесь собраны ответы на основные вопросы о программе, формате обучения и участии в Школе Аудиопрактик.";

const CLOSING =
  "Остались вопросы или уже готовы создать свой первый авторский аудиопродукт?";

const CTA_LABEL = "Выбрать пакет участия";

export default function SchoolFaqScreen() {
  return (
    <section
      className="school-faq"
      aria-label="Часто задаваемые вопросы"
    >
      <div className="school-faq__inner">
        <div className="school-faq__header">
          <h2 className="school-faq__title">{TITLE}</h2>
          <p className="school-faq__intro">{INTRO}</p>
        </div>

        <SchoolFaqAccordion items={SCHOOL_FAQ_ITEMS} />

        <div className="school-faq__closing">
          <p className="school-faq__closing-text">{CLOSING}</p>
          <SchoolTariffsAnchorLink className="school-faq__cta">
            {CTA_LABEL}
          </SchoolTariffsAnchorLink>
        </div>
      </div>
    </section>
  );
}
