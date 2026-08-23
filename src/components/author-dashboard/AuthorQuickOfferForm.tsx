"use client";

import { useEffect, useMemo, useState } from "react";

import type { AuthorWorkspace } from "@/lib/author-products/types";
import { getQuickOfferUiErrorMessage } from "@/lib/quick-offers/errors";
import { formatMaterialCaption } from "@/lib/quick-offers/format-labels";
import { buildQuickOfferPath } from "@/lib/quick-offers/paths";
import {
  getQuickOfferStatusClassName,
  getQuickOfferStatusLabel,
} from "@/lib/quick-offers/status-labels";
import {
  QUICK_OFFER_DEFAULT_CTA_TEXT,
  QUICK_OFFER_FORMAT_PRESETS,
  QUICK_OFFER_TIMER_PRESETS_SECONDS,
  type QuickOfferAdminDto,
  type QuickOfferEligibleProduct,
} from "@/lib/quick-offers/types";
import {
  QUICK_OFFER_CTA_MAX_LENGTH,
  QUICK_OFFER_DESCRIPTION_MAX_LENGTH,
  QUICK_OFFER_FORMAT_LABEL_MAX_LENGTH,
  QUICK_OFFER_TITLE_MAX_LENGTH,
  normalizeFormatLabel,
  normalizeQuickOfferSlug,
  validateFormatLabel,
} from "@/lib/quick-offers/validation";
import { formatRubles } from "@/lib/products/price-format";
import { copyTextToClipboard } from "@/lib/playlists/public-url";

type AuthorQuickOfferFormProps = {
  selectedAuthor: AuthorWorkspace;
  offerId: string | null;
  onClose: () => void;
  onSaved: (offer: QuickOfferAdminDto) => void;
};

function timerLabel(seconds: number): string {
  return `${Math.round(seconds / 60)} мин`;
}

export default function AuthorQuickOfferForm({
  selectedAuthor,
  offerId,
  onClose,
  onSaved,
}: AuthorQuickOfferFormProps) {
  const isCreate = !offerId;
  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [copied, setCopied] = useState(false);

  const [offer, setOffer] = useState<QuickOfferAdminDto | null>(null);
  const [products, setProducts] = useState<QuickOfferEligibleProduct[]>([]);
  const [practiceId, setPracticeId] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [promoPrice, setPromoPrice] = useState("");
  const [ctaText, setCtaText] = useState(QUICK_OFFER_DEFAULT_CTA_TEXT);
  const [timerSeconds, setTimerSeconds] = useState(1200);
  const [newFormat, setNewFormat] = useState<string>("PDF");
  const [customFormat, setCustomFormat] = useState("");

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === practiceId) ?? null,
    [practiceId, products],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const productsResponse = await fetch(
          `/api/author/promotion/offers/eligible-products?author_id=${encodeURIComponent(selectedAuthor.id)}`,
          { cache: "no-store" },
        );
        const productsPayload = (await productsResponse.json()) as {
          products?: QuickOfferEligibleProduct[];
        };

        if (!cancelled) {
          setProducts(productsPayload.products ?? []);
        }

        if (!offerId) {
          if (!cancelled) {
            setLoading(false);
          }
          return;
        }

        const response = await fetch(
          `/api/author/promotion/offers/${encodeURIComponent(offerId)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          offer?: QuickOfferAdminDto;
          error?: string;
        };

        if (!response.ok || !payload.offer) {
          throw new Error(payload.error ?? "load_failed");
        }

        if (!cancelled) {
          hydrateOffer(payload.offer);
          setLoading(false);
        }
      } catch (failure) {
        if (!cancelled) {
          setError(
            getQuickOfferUiErrorMessage(
              failure instanceof Error ? failure.message : "load_failed",
            ),
          );
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [offerId, selectedAuthor.id]);

  function hydrateOffer(next: QuickOfferAdminDto) {
    setOffer(next);
    setPracticeId(next.practice_id);
    setTitle(next.title);
    setSlug(next.slug);
    setDescription(next.short_description);
    setPromoPrice(String(next.promo_price));
    setCtaText(next.cta_text);
    setTimerSeconds(next.timer_duration_seconds);
  }

  function handleTitleChange(value: string) {
    setTitle(value);

    if (!slugTouched) {
      setSlug(normalizeQuickOfferSlug(value));
    }
  }

  async function saveOffer() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const parsedPromo = Number(promoPrice);

    try {
      const body = {
        author_id: isCreate ? selectedAuthor.id : undefined,
        practice_id:
          !isCreate && offer?.status === "published" ? undefined : practiceId,
        title,
        slug,
        short_description: description,
        promo_price: Number.isInteger(parsedPromo) ? parsedPromo : parsedPromo,
        cta_text: ctaText,
        timer_duration_seconds: timerSeconds,
      };

      const response = await fetch(
        isCreate
          ? "/api/author/promotion/offers"
          : `/api/author/promotion/offers/${encodeURIComponent(offerId!)}`,
        {
          method: isCreate ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isCreate ? body : { ...body, author_id: undefined },
          ),
        },
      );
      const payload = (await response.json()) as {
        offer?: QuickOfferAdminDto;
        error?: string;
      };

      if (!response.ok || !payload.offer) {
        throw new Error(payload.error ?? "save_failed");
      }

      hydrateOffer(payload.offer);
      onSaved(payload.offer);
      setSuccess("Оффер сохранён.");
    } catch (failure) {
      setError(
        getQuickOfferUiErrorMessage(
          failure instanceof Error ? failure.message : "save_failed",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadHero(file: File) {
    if (!offer) {
      return;
    }

    const formData = new FormData();
    formData.set("file", file);
    const response = await fetch(
      `/api/author/promotion/offers/${encodeURIComponent(offer.id)}/hero`,
      { method: "POST", body: formData },
    );
    const payload = (await response.json()) as {
      offer?: QuickOfferAdminDto;
      error?: string;
    };

    if (!response.ok || !payload.offer) {
      throw new Error(payload.error ?? "save_failed");
    }

    hydrateOffer(payload.offer);
  }

  async function addMaterial() {
    if (!offer) {
      setError("Сначала сохраните оффер, затем добавляйте карточки.");
      return;
    }

    const formatLabel =
      newFormat === "custom"
        ? normalizeFormatLabel(customFormat)
        : newFormat;
    const formatError = validateFormatLabel(formatLabel);

    if (formatError) {
      setError(getQuickOfferUiErrorMessage(formatError));
      return;
    }

    const response = await fetch(
      `/api/author/promotion/offers/${encodeURIComponent(offer.id)}/materials`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format_label: formatLabel }),
      },
    );
    const payload = (await response.json()) as {
      offer?: QuickOfferAdminDto;
      error?: string;
    };

    if (!response.ok || !payload.offer) {
      setError(getQuickOfferUiErrorMessage(payload.error));
      return;
    }

    hydrateOffer(payload.offer);
    setCustomFormat("");
  }

  async function updateMaterialFormat(materialId: string, formatLabel: string) {
    if (!offer) {
      return;
    }

    const normalized = normalizeFormatLabel(formatLabel);
    const formatError = validateFormatLabel(normalized);

    if (formatError) {
      setError(getQuickOfferUiErrorMessage(formatError));
      return;
    }

    const response = await fetch(
      `/api/author/promotion/offers/${encodeURIComponent(offer.id)}/materials/${encodeURIComponent(materialId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format_label: normalized }),
      },
    );
    const payload = (await response.json()) as {
      offer?: QuickOfferAdminDto;
      error?: string;
    };

    if (!response.ok || !payload.offer) {
      setError(getQuickOfferUiErrorMessage(payload.error));
      return;
    }

    hydrateOffer(payload.offer);
  }

  async function uploadMaterialImage(materialId: string, file: File) {
    if (!offer) {
      return;
    }

    const formData = new FormData();
    formData.set("file", file);
    const response = await fetch(
      `/api/author/promotion/offers/${encodeURIComponent(offer.id)}/materials/${encodeURIComponent(materialId)}/image`,
      { method: "POST", body: formData },
    );
    const payload = (await response.json()) as {
      offer?: QuickOfferAdminDto;
      error?: string;
    };

    if (!response.ok || !payload.offer) {
      setError(getQuickOfferUiErrorMessage(payload.error));
      return;
    }

    hydrateOffer(payload.offer);
  }

  async function deleteMaterial(materialId: string) {
    if (!offer) {
      return;
    }

    const response = await fetch(
      `/api/author/promotion/offers/${encodeURIComponent(offer.id)}/materials/${encodeURIComponent(materialId)}`,
      { method: "DELETE" },
    );
    const payload = (await response.json()) as {
      offer?: QuickOfferAdminDto;
      error?: string;
    };

    if (!response.ok || !payload.offer) {
      setError(getQuickOfferUiErrorMessage(payload.error));
      return;
    }

    hydrateOffer(payload.offer);
  }

  async function moveMaterial(materialId: string, direction: -1 | 1) {
    if (!offer) {
      return;
    }

    const ids = offer.materials.map((material) => material.id);
    const index = ids.indexOf(materialId);
    const next = index + direction;

    if (index < 0 || next < 0 || next >= ids.length) {
      return;
    }

    const reordered = [...ids];
    const [removed] = reordered.splice(index, 1);
    reordered.splice(next, 0, removed);

    const response = await fetch(
      `/api/author/promotion/offers/${encodeURIComponent(offer.id)}/materials/reorder`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ material_ids: reordered }),
      },
    );
    const payload = (await response.json()) as {
      offer?: QuickOfferAdminDto;
      error?: string;
    };

    if (!response.ok || !payload.offer) {
      setError(getQuickOfferUiErrorMessage(payload.error));
      return;
    }

    hydrateOffer(payload.offer);
  }

  async function publishOffer() {
    if (!offer) {
      return;
    }

    setPublishing(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/author/promotion/offers/${encodeURIComponent(offer.id)}/publish`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        offer?: QuickOfferAdminDto;
        error?: string;
      };

      if (!response.ok || !payload.offer) {
        throw new Error(payload.error ?? "publish_failed");
      }

      hydrateOffer(payload.offer);
      setSuccess("Оффер опубликован.");
    } catch (failure) {
      setError(
        getQuickOfferUiErrorMessage(
          failure instanceof Error ? failure.message : "publish_failed",
        ),
      );
    } finally {
      setPublishing(false);
    }
  }

  async function copyLink() {
    if (!offer) {
      return;
    }

    const ok = await copyTextToClipboard(
      `${window.location.origin}${buildQuickOfferPath(offer.slug)}`,
    );

    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  if (loading) {
    return <p className="text-sm text-[#7d70a2]">Загрузка формы…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-semibold">
            {isCreate ? "Новый быстрый оффер" : "Редактирование оффера"}
          </h2>
          {offer ? (
            <span
              className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${getQuickOfferStatusClassName(offer.status)}`}
            >
              {getQuickOfferStatusLabel(offer.status)}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]"
        >
          К списку
        </button>
      </div>

      {error ? (
        <p className="rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-[18px] border border-[#cde9d6] bg-[#f3fbf5] px-4 py-3 text-sm text-[#2f7a4d]">
          {success}
        </p>
      ) : null}

      <form
        className="space-y-4 rounded-[24px] border border-[#eadff8] bg-white p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void saveOffer();
        }}
      >
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#5f5484]">
            Продукт
          </span>
          <select
            value={practiceId}
            onChange={(event) => setPracticeId(event.target.value)}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
            required
            disabled={offer?.status === "published"}
          >
            <option value="">Выберите свой продукт</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.title} · {formatRubles(product.price)}
              </option>
            ))}
          </select>
          <span className="mt-2 block text-xs text-[#7d70a2]">
            {offer?.status === "published"
              ? "После публикации продукт сменить нельзя."
              : "Цена оплаты всегда берётся с продукта. Промо-цена ниже нужна только для витрины и серверного пересчёта, пока действует таймер."}
          </span>
        </label>

        {selectedProduct ? (
          <p className="text-sm text-[#5f5484]">
            Обычная цена продукта: {formatRubles(selectedProduct.price)}
          </p>
        ) : null}

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#5f5484]">
            Заголовок
          </span>
          <input
            value={title}
            maxLength={QUICK_OFFER_TITLE_MAX_LENGTH}
            onChange={(event) => handleTitleChange(event.target.value)}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
            required
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#5f5484]">
            Адрес страницы
          </span>
          <input
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(normalizeQuickOfferSlug(event.target.value));
            }}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
            required
          />
          <span className="mt-2 block break-all text-xs text-[#7d70a2]">
            {buildQuickOfferPath(slug || "slug")}
          </span>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#5f5484]">
            Короткое описание
          </span>
          <textarea
            value={description}
            maxLength={QUICK_OFFER_DESCRIPTION_MAX_LENGTH}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
            required
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#5f5484]">
            Промо-цена, ₽
          </span>
          <input
            type="number"
            min={1}
            step={1}
            value={promoPrice}
            onChange={(event) => setPromoPrice(event.target.value)}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
            required
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#5f5484]">
            Текст кнопки
          </span>
          <input
            value={ctaText}
            maxLength={QUICK_OFFER_CTA_MAX_LENGTH}
            onChange={(event) => setCtaText(event.target.value)}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
            required
          />
          <span className="mt-2 block text-xs text-[#7d70a2]">
            Можно использовать {"{price}"} — подставится актуальная цена.
          </span>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#5f5484]">
            Длительность таймера
          </span>
          <select
            value={timerSeconds}
            onChange={(event) => setTimerSeconds(Number(event.target.value))}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
          >
            {QUICK_OFFER_TIMER_PRESETS_SECONDS.map((value) => (
              <option key={value} value={value}>
                {timerLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Сохраняем…" : "Сохранить"}
        </button>
      </form>

      {offer ? (
        <section className="space-y-4 rounded-[24px] border border-[#eadff8] bg-white p-5">
          <h3 className="text-[18px] font-semibold">Обложка</h3>
          {offer.hero_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={offer.hero_image_url}
              alt=""
              className="aspect-square w-40 rounded-[20px] object-cover"
            />
          ) : (
            <p className="text-sm text-[#7d70a2]">Квадратная обложка ещё не загружена.</p>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void uploadHero(file).catch((failure) => {
                  setError(
                    getQuickOfferUiErrorMessage(
                      failure instanceof Error ? failure.message : "save_failed",
                    ),
                  );
                });
              }
            }}
          />
        </section>
      ) : null}

      {offer ? (
        <section className="space-y-4 rounded-[24px] border border-[#eadff8] bg-white p-5">
          <h3 className="text-[18px] font-semibold">Что внутри</h3>
          <p className="text-sm text-[#7d70a2]">
            Под картинкой только номер и формат, например «01 · PDF». Формат —
            максимум {QUICK_OFFER_FORMAT_LABEL_MAX_LENGTH} символов, одна
            строка.
          </p>

          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[140px] flex-1">
              <span className="mb-2 block text-sm font-medium text-[#5f5484]">
                Формат
              </span>
              <select
                value={newFormat}
                onChange={(event) => setNewFormat(event.target.value)}
                className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
              >
                {QUICK_OFFER_FORMAT_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
                <option value="custom">Свой</option>
              </select>
            </label>
            {newFormat === "custom" ? (
              <label className="min-w-[140px] flex-1">
                <span className="mb-2 block text-sm font-medium text-[#5f5484]">
                  Свой формат
                </span>
                <input
                  value={customFormat}
                  maxLength={QUICK_OFFER_FORMAT_LABEL_MAX_LENGTH}
                  onChange={(event) =>
                    setCustomFormat(normalizeFormatLabel(event.target.value))
                  }
                  className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
                />
              </label>
            ) : null}
            <button
              type="button"
              onClick={() => void addMaterial()}
              className="rounded-full border border-[#c6afe6] px-4 py-3 text-sm font-semibold text-[#7042c5]"
            >
              Добавить карточку
            </button>
          </div>

          <div className="space-y-3">
            {offer.materials.map((material, index) => (
              <article
                key={material.id}
                className="flex flex-wrap items-center gap-3 rounded-[20px] border border-[#eadff8] px-3 py-3"
              >
                <div className="h-20 w-16 overflow-hidden rounded-[12px] bg-[#f4ecfb]">
                  {material.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={material.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {formatMaterialCaption(material.sort_order, material.format_label)}
                  </p>
                  <input
                    defaultValue={material.format_label}
                    maxLength={QUICK_OFFER_FORMAT_LABEL_MAX_LENGTH}
                    onBlur={(event) => {
                      void updateMaterialFormat(
                        material.id,
                        event.target.value,
                      );
                    }}
                    className="mt-2 w-24 rounded-[12px] border border-[#e4d7f4] px-2 py-1 text-sm outline-none focus:border-[#9a74d8]"
                  />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="mt-2 block text-xs"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void uploadMaterialImage(material.id, file);
                      }
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => void moveMaterial(material.id, -1)}
                    className="rounded-full border border-[#ddcfef] px-3 py-1.5 text-xs font-semibold text-[#7042c5] disabled:opacity-40"
                  >
                    Вверх
                  </button>
                  <button
                    type="button"
                    disabled={index === offer.materials.length - 1}
                    onClick={() => void moveMaterial(material.id, 1)}
                    className="rounded-full border border-[#ddcfef] px-3 py-1.5 text-xs font-semibold text-[#7042c5] disabled:opacity-40"
                  >
                    Вниз
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteMaterial(material.id)}
                    className="rounded-full border border-[#f2c7c7] px-3 py-1.5 text-xs font-semibold text-[#9b3d3d]"
                  >
                    Удалить
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {offer ? (
        <div className="flex flex-wrap gap-2">
          {offer.status !== "published" ? (
            <button
              type="button"
              disabled={publishing}
              onClick={() => void publishOffer()}
              className="rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {publishing ? "Публикуем…" : "Опубликовать"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void copyLink()}
              className="rounded-full border border-[#c6afe6] px-5 py-3 text-sm font-semibold text-[#7042c5]"
            >
              {copied ? "Ссылка скопирована" : "Скопировать ссылку"}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
