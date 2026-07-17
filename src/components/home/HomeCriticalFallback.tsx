import Link from "next/link";

export default function HomeCriticalFallback() {
  return (
    <section className="mt-8 lg:mt-12">
      <h1 className="text-[32px] font-semibold leading-tight text-[#25135c] lg:text-[42px]">
        АудиоЛад
      </h1>
      <p className="mt-3 max-w-[720px] text-[15px] leading-6 text-[#6f61a3] lg:text-[17px]">
        Платформа авторских аудиопрактик, медитаций и программ. Откройте
        каталог, чтобы выбрать материал для прослушивания.
      </p>
      <div className="mt-6">
        <Link
          href="/catalog"
          className="inline-flex min-h-11 rounded-[22px] bg-gradient-to-r from-[#7042c5] to-[#9872d8] px-6 py-4 text-[17px] font-semibold text-white shadow-[0_14px_34px_rgba(96,59,168,0.24)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Открыть каталог
        </Link>
      </div>
    </section>
  );
}
