import Link from "next/link";
import type { MouseEvent } from "react";

import { buildAuthorPublicPath } from "@/lib/products/paths";

type AuthorLinkProps = {
  authorSlug?: string | null;
  authorName: string;
  className?: string;
  stopPropagation?: boolean;
  /** When set, author name renders as plain text on the same author page. */
  currentAuthorSlug?: string | null;
};

export default function AuthorLink({
  authorSlug,
  authorName,
  className = "",
  stopPropagation = false,
  currentAuthorSlug = null,
}: AuthorLinkProps) {
  const normalizedSlug = authorSlug?.trim() ?? "";
  const trimmedName = authorName.trim();

  if (!trimmedName) {
    return null;
  }

  if (
    !normalizedSlug ||
    (currentAuthorSlug && normalizedSlug === currentAuthorSlug.trim())
  ) {
    return <span className={className}>{trimmedName}</span>;
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (stopPropagation) {
      event.stopPropagation();
    }
  }

  return (
    <Link
      href={buildAuthorPublicPath(normalizedSlug)}
      className={`hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${className}`}
      aria-label={`Страница автора ${trimmedName}`}
      onClick={handleClick}
    >
      {trimmedName}
    </Link>
  );
}
