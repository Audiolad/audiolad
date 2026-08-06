import SchoolTestimonialsClient from "@/components/school/SchoolTestimonialsClient";
import { SchoolTariffsAnchorLink } from "@/components/school/SchoolTariffsAnchorLink";

const TITLE = "Истории учеников и участников программ";

const INTRO =
  "Эти люди проходили обучение, сопровождение и авторские программы Сергея Петрова. Они рассказывают о своих результатах, изменениях и опыте совместной работы.";

const DISCLAIMER =
  "Результаты участников индивидуальны и зависят от опыта, действий, выбранного направления и других обстоятельств.";

const CTA_LABEL = "Выбрать вариант участия";

export default function SchoolTestimonialsScreen() {
  return (
    <section
      className="school-stories"
      aria-label="Истории учеников и участников программ"
    >
      <div className="school-stories__header">
        <h2 className="school-stories__title">{TITLE}</h2>
        <p className="school-stories__intro">{INTRO}</p>
      </div>

      <SchoolTestimonialsClient />

      <p className="school-stories__disclaimer">{DISCLAIMER}</p>

      <SchoolTariffsAnchorLink className="school-stories__cta">
        {CTA_LABEL}
      </SchoolTariffsAnchorLink>
    </section>
  );
}
