"use client";

import { useEffect, useState } from "react";

import {
  ACCESS_LINK_COPY_LABEL,
  ACCESS_LINK_CREATE_COURSE_LABEL,
  ACCESS_LINK_CREATE_ORDINARY_LABEL,
  ACCESS_LINK_LOST_HINT,
  ACCESS_LINK_ONCE_HINT,
  ACCESS_LINK_SECTION_COPY,
  ACCESS_LINK_SECTION_TITLE,
  accessLinkAuthorErrorMessage,
  type AccessLinkExpiryOption,
  type PracticeAccessLinkAllowedTarget,
  type PracticeAccessLinkListItem,
} from "@/lib/products/access-links";

type AccessLinksPayload = {
  links: PracticeAccessLinkListItem[];
  allowedTargets: PracticeAccessLinkAllowedTarget[];
};

async function fetchAccessLinks(practiceId: string): Promise<AccessLinksPayload> {
  const response = await fetch(`/api/author/products/${practiceId}/access-links`);
  const payload = (await response.json()) as {
    links?: PracticeAccessLinkListItem[];
    allowed_targets?: PracticeAccessLinkAllowedTarget[];
    error?: string;
  };

  if (!response.ok) {
    throw new Error(accessLinkAuthorErrorMessage(payload.error));
  }

  return {
    links: payload.links ?? [],
    allowedTargets: payload.allowed_targets ?? [],
  };
}

type CreatedLink = {
  accessUrl: string;
  link: PracticeAccessLinkListItem;
};

function statusLabel(status: PracticeAccessLinkListItem["status"]): string {
  switch (status) {
    case "active":
      return "Активна";
    case "redeemed":
      return "Использована";
    case "revoked":
      return "Отозвана";
    case "expired":
      return "Истекла";
    default:
      return status;
  }
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function AuthorPracticeAccessLinks({
  practiceId,
  publicationClass,
  levels,
  disabled,
}: {
  practiceId: string | null;
  publicationClass: string | null;
  levels: PracticeAccessLinkAllowedTarget[];
  disabled: boolean;
}) {
  const [links, setLinks] = useState<PracticeAccessLinkListItem[]>([]);
  const [apiTargets, setApiTargets] = useState<PracticeAccessLinkAllowedTarget[]>(
    [],
  );
  const [targetLevelDraft, setTargetLevelDraft] = useState<number | null>(null);
  const [expiry, setExpiry] = useState<AccessLinkExpiryOption>("none");
  const [created, setCreated] = useState<CreatedLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const allowedTargets = levels.length > 0 ? levels : apiTargets;
  const resolvedTargets =
    allowedTargets.length > 0
      ? allowedTargets
      : [{ level: 1, title: null, description: null }];
  const targetLevel =
    targetLevelDraft != null &&
    resolvedTargets.some((item) => item.level === targetLevelDraft)
      ? targetLevelDraft
      : (resolvedTargets[0]?.level ?? 1);
  const isCourse = publicationClass === "course";
  const multiLevel = isCourse && resolvedTargets.length > 1;

  useEffect(() => {
    if (!practiceId) {
      return;
    }

    let cancelled = false;

    fetchAccessLinks(practiceId)
      .then((payload) => {
        if (!cancelled) {
          setLinks(payload.links);
          if (payload.allowedTargets.length > 0) {
            setApiTargets(payload.allowedTargets);
          }
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : accessLinkAuthorErrorMessage("internal_error"),
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [practiceId]);

  async function reloadLinks() {
    if (!practiceId) {
      return;
    }

    const payload = await fetchAccessLinks(practiceId);
    setLinks(payload.links);
    if (payload.allowedTargets.length > 0) {
      setApiTargets(payload.allowedTargets);
    }
  }

  async function createLink() {
    if (!practiceId) {
      setError("Сохраните продукт, чтобы создать ссылку доступа.");
      return;
    }

    setBusy(true);
    setError(null);
    setCopied(false);

    try {
      const response = await fetch(
        `/api/author/products/${practiceId}/access-links`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetAccessLevel: multiLevel ? targetLevel : 1,
            expiresIn: expiry,
          }),
        },
      );
      const payload = (await response.json()) as CreatedLink & {
        error?: string;
      };

      if (!response.ok) {
        setError(accessLinkAuthorErrorMessage(payload.error));
        return;
      }

      setCreated({ accessUrl: payload.accessUrl, link: payload.link });
      await reloadLinks();
    } catch {
      setError(accessLinkAuthorErrorMessage("internal_error"));
    } finally {
      setBusy(false);
    }
  }

  async function copyCreatedUrl() {
    if (!created?.accessUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(created.accessUrl);
      setCopied(true);
    } catch {
      setError("Не удалось скопировать ссылку.");
    }
  }

  async function revokeLink(linkId: string) {
    if (!practiceId) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/author/products/${practiceId}/access-links/${linkId}/revoke`,
        { method: "POST" },
      );
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(accessLinkAuthorErrorMessage(payload.error));
        return;
      }

      await reloadLinks();
    } catch {
      setError(accessLinkAuthorErrorMessage("internal_error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      data-author-practice-access-links
      className="space-y-4 rounded-[24px] border border-[#eadff8] bg-white p-5"
    >
      <div className="space-y-2">
        <h2 className="text-[20px] font-semibold">{ACCESS_LINK_SECTION_TITLE}</h2>
        <p className="text-sm leading-6 text-[#5c5278]">
          {ACCESS_LINK_SECTION_COPY}
        </p>
      </div>

      {error ? (
        <p className="text-sm text-[#9b3d3d]">{error}</p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        {multiLevel ? (
          <label className="min-w-[220px] flex-1">
            <span className="mb-2 block text-sm font-medium">Уровень доступа</span>
            <select
              value={targetLevel}
              disabled={disabled || busy || !practiceId}
              onChange={(event) =>
                setTargetLevelDraft(Number(event.target.value))
              }
              className="w-full rounded-[16px] border border-[#e4d7f4] bg-white px-3 py-2 text-sm"
            >
              {resolvedTargets.map((target) => (
                <option key={target.level} value={target.level}>
                  {target.title
                    ? `Уровень ${target.level}: ${target.title}`
                    : `Уровень ${target.level}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="min-w-[180px]">
          <span className="mb-2 block text-sm font-medium">Срок действия</span>
          <select
            value={expiry}
            disabled={disabled || busy || !practiceId}
            onChange={(event) =>
              setExpiry(event.target.value as AccessLinkExpiryOption)
            }
            className="w-full rounded-[16px] border border-[#e4d7f4] bg-white px-3 py-2 text-sm"
          >
            <option value="none">Без срока</option>
            <option value="24h">24 часа</option>
            <option value="7d">7 дней</option>
          </select>
        </label>

        <button
          type="button"
          disabled={disabled || busy || !practiceId}
          onClick={() => void createLink()}
          className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {multiLevel
            ? ACCESS_LINK_CREATE_COURSE_LABEL
            : ACCESS_LINK_CREATE_ORDINARY_LABEL}
        </button>
      </div>

      {created ? (
        <div
          data-author-access-link-created
          className="space-y-3 rounded-[18px] border border-[#c6afe6] bg-[#f8f4ff] p-4"
        >
          <p className="break-all text-sm text-[#3f3560]">{created.accessUrl}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyCreatedUrl()}
              className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
            >
              {copied ? "Скопировано" : ACCESS_LINK_COPY_LABEL}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreated(null);
                setCopied(false);
              }}
              className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]"
            >
              Скрыть ссылку
            </button>
          </div>
          <p className="text-sm text-[#5c5278]">{ACCESS_LINK_ONCE_HINT}</p>
        </div>
      ) : null}

      {links.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-[#7d70a2]">{ACCESS_LINK_LOST_HINT}</p>
          <ul className="space-y-2">
            {links.map((link) => (
              <li
                key={link.id}
                data-author-access-link-status={link.status}
                className="flex flex-col gap-2 rounded-[16px] border border-[#eee6f7] bg-[#fbf8ff] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="text-sm leading-6 text-[#3f3560]">
                  <p>
                    Уровень {link.targetAccessLevel} · {statusLabel(link.status)}
                  </p>
                  <p className="text-[#7d70a2]">
                    Создана {formatDate(link.createdAt)}
                    {link.expiresAt ? ` · до ${formatDate(link.expiresAt)}` : ""}
                    {link.redeemedAt
                      ? ` · использована ${formatDate(link.redeemedAt)}`
                      : ""}
                  </p>
                </div>
                {link.status === "active" ? (
                  <button
                    type="button"
                    disabled={disabled || busy}
                    onClick={() => void revokeLink(link.id)}
                    className="rounded-full border border-[#c6afe6] px-3 py-1.5 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
                  >
                    Отозвать
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
