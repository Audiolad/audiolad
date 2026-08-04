/**
 * Materials reserved for a future second screen of the school landing.
 * Not rendered on the first-screen cover — import later when that section is built.
 */

import {
  SchoolCarIcon,
  SchoolFitnessIcon,
  SchoolHomeIcon,
  SchoolMicIcon,
  SchoolSleepIcon,
  SchoolWalkIcon,
} from "@/components/school/SchoolIcons";

export const SCHOOL_VOICE_ACCENT_TEXT =
  "Ваш голос способен помогать людям даже тогда, когда вас нет рядом";

export const SCHOOL_SUPPORT_TEXT =
  "Сегодня люди всё чаще выбирают аудио. Оно удобно, естественно и легко вписывается в любой ритм жизни. Именно поэтому авторские аудиопродукты становятся новым способом передавать знания, опыт и внутреннее состояние тысячам людей.";

export const SCHOOL_LISTENING_SCENARIOS = [
  { label: "Дома", Icon: SchoolHomeIcon },
  { label: "В дороге", Icon: SchoolCarIcon },
  { label: "На прогулке", Icon: SchoolWalkIcon },
  { label: "На фитнесе", Icon: SchoolFitnessIcon },
  { label: "Перед сном", Icon: SchoolSleepIcon },
] as const;

/** Deferred second-screen content. Do not mount on the cover screen. */
export default function SchoolSecondScreenMaterials() {
  return (
    <section className="school-second-screen" aria-label="Почему аудио">
      <aside className="school-second-screen__accent">
        <span className="school-second-screen__accent-icon" aria-hidden="true">
          <SchoolMicIcon className="school-second-screen__mic-icon" />
        </span>
        <p className="school-second-screen__accent-text">
          {SCHOOL_VOICE_ACCENT_TEXT}
        </p>
      </aside>

      <ul
        className="school-second-screen__scenarios"
        aria-label="Когда слушают аудио"
      >
        {SCHOOL_LISTENING_SCENARIOS.map(({ label, Icon }) => (
          <li key={label} className="school-second-screen__scenario">
            <Icon className="school-second-screen__scenario-icon" />
            <span className="school-second-screen__scenario-label">{label}</span>
          </li>
        ))}
      </ul>

      <p className="school-second-screen__support">{SCHOOL_SUPPORT_TEXT}</p>
    </section>
  );
}
