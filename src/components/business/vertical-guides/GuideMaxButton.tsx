"use client";

import Image from "next/image";
import { sendYandexGoal } from "@/lib/analytics/yandex-metrika";

import {
  FOUR_CUPS_MAX_HREF,
  FOUR_CUPS_MAX_LABEL,
  FOUR_CUPS_TG_HREF,
  FOUR_CUPS_TG_LABEL,
} from "@/lib/business/vertical-guides/four-cups";

/**
 * The only external links of a guide page: the «Четыре чашки» quiz in MAX and the same quiz in Telegram.
 * nofollow: tracking redirects (max-potok.ru/r/…) are not for crawlers.
 */
export default function GuideMaxButton({ placement }: { placement: "slider" | "final" }) {
  return (
    <>
      <a
        className="guide-max"
        href={FOUR_CUPS_MAX_HREF}
        target="_blank"
        rel="nofollow noopener noreferrer"
        data-four-cups-max="true"
        data-max-placement={placement}
        onClick={() => sendYandexGoal("business_four_cups_clicked")}
      >
        <span className="guide-max__icon" aria-hidden="true">
          <Image src="/school/messengers/max.png" alt="" width={36} height={36} />
        </span>
        <span>{FOUR_CUPS_MAX_LABEL}</span>
      </a>
      <a
        className="guide-max guide-max--tg"
        href={FOUR_CUPS_TG_HREF}
        target="_blank"
        rel="nofollow noopener noreferrer"
        data-four-cups-tg="true"
        data-max-placement={placement}
        onClick={() => sendYandexGoal("business_four_cups_clicked")}
      >
        <span className="guide-max__icon" aria-hidden="true">
          <Image src="/school/messengers/telegram.png" alt="" width={36} height={36} />
        </span>
        <span>{FOUR_CUPS_TG_LABEL}</span>
      </a>
    </>
  );
}
