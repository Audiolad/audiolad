const TITLE = "Почему именно сейчас?";

const BODY = [
  { text: "Мир стремительно меняется.", tone: "lead" },
  {
    text: "Люди всё чаще выбирают аудиоформат вместо длинных текстов и многочасовых видео.",
    tone: "body",
  },
  {
    text: "Они слушают медитации, практики, лекции, подкасты и аудиокурсы дома, в дороге, на прогулке, во время занятий спортом и перед сном.",
    tone: "body",
  },
  {
    text: "Сегодня создать собственный аудиопродукт стало проще, чем когда-либо.",
    tone: "highlight",
  },
  {
    text: "Современные технологии позволяют быстро записывать, оформлять и публиковать свои материалы даже без профессиональной студии.",
    tone: "highlight",
  },
  {
    text: "Именно сейчас у вас есть возможность занять своё авторское направление, начать создавать востребованные аудиопродукты и постепенно собрать собственную библиотеку, которая будет помогать людям и приносить вам доход.",
    tone: "body",
  },
] as const;

const TIMELINE = ["Сегодня", "Первый шаг", "Через год"] as const;

const CONTRAST = [
  "Через год вы можете по-прежнему только думать о своей первой аудиопрактике.",
  "А можете уже создавать собственные аудиопродукты, которые будут помогать людям.",
] as const;

const ACCENT = "Лучшее время начать – сегодня.";

export default function SchoolWhyNowScreen() {
  return (
    <section className="school-why-now" aria-label="Почему именно сейчас?">
      <div className="school-why-now__layout">
        <div className="school-why-now__primary">
          <h2 className="school-why-now__title">{TITLE}</h2>

          <div className="school-why-now__body">
            {BODY.map((paragraph) => (
              <p
                key={paragraph.text}
                className={
                  paragraph.tone === "highlight"
                    ? "school-why-now__text school-why-now__text--highlight"
                    : paragraph.tone === "lead"
                      ? "school-why-now__text school-why-now__text--lead"
                      : "school-why-now__text"
                }
              >
                {paragraph.text}
              </p>
            ))}
          </div>
        </div>

        <div className="school-why-now__secondary">
          <ol className="school-why-now__timeline" aria-label="Путь вперёд">
            {TIMELINE.map((step, index) => (
              <li key={step} className="school-why-now__timeline-item">
                <span
                  className="school-why-now__timeline-dot"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span className="school-why-now__timeline-label">{step}</span>
              </li>
            ))}
          </ol>

          <div className="school-why-now__contrast">
            <p className="school-why-now__contrast-line school-why-now__contrast-line--think">
              {CONTRAST[0]}
            </p>
            <p className="school-why-now__contrast-line school-why-now__contrast-line--create">
              {CONTRAST[1]}
            </p>
          </div>

          <p className="school-why-now__accent">{ACCENT}</p>
        </div>
      </div>
    </section>
  );
}
