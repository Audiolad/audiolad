"use client";

import { useRouter } from "next/navigation";

type AudioPostBackLinkProps = {
  className?: string;
};

/**
 * Soft back for audio posts: same-origin history when available, else home.
 * Catalog is intentionally not the default — unlisted posts are often off-catalog.
 */
export default function AudioPostBackLink({
  className = "",
}: AudioPostBackLinkProps) {
  const router = useRouter();

  function handleClick() {
    if (typeof window === "undefined") {
      router.push("/");
      return;
    }

    const referrer = document.referrer;
    if (referrer) {
      try {
        const refUrl = new URL(referrer);
        if (refUrl.origin === window.location.origin) {
          router.back();
          return;
        }
      } catch {
        // fall through to home
      }
    }

    router.push("/");
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center text-sm font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${className}`.trim()}
    >
      ← Назад
    </button>
  );
}
