import Link from "next/link";

const legalLinks = [
  { href: "/requisites", title: "Реквизиты" },
  { href: "/offer", title: "Публичная оферта" },
  { href: "/privacy", title: "Политика обработки персональных данных" },
  { href: "/consent", title: "Согласие на обработку персональных данных" },
  { href: "/payment-and-refund", title: "Оплата, получение и возврат" },
] as const;

const linkClassName =
  "text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

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

        <nav aria-label="Юридические документы">
          <ul className="grid gap-2.5 text-[15px] sm:grid-cols-2 lg:grid-cols-1">
            {legalLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={linkClassName}>
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="text-sm font-medium text-[#7d70a2]">Контакт для связи</p>
          <p className="mt-2 text-[15px]">
            <a href="mailto:1@audiolad.ru" className={linkClassName}>
              1@audiolad.ru
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
