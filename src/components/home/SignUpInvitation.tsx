import Link from "next/link";

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
        className="mt-5 inline-flex min-h-11 rounded-[22px] bg-gradient-to-r from-[#7042c5] to-[#9872d8] px-6 py-4 text-[17px] font-semibold text-white shadow-[0_14px_34px_rgba(96,59,168,0.24)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        Создать Аудиотеку
      </Link>
    </section>
  );
}
