import Link from "next/link";

import { UserIcon } from "@/components/home/HomeIcons";

function DecorativeAudioCard({
  title,
  bars,
  modifier,
}: {
  title: string;
  bars: readonly number[];
  modifier: string;
}) {
  return (
    <div className={`listen-signup-cta__card listen-signup-cta__card--${modifier}`}>
      <span className="listen-signup-cta__card-title">{title}</span>
      <span className="listen-signup-cta__card-wave">
        {bars.map((height, index) => (
          <span
            key={`${modifier}-${index}`}
            className="listen-signup-cta__bar"
            style={{ height: `${height}%` }}
          />
        ))}
      </span>
    </div>
  );
}

export default function ListenSignupCta() {
  return (
    <section
      className="listen-signup-cta mt-8 sm:mt-10"
      aria-label="Создайте бесплатный аккаунт в АудиоЛаде"
      data-listen-signup-cta
    >
      <div className="listen-signup-cta__glow" aria-hidden="true" />
      <div className="listen-signup-cta__wave" aria-hidden="true">
        <svg viewBox="0 0 640 80" preserveAspectRatio="none">
          <path
            d="M0 42C80 18 140 66 220 40C300 14 360 62 440 36C520 10 580 54 640 30V80H0Z"
            fill="rgba(201, 182, 234, 0.28)"
          />
        </svg>
      </div>

      <div className="listen-signup-cta__layout">
        <div className="listen-signup-cta__cluster" aria-hidden="true">
          <span className="listen-signup-cta__sparkle listen-signup-cta__sparkle--a" />
          <span className="listen-signup-cta__sparkle listen-signup-cta__sparkle--b" />
          <span className="listen-signup-cta__sparkle listen-signup-cta__sparkle--c" />
          <DecorativeAudioCard
            title="Утро"
            bars={[36, 58, 44, 72, 40, 64, 48]}
            modifier="one"
          />
          <DecorativeAudioCard
            title="Тишина"
            bars={[48, 34, 68, 42, 76, 50, 38]}
            modifier="two"
          />
          <DecorativeAudioCard
            title="Свет"
            bars={[42, 70, 38, 60, 46, 74, 52]}
            modifier="three"
          />
        </div>

        <div className="listen-signup-cta__copy">
          <h2 className="listen-signup-cta__title">
            Создайте бесплатный аккаунт в АудиоЛаде
          </h2>
          <p className="listen-signup-cta__text">
            Сохраняйте любимые практики, слушайте медитации и музыку в одном
            месте.
          </p>
          <Link
            href="/auth/sign-up"
            className="home-primary-cta home-primary-cta--compact listen-signup-cta__primary"
          >
            <UserIcon />
            Зарегистрироваться бесплатно
          </Link>
          <Link
            href="/my-practices"
            className="listen-signup-cta__secondary"
          >
            Открыть аудиотеку →
          </Link>
          <p className="listen-signup-cta__chip">
            Сохраняйте. Слушайте. Наполняйтесь.
          </p>
        </div>
      </div>
    </section>
  );
}
