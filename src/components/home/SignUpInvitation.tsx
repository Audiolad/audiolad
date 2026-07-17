import Link from "next/link";

import { UserIcon } from "./HomeIcons";

export default function SignUpInvitation() {
  return (
    <section
      className="signup-invitation-banner mt-8"
      aria-label="Приглашение создать аккаунт"
    >
      <div className="signup-invitation-banner__visual" aria-hidden="true" />

      <div className="signup-invitation-banner__content">
        <h2 className="signup-invitation-banner__title">
          Сохраните своё пространство в АудиоЛаде
        </h2>

        <p className="signup-invitation-banner__description">
          Создайте аккаунт, чтобы продолжать с того места, где
          остановились, сохранять практики и получать новые материалы любимых
          авторов.
        </p>

        <Link
          href="/auth/sign-up"
          className="home-primary-cta home-primary-cta--compact signup-invitation-banner__cta"
        >
          <UserIcon />
          Создать Аудиотеку
        </Link>
      </div>
    </section>
  );
}
