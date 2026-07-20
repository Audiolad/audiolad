"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  PROMOTION_CHANNEL_TYPE_OPTIONS,
  parseChannelTypeFormState,
} from "@/lib/promotion/channel-types";
import { PROMOTION_SYSTEM_CHANNEL_PRESETS } from "@/lib/promotion/channels";
import {
  buildUtmSourceFromLabel,
  resolveCustomChannelForm,
  validateCustomChannelForm,
} from "@/lib/promotion/custom-channel";
import { buildPromotionLink } from "@/lib/promotion/links";
import type {
  PromotionCampaignChannel,
  PromotionCampaignWithProduct,
} from "@/lib/promotion/types";
import { normalizeUtmValue, resolveCustomUtmMedium } from "@/lib/promotion/utm-normalize";
import { copyTextToClipboard } from "@/lib/playlists/public-url";

export type PromotionChannelFormSeed = {
  token: number;
  label: string;
  utmSource: string;
  sourceManual: boolean;
  channelType: string;
  customTypeLabel: string;
};

type PromotionCampaignLinksSectionProps = {
  campaign: PromotionCampaignWithProduct;
  onToast: (message: string) => void;
  formSeed?: PromotionChannelFormSeed | null;
};

function getChannelErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    channel_label_required: "Укажите название канала.",
    channel_label_too_long: "Название канала слишком длинное.",
    channel_source_invalid:
      "UTM-источник может содержать только латинские буквы, цифры и дефисы.",
    channel_medium_invalid:
      "Тип канала может содержать только латинские буквы, цифры и дефисы.",
    channel_utm_invalid: "Проверьте UTM-источник и тип канала.",
    channel_utm_duplicate:
      "В этой кампании уже есть ссылка с таким UTM-источником и типом канала.",
    invalid_request: "Проверьте заполнение формы.",
    not_found: "Ссылка не найдена.",
    forbidden: "Нет доступа к этой кампании.",
    internal_error: "Не удалось выполнить действие.",
  };

  return messages[code] ?? "Не удалось выполнить действие.";
}

function buildCampaignLinkForChannel(
  campaign: PromotionCampaignWithProduct,
  utmSource: string,
  utmMedium: string,
): string {
  return buildPromotionLink({
    authorSlug: campaign.author_slug,
    practiceSlug: campaign.practice_slug,
    campaignKey: campaign.campaign_key,
    utmSource,
    utmMedium,
  });
}

function PromotionLinkCard({
  label,
  url,
  onEdit,
  onDelete,
}: {
  label: string;
  url: string;
  onEdit?: () => void;
  onDelete?: () => void;
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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold">{label}</p>
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
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-full border border-[#c6afe6] px-3 py-1.5 text-xs font-semibold text-[#7042c5]"
            >
              Изменить
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-full border border-[#efb8c4] px-3 py-1.5 text-xs font-semibold text-[#b34f63]"
            >
              Удалить
            </button>
          ) : null}
        </div>
      </div>
      <p className="mt-3 break-all text-xs text-[#5f5484]">{url}</p>
    </div>
  );
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

export default function PromotionCampaignLinksSection({
  campaign,
  onToast,
  formSeed,
}: PromotionCampaignLinksSectionProps) {
  const [channels, setChannels] = useState<PromotionCampaignChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [channelsRefreshError, setChannelsRefreshError] = useState<string | null>(
    null,
  );
  const [channelsReloadNonce, setChannelsReloadNonce] = useState(0);
  const [channelFormError, setChannelFormError] = useState<string | null>(null);
  const [channelSaving, setChannelSaving] = useState(false);
  const [channelDeleting, setChannelDeleting] = useState(false);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [pendingDeleteChannel, setPendingDeleteChannel] =
    useState<PromotionCampaignChannel | null>(null);
  const [deleteChannelError, setDeleteChannelError] = useState<string | null>(null);

  const [customLabel, setCustomLabel] = useState("");
  const [customSource, setCustomSource] = useState("");
  const [customSourceManual, setCustomSourceManual] = useState(false);
  const [channelType, setChannelType] = useState("social");
  const [customTypeLabel, setCustomTypeLabel] = useState("");
  const [customTypeLabelSaved, setCustomTypeLabelSaved] = useState("");

  const channelsRequestToken = useRef(0);
  const previousCampaignIdRef = useRef(campaign.id);
  const [appliedFormSeedToken, setAppliedFormSeedToken] = useState<number | null>(null);

  if (formSeed && formSeed.token !== appliedFormSeedToken) {
    setAppliedFormSeedToken(formSeed.token);
    setCustomLabel(formSeed.label);
    setCustomSource(formSeed.utmSource);
    setCustomSourceManual(formSeed.sourceManual);
    setChannelType(formSeed.channelType);
    setCustomTypeLabel(formSeed.customTypeLabel);
    setCustomTypeLabelSaved(formSeed.customTypeLabel);
    setEditingChannelId(null);
    setChannelFormError(null);
  }

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

  const isEditing = editingChannelId !== null;
  const formComplete = resolvedCustomChannel !== null;

  function resetChannelForm() {
    setCustomLabel("");
    setCustomSource("");
    setCustomSourceManual(false);
    setChannelType("social");
    setCustomTypeLabel("");
    setCustomTypeLabelSaved("");
    setEditingChannelId(null);
    setChannelFormError(null);
  }

  function loadChannelIntoForm(channel: PromotionCampaignChannel) {
    const parsedType = parseChannelTypeFormState(channel.utm_medium);
    setCustomLabel(channel.label);
    setCustomSource(channel.utm_source);
    setCustomSourceManual(true);
    setChannelType(parsedType.channelType);
    setCustomTypeLabel(parsedType.customTypeLabel);
    setCustomTypeLabelSaved(parsedType.customTypeLabel);
    setEditingChannelId(channel.id);
    setChannelFormError(null);
  }

  function handleRetryChannelsLoad() {
    if (channelsLoading) {
      return;
    }

    setChannelsReloadNonce((value) => value + 1);
  }

  useEffect(() => {
    const requestToken = ++channelsRequestToken.current;
    const campaignId = campaign.id;
    const campaignChanged = previousCampaignIdRef.current !== campaignId;
    previousCampaignIdRef.current = campaignId;

    if (campaignChanged) {
      setChannels([]);
      setChannelsError(null);
      setChannelsRefreshError(null);
    }

    async function loadChannels() {
      setChannelsLoading(true);

      if (campaignChanged) {
        setChannelsError(null);
        setChannelsRefreshError(null);
      }

      try {
        const response = await fetch(
          `/api/author/promotion/campaigns/${encodeURIComponent(campaignId)}/channels`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          channels?: PromotionCampaignChannel[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "load_failed");
        }

        if (channelsRequestToken.current !== requestToken) {
          return;
        }

        setChannels(payload.channels ?? []);
        setChannelsError(null);
        setChannelsRefreshError(null);
      } catch {
        if (channelsRequestToken.current !== requestToken) {
          return;
        }

        setChannels((current) => {
          if (current.length === 0) {
            setChannelsError("Не удалось загрузить дополнительные ссылки.");
            setChannelsRefreshError(null);
          } else {
            setChannelsRefreshError("Не удалось обновить список дополнительных ссылок.");
          }

          return current;
        });
      } finally {
        if (channelsRequestToken.current === requestToken) {
          setChannelsLoading(false);
        }
      }
    }

    void loadChannels();
  }, [campaign.id, channelsReloadNonce]);

  async function handleSubmitChannel(event: React.FormEvent) {
    event.preventDefault();

    if (!resolvedCustomChannel || channelSaving) {
      return;
    }

    setChannelSaving(true);
    setChannelFormError(null);

    const campaignId = campaign.id;
    const url = isEditing
      ? `/api/author/promotion/campaigns/${encodeURIComponent(campaignId)}/channels/${encodeURIComponent(editingChannelId!)}`
      : `/api/author/promotion/campaigns/${encodeURIComponent(campaignId)}/channels`;

    try {
      const response = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: resolvedCustomChannel.label,
          utm_source: resolvedCustomChannel.utmSource,
          channel_type: channelType,
          custom_type_label: customTypeLabel,
        }),
      });

      const payload = (await response.json()) as {
        channel?: PromotionCampaignChannel;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "save_failed");
      }

      if (payload.channel) {
        setChannels((current) => {
          if (isEditing) {
            return current.map((item) =>
              item.id === payload.channel!.id ? payload.channel! : item,
            );
          }

          return [...current, payload.channel!];
        });
      }

      resetChannelForm();
      onToast(isEditing ? "Канал обновлён." : "Ссылка добавлена.");
    } catch (saveFailure) {
      const code =
        saveFailure instanceof Error ? saveFailure.message : "save_failed";
      setChannelFormError(getChannelErrorMessage(code));
    } finally {
      setChannelSaving(false);
    }
  }

  async function handleConfirmDeleteChannel() {
    if (!pendingDeleteChannel || channelDeleting) {
      return;
    }

    setChannelDeleting(true);
    setDeleteChannelError(null);

    try {
      const response = await fetch(
        `/api/author/promotion/campaigns/${encodeURIComponent(campaign.id)}/channels/${encodeURIComponent(pendingDeleteChannel.id)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "delete_failed");
      }

      const deletedId = pendingDeleteChannel.id;
      setPendingDeleteChannel(null);
      setChannels((current) => current.filter((item) => item.id !== deletedId));

      if (editingChannelId === deletedId) {
        resetChannelForm();
      }

      onToast("Ссылка удалена.");
    } catch (deleteFailure) {
      const code =
        deleteFailure instanceof Error ? deleteFailure.message : "delete_failed";
      setDeleteChannelError(getChannelErrorMessage(code));
    } finally {
      setChannelDeleting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[21px] font-semibold">Ссылки для публикации</h2>
        <p className="mt-2 text-sm text-[#7d70a2]">
          Используйте готовые ссылки для Telegram, MAX и VK или создавайте
          отдельные ссылки для других площадок, рассылок, рекламы и партнёров.
        </p>
        <div className="mt-4 rounded-[18px] border border-[#d4c0f0] bg-[#f0e8fb] px-4 py-3">
          <p className="text-sm text-[#5f5484]">Ссылки для кампании</p>
          <p className="mt-1 break-words text-[18px] font-semibold text-[#3d2a66]">
            «{campaign.name}»
          </p>
          <p className="mt-1 break-all text-xs text-[#7d70a2]">
            utm_campaign={campaign.campaign_key}
          </p>
        </div>
        {campaign.practice_status !== "published" ? (
          <p className="mt-2 rounded-[18px] border border-[#f2dfc7] bg-[#fff9f0] px-4 py-3 text-sm text-[#8a5a16]">
            Продукт снят с публикации. Ссылки остаются рабочими, но новые
            кампании для него создать нельзя.
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        {PROMOTION_SYSTEM_CHANNEL_PRESETS.map((preset) => (
          <PromotionLinkCard
            key={preset.id}
            label={preset.label}
            url={buildCampaignLinkForChannel(
              campaign,
              preset.utm_source,
              preset.utm_medium,
            )}
          />
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-[17px] font-semibold">Другие каналы</h3>

        {channelsLoading ? (
          <p className="text-sm text-[#7d70a2]">Загружаем дополнительные ссылки…</p>
        ) : null}

        {channelsError ? (
          <div className="rounded-[18px] border border-[#efb8c4] bg-[#fff5f7] px-4 py-4">
            <p className="text-sm text-[#9b3d3d]" role="alert">
              {channelsError}
            </p>
            <button
              type="button"
              onClick={handleRetryChannelsLoad}
              disabled={channelsLoading}
              className="mt-3 rounded-full border border-[#efb8c4] px-4 py-2 text-sm font-semibold text-[#b34f63] disabled:opacity-60"
            >
              Повторить
            </button>
          </div>
        ) : null}

        {channelsRefreshError ? (
          <p className="rounded-[18px] border border-[#f2dfc7] bg-[#fff9f0] px-4 py-3 text-sm text-[#8a5a16]" role="status">
            {channelsRefreshError}
            <button
              type="button"
              onClick={handleRetryChannelsLoad}
              disabled={channelsLoading}
              className="ml-2 font-semibold text-[#8a5a16] underline-offset-2 hover:underline disabled:opacity-60"
            >
              Повторить
            </button>
          </p>
        ) : null}

        {!channelsLoading && !channelsError && channels.length === 0 ? (
          <p className="rounded-[18px] border border-[#eadff8] bg-[#fbf8ff] px-4 py-4 text-sm text-[#7d70a2]">
            Дополнительных ссылок пока нет.
          </p>
        ) : null}

        {channels.map((channel) => (
          <PromotionLinkCard
            key={channel.id}
            label={channel.label}
            url={buildCampaignLinkForChannel(
              campaign,
              channel.utm_source,
              channel.utm_medium,
            )}
            onEdit={() => loadChannelIntoForm(channel)}
            onDelete={() => {
              setPendingDeleteChannel(channel);
              setDeleteChannelError(null);
            }}
          />
        ))}
      </div>

      <div className="rounded-[20px] border border-[#eadff8] bg-white p-4">
        <p className="text-sm font-semibold">
          {isEditing ? "Изменить канал" : "Добавить канал"}
        </p>
        <p className="mt-1 text-sm text-[#5f5484]">
          Новая ссылка будет добавлена именно в эту кампанию.
        </p>
        <p className="mt-1 text-xs text-[#7d70a2]">
          Создайте отдельную ссылку для любой другой площадки, рассылки, рекламы
          или партнёра.
        </p>

        <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(event) => void handleSubmitChannel(event)}>
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
              placeholder="BotHelp Telegram"
              className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8]"
            />
            {customChannelErrors.label ? (
              <p className="mt-1 text-xs text-[#9b3d3d]">{customChannelErrors.label}</p>
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
              placeholder="bothelp-telegram"
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

          {channelFormError ? (
            <p className="sm:col-span-2 text-sm text-[#9b3d3d]" role="alert">
              {channelFormError}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={!formComplete || channelSaving}
              className="rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {channelSaving
                ? isEditing
                  ? "Сохранение…"
                  : "Добавление…"
                : isEditing
                  ? "Сохранить изменения"
                  : "Добавить ссылку"}
            </button>
            {isEditing ? (
              <button
                type="button"
                onClick={resetChannelForm}
                className="rounded-full border border-[#c6afe6] px-5 py-3 text-sm font-semibold text-[#7042c5]"
              >
                Отмена
              </button>
            ) : null}
          </div>
        </form>
      </div>

      {pendingDeleteChannel ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-[#25135c]/35 px-0 pb-[env(safe-area-inset-bottom)] sm:items-center sm:px-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !channelDeleting) {
              setPendingDeleteChannel(null);
              setDeleteChannelError(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-[430px] rounded-t-[28px] border border-[#eadff8] bg-white p-5 shadow-[0_-12px_40px_rgba(91,62,145,0.18)] sm:rounded-[28px]"
          >
            <h2 className="text-[20px] font-semibold">
              Удалить ссылку «{pendingDeleteChannel.label}»?
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
              Она исчезнет из списка этой кампании. Уже опубликованные копии
              ссылки продолжат открываться, а историческая статистика
              сохранится.
            </p>

            {deleteChannelError ? (
              <p className="mt-3 text-sm text-[#b34f63]" role="alert">
                {deleteChannelError}
              </p>
            ) : null}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-full border border-[#ddcfef] px-4 py-3 text-sm"
                disabled={channelDeleting}
                onClick={() => {
                  setPendingDeleteChannel(null);
                  setDeleteChannelError(null);
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                className="flex-1 rounded-full bg-[#b34f63] px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
                disabled={channelDeleting}
                onClick={() => void handleConfirmDeleteChannel()}
              >
                {channelDeleting ? "Удаление…" : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
