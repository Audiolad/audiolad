"use client";

import Link from "next/link";
import type { MouseEvent } from "react";

import { StudioGuestAuthLinks } from "@/components/studio/StudioGuestGate";

export function StudioChromeNav({
  accessMode,
  showStudioLauncher = false,
  onNavigate,
}: {
  accessMode: "author" | "guest";
  showStudioLauncher?: boolean;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  if (accessMode === "guest") {
    return (
      <nav className="flex flex-wrap items-center gap-2">
        <Link
          href="/studio/projects"
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/25 px-4 text-sm font-semibold text-white"
        >
          Мои проекты
        </Link>
        <Link
          href="/studio/help"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#a98be0] px-4 text-sm font-semibold text-[#eadfff] hover:bg-white/10"
        >
          Инструкция
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/25 px-4 text-sm font-semibold text-white"
        >
          В АудиоЛад
        </Link>
        <StudioGuestAuthLinks />
      </nav>
    );
  }

  return (
    <nav className="flex flex-wrap gap-2">
      <Link
        href="/studio/help"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#a98be0] px-4 text-sm font-semibold text-[#eadfff] hover:bg-white/10"
      >
        Инструкция
      </Link>
      {showStudioLauncher ? (
        <Link
          href="/studio"
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/25 px-4 text-sm font-semibold text-white"
        >
          ← В Studio
        </Link>
      ) : null}
      <Link
        href="/author-dashboard"
        onClick={onNavigate}
        className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#7051ae] px-4 text-sm font-semibold text-white"
      >
        Вернуться в кабинет автора
      </Link>
      <Link
        href="/profile"
        onClick={onNavigate}
        className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/25 px-4 text-sm font-semibold text-white"
      >
        Вернуться в АудиоЛад
      </Link>
    </nav>
  );
}
