"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

import type { PlaylistListingSort } from "@/lib/playlists/listing-contract";
import {
  buildPlaylistCatalogHref,
  type PlaylistCatalogTopicOption,
} from "@/lib/playlists/listing-filters";

type PlaylistCatalogTopicFilterProps = {
  topics: PlaylistCatalogTopicOption[];
  activeTopicKey: string | null;
  q: string;
  sort: PlaylistListingSort;
  buildHref?: (topicKey: string | null) => string;
};

function optionClassName(isActive: boolean) {
  return `flex min-h-11 w-full items-center rounded-full border px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
    isActive
      ? "border-[#7042c5] bg-[#7042c5] text-white"
      : "border-[#ddcfef] bg-white text-[#7042c5]"
  }`;
}

export default function PlaylistCatalogTopicFilter({
  topics,
  activeTopicKey,
  q,
  sort,
  buildHref: buildHrefProp,
}: PlaylistCatalogTopicFilterProps) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const activeTitle =
    topics.find((topic) => topic.key === activeTopicKey)?.title ?? null;

  function buildHref(topicKey: string | null) {
    return (
      buildHrefProp?.(topicKey) ??
      buildPlaylistCatalogHref({ q, sort, topic: topicKey })
    );
  }

  function closeSheet() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSheet();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="mt-3" data-playlist-catalog-topic-filter>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] ${
          activeTitle
            ? "border-[#7042c5] bg-[#7042c5] text-white"
            : "border-[#ddcfef] bg-white text-[#7042c5]"
        }`}
      >
        {activeTitle ?? "Темы"}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-[#25135c]/35 px-0 pb-[env(safe-area-inset-bottom)] sm:items-center sm:px-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeSheet();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="flex max-h-[min(92vh,720px)] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[28px] border border-[#eadff8] bg-white shadow-[0_-12px_40px_rgba(91,62,145,0.18)] sm:rounded-[28px]"
          >
            <div className="shrink-0 border-b border-[#f0e7fa] px-5 pb-4 pt-5">
              <div className="flex items-start justify-between gap-3">
                <h2 id={titleId} className="text-[22px] font-semibold">
                  Темы
                </h2>
                <button
                  type="button"
                  onClick={closeSheet}
                  className="rounded-full px-2 py-1 text-sm text-[#7d70a2] hover:bg-[#f7f1fc]"
                  aria-label="Закрыть"
                >
                  Закрыть
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              <ul className="flex flex-col gap-2">
                <li>
                  <Link
                    href={buildHref(null)}
                    prefetch={false}
                    onClick={closeSheet}
                    aria-current={activeTopicKey ? undefined : "page"}
                    className={optionClassName(!activeTopicKey)}
                  >
                    Все
                  </Link>
                </li>
                {topics.map((topic) => {
                  const isActive = topic.key === activeTopicKey;

                  return (
                    <li key={topic.key}>
                      <Link
                        href={buildHref(topic.key)}
                        prefetch={false}
                        onClick={closeSheet}
                        aria-current={isActive ? "page" : undefined}
                        className={optionClassName(isActive)}
                      >
                        {topic.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
