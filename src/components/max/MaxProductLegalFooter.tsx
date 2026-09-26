"use client";

import { LEGAL_LINKS } from "@/lib/legal/links";
import { openMaxExternalLink } from "@/lib/max/bridge";

const AUDIOLAD_ORIGIN = "https://audiolad.ru";

function openLegalHref(href: string) {
  openMaxExternalLink(new URL(href, AUDIOLAD_ORIGIN).toString());
}

export default function MaxProductLegalFooter() {
  return (
    <footer
      className="mt-8 border-t border-[#eadff8] pb-2 pt-6"
      aria-label="Правовая информация и контакты"
      data-max-product-legal-footer=""
    >
      <p className="text-lg font-semibold text-[#6234b5]">АудиоЛад</p>
      <nav aria-label="Юридическая информация" className="mt-3">
        <ul className="grid gap-1 text-[15px]">
          {LEGAL_LINKS.map((item) => (
            <li key={item.href}>
              <button
                type="button"
                onClick={() => openLegalHref(item.href)}
                className="inline-flex min-h-11 items-center text-left text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
              >
                {item.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-5">
        <p className="text-sm font-medium text-[#7d70a2]">Контакт для связи</p>
        <p className="mt-2 text-[15px] text-[#7042c5]">1@audiolad.ru</p>
      </div>
    </footer>
  );
}
