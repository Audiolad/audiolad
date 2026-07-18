import LegalLinksNav from "@/components/legal/LegalLinksNav";
import { legalLinkClassName } from "@/lib/legal/links";

export default function LegalFooter({ className }: { className?: string }) {
  return (
    <footer
      className={`border-t border-[#eadff8] pt-6 ${className ?? ""}`}
      aria-label="Правовая информация и контакты"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
        <div className="lg:max-w-[280px]">
          <p className="text-lg font-semibold text-[#6234b5]">АудиоЛад</p>
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
