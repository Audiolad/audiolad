import Link from "next/link";

import LegalLinksNav from "@/components/legal/LegalLinksNav";
import { legalLinkClassName } from "@/lib/legal/links";
import { PUBLIC_FOOTER_LINKS } from "@/lib/navigation/public-footer-links";

export default function LegalFooter({ className }: { className?: string }) {
  return (
    <footer
      className={`border-t border-[#eadff8] pt-6 ${className ?? ""}`}
      aria-label="Правовая информация и контакты"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
        <div className="lg:max-w-[280px]">
          <p className="text-lg font-semibold text-[#6234b5]">АудиоЛад</p>
          <nav aria-label="Разделы платформы" className="mt-3">
            <ul className="flex flex-wrap gap-x-4 gap-y-2 text-[15px]">
              {PUBLIC_FOOTER_LINKS.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={legalLinkClassName}>
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <LegalLinksNav listClassName="grid gap-2.5 text-[15px] sm:grid-cols-2 lg:grid-cols-1" />

        <div>
          <p className="text-sm font-medium text-[#7d70a2]">Контакт для связи</p>
          <p className="mt-2 text-[15px]">
            <a href="mailto:1@audiolad.ru" className={legalLinkClassName}>
              1@audiolad.ru
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
