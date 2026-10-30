import Link from "next/link";

/**
 * Footer of the coffee section (index and articles). Only existing public pages that carry no
 * personal data: /privacy and /requisites are deliberately left out (they show the ИП address).
 * Links open in a new tab, like every other in-text link of the section.
 */
export const GUIDE_FOOTER_LINKS = [
  { href: "/b/coffee#o-razdele", label: "О разделе" },
  { href: "/b", label: "Музыка для бизнеса" },
  { href: "/b/prava", label: "Права на музыку" },
  { href: "/about", label: "О платформе" },
  { href: "/help", label: "Справочный центр" },
] as const;

export default function GuideFooter() {
  return (
    <footer className="guide-footer">
      <div className="guide-wrap">
        <nav className="guide-footer__nav" aria-label="О разделе и платформе">
          {GUIDE_FOOTER_LINKS.map((link) => (
            <Link key={link.href} href={link.href} target="_blank" rel="noopener">
              {link.label}
            </Link>
          ))}
        </nav>
        <p>АудиоЛад Кофейни – раздел сервиса АудиоЛад. АудиоЛад не связан с кофейнями атласа. Их названия принадлежат владельцам.</p>
      </div>
    </footer>
  );
}
