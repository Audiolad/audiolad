import {
  SchoolCarIcon,
  SchoolFitnessIcon,
  SchoolHomeIcon,
  SchoolMicIcon,
  SchoolSleepIcon,
  SchoolWalkIcon,
} from "@/components/school/SchoolIcons";

const VOICE_HEADLINE =
  "Ваш голос способен помогать людям даже тогда, когда вас нет рядом";

const AUDIO_CHOICE_TITLE = "Сегодня люди всё чаще выбирают аудио";

const AUDIO_CHOICE_TEXT =
  "Аудиопродукты слушают дома, в дороге, на прогулке, во время занятий спортом и перед сном. Аудиоформат легко вписывается в повседневную жизнь и позволяет получать знания и поддержку без необходимости постоянно смотреть в экран.";

const CLOSING_TEXT =
  "Именно поэтому авторские аудиопродукты становятся новым способом передавать знания, опыт и внутреннее состояние тысячам людей.";

const SCENARIOS = [
  {
    label: "Дома",
    description: "Во время отдыха и домашних дел",
    Icon: SchoolHomeIcon,
  },
  {
    label: "В дороге",
    description: "По пути на работу и в путешествиях",
    Icon: SchoolCarIcon,
  },
  {
    label: "На прогулке",
    description: "Совмещая движение и саморазвитие",
    Icon: SchoolWalkIcon,
  },
  {
    label: "На фитнесе",
    description: "Сохраняя внимание на тренировке",
    Icon: SchoolFitnessIcon,
  },
  {
    label: "Перед сном",
    description: "Для расслабления и спокойного отдыха",
    Icon: SchoolSleepIcon,
  },
] as const;

function SchoolVoiceWaves({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 72 28"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 14c2.2-4.5 4.4-4.5 6.6 0s4.4 4.5 6.6 0 4.4-4.5 6.6 0 4.4 4.5 6.6 0 4.4-4.5 6.6 0 4.4 4.5 6.6 0 4.4-4.5 6.6 0 4.4 4.5 6.6 0"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M8 14c1.6-2.8 3.2-2.8 4.8 0s3.2 2.8 4.8 0 3.2-2.8 4.8 0 3.2 2.8 4.8 0 3.2-2.8 4.8 0 3.2 2.8 4.8 0 3.2-2.8 4.8 0 3.2 2.8 4.8 0"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

export default function SchoolSecondScreen() {
  return (
    <section
      className="school-second-screen"
      aria-label="Почему авторские аудиопродукты востребованы"
    >
      <div className="school-second-screen__voice">
        <div className="school-second-screen__voice-visual" aria-hidden="true">
          <span className="school-second-screen__mic-badge">
            <SchoolMicIcon className="school-second-screen__mic-icon" />
          </span>
          <SchoolVoiceWaves className="school-second-screen__waves" />
        </div>
        <h2 className="school-second-screen__voice-title">{VOICE_HEADLINE}</h2>
      </div>

      <div className="school-second-screen__choice">
        <h3 className="school-second-screen__choice-title">
          {AUDIO_CHOICE_TITLE}
        </h3>
        <p className="school-second-screen__choice-text">{AUDIO_CHOICE_TEXT}</p>
      </div>

      <ul
        className="school-second-screen__scenarios"
        aria-label="Когда слушают аудио"
      >
        {SCENARIOS.map(({ label, description, Icon }) => (
          <li key={label} className="school-second-screen__scenario">
            <span className="school-second-screen__scenario-icon-wrap">
              <Icon className="school-second-screen__scenario-icon" />
            </span>
            <span className="school-second-screen__scenario-label">{label}</span>
            <span className="school-second-screen__scenario-desc">
              {description}
            </span>
          </li>
        ))}
      </ul>

      <p className="school-second-screen__closing">{CLOSING_TEXT}</p>
    </section>
  );
}
