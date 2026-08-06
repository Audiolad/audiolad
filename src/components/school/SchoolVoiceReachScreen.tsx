import { SchoolMicIcon } from "@/components/school/SchoolIcons";

const TITLE = "Один голос. Тысячи прослушиваний.";

const BODY = [
  "Однажды записанная аудиопрактика может помогать не одному человеку, а сотням, тысячам и даже десяткам тысяч слушателей.",
  "Именно в этом заключается удивительная сила аудиоформата.",
] as const;

const ACCENT = [
  "Вы создаёте её один раз.",
  "А она продолжает жить своей жизнью.",
] as const;

function SchoolReachWaves({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 240"
      fill="none"
      aria-hidden="true"
    >
      {/* Soft expanding sound arcs — not closed circles, no radial spokes */}
      <path
        d="M78 150c18-34 48-52 82-52s64 18 82 52"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.42"
      />
      <path
        d="M62 162c24-46 60-70 98-70s74 24 98 70"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        opacity="0.3"
      />
      <path
        d="M48 174c28-56 70-86 112-86s84 30 112 86"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.2"
      />
      <path
        d="M36 186c32-66 80-100 124-100s92 34 124 100"
        stroke="currentColor"
        strokeWidth="1.05"
        strokeLinecap="round"
        opacity="0.14"
      />

      {/* Listener points along outer arcs */}
      <circle cx="96" cy="104" r="3.2" fill="currentColor" opacity="0.34" />
      <circle cx="144" cy="88" r="2.7" fill="currentColor" opacity="0.28" />
      <circle cx="188" cy="104" r="3.4" fill="currentColor" opacity="0.36" />
      <circle cx="68" cy="138" r="2.6" fill="currentColor" opacity="0.24" />
      <circle cx="210" cy="140" r="2.8" fill="currentColor" opacity="0.26" />
      <circle cx="118" cy="72" r="2.4" fill="currentColor" opacity="0.22" />
      <circle cx="172" cy="74" r="2.5" fill="currentColor" opacity="0.24" />

      {/* Soft glow behind mic */}
      <circle cx="78" cy="168" r="28" fill="currentColor" opacity="0.07" />
    </svg>
  );
}

export default function SchoolVoiceReachScreen() {
  return (
    <section
      className="school-voice-reach"
      aria-label="Один голос. Тысячи прослушиваний."
    >
      <div className="school-voice-reach__glow" aria-hidden="true" />

      <div className="school-voice-reach__layout">
        <div className="school-voice-reach__copy">
          <h2 className="school-voice-reach__title">{TITLE}</h2>

          <div className="school-voice-reach__body">
            {BODY.map((paragraph) => (
              <p key={paragraph} className="school-voice-reach__text">
                {paragraph}
              </p>
            ))}
          </div>

          <div className="school-voice-reach__accent">
            {ACCENT.map((line) => (
              <p key={line} className="school-voice-reach__accent-line">
                {line}
              </p>
            ))}
          </div>
        </div>

        <div className="school-voice-reach__visual school-voice-reach__visual--spread" aria-hidden="true">
          <SchoolReachWaves className="school-voice-reach__ripples" />
          <span className="school-voice-reach__core school-voice-reach__core--source">
            <SchoolMicIcon className="school-voice-reach__mic" />
          </span>
        </div>
      </div>
    </section>
  );
}
