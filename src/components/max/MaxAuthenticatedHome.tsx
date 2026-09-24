"use client";

import AudioladHorizontalLogo from "@/components/brand/AudioladHorizontalLogo";
import { readMaxInitData } from "@/lib/max/bridge";
import { MAX_CATALOG_PATH } from "@/lib/max/host";
import { useEffect, useState } from "react";

type MaxCatalogProduct = {
  slug: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  authorName: string | null;
  formatLabel: string;
  priceLabel: string;
  isFree: boolean;
};

type MaxCatalogState =
  | { status: "loading" }
  | { status: "ready"; items: MaxCatalogProduct[] }
  | { status: "error" };

function readCatalogPayload(payload: unknown): MaxCatalogProduct[] | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const items = (payload as { items?: unknown }).items;
  if (!Array.isArray(items)) {
    return null;
  }

  return items.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const product = item as Partial<MaxCatalogProduct>;
    if (
      typeof product.slug !== "string" ||
      typeof product.title !== "string" ||
      typeof product.formatLabel !== "string" ||
      typeof product.priceLabel !== "string" ||
      typeof product.isFree !== "boolean"
    ) {
      return [];
    }

    return [
      {
        slug: product.slug,
        title: product.title,
        subtitle: typeof product.subtitle === "string" ? product.subtitle : null,
        coverUrl: typeof product.coverUrl === "string" ? product.coverUrl : null,
        authorName:
          typeof product.authorName === "string" ? product.authorName : null,
        formatLabel: product.formatLabel,
        priceLabel: product.priceLabel,
        isFree: product.isFree,
      },
    ];
  });
}

export default function MaxAuthenticatedHome() {
  const [catalog, setCatalog] = useState<MaxCatalogState>(() =>
    readMaxInitData() ? { status: "loading" } : { status: "error" },
  );

  useEffect(() => {
    const initData = readMaxInitData();
    if (!initData) {
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(MAX_CATALOG_PATH, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        const items = response.ok ? readCatalogPayload(payload) : null;
        if (!controller.signal.aborted) {
          setCatalog(items ? { status: "ready", items } : { status: "error" });
        }
      } catch {
        if (!controller.signal.aborted) {
          setCatalog({ status: "error" });
        }
      }
    })();

    return () => controller.abort();
  }, []);

  return (
    <section className="min-h-screen bg-[#faf8ff] px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))] text-[#25135c]">
      <header className="flex min-h-11 items-center border-b border-[#e8def5] pb-3">
        <AudioladHorizontalLogo
          className="h-8 w-auto max-w-full object-contain object-left"
          linkClassName="inline-flex rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          priority
          sizes="144px"
        />
      </header>
      <div className="mx-auto max-w-lg">
        <h1 className="mt-5 text-[26px] font-semibold leading-tight">Каталог</h1>
        <p className="mt-1 text-sm leading-5 text-[#6c5d94]">
          Аудиопрактики, музыка и курсы АудиоЛада
        </p>

        {catalog.status === "loading" ? (
          <p className="py-10 text-center text-sm text-[#6c5d94]">
            Загружаем каталог…
          </p>
        ) : null}
        {catalog.status === "error" ? (
          <div className="mt-6 rounded-2xl border border-[#eadce7] bg-white px-5 py-6 text-center">
            <p className="text-sm font-medium text-[#5f3f9d]">
              Не удалось загрузить каталог
            </p>
            <p className="mt-2 text-sm leading-5 text-[#6c5d94]">
              Закройте и снова откройте АудиоЛад в MAX.
            </p>
          </div>
        ) : null}
        {catalog.status === "ready" && catalog.items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-[#e8def5] bg-white px-5 py-6 text-center">
            <p className="text-sm font-medium text-[#5f3f9d]">
              В каталоге пока нет опубликованных аудиопродуктов.
            </p>
          </div>
        ) : null}
        {catalog.status === "ready" && catalog.items.length > 0 ? (
          <ul className="mt-5 grid gap-3">
            {catalog.items.map((product) => (
              <li
                key={product.slug}
                className="flex min-h-28 gap-3 rounded-2xl border border-[#e8def5] bg-white p-3"
              >
                <div className="h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-[#ede6f8]">
                  {product.coverUrl ? (
                    <img
                      src={product.coverUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 py-0.5">
                  <p className="line-clamp-2 text-[15px] font-semibold leading-5">
                    {product.title}
                  </p>
                  {product.subtitle ? (
                    <p className="mt-1 line-clamp-1 text-xs text-[#6c5d94]">
                      {product.subtitle}
                    </p>
                  ) : null}
                  {product.authorName ? (
                    <p className="mt-1 truncate text-xs text-[#6c5d94]">
                      {product.authorName}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-[#6c5d94]">{product.formatLabel}</p>
                  <p className="mt-1 text-sm font-medium text-[#7042c5]">
                    {product.priceLabel}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
