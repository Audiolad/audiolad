import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { BUSINESS_BRAND_MARK_SRC, COFFEE_BRAND_NAME } from "@/lib/business-app/brand-icons";
import { BUSINESS_LEGAL_CONTACT, BUSINESS_LEGAL_HREF, BUSINESS_LEGAL_OPERATOR } from "@/lib/business/legal/section";

export const legalCardClass = "business-legal__card";
export const legalBodyClass = "business-legal__body";
export const legalH2Class = "business-legal__h2";
export const legalH3Class = "business-legal__h3";
export const legalNoteClass = "business-legal__note";
export const legalListClass = "business-legal__list";
export const legalLinkClass = "business-legal__link";
export const legalNavClass = "business-legal__nav-item";
export const legalSubcardClass = "business-legal__subcard";
export const legalButtonClass = "business-legal__button";
export const legalBadgeClass = "business-legal__badge";
export const legalSampleClass = "business-legal__sample";

type Props = {
  kicker: string;
  title: string;
  lead: ReactNode;
  breadcrumb?: string;
  children: ReactNode;
};

export default function BusinessLegalShell({ kicker, title, lead, breadcrumb, children }: Props) {
  return (
    <div className="business-app-root business-legal" data-biz-theme="jazz-coffee">
      <header className="business-legal__header">
        <div className="business-legal__header-bar">
          <Link href={BUSINESS_LEGAL_HREF} className="business-legal__brand" aria-label={COFFEE_BRAND_NAME}>
            <Image
              src={BUSINESS_BRAND_MARK_SRC}
              alt=""
              width={160}
              height={160}
              className="business-legal__mark"
              unoptimized
              priority
            />
            <span className="business-legal__brand-name">{COFFEE_BRAND_NAME}</span>
          </Link>
        </div>
      </header>

      <main className="business-legal__wrap business-legal__main">
        {breadcrumb ? (
          <nav aria-label="Навигация по разделу" className="business-legal__crumbs">
            <Link href={BUSINESS_LEGAL_HREF}>Правовая информация</Link>
            {" · "}
            {breadcrumb}
          </nav>
        ) : null}

        <section className="business-legal__hero">
          <p className="business-legal__kicker">{kicker}</p>
          <h1 className="business-legal__title">{title}</h1>
          <div className="business-legal__lead">{lead}</div>
        </section>

        <div className="business-legal__stack">{children}</div>

        <footer className="business-legal__footer">
          <p>
            Этот раздел объясняет, как работает сервис, и сам по себе договором не является. Условия – в
            договоре-оферте «АудиоЛад Бизнес» и приложениях к нему.
          </p>
          <p>
            Оператор сервисов «АудиоЛад Бизнес» и «АудиоЛад Кофейня» – {BUSINESS_LEGAL_OPERATOR.name}, ИНН{" "}
            {BUSINESS_LEGAL_OPERATOR.inn}, ОГРНИП {BUSINESS_LEGAL_OPERATOR.ogrnip}.
          </p>
        </footer>
      </main>
    </div>
  );
}

export function LegalSteps({ items }: { items: { title: string; text: ReactNode }[] }) {
  return (
    <ol className="business-legal__steps">
      {items.map((item, index) => (
        <li key={item.title} className="business-legal__step">
          <span className="business-legal__step-n">{index + 1}</span>
          <p className={legalBodyClass}>
            <b>{item.title}</b> {item.text}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function LegalTable({ rows, head }: { rows: ReactNode[][]; head?: string[] }) {
  const table = (
    <div className={"business-legal__table-wrap" + (head ? " business-legal__table-wrap--desktop" : "")}>
      <table className={"business-legal__table" + (head ? "" : " business-legal__table--kv")}>
        {head ? (
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  if (!head) return table;
  return (
    <>
      {table}
      <ul className="business-legal__cards">
        {rows.map((row, i) => (
          <li key={i} className="business-legal__mobile-card">
            <b>{row[0]}</b>
            {row.slice(1).map((cell, j) => (
              <span key={j} className="business-legal__mobile-card-row">
                <span className="business-legal__mobile-card-label">{head[j + 1]}: </span>
                {cell}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </>
  );
}

export function LegalContacts() {
  return (
    <ul className={legalListClass}>
      <li>
        Почта:{" "}
        <a href={BUSINESS_LEGAL_CONTACT.emailHref} className={legalLinkClass}>
          {BUSINESS_LEGAL_CONTACT.email}
        </a>
      </li>
      <li>
        Телефон:{" "}
        <a href={BUSINESS_LEGAL_CONTACT.phoneHref} className={legalLinkClass}>
          {BUSINESS_LEGAL_CONTACT.phoneDisplay}
        </a>
      </li>
      <li>
        МАКС:{" "}
        <a href={BUSINESS_LEGAL_CONTACT.maxHref} className={legalLinkClass} rel="nofollow noopener" target="_blank">
          {BUSINESS_LEGAL_CONTACT.maxDisplay}
        </a>
      </li>
    </ul>
  );
}
