import Link from "next/link";

import { HOME_NEED_ITEMS } from "@/lib/home/needs-navigation";

import HomeSectionHeader from "./HomeSectionHeader";

const NEEDS_FIRST_ROW = HOME_NEED_ITEMS.slice(0, 4);
const NEEDS_SECOND_ROW = HOME_NEED_ITEMS.slice(4, 8);

function NeedChip({ id, title, href }: (typeof HOME_NEED_ITEMS)[number]) {
  const wrapClass = id === "programs" ? " home-need-chip--wrap" : "";

  return (
    <Link href={href} className={`home-need-chip${wrapClass}`}>
      {title}
    </Link>
  );
}

export default function NeedsNavigation() {
  return (
    <section
      className="home-needs-strip home-section-carousel mt-8"
      aria-label="Выберите, что вам сейчас нужно"
    >
      <HomeSectionHeader title="Выберите, что вам сейчас нужно" href="/catalog" />

      <div className="home-needs-track mt-4">
        <div className="home-needs-rows">
          <div className="home-needs-row">
            {NEEDS_FIRST_ROW.map((item) => (
              <NeedChip key={item.id} {...item} />
            ))}
          </div>

          <div className="home-needs-row">
            {NEEDS_SECOND_ROW.map((item) => (
              <NeedChip key={item.id} {...item} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
