import { SchoolTariffsAnchorLink } from "@/components/school/SchoolTariffsAnchorLink";

const TITLE = "Что у вас будет после окончания Школы";

const INTRO =
  "К завершению обучения у вас появится не только понимание того, как создавать аудиопродукты, но и первые реальные результаты.";

const RESULTS = [
  "Собственное авторское направление;",
  "Первая линейка авторских аудиопродуктов;",
  "Готовые медитации, аудиопрактики, программы или аудиокурсы;",
  "Красиво оформленные карточки продуктов;",
  "Опубликованные аудиопродукты на платформе АудиоЛад;",
  "Понимание, как развивать своё творчество дальше;",
  "Возможность привлекать первых слушателей и получать доход от своих знаний.",
] as const;

const CTA_LABEL = "Посмотреть пакеты участия";

function CheckMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4.5 10.4 8.2 14 15.5 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SchoolResultsScreen() {
  return (
    <section
      className="school-results"
      aria-label="Что у вас будет после окончания Школы"
    >
      <h2 className="school-results__title">{TITLE}</h2>
      <p className="school-results__intro">{INTRO}</p>

      <ul className="school-results__list">
        {RESULTS.map((item) => (
          <li key={item} className="school-results__item">
            <span className="school-results__check" aria-hidden="true">
              <CheckMark className="school-results__check-icon" />
            </span>
            <span className="school-results__text">{item}</span>
          </li>
        ))}
      </ul>

      <SchoolTariffsAnchorLink className="school-results__cta">
        {CTA_LABEL}
      </SchoolTariffsAnchorLink>
    </section>
  );
}
