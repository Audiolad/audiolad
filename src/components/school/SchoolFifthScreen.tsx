function SchoolFutureWaves({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 220 56"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 28c8-12 16-12 24 0s16 12 24 0 16-12 24 0 16 12 24 0 16-12 24 0 16 12 24 0 16-12 24 0 16 12 24 0 16-12 24 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M14 28c6-8 12-8 18 0s12 8 18 0 12-8 18 0 12 8 18 0 12-8 18 0 12 8 18 0 12-8 18 0 12 8 18 0 12-8 18 0"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.32"
      />
    </svg>
  );
}

const TITLE = "Представьте...";

const INTRO = [
  "Вы отдыхаете, проводите время с близкими, путешествуете, занимаетесь любимым делом или создаёте новые продукты.",
  "А в это время люди слушают ваши медитации, аудиопрактики и программы.",
] as const;

const OUTCOMES = [
  "Они получают новые знания.",
  "Находят внутреннюю опору.",
  "Меняют своё состояние.",
  "Рекомендуют ваши продукты друзьям и близким.",
  "Возвращаются к ним снова и снова.",
] as const;

const CONTINUATION = [
  "Ваш голос продолжает помогать людям, даже когда вы не находитесь рядом.",
  "А созданные однажды аудиопродукты продолжают находить новых слушателей, продаваться и приносить вам доход без необходимости каждый раз лично проводить консультации, встречи или обучение.",
] as const;

/** En dash (U+2013). */
const ACCENT = "Один раз создайте – и помогайте людям снова и снова";

const CLOSING =
  "Постепенно вы сможете собрать собственную библиотеку аудиопродуктов, которая будет развивать ваше имя, привлекать новую аудиторию и становиться дополнительным источником дохода.";

export default function SchoolFifthScreen() {
  return (
    <section
      className="school-fifth-screen"
      aria-label="Представьте своё будущее как автора аудиопродуктов"
    >
      <div className="school-fifth-screen__glow" aria-hidden="true" />
      <div
        className="school-fifth-screen__orb school-fifth-screen__orb--a"
        aria-hidden="true"
      />
      <div
        className="school-fifth-screen__orb school-fifth-screen__orb--b"
        aria-hidden="true"
      />

      <div className="school-fifth-screen__layout">
        <h2 className="school-fifth-screen__title">{TITLE}</h2>

        <div className="school-fifth-screen__intro">
          {INTRO.map((paragraph) => (
            <p key={paragraph} className="school-fifth-screen__text">
              {paragraph}
            </p>
          ))}
        </div>

        <SchoolFutureWaves className="school-fifth-screen__waves" />

        <ul className="school-fifth-screen__outcomes">
          {OUTCOMES.map((line) => (
            <li key={line} className="school-fifth-screen__outcome">
              <span
                className="school-fifth-screen__outcome-mark"
                aria-hidden="true"
              />
              <span className="school-fifth-screen__outcome-text">{line}</span>
            </li>
          ))}
        </ul>

        <div className="school-fifth-screen__continuation">
          {CONTINUATION.map((paragraph) => (
            <p key={paragraph} className="school-fifth-screen__text">
              {paragraph}
            </p>
          ))}
        </div>

        <p className="school-fifth-screen__accent">{ACCENT}</p>

        <p className="school-fifth-screen__closing">{CLOSING}</p>
      </div>
    </section>
  );
}
