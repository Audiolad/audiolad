"use client";

import { useEffect, useState } from "react";

import MaxCatalogProductCard from "@/components/max/MaxCatalogProductCard";
import MaxGuestHomeSlider from "@/components/max/MaxGuestHomeSlider";
import {
  PUBLIC_CATALOG_SECTION_CARDS,
  type PublicCatalogSection,
} from "@/lib/catalog/catalog-sections";
import {
  GUEST_HOME_INTRO,
  GUEST_HOME_LISTEN_FREE_CTA,
} from "@/lib/home/guest-slider";
import { readMaxInitData } from "@/lib/max/bridge";
import type { MaxCatalogProduct } from "@/lib/max/catalog-product";
import {
  MAX_HOME_SEE_ALL_LABEL,
  MAX_HOME_SHELF_LIMIT,
  MAX_HOME_SHELVES,
  MAX_HOME_SUBTITLE,
  MAX_HOME_TITLE,
  readMaxHomeShelves,
  type MaxHomeShelfId,
  type MaxHomeShelves,
} from "@/lib/max/home";
import { MAX_HOME_PATH } from "@/lib/max/host";

type MaxHomeStatus = "loading" | "ready" | "error";

type MaxHomeScreenProps = {
  guestMode: boolean;
  status: MaxHomeStatus;
  shelves: MaxHomeShelves | null;
  onListenFree: () => void;
  onSlideAction: (slideId: string) => void;
  onOpenSection: (section: PublicCatalogSection) => void;
  onOpenShelf: (shelfId: MaxHomeShelfId) => void;
  onSelectProduct: (product: MaxCatalogProduct) => void;
};

const EMPTY_SHELVES: MaxHomeShelves = {
  free: [],
  music: [],
  meditations: [],
};

export function MaxHomeScreen({
  guestMode,
  status,
  shelves,
  onListenFree,
  onSlideAction,
  onOpenSection,
  onOpenShelf,
  onSelectProduct,
}: MaxHomeScreenProps) {
  const readyShelves = shelves ?? EMPTY_SHELVES;

  return (
    <div data-max-home data-max-home-guest={guestMode ? "true" : "false"}>
      {guestMode ? (
        <section className="mt-3">
          <h1
            data-max-guest-home-intro
            className="text-[15px] font-medium leading-snug text-[#25135c] sm:text-base"
          >
            {GUEST_HOME_INTRO}
          </h1>
          <div className="mt-3">
            <MaxGuestHomeSlider onSlideAction={onSlideAction} />
          </div>
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              data-max-guest-home-cta
              onClick={onListenFree}
              className="home-primary-cta home-primary-cta--compact"
            >
              {GUEST_HOME_LISTEN_FREE_CTA.label}
            </button>
          </div>
        </section>
      ) : (
        <>
          <h1 className="mt-5 text-[26px] font-semibold leading-tight text-[#25135c]">
            {MAX_HOME_TITLE}
          </h1>
          <p className="mt-2 text-[17px] leading-6 text-[#4a3d73]">{MAX_HOME_SUBTITLE}</p>
        </>
      )}

      <nav aria-label="Разделы каталога" data-max-home-sections className="mt-6">
        <div className="grid grid-cols-4 gap-1">
          {PUBLIC_CATALOG_SECTION_CARDS.map((section) => (
            <button
              key={section.value}
              type="button"
              aria-label={section.label}
              data-max-home-section={section.value}
              onClick={() => onOpenSection(section.value)}
              className="block aspect-square w-full min-w-0 overflow-hidden rounded-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              <img
                src={`/images/catalog-sections/catalog-section-${section.asset}-mobile.webp`}
                alt=""
                className="block aspect-square h-auto w-full object-cover"
              />
            </button>
          ))}
        </div>
      </nav>

      {status === "loading" ? (
        <p className="mt-6 text-sm text-[#6c5d94]">Собираем подборки…</p>
      ) : null}
      {status === "error" ? (
        <p className="mt-6 text-sm text-[#6c5d94]">Не удалось загрузить подборки.</p>
      ) : null}
      {status === "ready"
        ? MAX_HOME_SHELVES.map((shelf) => {
            const items = readyShelves[shelf.id].slice(0, MAX_HOME_SHELF_LIMIT);
            if (items.length === 0) return null;
            return (
              <section key={shelf.id} data-max-home-shelf={shelf.id} className="mt-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[18px] font-semibold leading-6 text-[#25135c]">
                    {shelf.title}
                  </h2>
                  <button
                    type="button"
                    onClick={() => onOpenShelf(shelf.id)}
                    className="inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                  >
                    {MAX_HOME_SEE_ALL_LABEL}
                  </button>
                </div>
                <ul className="-mx-4 mt-3 flex gap-[6px] overflow-x-auto px-[6px] pb-1">
                  {items.map((product) => (
                    <li
                      key={`${shelf.id}/${product.authorSlug}/${product.slug}`}
                      className="w-[46%] max-w-[180px] shrink-0"
                    >
                      <MaxCatalogProductCard
                        product={product}
                        onSelectProduct={onSelectProduct}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        : null}
    </div>
  );
}

export default function MaxHome({
  guestMode,
  onListenFree,
  onSlideAction,
  onOpenSection,
  onOpenShelf,
  onSelectProduct,
}: Omit<MaxHomeScreenProps, "status" | "shelves">) {
  const [status, setStatus] = useState<MaxHomeStatus>(() =>
    readMaxInitData() ? "loading" : "error",
  );
  const [shelves, setShelves] = useState<MaxHomeShelves | null>(null);

  useEffect(() => {
    const initData = readMaxInitData();
    if (!initData) {
      return;
    }

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(MAX_HOME_PATH, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        const nextShelves = response.ok ? readMaxHomeShelves(payload) : null;
        if (!nextShelves) {
          setStatus("error");
          setShelves(null);
          return;
        }
        setShelves(nextShelves);
        setStatus("ready");
      } catch {
        if (!controller.signal.aborted) {
          setStatus("error");
          setShelves(null);
        }
      }
    })();

    return () => controller.abort();
  }, []);

  return (
    <MaxHomeScreen
      guestMode={guestMode}
      status={status}
      shelves={shelves}
      onListenFree={onListenFree}
      onSlideAction={onSlideAction}
      onOpenSection={onOpenSection}
      onOpenShelf={onOpenShelf}
      onSelectProduct={onSelectProduct}
    />
  );
}
