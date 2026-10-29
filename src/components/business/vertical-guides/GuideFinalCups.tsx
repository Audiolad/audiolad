import Image from "next/image";

import { FOUR_CUPS_FINAL_IMAGE } from "@/lib/business/vertical-guides/four-cups";

import GuideMaxButton from "./GuideMaxButton";

/** Bottom block: bold question, the single «all four cups» picture and the MAX button. */
export default function GuideFinalCups({ question }: { question: string }) {
  return (
    <section className="guide-wrap guide-block guide-final" aria-labelledby="guide-final-title">
      <p id="guide-final-title" className="guide-final__question">
        {question}
      </p>
      <Image
        className="guide-final__image"
        src={FOUR_CUPS_FINAL_IMAGE.src}
        alt={FOUR_CUPS_FINAL_IMAGE.alt}
        width={1254}
        height={1254}
        sizes="(min-width: 800px) 540px, 92vw"
      />
      <GuideMaxButton placement="final" />
    </section>
  );
}
