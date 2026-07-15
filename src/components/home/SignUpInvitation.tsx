import Link from "next/link";

import { UserIcon } from "./HomeIcons";

export default function SignUpInvitation() {
  return (
    <section className="mt-8 overflow-hidden rounded-[28px] border border-[#eadff8] bg-gradient-to-r from-[#faf4ff] to-[#f1e4fc] p-6 lg:p-8">
      <h2 className="text-[22px] font-semibold leading-tight text-[#25135c] lg:text-[24px]">
        Сохраните своё пространство в АудиоЛаде
      </h2>

      <p className="mt-3 max-w-[640px] text-[15px] leading-6 text-[#6f61a3]">
        Создайте бесплатный аккаунт, чтобы продолжать с того места, где
        остановились, сохранять практики и получать новые материалы любимых
        авторов.
      </p>

      <Link
        href="/auth/sign-up"
        className="home-primary-cta home-primary-cta--compact mt-5"
      >
        <UserIcon />
        Создать Аудиотеку
      </Link>
    </section>
  );
}
