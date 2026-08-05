const TITLE = "Как проходит обучение";

const INTRO =
  "Всё обучение построено так, чтобы вы постепенно прошли путь от первой идеи до собственных опубликованных аудиопродуктов.";

const STEPS = [
  "Регистрируетесь в Школе Аудиопрактик.",
  "Проходите двухдневный онлайн-интенсив.",
  "Получаете пошаговую систему создания аудиопродуктов.",
  "Выполняете практические задания.",
  "Создаёте собственные медитации, аудиопрактики и программы.",
  "Получаете обратную связь и рекомендации.",
  "Публикуете свои первые аудиопродукты на платформе АудиоЛад.",
  "Начинаете развивать собственное авторское направление.",
] as const;

const ACCENT = "От первой идеи – до собственных опубликованных аудиопродуктов.";

export default function SchoolLearningProcessScreen() {
  return (
    <section
      className="school-learning"
      aria-label="Как проходит обучение"
    >
      <div className="school-learning__header">
        <h2 className="school-learning__title">{TITLE}</h2>
        <p className="school-learning__intro">{INTRO}</p>
      </div>

      <ol className="school-learning__steps">
        {STEPS.map((step, index) => {
          const number = index + 1;
          const isResult = number >= 7;

          return (
            <li
              key={step}
              className={
                isResult
                  ? "school-learning__step school-learning__step--result"
                  : "school-learning__step"
              }
            >
              <span
                className="school-learning__step-num school-number"
                aria-hidden="true"
              >
                {number}
              </span>
              <p className="school-learning__step-text">{step}</p>
            </li>
          );
        })}
      </ol>

      <p className="school-learning__accent">{ACCENT}</p>
    </section>
  );
}
