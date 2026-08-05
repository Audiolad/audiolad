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

function SchoolReachRipples({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 240 240"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="120"
        cy="120"
        r="108"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.12"
      />
      <circle
        cx="120"
        cy="120"
        r="84"
        stroke="currentColor"
        strokeWidth="1.15"
        opacity="0.18"
      />
      <circle
        cx="120"
        cy="120"
        r="60"
        stroke="currentColor"
        strokeWidth="1.3"
        opacity="0.28"
      />
      <circle
        cx="120"
        cy="120"
        r="38"
        stroke="currentColor"
        strokeWidth="1.45"
        opacity="0.4"
      />
      {/* Soft radial impulses */}
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 120 + Math.cos(rad) * 28;
        const y1 = 120 + Math.sin(rad) * 28;
        const x2 = 120 + Math.cos(rad) * 104;
        const y2 = 120 + Math.sin(rad) * 104;
        return (
          <line
            key={deg}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinecap="round"
            opacity={deg % 60 === 0 ? 0.28 : 0.14}
          />
        );
      })}
      <circle cx="120" cy="120" r="22" fill="currentColor" opacity="0.08" />
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

        <div className="school-voice-reach__visual" aria-hidden="true">
          <SchoolReachRipples className="school-voice-reach__ripples" />
          <span className="school-voice-reach__core">
            <SchoolMicIcon className="school-voice-reach__mic" />
          </span>
        </div>
      </div>
    </section>
  );
}
