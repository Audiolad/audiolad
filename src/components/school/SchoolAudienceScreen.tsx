const TITLE = "Для кого создана Школа Аудиопрактик";

const INTRO = "Эта программа подойдёт вам, если вы:";

const SITUATIONS = [
  "Хотите передавать свои знания, опыт или внутреннее состояние через голос;",
  "Чувствуете, что можете помогать людям;",
  "Мечтаете создать собственное авторское направление;",
  "Давно хотите записывать медитации, аудиопрактики или другие аудиопродукты, но не знаете, с чего начать;",
  "Хотите превратить своё увлечение в любимое дело;",
  "Хотите создать продукты, которые смогут помогать людям и приносить доход без вашего постоянного личного участия;",
  "Хотите собрать свою первую линейку авторских аудиопродуктов.",
] as const;

const AUDIENCE_LEAD = "Особенно полезно для:";

const AUDIENCES = [
  "Психологов;",
  "Коучей;",
  "Наставников;",
  "Преподавателей;",
  "Энергопрактиков;",
  "Специалистов помогающих профессий;",
  "Авторов медитаций;",
  "Всех, кто хочет делиться своими знаниями через аудиоформат.",
] as const;

const CLOSING = [
  "Для участия не требуется профессиональный статус, готовые продукты или опыт записи.",
  "Даже если сегодня у вас ещё нет ни одной аудиопрактики, мы поможем пройти путь от идеи до первых опубликованных авторских аудиопродуктов.",
] as const;

export default function SchoolAudienceScreen() {
  return (
    <section
      className="school-audience"
      aria-label="Для кого создана Школа Аудиопрактик"
    >
      <div className="school-audience__layout">
        <div className="school-audience__primary">
          <h2 className="school-audience__title">{TITLE}</h2>
          <p className="school-audience__intro">{INTRO}</p>

          <ul className="school-audience__situations">
            {SITUATIONS.map((item) => (
              <li key={item} className="school-audience__situation">
                <span
                  className="school-audience__situation-mark"
                  aria-hidden="true"
                />
                <span className="school-audience__situation-text">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="school-audience__secondary">
          <p className="school-audience__audience-lead">{AUDIENCE_LEAD}</p>

          <ul className="school-audience__audiences">
            {AUDIENCES.map((item) => (
              <li key={item} className="school-audience__chip">
                {item}
              </li>
            ))}
          </ul>

          <div className="school-audience__closing">
            {CLOSING.map((paragraph) => (
              <p key={paragraph} className="school-audience__closing-text">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
