import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";

const SUPPORT_EMAIL = "1@audiolad.ru";

const FOOTER_LINKS = [
  { href: `${PRODUCTION_APP_ORIGIN}/`, label: "Главная АудиоЛада" },
  {
    href: `${PRODUCTION_APP_ORIGIN}/privacy`,
    label: "Политика конфиденциальности",
  },
  {
    href: `${PRODUCTION_APP_ORIGIN}/offer`,
    label: "Публичная оферта",
  },
  {
    href: `${PRODUCTION_APP_ORIGIN}/help`,
    label: "Помощь и поддержка",
  },
  {
    href: `${PRODUCTION_APP_ORIGIN}/author-terms`,
    label: "Авторские условия",
  },
] as const;

export default function SchoolFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="school-footer" aria-label="Подвал Школы Аудиопрактик">
      <div className="school-footer__inner">
        <div className="school-footer__brand">
          <p className="school-footer__name">АудиоЛад</p>
          <p className="school-footer__tagline">
            Платформа авторских аудиопродуктов
          </p>
        </div>

        <nav className="school-footer__nav" aria-label="Ссылки АудиоЛада">
          <ul className="school-footer__list">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  className="school-footer__link"
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="school-footer__contact">
          <p className="school-footer__contact-label">Контакт</p>
          <a
            className="school-footer__link"
            href={`mailto:${SUPPORT_EMAIL}`}
          >
            {SUPPORT_EMAIL}
          </a>
        </div>

        <p className="school-footer__copy">© {year} АудиоЛад</p>
      </div>
    </footer>
  );
}
