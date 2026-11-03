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

/** Footer items about music, hidden in template v2 articles (owner rule for the pilot set 11: no music in visible text). */
export const GUIDE_FOOTER_MUSIC_HREFS: readonly string[] = ["/b", "/b/prava"];

export default function GuideFooter({ withoutMusic = false }: { withoutMusic?: boolean }) {
  const links = withoutMusic ? GUIDE_FOOTER_LINKS.filter((link) => !GUIDE_FOOTER_MUSIC_HREFS.includes(link.href)) : GUIDE_FOOTER_LINKS;
  return (
    <footer className="guide-footer">
      <div className="guide-wrap">
        <nav className="guide-footer__nav" aria-label="О разделе и платформе">
          {links.map((link) => (
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
