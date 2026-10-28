import Link from "next/link";

import type { TextPart } from "@/lib/business/vertical-guides/types";

export function GuideRichText({ parts }: { parts: readonly TextPart[] }) {
  return (
    <>
      {parts.map((part, index) =>
        typeof part === "string" ? (
          <span key={index}>{part}</span>
        ) : (
          <Link key={part.href + part.label} href={part.href}>
            {part.label}
          </Link>
        ),
      )}
    </>
  );
}
