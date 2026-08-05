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

const CONTRAST = [
  {
    emoji: "🤔",
    text: "Через год вы можете по-прежнему только думать о своей первой аудиопрактике.",
    tone: "think",
  },
  {
    emoji: "😊",
    text: "А можете уже создавать собственные аудиопродукты, которые будут помогать людям.",
    tone: "create",
  },
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
          <div className="school-why-now__contrast">
            {CONTRAST.map((option) => (
              <div
                key={option.tone}
                className={`school-why-now__state school-why-now__state--${option.tone}`}
              >
                <span
                  className="school-why-now__state-emoji"
                  aria-hidden="true"
                >
                  {option.emoji}
                </span>
                <p className="school-why-now__state-text">{option.text}</p>
              </div>
            ))}
          </div>

          <p className="school-why-now__accent">{ACCENT}</p>
        </div>
      </div>
    </section>
  );
}
