"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import {
  buildCampaignKeyFromName,
  normalizeCampaignKey,
} from "@/lib/promotion/campaign-key";
import {
  PROMOTION_CHANNEL_TYPE_OPTIONS,
  parseChannelTypeFormState,
} from "@/lib/promotion/channel-types";
import { PROMOTION_CHANNEL_PRESETS } from "@/lib/promotion/channels";
import {
  buildUtmSourceFromLabel,
  resolveCustomChannelForm,
  validateCustomChannelForm,
} from "@/lib/promotion/custom-channel";
import { normalizeUtmValue, resolveCustomUtmMedium } from "@/lib/promotion/utm-normalize";
import {
  getPromotionPeriodLabel,
  parsePromotionPeriod,
} from "@/lib/promotion/dates";
import { buildPromotionLink } from "@/lib/promotion/links";
import {
  aggregateAuthorSummaryTotals,
} from "@/lib/promotion/stats";
import type {
  PromotionCampaignSummaryRow,
  PromotionCampaignWithProduct,
  PromotionPeriodKey,
} from "@/lib/promotion/types";
import type { AuthorProductListItem, AuthorWorkspace } from "@/lib/author-products/types";
import { copyTextToClipboard } from "@/lib/playlists/public-url";

type AuthorPromotionClientProps = {
  authors: AuthorWorkspace[];
};

type CampaignStatsPayload = {
  metrics: {
    uniqueViews: number;
    uniquePlayStarts: number;
    uniqueProgress25: number;
    uniqueProgress50: number;
    uniqueProgress75: number;
    uniqueCompleted: number;
    uniqueSignupPromptShown: number;
    uniqueSignupClicked: number;
    uniqueRegistrations: number;
    uniqueSaves: number;
    uniqueGiftsOpened: number;
  };
  conversions: {
    viewToPlay: number;
    playTo25: number;
    playToComplete: number;
    viewToSignupClick: number;
    viewToRegistration: number;
    registrationToSave: number;
  };
  channels: Array<{
    utm_source: string;
    utm_medium: string;
    utm_content: string;
    uniqueViews: number;
    uniquePlayStarts: number;
    uniqueProgress25: number;
    uniqueCompleted: number;
    uniqueSignupClicked: number;
    uniqueRegistrations: number;
  }>;
};

function loadCustomChannelFromStats(channel: {
  utm_source: string;
  utm_medium: string;
  utm_content: string;
}): {
  customLabel: string;
  customSource: string;
  customSourceManual: boolean;
  channelType: string;
  customTypeLabel: string;
  customTypeLabelSaved: string;
} {
  const parsedType = parseChannelTypeFormState(channel.utm_medium);

  return {
    customLabel: getSourceLabel(channel.utm_source),
    customSource: channel.utm_source,
    customSourceManual: true,
    channelType: parsedType.channelType,
    customTypeLabel: parsedType.customTypeLabel,
    customTypeLabelSaved: parsedType.customTypeLabel,
  };
}

function handleCustomChannelTypeChange(
  nextType: string,
  currentType: string,
  customTypeLabel: string,
  customTypeLabelSaved: string,
): {
  channelType: string;
  customTypeLabel: string;
  customTypeLabelSaved: string;
} {
  if (currentType === "other" && nextType !== "other") {
    return {
      channelType: nextType,
      customTypeLabel: "",
      customTypeLabelSaved: customTypeLabel,
    };
  }

  if (nextType === "other") {
    return {
      channelType: nextType,
      customTypeLabel: customTypeLabelSaved,
      customTypeLabelSaved,
    };
  }

  return {
    channelType: nextType,
    customTypeLabel: "",
    customTypeLabelSaved,
  };
}

function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    telegram: "Telegram",
    max: "MAX",
    vk: "VK",
    direct: "Прямая ссылка",
  };

  return labels[source.toLowerCase()] ?? source;
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-[20px] border border-[#eadff8] bg-white px-4 py-3">
      <p className="text-xs text-[#7d70a2]">{label}</p>
      <p className="mt-1 text-[22px] font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-[#9a8fbf]">{hint}</p> : null}
    </div>
  );
}

function CopyLinkRow({
  label,
  url,
}: {
  label: string;
  url: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyTextToClipboard(url);

    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <div className="rounded-[18px] border border-[#eadff8] bg-[#fbf8ff] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{label}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="rounded-full bg-[#7042c5] px-3 py-1.5 text-xs font-semibold text-white"
          >
            {copied ? "Ссылка скопирована" : "Скопировать"}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-[#c6afe6] px-3 py-1.5 text-xs font-semibold text-[#7042c5]"
          >
            Открыть
          </a>
        </div>
      </div>
      <p className="mt-3 break-all text-xs text-[#5f5484]">{url}</p>
    </div>
  );
}

export default function AuthorPromotionClient({
  authors,
}: AuthorPromotionClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [campaigns, setCampaigns] = useState<PromotionCampaignWithProduct[]>([]);
  const [summaryRows, setSummaryRows] = useState<PromotionCampaignSummaryRow[]>([]);
  const [products, setProducts] = useState<AuthorProductListItem[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [campaignStats, setCampaignStats] = useState<CampaignStatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [campaignKey, setCampaignKey] = useState("");
  const [practiceId, setPracticeId] = useState("");
  const [customSource, setCustomSource] = useState("");
  const [customSourceManual, setCustomSourceManual] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [channelType, setChannelType] = useState("social");
  const [customTypeLabel, setCustomTypeLabel] = useState("");
  const [customTypeLabelSaved, setCustomTypeLabelSaved] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  const customChannelFormInput = useMemo(
    () => ({
      label: customLabel,
      utmSource: customSource,
      channelType,
      customTypeLabel,
    }),
    [customLabel, customSource, channelType, customTypeLabel],
  );

  const customChannelErrors = useMemo(
    () => validateCustomChannelForm(customChannelFormInput),
    [customChannelFormInput],
  );

  const resolvedCustomChannel = useMemo(
    () => resolveCustomChannelForm(customChannelFormInput),
    [customChannelFormInput],
  );

  const resolvedCustomTypeUtm = useMemo(() => {
    if (channelType !== "other" || !customTypeLabel.trim()) {
      return "";
    }

    return resolveCustomUtmMedium(customTypeLabel);
  }, [channelType, customTypeLabel]);

  const period = parsePromotionPeriod(searchParams.get("period"));
  const selectedAuthor = useMemo(() => {
    const slug = searchParams.get("author");
    return authors.find((author) => author.slug === slug) ?? authors[0] ?? null;
  }, [authors, searchParams]);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId],
  );

  const publishedProducts = useMemo(
    () => products.filter((product) => product.status === "published"),
    [products],
  );

  const summaryTotals = useMemo(
    () => aggregateAuthorSummaryTotals(summaryRows),
    [summaryRows],
  );

  useEffect(() => {
    if (!selectedAuthor) {
      return;
    }

    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const [campaignsResponse, summaryResponse, productsResponse] =
          await Promise.all([
            fetch(
              `/api/author/promotion/campaigns?author_id=${encodeURIComponent(selectedAuthor.id)}`,
              { cache: "no-store" },
            ),
            fetch(
              `/api/author/promotion/summary?author_id=${encodeURIComponent(selectedAuthor.id)}&period=${encodeURIComponent(period)}`,
              { cache: "no-store" },
            ),
            fetch(
              `/api/author/promotion/products?author_id=${encodeURIComponent(selectedAuthor.id)}`,
              { cache: "no-store" },
            ),
          ]);

        const campaignsPayload = (await campaignsResponse.json()) as {
          campaigns?: PromotionCampaignWithProduct[];
          error?: string;
        };
        const summaryPayload = (await summaryResponse.json()) as {
          campaigns?: PromotionCampaignSummaryRow[];
          error?: string;
        };
        const productsPayload = (await productsResponse.json()) as {
          products?: AuthorProductListItem[];
          error?: string;
        };

        if (
          !campaignsResponse.ok ||
          !summaryResponse.ok ||
          !productsResponse.ok
        ) {
          throw new Error(
            campaignsPayload.error ??
              summaryPayload.error ??
              productsPayload.error ??
              "load_failed",
          );
        }

        if (cancelled) {
          return;
        }

        const nextCampaigns = campaignsPayload.campaigns ?? [];
        setCampaigns(nextCampaigns);
        setSummaryRows(summaryPayload.campaigns ?? []);
        setProducts(productsPayload.products ?? []);
        setSelectedCampaignId((current) => {
          if (current && nextCampaigns.some((campaign) => campaign.id === current)) {
            return current;
          }

          return nextCampaigns[0]?.id ?? null;
        });
      } catch {
        if (!cancelled) {
          setError("Не удалось загрузить данные продвижения.");
          setCampaigns([]);
          setSummaryRows([]);
          setProducts([]);
          setSelectedCampaignId(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [period, refreshToken, selectedAuthor]);

  useEffect(() => {
    const campaignId = selectedCampaignId;

    if (!campaignId) {
      return;
    }

    const statsCampaignId: string = campaignId;

    let cancelled = false;

    async function loadStats() {
      setStatsLoading(true);

      try {
        const response = await fetch(
          `/api/author/promotion/campaigns/${encodeURIComponent(statsCampaignId)}?period=${encodeURIComponent(period)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as CampaignStatsPayload & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "stats_failed");
        }

        if (!cancelled) {
          setCampaignStats(payload);
        }
      } catch {
        if (!cancelled) {
          setCampaignStats(null);
        }
      } finally {
        if (!cancelled) {
          setStatsLoading(false);
        }
      }
    }

    void loadStats();

    return () => {
      cancelled = true;
    };
  }, [period, selectedCampaignId]);

  function handleAuthorChange(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("author", slug);
    router.replace(`/author-dashboard/promotion?${params.toString()}`);
  }

  function handlePeriodChange(nextPeriod: PromotionPeriodKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", nextPeriod);
    router.replace(`/author-dashboard/promotion?${params.toString()}`);
  }

  async function handleCreateCampaign(event: React.FormEvent) {
    event.preventDefault();

    if (!selectedAuthor) {
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const response = await fetch("/api/author/promotion/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author_id: selectedAuthor.id,
          practice_id: practiceId,
          name: campaignName,
          campaign_key: campaignKey || buildCampaignKeyFromName(campaignName),
        }),
      });

      const payload = (await response.json()) as {
        campaign?: PromotionCampaignWithProduct;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "create_failed");
      }

      setCreateOpen(false);
      setCampaignName("");
      setCampaignKey("");
      setPracticeId("");
      setSelectedCampaignId(payload.campaign?.id ?? null);
      setRefreshToken((value) => value + 1);
    } catch (createFailure) {
      const code =
        createFailure instanceof Error ? createFailure.message : "create_failed";
      const messages: Record<string, string> = {
        campaign_key_taken: "Такой идентификатор кампании уже используется.",
        practice_not_published: "Можно выбрать только опубликованный продукт.",
        forbidden: "Нет доступа к выбранному продукту.",
        campaign_name_required: "Укажите название кампании.",
        campaign_key_invalid: "Идентификатор кампании указан некорректно.",
      };
      setCreateError(messages[code] ?? "Не удалось создать кампанию.");
    } finally {
      setCreating(false);
    }
  }

  if (!selectedAuthor) {
    return null;
  }

  const campaignHasTraffic =
    !!selectedCampaign &&
    summaryRows.some(
      (row) =>
        row.campaign_id === selectedCampaign.id &&
        (row.unique_views > 0 || row.total_events > 0),
    );

  return (
    <div className="space-y-8">
      <AuthorDashboardNav authorSlug={selectedAuthor.slug} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="block flex-1">
          <span className="mb-2 block text-sm font-medium text-[#5f5484]">
            Авторское пространство
          </span>
          <select
            value={selectedAuthor.slug}
            onChange={(event) => handleAuthorChange(event.target.value)}
            className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 text-[15px] outline-none focus:border-[#9a74d8]"
          >
            {authors.map((author) => (
              <option key={author.id} value={author.slug}>
                {author.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block sm:w-48">
          <span className="mb-2 block text-sm font-medium text-[#5f5484]">
            Период
          </span>
          <select
            value={period}
            onChange={(event) =>
              handlePeriodChange(parsePromotionPeriod(event.target.value))
            }
            className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 text-[15px] outline-none focus:border-[#9a74d8]"
          >
            <option value="7d">7 дней</option>
            <option value="30d">30 дней</option>
            <option value="90d">90 дней</option>
            <option value="all">Всё время</option>
          </select>
        </label>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[21px] font-semibold">Статистика</h2>
            <p className="mt-1 text-sm text-[#7d70a2]">
              Сводка за {getPromotionPeriodLabel(period).toLowerCase()}. Уникальные
              переходы и запуски считаются по сессиям до регистрации и по
              пользователям после неё.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard label="Кампаний" value={summaryTotals.campaignCount} />
          <MetricCard
            label="Уникальные переходы"
            value={summaryTotals.uniqueViews}
          />
          <MetricCard label="Запуски" value={summaryTotals.uniquePlayStarts} />
          <MetricCard label="Регистрации" value={summaryTotals.uniqueRegistrations} />
          <MetricCard label="Сохранения" value={summaryTotals.uniqueSaves} />
          <MetricCard
            label="Конверсия переход → регистрация"
            value={`${summaryTotals.averageViewToRegistration}%`}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[21px] font-semibold">Кампании</h2>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
          >
            Создать кампанию
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-[#7d70a2]">Загрузка кампаний…</p>
        ) : null}

        {error ? (
          <p className="rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
            {error}
          </p>
        ) : null}

        {!loading && !error && campaigns.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[#d9c9ef] bg-[#fbf8ff] px-5 py-8 text-center">
            <p className="text-[18px] font-semibold">Создайте первую кампанию</p>
            <p className="mt-3 text-sm text-[#7d70a2]">
              Выберите аудиопродукт, получите отдельные ссылки для Telegram, MAX
              и других каналов и следите за результатами продвижения.
            </p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-6 rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
            >
              Создать кампанию
            </button>
          </div>
        ) : null}

        {!loading && campaigns.length > 0 ? (
          <div className="space-y-3">
            {campaigns.map((campaign) => {
              const summary = summaryRows.find(
                (row) => row.campaign_id === campaign.id,
              );
              const isSelected = campaign.id === selectedCampaignId;

              return (
                <button
                  key={campaign.id}
                  type="button"
                  onClick={() => setSelectedCampaignId(campaign.id)}
                  className={`w-full rounded-[22px] border px-4 py-4 text-left transition-colors ${
                    isSelected
                      ? "border-[#9a74d8] bg-[#f4ecfb]"
                      : "border-[#eadff8] bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[17px] font-semibold">{campaign.name}</p>
                      <p className="mt-1 text-sm text-[#7d70a2]">
                        {campaign.practice_title} · {campaign.campaign_key}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#efe6fb] px-2.5 py-1 text-[11px] font-medium text-[#7042c5]">
                      {campaign.status === "archived" ? "Архив" : "Активна"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-[#5f5484]">
                    <span>Переходы: {summary?.unique_views ?? 0}</span>
                    <span>Запуски: {summary?.unique_play_starts ?? 0}</span>
                    <span>Регистрации: {summary?.unique_registrations ?? 0}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      {createOpen ? (
        <section className="rounded-[24px] border border-[#eadff8] bg-white p-5">
          <h2 className="text-[21px] font-semibold">Создать кампанию</h2>
          <form className="mt-4 space-y-4" onSubmit={(event) => void handleCreateCampaign(event)}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#5f5484]">
                Название кампании
              </span>
              <input
                value={campaignName}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setCampaignName(nextName);
                  if (!campaignKey.trim()) {
                    setCampaignKey(buildCampaignKeyFromName(nextName));
                  }
                }}
                className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
                placeholder="Женские деньги — запуск"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#5f5484]">
                Аудиопродукт
              </span>
              <select
                value={practiceId}
                onChange={(event) => setPracticeId(event.target.value)}
                className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8]"
              >
                <option value="">Выберите опубликованный продукт</option>
                {publishedProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#5f5484]">
                Идентификатор кампании
              </span>
              <input
                value={campaignKey}
                onChange={(event) =>
                  setCampaignKey(normalizeCampaignKey(event.target.value))
                }
                className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
                placeholder="zhenskie_dengi_launch"
              />
            </label>

            {createError ? (
              <p className="text-sm text-[#9b3d3d]">{createError}</p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={creating}
                className="rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {creating ? "Создание…" : "Создать"}
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-full border border-[#c6afe6] px-5 py-3 text-sm font-semibold text-[#7042c5]"
              >
                Отмена
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {selectedCampaign ? (
        <>
          <section className="space-y-4">
            <div>
              <h2 className="text-[21px] font-semibold">Ссылки для публикации</h2>
              <p className="mt-2 text-sm text-[#7d70a2]">
                Используйте отдельную ссылку для каждого канала. Так вы увидите,
                откуда пришли слушатели и регистрации.
              </p>
              {selectedCampaign.practice_status !== "published" ? (
                <p className="mt-2 rounded-[18px] border border-[#f2dfc7] bg-[#fff9f0] px-4 py-3 text-sm text-[#8a5a16]">
                  Продукт снят с публикации. Ссылки остаются рабочими, но новые
                  кампании для него создать нельзя.
                </p>
              ) : null}
              {!campaignHasTraffic ? (
                <p className="mt-2 rounded-[18px] border border-[#d9c9ef] bg-[#fbf8ff] px-4 py-3 text-sm text-[#7d70a2]">
                  Ссылки готовы. Опубликуйте их в выбранных каналах. Первые
                  данные появятся после переходов и прослушиваний.
                </p>
              ) : null}
            </div>

            <div className="space-y-3">
              {PROMOTION_CHANNEL_PRESETS.map((preset) => {
                const url = buildPromotionLink({
                  authorSlug: selectedCampaign.author_slug,
                  practiceSlug: selectedCampaign.practice_slug,
                  campaignKey: selectedCampaign.campaign_key,
                  utmSource: preset.utm_source,
                  utmMedium: preset.utm_medium,
                });

                return (
                  <CopyLinkRow key={preset.id} label={preset.label} url={url} />
                );
              })}

              {resolvedCustomChannel ? (
                <CopyLinkRow
                  label={resolvedCustomChannel.label}
                  url={buildPromotionLink({
                    authorSlug: selectedCampaign.author_slug,
                    practiceSlug: selectedCampaign.practice_slug,
                    campaignKey: selectedCampaign.campaign_key,
                    utmSource: resolvedCustomChannel.utmSource,
                    utmMedium: resolvedCustomChannel.utmMedium,
                  })}
                />
              ) : null}
            </div>

            <div className="rounded-[20px] border border-[#eadff8] bg-white p-4">
              <p className="text-sm font-semibold">Другой канал</p>
              <p className="mt-1 text-xs text-[#7d70a2]">
                Настройте собственный канал или загрузите параметры из таблицы
                статистики ниже.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-2 block text-sm font-medium text-[#5f5484]">
                    Название канала
                  </span>
                  <input
                    value={customLabel}
                    onChange={(event) => {
                      const nextLabel = event.target.value;
                      setCustomLabel(nextLabel);
                      setCustomSource(
                        buildUtmSourceFromLabel(
                          nextLabel,
                          customSource,
                          customSourceManual,
                        ),
                      );
                    }}
                    placeholder="BotHelp"
                    className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
                  />
                  {customChannelErrors.label ? (
                    <p className="mt-1 text-xs text-[#9b3d3d]">
                      {customChannelErrors.label}
                    </p>
                  ) : null}
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#5f5484]">
                    UTM-источник
                  </span>
                  <input
                    value={customSource}
                    onChange={(event) => {
                      setCustomSourceManual(true);
                      setCustomSource(event.target.value);
                    }}
                    placeholder="bothelp"
                    className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
                  />
                  <p className="mt-1 text-xs text-[#7d70a2]">
                    Будет использовано в ссылке как utm_source
                  </p>
                  {customSourceManual ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomSourceManual(false);
                        setCustomSource(normalizeUtmValue(customLabel));
                      }}
                      className="mt-1 text-xs font-medium text-[#7042c5] underline-offset-2 hover:underline"
                    >
                      Сформировать из названия
                    </button>
                  ) : null}
                  {customChannelErrors.utmSource ? (
                    <p className="mt-1 text-xs text-[#9b3d3d]">
                      {customChannelErrors.utmSource}
                    </p>
                  ) : null}
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[#5f5484]">
                    Тип канала
                  </span>
                  <select
                    value={channelType}
                    onChange={(event) => {
                      const next = handleCustomChannelTypeChange(
                        event.target.value,
                        channelType,
                        customTypeLabel,
                        customTypeLabelSaved,
                      );
                      setChannelType(next.channelType);
                      setCustomTypeLabel(next.customTypeLabel);
                      setCustomTypeLabelSaved(next.customTypeLabelSaved);
                    }}
                    className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8]"
                  >
                    {PROMOTION_CHANNEL_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-[#7d70a2]">
                    Будет использовано в ссылке как utm_medium
                  </p>
                  {customChannelErrors.channelType ? (
                    <p className="mt-1 text-xs text-[#9b3d3d]">
                      {customChannelErrors.channelType}
                    </p>
                  ) : null}
                </label>

                {channelType === "other" ? (
                  <label className="block sm:col-span-2">
                    <span className="mb-2 block text-sm font-medium text-[#5f5484]">
                      Укажите свой тип канала
                    </span>
                    <input
                      value={customTypeLabel}
                      onChange={(event) => setCustomTypeLabel(event.target.value)}
                      placeholder="Например: автоворонка, подкаст, база клиентов"
                      className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
                    />
                    {resolvedCustomTypeUtm ? (
                      <p className="mt-1 text-xs text-[#7d70a2]">
                        Значение UTM: {resolvedCustomTypeUtm}
                      </p>
                    ) : null}
                    {customChannelErrors.customTypeLabel ? (
                      <p className="mt-1 text-xs text-[#9b3d3d]">
                        {customChannelErrors.customTypeLabel}
                      </p>
                    ) : null}
                  </label>
                ) : null}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-[21px] font-semibold">Статистика кампании</h2>

            {statsLoading ? (
              <p className="text-sm text-[#7d70a2]">Загрузка статистики…</p>
            ) : null}

            {campaignStats ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <MetricCard
                    label="Уникальные переходы"
                    value={campaignStats.metrics.uniqueViews}
                  />
                  <MetricCard
                    label="Уникальные запуски"
                    value={campaignStats.metrics.uniquePlayStarts}
                  />
                  <MetricCard
                    label="25%"
                    value={campaignStats.metrics.uniqueProgress25}
                  />
                  <MetricCard
                    label="50%"
                    value={campaignStats.metrics.uniqueProgress50}
                  />
                  <MetricCard
                    label="75%"
                    value={campaignStats.metrics.uniqueProgress75}
                  />
                  <MetricCard
                    label="Дослушали"
                    value={campaignStats.metrics.uniqueCompleted}
                  />
                  <MetricCard
                    label="Предложение регистрации"
                    value={campaignStats.metrics.uniqueSignupPromptShown}
                  />
                  <MetricCard
                    label="Клик регистрации"
                    value={campaignStats.metrics.uniqueSignupClicked}
                  />
                  <MetricCard
                    label="Регистрации"
                    value={campaignStats.metrics.uniqueRegistrations}
                  />
                  <MetricCard
                    label="Сохранили практику"
                    value={campaignStats.metrics.uniqueSaves}
                  />
                  <MetricCard
                    label="Открыли подарки"
                    value={campaignStats.metrics.uniqueGiftsOpened}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <MetricCard
                    label="Переход → запуск"
                    value={`${campaignStats.conversions.viewToPlay}%`}
                  />
                  <MetricCard
                    label="Запуск → 25%"
                    value={`${campaignStats.conversions.playTo25}%`}
                  />
                  <MetricCard
                    label="Запуск → завершение"
                    value={`${campaignStats.conversions.playToComplete}%`}
                  />
                  <MetricCard
                    label="Переход → клик регистрации"
                    value={`${campaignStats.conversions.viewToSignupClick}%`}
                  />
                  <MetricCard
                    label="Переход → регистрация"
                    value={`${campaignStats.conversions.viewToRegistration}%`}
                  />
                  <MetricCard
                    label="Регистрация → сохранение"
                    value={`${campaignStats.conversions.registrationToSave}%`}
                  />
                </div>

                <div className="overflow-x-auto rounded-[20px] border border-[#eadff8] bg-white">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-[#eadff8] bg-[#fbf8ff] text-[#7d70a2]">
                      <tr>
                        <th className="px-4 py-3 font-medium">Канал</th>
                        <th className="px-4 py-3 font-medium">utm_content</th>
                        <th className="px-4 py-3 font-medium text-right">Переходы</th>
                        <th className="px-4 py-3 font-medium text-right">Запуски</th>
                        <th className="px-4 py-3 font-medium text-right">25%</th>
                        <th className="px-4 py-3 font-medium text-right">Завершения</th>
                        <th className="px-4 py-3 font-medium text-right">Клики рег.</th>
                        <th className="px-4 py-3 font-medium text-right">Регистрации</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaignStats.channels.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-6 text-[#7d70a2]">
                            По этой кампании пока нет promo-событий с UTM-метками.
                          </td>
                        </tr>
                      ) : (
                        campaignStats.channels.map((channel) => (
                          <tr
                            key={`${channel.utm_source}-${channel.utm_medium}-${channel.utm_content}`}
                            className="cursor-pointer border-b border-[#f1e9fb] last:border-b-0 hover:bg-[#fbf8ff]"
                            onClick={() => {
                              const loaded = loadCustomChannelFromStats(channel);
                              setCustomLabel(loaded.customLabel);
                              setCustomSource(loaded.customSource);
                              setCustomSourceManual(loaded.customSourceManual);
                              setChannelType(loaded.channelType);
                              setCustomTypeLabel(loaded.customTypeLabel);
                              setCustomTypeLabelSaved(loaded.customTypeLabelSaved);
                            }}
                            title="Загрузить параметры канала в форму «Другой канал»"
                          >
                            <td className="px-4 py-3">
                              {getSourceLabel(channel.utm_source)}
                            </td>
                            <td className="px-4 py-3">{channel.utm_content}</td>
                            <td className="px-4 py-3 text-right">{channel.uniqueViews}</td>
                            <td className="px-4 py-3 text-right">
                              {channel.uniquePlayStarts}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {channel.uniqueProgress25}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {channel.uniqueCompleted}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {channel.uniqueSignupClicked}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {channel.uniqueRegistrations}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </section>
        </>
      ) : null}

      <div>
        <Link href="/profile" className="text-sm font-medium text-[#7042c5]">
          Вернуться в пользовательскую часть платформы
        </Link>
      </div>
    </div>
  );
}
