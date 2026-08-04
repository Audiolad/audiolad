"use client";

import type { MouseEvent, ReactNode } from "react";

type SchoolTariffsAnchorLinkProps = {
  children: ReactNode;
  className?: string;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function SchoolTariffsAnchorLink({
  children,
  className,
}: SchoolTariffsAnchorLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    const target = document.getElementById("tariffs");
    if (!target) return;

    event.preventDefault();
    target.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "#tariffs");
    }
  }

  return (
    <a href="#tariffs" className={className} onClick={handleClick}>
      {children}
    </a>
  );
}
