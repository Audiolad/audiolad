import Link from "next/link";

import { UserIcon } from "@/components/home/HomeIcons";

const DECORATIVE_COVERS = [
  {
    modifier: "one",
    src: "https://audiolad.ru/storage/v1/object/public/practice-covers/practices/b9ddb063-4dc6-4698-be16-facb25d69c39/variants/de184072-d259-450d-b304-a1589d998133/md.webp",
  },
  {
    modifier: "two",
    src: "https://audiolad.ru/storage/v1/object/public/practice-covers/practices/98f7ebb9-e574-428c-93c8-04fb6a4332a7/variants/dc81e766-c2bf-4060-bd06-f61acff62da2/md.webp",
  },
  {
    modifier: "three",
    src: "https://audiolad.ru/storage/v1/object/public/practice-covers/practices/5fb00fbb-d66b-4c95-b993-04d4344b8d0b/variants/fa98345d-45b0-44d2-95af-6e276ada2f46/md.webp",
  },
] as const;

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

      <p className="listen-signup-cta__bookmark" data-listen-bookmark-cta>
        🔖 Сохраните эту страницу в закладки, чтобы не потерять важную для себя информацию и легко вернуться к ней позже.
      </p>

      <div className="listen-signup-cta__layout">
        <div className="listen-signup-cta__cluster" aria-hidden="true">
          <span className="listen-signup-cta__sparkle listen-signup-cta__sparkle--a" />
          <span className="listen-signup-cta__sparkle listen-signup-cta__sparkle--b" />
          <span className="listen-signup-cta__sparkle listen-signup-cta__sparkle--c" />
          {DECORATIVE_COVERS.map((cover) => (
            <div
              key={cover.modifier}
              className={`listen-signup-cta__card listen-signup-cta__card--${cover.modifier}`}
            >
              {/* Decorative public covers: raw img by design, not next/image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover.src} alt="" />
            </div>
          ))}
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
