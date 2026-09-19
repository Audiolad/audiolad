"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import AuthorAccessStatusBanner from "@/components/author-dashboard/AuthorAccessStatusBanner";
import { useAuthorProjectSelection } from "@/components/author-dashboard/useAuthorProjectSelection";
import ProductCoverThumbnail from "@/components/products/ProductCoverThumbnail";
import { buildAuthorStatusHref } from "@/lib/author-dashboard/free-author-first-step";
import type { AuthorWorkspace } from "@/lib/author-products/types";
import {
  formatPriceLabel,
  getStatusClassName,
  getStatusLabel,
} from "@/lib/author-products/types";
import { getVisibleAuthorProductStatus } from "@/lib/author-products/moderation";
import type { AuthorStudioMusicListItem } from "@/lib/author-studio-music/management";
import { initialStudioFixedPriceDraft } from "@/lib/author-studio-music/management";
import {
  DEFAULT_STUDIO_MUSIC_FIXED_RUBLES,
  STUDIO_MUSIC_PRICING_MODE,
} from "@/lib/studio-music/pricing";

type Tab = "library" | "studio";
type StudioFilter = "all" | "in" | "out";

type AuthorMusicClientProps = {
  authors: AuthorWorkspace[];
  initialTab?: Tab;
};

export default function AuthorMusicClient({
  authors,
  initialTab = "library",
}: AuthorMusicClientProps) {
  const pathname = usePathname();
  const { selectedAuthor } = useAuthorProjectSelection(authors, pathname);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [items, setItems] = useState<AuthorStudioMusicListItem[]>([]);
  const [canManageStudio, setCanManageStudio] = useState(false);
  const [inStudioCount, setInStudioCount] = useState(0);
  const [notInStudioCount, setNotInStudioCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [studioFilter, setStudioFilter] = useState<StudioFilter>("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowMessage, setRowMessage] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [editingPriceIds, setEditingPriceIds] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!selectedAuthor) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/author/studio-music?author_id=${encodeURIComponent(selectedAuthor.id)}`,
        { credentials: "same-origin" },
      );
      const payload = (await response.json()) as {
        error?: string;
        items?: AuthorStudioMusicListItem[];
        canManageStudio?: boolean;
        inStudioCount?: number;
        notInStudioCount?: number;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "load_failed");
      }
      const list = payload.items ?? [];
      setItems(list);
      setCanManageStudio(payload.canManageStudio === true);
      setInStudioCount(payload.inStudioCount ?? 0);
      setNotInStudioCount(payload.notInStudioCount ?? 0);
      const drafts: Record<string, string> = {};
      const editing: Record<string, boolean> = {};
      for (const item of list) {
        const fixed = initialStudioFixedPriceDraft(item);
        if (fixed != null) {
          drafts[item.practiceId] = String(fixed);
        }
        editing[item.practiceId] = false;
      }
      setPriceDrafts(drafts);
      setEditingPriceIds(editing);
    } catch {
      setError("Не удалось загрузить музыку.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [selectedAuthor]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedAuthor) return;
    const url = new URL(window.location.href);
    url.searchParams.set("author", selectedAuthor.slug);
    url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", url.toString());
  }, [selectedAuthor, tab]);

  const filteredStudioItems = useMemo(() => {
    if (studioFilter === "in") return items.filter((i) => i.inStudio);
    if (studioFilter === "out") return items.filter((i) => !i.inStudio);
    return items;
  }, [items, studioFilter]);

  if (!selectedAuthor) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-sm text-[#7d70a2]">Выберите авторский проект.</p>
      </div>
    );
  }

  const authorQuery = `?author=${encodeURIComponent(selectedAuthor.slug)}`;
  const productsHref = `/author-dashboard${authorQuery}`;
  const statusHref = buildAuthorStatusHref(selectedAuthor.slug);

  async function saveStudio(
    item: AuthorStudioMusicListItem,
    enabled: boolean,
    priceRubles: number,
  ) {
    setSavingId(item.practiceId);
    setRowError((c) => ({ ...c, [item.practiceId]: "" }));
    setRowMessage((c) => ({ ...c, [item.practiceId]: "" }));
    try {
      const response = await fetch(
        `/api/author/studio-music/${encodeURIComponent(item.practiceId)}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled, priceRubles }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        item?: AuthorStudioMusicListItem;
      };
      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? "save_failed");
      }
      if (payload.item) {
        setItems((current) =>
          current.map((row) =>
            row.practiceId === payload.item!.practiceId ? payload.item! : row,
          ),
        );
        setInStudioCount((count) => {
          const was = item.inStudio;
          const now = payload.item!.inStudio;
          if (!was && now) return count + 1;
          if (was && !now) return count - 1;
          return count;
        });
        setNotInStudioCount((count) => {
          const was = item.inStudio;
          const now = payload.item!.inStudio;
          if (!was && now) return count - 1;
          if (was && !now) return count + 1;
          return count;
        });
      }
      setRowMessage((c) => ({
        ...c,
        [item.practiceId]: "Настройки Студии сохранены",
      }));
      setEditingPriceIds((c) => ({ ...c, [item.practiceId]: false }));
      if (payload.item?.studioPricingMode === STUDIO_MUSIC_PRICING_MODE.FIXED) {
        setPriceDrafts((c) => ({
          ...c,
          [item.practiceId]: String(
            payload.item!.studioPriceRubles ?? DEFAULT_STUDIO_MUSIC_FIXED_RUBLES,
          ),
        }));
      }
    } catch (err) {
      setRowError((c) => ({
        ...c,
        [item.practiceId]:
          err instanceof Error ? err.message : "Не удалось сохранить",
      }));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <AuthorDashboardNav
        authorSlug={selectedAuthor.slug}
        authorId={selectedAuthor.id}
      />
      <AuthorAccessStatusBanner accessStatus={selectedAuthor.accessStatus} />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href={productsHref} className="text-[#6b5b95] hover:underline">
          Все продукты
        </Link>
        <span className="text-[#cbbce6]">·</span>
        <span className="font-medium text-[#3f3560]">
          Музыка · {items.length}
        </span>
      </div>

      <div className="flex gap-2 rounded-[18px] border border-[#eadff8] bg-white p-1">
        {(
          [
            ["library", "Моя музыка"],
            ["studio", "Музыка в Студии"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`flex-1 rounded-[14px] px-4 py-2.5 text-sm font-medium transition ${
              tab === value
                ? "bg-[#f8f4ff] text-[#5b3e91]"
                : "text-[#7d70a2] hover:bg-[#fbf8ff]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[#7d70a2]">Загрузка…</p>
      ) : error ? (
        <p className="text-sm text-[#9b3d3d]">{error}</p>
      ) : items.length === 0 ? (
        <div className="rounded-[24px] border border-[#eadff8] bg-white p-6 text-sm text-[#7d70a2]">
          Пока нет музыкальных продуктов.{" "}
          <Link href={productsHref} className="text-[#6b5b95] underline">
            Вернуться к продуктам
          </Link>
        </div>
      ) : tab === "library" ? (
        <div className="space-y-3">
          {items.map((item) => (
            <MusicLibraryCard
              key={item.practiceId}
              item={item}
              authorSlug={selectedAuthor.slug}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-[24px] border border-[#eadff8] bg-white p-5">
            <p className="text-sm font-medium text-[#3f3560]">
              В Студии: {inStudioCount} · Не в Студии: {notInStudioCount}
            </p>
            <p className="mt-2 text-sm leading-5 text-[#7d70a2]">
              Выберите музыку, которую другие авторы смогут использовать в своих
              проектах. Лицензия для Студии — от{" "}
              {DEFAULT_STUDIO_MUSIC_FIXED_RUBLES} ₽.
            </p>
            {!canManageStudio ? (
              <p className="mt-3 text-sm leading-5 text-[#7d70a2]">
                После получения коммерческого статуса вы сможете выбрать музыку
                для Студии и установить цену лицензии от{" "}
                {DEFAULT_STUDIO_MUSIC_FIXED_RUBLES} ₽.{" "}
                <Link href={statusHref} className="text-[#6b5b95] underline">
                  Подробнее о коммерческом статусе
                </Link>
              </p>
            ) : null}
          </div>

          {canManageStudio ? (
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "Все"],
                  ["in", "В Студии"],
                  ["out", "Не в Студии"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStudioFilter(value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                    studioFilter === value
                      ? "bg-[#5b3e91] text-white"
                      : "bg-[#f3ecfb] text-[#5b3e91]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="space-y-3">
            {filteredStudioItems.map((item) => (
              <MusicStudioCard
                key={item.practiceId}
                item={item}
                authorSlug={selectedAuthor.slug}
                canManage={canManageStudio}
                saving={savingId === item.practiceId}
                editingPrice={editingPriceIds[item.practiceId] === true}
                priceDraft={
                  priceDrafts[item.practiceId] ??
                  String(DEFAULT_STUDIO_MUSIC_FIXED_RUBLES)
                }
                onPriceDraft={(value) =>
                  setPriceDrafts((c) => ({ ...c, [item.practiceId]: value }))
                }
                onStartEditPrice={() => {
                  setEditingPriceIds((c) => ({
                    ...c,
                    [item.practiceId]: true,
                  }));
                  setPriceDrafts((c) => ({
                    ...c,
                    [item.practiceId]:
                      c[item.practiceId] ??
                      String(
                        item.studioPriceRubles ??
                          DEFAULT_STUDIO_MUSIC_FIXED_RUBLES,
                      ),
                  }));
                }}
                message={rowMessage[item.practiceId]}
                error={rowError[item.practiceId]}
                onToggle={(enabled) => {
                  const price = Number.parseInt(
                    priceDrafts[item.practiceId] ??
                      String(DEFAULT_STUDIO_MUSIC_FIXED_RUBLES),
                    10,
                  );
                  void saveStudio(item, enabled, price);
                }}
                onSavePrice={() => {
                  const price = Number.parseInt(
                    priceDrafts[item.practiceId] ??
                      String(DEFAULT_STUDIO_MUSIC_FIXED_RUBLES),
                    10,
                  );
                  void saveStudio(item, true, price);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MusicLibraryCard({
  item,
  authorSlug,
}: {
  item: AuthorStudioMusicListItem;
  authorSlug: string;
}) {
  const visible = getVisibleAuthorProductStatus({
    status: item.status,
    moderationStatus: item.moderationStatus,
  });
  return (
    <article className="rounded-[24px] border border-[#eadff8] bg-white p-4 shadow-[0_8px_22px_rgba(91,62,145,0.06)]">
      <div className="flex flex-col gap-4 sm:flex-row">
        <ProductCoverThumbnail
          slug={item.slug}
          title={item.title}
          coverUrl={item.coverUrl}
          coverImage={item.coverImage}
          displayWidth={96}
          className="h-24 w-24 shrink-0 rounded-[18px]"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="text-base font-semibold text-[#3f3560]">{item.title}</h3>
          <p className="text-sm text-[#7d70a2]">
            {item.kindLabel}
            {item.trackCount > 0 ? ` · ${item.trackCount}` : ""}
          </p>
          <p className="text-sm text-[#7d70a2]">
            Прослушивание:{" "}
            {item.listenerIsFree
              ? "бесплатно"
              : formatPriceLabel(item.listenerPriceRubles, false)}
          </p>
          <p className="text-sm text-[#7d70a2]">
            {item.inStudio ? "В Студии" : "Не в Студии"}
          </p>
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClassName(visible)}`}
          >
            {getStatusLabel(visible)}
          </span>
          <div>
            <Link
              href={`/author-dashboard/products/${item.practiceId}?author=${encodeURIComponent(authorSlug)}`}
              className="text-sm font-medium text-[#6b5b95] hover:underline"
            >
              Редактировать
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function MusicStudioCard({
  item,
  authorSlug,
  canManage,
  saving,
  editingPrice,
  priceDraft,
  onPriceDraft,
  onStartEditPrice,
  onToggle,
  onSavePrice,
  message,
  error,
}: {
  item: AuthorStudioMusicListItem;
  authorSlug: string;
  canManage: boolean;
  saving: boolean;
  editingPrice: boolean;
  priceDraft: string;
  onPriceDraft: (value: string) => void;
  onStartEditPrice: () => void;
  onToggle: (enabled: boolean) => void;
  onSavePrice: () => void;
  message?: string;
  error?: string;
}) {
  const toggleDisabled =
    !canManage || saving || (!item.published && !item.inStudio);
  const isAuto =
    item.studioPricingMode === STUDIO_MUSIC_PRICING_MODE.AUTO_2X_LISTENER;
  const isFixed =
    item.studioPricingMode === STUDIO_MUSIC_PRICING_MODE.FIXED;
  const isGrandfatheredFree = item.grandfatheredFree === true;
  const showFixedEditor =
    canManage &&
    (item.inStudio || item.published) &&
    (isFixed || editingPrice);

  return (
    <article className="rounded-[24px] border border-[#eadff8] bg-white p-4 shadow-[0_8px_22px_rgba(91,62,145,0.06)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <ProductCoverThumbnail
          slug={item.slug}
          title={item.title}
          coverUrl={item.coverUrl}
          coverImage={item.coverImage}
          displayWidth={80}
          className="h-20 w-20 shrink-0 rounded-[16px]"
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h3 className="text-base font-semibold text-[#3f3560]">{item.title}</h3>
            <p className="text-sm text-[#7d70a2]">
              {item.kindLabel}
              {item.trackCount > 0 ? ` · ${item.trackCount}` : ""} ·{" "}
              {item.published ? "Опубликован" : "Черновик"}
            </p>
            <p className="text-sm text-[#7d70a2]">
              Прослушивание:{" "}
              {item.listenerIsFree
                ? "бесплатно"
                : formatPriceLabel(item.listenerPriceRubles, false)}
            </p>
          </div>

          <label className="flex items-center gap-3 text-sm text-[#3f3560]">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={item.inStudio}
              disabled={toggleDisabled}
              onChange={(event) => onToggle(event.target.checked)}
            />
            <span>В Студии</span>
          </label>
          {!item.published && !item.inStudio ? (
            <p className="text-xs text-[#7d70a2]">Сначала опубликуйте продукт.</p>
          ) : null}

          {item.inStudio && isGrandfatheredFree && !editingPrice ? (
            <div className="space-y-2">
              <p className="text-sm text-[#7d70a2]">
                Бесплатно — сохранено ранее
              </p>
              {canManage ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={onStartEditPrice}
                  className="rounded-[14px] border border-[#e4d7f4] bg-white px-4 py-2 text-sm font-medium text-[#5b3e91] disabled:opacity-60"
                >
                  Сделать лицензию платной
                </button>
              ) : null}
            </div>
          ) : null}

          {item.inStudio && isAuto && !editingPrice ? (
            <div className="space-y-2">
              <p className="text-sm text-[#7d70a2]">
                Автоматическая цена — в 2 раза выше цены прослушивания, минимум{" "}
                {DEFAULT_STUDIO_MUSIC_FIXED_RUBLES} ₽
              </p>
              {canManage ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={onStartEditPrice}
                  className="rounded-[14px] border border-[#e4d7f4] bg-white px-4 py-2 text-sm font-medium text-[#5b3e91] disabled:opacity-60"
                >
                  Установить свою цену
                </button>
              ) : null}
            </div>
          ) : null}

          {showFixedEditor ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-[#7d70a2]">Цена лицензии, ₽</span>
                <input
                  type="number"
                  min={DEFAULT_STUDIO_MUSIC_FIXED_RUBLES}
                  step={1}
                  value={priceDraft}
                  disabled={saving || !canManage}
                  onChange={(event) => onPriceDraft(event.target.value)}
                  className="w-28 rounded-[14px] border border-[#e4d7f4] px-3 py-2 outline-none focus:border-[#9a74d8]"
                />
              </label>
              {item.inStudio || editingPrice ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={onSavePrice}
                  className="rounded-[14px] bg-[#5b3e91] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {isGrandfatheredFree || isAuto
                    ? "Сохранить платную лицензию"
                    : "Сохранить цену"}
                </button>
              ) : null}
            </div>
          ) : null}

          {canManage &&
          !item.inStudio &&
          item.published &&
          !editingPrice ? (
            <p className="text-xs text-[#7d70a2]">
              При включении в Студию лицензия будет платной от{" "}
              {DEFAULT_STUDIO_MUSIC_FIXED_RUBLES} ₽.
            </p>
          ) : null}

          {message ? (
            <p className="text-sm text-[#2f7a4a]">{message}</p>
          ) : null}
          {error ? <p className="text-sm text-[#9b3d3d]">{error}</p> : null}

          <Link
            href={`/author-dashboard/products/${item.practiceId}?author=${encodeURIComponent(authorSlug)}`}
            className="inline-block text-sm font-medium text-[#6b5b95] hover:underline"
          >
            Открыть продукт
          </Link>
        </div>
      </div>
    </article>
  );
}
