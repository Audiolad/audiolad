import Link from "next/link";

import { HOME_NEED_ITEMS } from "@/lib/home/needs-navigation";

import HomeSectionHeader from "./HomeSectionHeader";

export default function NeedsNavigation() {
  return (
    <section className="mt-8" aria-label="Выберите, что вам сейчас нужно">
      <HomeSectionHeader title="Выберите, что вам сейчас нужно" href="/catalog" />

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {HOME_NEED_ITEMS.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="flex min-h-[88px] items-center justify-center rounded-[22px] border border-[#eadff8] bg-[#fcfaff] px-3 py-4 text-center text-[14px] font-medium leading-5 text-[#25135c] shadow-sm transition hover:border-[#d9c9ef] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            {item.title}
          </Link>
        ))}
      </div>
    </section>
  );
}
