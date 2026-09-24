"use client";

import AudioladHorizontalLogo from "@/components/brand/AudioladHorizontalLogo";
import { readMaxInitData } from "@/lib/max/bridge";
import { MAX_CATALOG_PATH, MAX_PRODUCT_PATH } from "@/lib/max/host";
import { useEffect, useState } from "react";

type MaxCatalogProduct = {
  authorSlug: string;
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
type MaxProductDetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; product: { title: string; subtitle: string | null; description: string | null; authorName: string | null; formatLabel: string; coverUrl: string | null; priceLabel: string; statsLabel: string | null; contents: Array<{ title: string; position: number; durationSeconds: number | null }> } }
  | { status: "not_found" }
  | { status: "error" };

export function formatMaxDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = String(safe % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

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
      typeof product.authorSlug !== "string" ||
      typeof product.title !== "string" ||
      typeof product.formatLabel !== "string" ||
      typeof product.priceLabel !== "string" ||
      typeof product.isFree !== "boolean"
    ) {
      return [];
    }

    return [
      {
        authorSlug: product.authorSlug,
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
  const [selected, setSelected] = useState<MaxCatalogProduct | null>(null);
  const [detail, setDetail] = useState<MaxProductDetailState>({ status: "idle" });

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

  useEffect(() => {
    if (!selected) {
      return;
    }
    const initData = readMaxInitData();
    if (!initData) return;
    const controller = new AbortController();
    void fetch(MAX_PRODUCT_PATH, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData, authorSlug: selected.authorSlug, productSlug: selected.slug }),
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => ({ status: response.status, payload: await response.json().catch(() => null) }))
      .then(({ status, payload }) => {
        if (controller.signal.aborted) return;
        if (status === 404) return setDetail({ status: "not_found" });
        const product = payload?.product;
        if (product && Array.isArray(product.contents)) {
          setDetail({ status: "ready", product });
        } else setDetail({ status: "error" });
      })
      .catch(() => { if (!controller.signal.aborted) setDetail({ status: "error" }); });
    return () => controller.abort();
  }, [selected]);

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
              <li key={`${product.authorSlug}/${product.slug}`}><button
                type="button"
                onClick={() => { setDetail({ status: "loading" }); setSelected(product); }}
                className="flex min-h-28 w-full gap-3 rounded-2xl border border-[#e8def5] bg-white p-3 text-left"
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
              </button></li>
            ))}
          </ul>
        ) : null}
      </div>
      {selected ? (
        <div className="fixed inset-0 overflow-y-auto bg-[#faf8ff] p-4">
          <button type="button" onClick={() => { setDetail({ status: "idle" }); setSelected(null); }} className="min-h-11 text-sm font-medium text-[#7042c5]">
            ← Назад в каталог
          </button>
          <h2 className="mt-5 text-2xl font-semibold">{detail.status === "ready" ? detail.product.title : selected.title}</h2>
          {detail.status === "loading" ? <p className="mt-6 text-sm text-[#6c5d94]">Детали продукта загружаются…</p> : null}
          {detail.status === "not_found" ? <p className="mt-6 text-sm text-[#6c5d94]">Продукт недоступен.</p> : null}
          {detail.status === "error" ? <p className="mt-6 text-sm text-[#6c5d94]">Не удалось загрузить продукт.</p> : null}
          {detail.status === "ready" ? <>{detail.product.coverUrl ? <img src={detail.product.coverUrl} alt="" className="mt-4 h-48 w-full rounded-2xl object-cover" /> : null}<p className="mt-3 text-sm">{detail.product.formatLabel} · {detail.product.priceLabel}</p>{detail.product.subtitle ? <p className="mt-2 text-sm text-[#6c5d94]">{detail.product.subtitle}</p> : null}{detail.product.authorName ? <p className="mt-2 text-sm text-[#6c5d94]">{detail.product.authorName}</p> : null}{detail.product.statsLabel ? <p className="mt-2 text-sm text-[#6c5d94]">{detail.product.statsLabel}</p> : null}{detail.product.description ? <p className="mt-6 whitespace-pre-line text-sm text-[#4a3d73]">{detail.product.description}</p> : null}{detail.product.contents.length ? <ol className="mt-6 space-y-2 text-sm">{detail.product.contents.map((track) => <li key={`${track.position}-${track.title}`}>{track.position}. {track.title}{track.durationSeconds !== null ? ` · ${formatMaxDuration(track.durationSeconds)}` : ""}</li>)}</ol> : null}</> : null}
        </div>
      ) : null}
    </section>
  );
}
