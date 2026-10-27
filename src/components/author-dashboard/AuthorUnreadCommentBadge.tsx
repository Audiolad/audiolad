"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { formatAdminNavBadgeCount } from "@/lib/admin/nav-badge";
import {
  AUTHOR_COMMENTS_BADGE_LABEL,
  AUTHOR_COMMENTS_HREF,
} from "@/lib/practice-comments/copy";

export const AUTHOR_UNREAD_EVENT = "author-unread-comments";

let cachedCount: { value: number; at: number } | null = null;
let inflight: Promise<number> | null = null;

export function publishAuthorUnreadCount(count: number): void {
  cachedCount = { value: count, at: Date.now() };
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTHOR_UNREAD_EVENT, { detail: count }));
}

async function loadUnreadCount(force: boolean): Promise<number> {
  if (!force && cachedCount && Date.now() - cachedCount.at < 20_000) {
    return cachedCount.value;
  }
  if (inflight) return inflight;
  inflight = fetch("/api/author/listener-comments/unread", { credentials: "same-origin" })
    .then(async (response) => {
      if (!response.ok) return 0;
      const payload = (await response.json()) as { unreadCount?: number };
      return typeof payload.unreadCount === "number" ? payload.unreadCount : 0;
    })
    .catch(() => 0)
    .then((count) => {
      cachedCount = { value: count, at: Date.now() };
      return count;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useAuthorUnreadCommentCount(): number {
  const pathname = usePathname();
  const [count, setCount] = useState(cachedCount?.value ?? 0);

  useEffect(() => {
    let stop = false;
    const apply = (next: number) => {
      if (!stop) setCount(next);
    };
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<number>).detail;
      if (typeof detail === "number") apply(detail);
    };
    window.addEventListener(AUTHOR_UNREAD_EVENT, onEvent);
    void loadUnreadCount(true).then(apply);
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadUnreadCount(true).then(apply);
    }, 60_000);
    return () => {
      stop = true;
      window.removeEventListener(AUTHOR_UNREAD_EVENT, onEvent);
      window.clearInterval(timer);
    };
  }, [pathname]);

  return count;
}

export function AuthorUnreadCommentBadgeView({
  count,
  placement,
}: {
  count: number;
  placement: "sidebar" | "nav";
}) {
  const text = formatAdminNavBadgeCount(count);
  if (!text) return null;
  const className =
    placement === "sidebar"
      ? "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#9a3d55] px-1 text-[11px] font-bold leading-none text-white shadow-sm"
      : "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#9a3d55] px-1 text-[11px] font-bold leading-none text-white";
  const label = `${AUTHOR_COMMENTS_BADGE_LABEL}: ${text}`;
  if (placement === "sidebar") {
    return (
      <Link
        href={AUTHOR_COMMENTS_HREF}
        data-author-unread-comments={text}
        aria-label={label}
        title={label}
        className={`absolute -right-1 -top-2 ${className}`}
      >
        {text}
      </Link>
    );
  }
  return (
    <span data-author-unread-comments={text} aria-label={label} className={className}>
      {text}
    </span>
  );
}

export default function AuthorUnreadCommentBadge({
  placement,
}: {
  placement: "sidebar" | "nav";
}) {
  const count = useAuthorUnreadCommentCount();
  return <AuthorUnreadCommentBadgeView count={count} placement={placement} />;
}
