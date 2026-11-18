import Link from "next/link";
import type { ReactNode } from "react";

import AudioladHorizontalLogo from "@/components/brand/AudioladHorizontalLogo";
import { BUSINESS_LEGAL_CONTACT, BUSINESS_LEGAL_HREF, BUSINESS_LEGAL_OPERATOR } from "@/lib/business/legal/section";

export const legalCardClass =
  "min-w-0 break-words rounded-[24px] border border-[#eadff8] bg-white p-5 shadow-[0_12px_35px_rgba(74,42,130,0.06)] sm:p-6";
export const legalBodyClass = "text-[18px] leading-8 text-[#4c3d78]";
export const legalH2Class = "text-[26px] font-semibold leading-tight lg:text-[28px]";
export const legalH3Class = "mt-6 text-[20px] font-semibold";
export const legalNoteClass = "mt-5 rounded-[20px] bg-[#faf6ff] p-5 text-[18px] font-semibold leading-8";
export const legalListClass =
  "mt-4 list-disc space-y-3 pl-6 text-[18px] leading-8 text-[#4c3d78] marker:text-[#7042c5]";
export const legalLinkClass = "font-medium text-[#7042c5] underline underline-offset-2";

type Props = {
  kicker: string;
  title: string;
  lead: ReactNode;
  breadcrumb?: string;
  children: ReactNode;
};

export default function BusinessLegalShell({ kicker, title, lead, breadcrumb, children }: Props) {
  return (
    <main className="min-h-screen bg-[#fbf9ff] text-[#25135c]">
      <div className="mx-auto w-full max-w-[980px] px-5 py-8 lg:px-10 lg:py-12">
        <header className="flex items-center justify-between gap-4">
          <AudioladHorizontalLogo priority />
          <Link
            href="/b"
            className="text-sm font-medium text-[#7042c5] underline-offset-2 hover:underline"
          >
            ← «АудиоЛад Бизнес»
          </Link>
        </header>

        {breadcrumb ? (
          <nav aria-label="Навигация по разделу" className="mt-8 text-sm text-[#6d5a9e]">
            <Link href={BUSINESS_LEGAL_HREF} className="text-[#7042c5] underline-offset-2 hover:underline">
              Правовая информация
            </Link>
            {" · "}
            {breadcrumb}
          </nav>
        ) : null}

        <section className={(breadcrumb ? "mt-4" : "mt-10") + " rounded-[30px] bg-[#f4e9ff] p-7 lg:p-10"}>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#7042c5]">{kicker}</p>
          <h1 className="mt-3 text-[32px] font-semibold leading-tight lg:text-[46px]">{title}</h1>
          <div className="mt-5 text-[19px] leading-8 text-[#4c3d78] lg:text-[21px]">{lead}</div>
        </section>

        <div className="mt-8 grid gap-6">{children}</div>

        <footer className="mt-10 border-t border-[#eadff8] pt-7 text-[15px] leading-7 text-[#6d5a9e]">
          <p>
            Этот раздел объясняет, как работает сервис, и сам по себе договором не является. Условия – в
            договоре-оферте «АудиоЛад Бизнес» и приложениях к нему.
          </p>
          <p className="mt-2">
            Оператор сервисов «АудиоЛад Бизнес» и «АудиоЛад Кофейня» – {BUSINESS_LEGAL_OPERATOR.name}, ИНН{" "}
            {BUSINESS_LEGAL_OPERATOR.inn}, ОГРНИП {BUSINESS_LEGAL_OPERATOR.ogrnip}.
          </p>
        </footer>
      </div>
    </main>
  );
}

export function LegalSteps({ items }: { items: { title: string; text: ReactNode }[] }) {
  return (
    <ol className="mt-5 space-y-5">
      {items.map((item, index) => (
        <li key={item.title} className="flex gap-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#7042c5] text-[16px] font-bold text-white">
            {index + 1}
          </span>
          <p className={legalBodyClass}>
            <b className="text-[#25135c]">{item.title}</b> {item.text}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function LegalTable({ rows, head }: { rows: ReactNode[][]; head?: string[] }) {
  const table = (
    <div className={"mt-4 overflow-x-auto" + (head ? " hidden md:block" : "")}>
      <table className="w-full border-collapse text-left text-[16px] leading-7 text-[#4c3d78]">
        {head ? (
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} className="border-b border-[#eee3f8] px-2 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#7042c5]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={
                    "border-b border-[#eee3f8] px-2 py-3 align-top" +
                    (!head && j === 0 ? " w-[36%] text-[#6d5a9e]" : "")
                  }
                >
                  {cell}
                </td>
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
      <ul className="mt-4 space-y-3 md:hidden">
        {rows.map((row, i) => (
          <li key={i} className="rounded-[18px] bg-[#faf6ff] p-4 text-[16px] leading-7 text-[#4c3d78]">
            <b className="block text-[17px] text-[#25135c]">{row[0]}</b>
            {row.slice(1).map((cell, j) => (
              <span key={j} className="mt-1 block">
                <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#7042c5]">{head[j + 1]}: </span>
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
