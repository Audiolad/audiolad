import Link from "next/link";

import { PracticeBackLink } from "./PracticePageParts";

export default function PracticePageErrorState() {
  return (
    <div className="pb-8 pt-6 xl:px-6 xl:pt-3">
      <PracticeBackLink />

      <section className="mt-10 rounded-[24px] border border-[#eadff8] bg-[#faf6ff] px-5 py-8 text-center xl:mt-12">
        <h1 className="text-[22px] font-semibold">Не удалось загрузить практику</h1>
        <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
          Попробуйте вернуться в каталог и открыть материал ещё раз.
        </p>
        <Link
          href="/catalog"
          className="mt-5 inline-flex rounded-[18px] bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
        >
          Вернуться в каталог
        </Link>
      </section>
    </div>
  );
}
