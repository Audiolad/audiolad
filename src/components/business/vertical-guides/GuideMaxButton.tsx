import Image from "next/image";

import { FOUR_CUPS_MAX_HREF, FOUR_CUPS_MAX_LABEL } from "@/lib/business/vertical-guides/four-cups";

/** The only external link of a guide page: the «Четыре чашки» quiz in MAX. */
export default function GuideMaxButton({ placement }: { placement: "slider" | "final" }) {
  return (
    <a
      className="guide-max"
      href={FOUR_CUPS_MAX_HREF}
      target="_blank"
      rel="noopener noreferrer"
      data-four-cups-max="true"
      data-max-placement={placement}
    >
      <span className="guide-max__icon" aria-hidden="true">
        <Image src="/school/messengers/max.png" alt="" width={36} height={36} />
      </span>
      <span>{FOUR_CUPS_MAX_LABEL}</span>
    </a>
  );
}
