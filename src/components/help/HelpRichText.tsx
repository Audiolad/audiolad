import Link from "next/link";
import type { ReactNode } from "react";

import { isHelpRichNodes } from "@/lib/help/rich-text";
import type { HelpRichText as HelpRichTextValue } from "@/lib/help/types";

const INLINE_LINK_CLASS =
  "break-words font-medium text-[#7042c5] underline underline-offset-2 decoration-[#c9b6ea] transition-colors hover:text-[#5a2fb0] hover:decoration-[#7042c5] focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

type HelpRichTextProps = {
  value: HelpRichTextValue;
  className?: string;
  as?: "span" | "p" | "div";
};

export default function HelpRichText({
  value,
  className,
  as = "span",
}: HelpRichTextProps) {
  const Tag = as;
  let content: ReactNode;

  if (!isHelpRichNodes(value)) {
    content = value;
  } else {
    content = value.map((node, index) => {
      if (node.type === "text") {
        return <span key={`t-${index}`}>{node.value}</span>;
      }

      if (node.external || /^https?:\/\//i.test(node.href)) {
        return (
          <a
            key={`l-${index}`}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className={INLINE_LINK_CLASS}
          >
            {node.label}
            <span className="sr-only"> (откроется в новой вкладке)</span>
          </a>
        );
      }

      return (
        <Link
          key={`l-${index}`}
          href={node.href}
          className={INLINE_LINK_CLASS}
        >
          {node.label}
        </Link>
      );
    });
  }

  return <Tag className={className}>{content}</Tag>;
}
