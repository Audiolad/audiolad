"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";

import TopicSelector from "@/components/author-products/TopicSelector";
import EditorialCollaboratorsSection from "@/components/playlists/editorial/EditorialCollaboratorsSection";
import EditorialPracticePickerSheet from "@/components/playlists/EditorialPracticePickerSheet";
import PlaylistCover from "@/components/playlists/PlaylistCover";
import PlaylistItemRow from "@/components/playlists/PlaylistItemRow";
import PlaylistItemsSortableList from "@/components/playlists/PlaylistItemsSortableList";
import { takeFirstPlaylistItemCoverUrls } from "@/lib/playlists/cover-presentation";
import {
  editorialAuditActionLabel,
  type EditorialWorkspaceDetail,
  type EditorialWorkspaceItemView,
} from "@/lib/playlists/editorial-workspace-detail";
import {
  formatEditorialDateTime,
  formatEditorialUpdatedAt,
} from "@/lib/playlists/editorial-workspace";
import {
  playlistItemKey,
  playlistItemQuery,
} from "@/lib/playlists/playlist-item-identity";
import {
  movePlaylistItems,
  playlistItemReorderRequest,
  visiblePlaylistItems,
  type PlaylistItemsDraft,
} from "@/lib/playlists/playlist-item-reorder";
import { PLAYLIST_TOPIC_LIMIT } from "@/lib/playlists/playlist-topics";
import { PLAYLIST_DESCRIPTION_MAX_LENGTH, PLAYLIST_MAX_ITEMS, PLAYLIST_TITLE_MAX_LENGTH } from "@/lib/playlists/types";
import { getProductCoverDisplayUrl } from "@/lib/products/cover-display";

type EditorialPlaylistEditorClientProps = {
  detail: EditorialWorkspaceDetail;
};

const COVER_ACCEPT = "image/jpeg,image/png,image/webp";
const COVER_MAX_BYTES = 5 * 1024 * 1024;
const PAGE_SIZE = 20;

function coverGradientForId(id: string): string {
  const gradients = [
    "from-[#f5d7e7] to-[#bd91df]",
    "from-[#d9c9f3] to-[#8f73cd]",
    "from-[#f4d6aa] to-[#d399c9]",
    "from-[#6870b7] to-[#c9b7ea]",
  ];
  let hash = 0;

  for (let i = 0; i < id.length; i += 1) {
    hash = (hash + id.charCodeAt(i) * (i + 1)) % gradients.length;
  }

  return gradients[hash] ?? gradients[0];
}

export default function EditorialPlaylistEditorClient({
  detail,
}: EditorialPlaylistEditorClientProps) {
  const router = useRouter();
  const titleId = useId();
  const slugId = useId();
  const descriptionId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState(detail.playlist.title);
  const [slug, setSlug] = useState(detail.playlist.slug ?? "");
  const [description, setDescription] = useState(detail.playlist.description ?? "");
  const [topicKeys, setTopicKeys] = useState(detail.topicKeys);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [coverUrl, setCoverUrl] = useState(detail.coverUrl);
  const [hasCustomCover, setHasCustomCover] = useState(
    Boolean(detail.coverUrl || detail.playlist.cover_path),
  );
  const [page, setPage] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [replacePracticeId, setReplacePracticeId] = useState<string | null>(null);
  const [replaceAudioItemId, setReplaceAudioItemId] = useState<string | null>(
    null,
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [movingPracticeId, setMovingPracticeId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const published = detail.playlist.visibility === "public";
  const slugLocked = detail.slugLocked;
  const serverItems = useMemo(
    () =>
      detail.items.filter(
        (item) =>
          !removedIds.has(playlistItemKey(item.practiceId, item.audioItemId)),
      ),
    [detail.items, removedIds],
  );
  const serverOrderKey = serverItems
    .map(
      (item) =>
        `${playlistItemKey(item.practiceId, item.audioItemId)}:${item.position}`,
    )
    .join("|");
  const [draft, setDraft] = useState<PlaylistItemsDraft<EditorialWorkspaceItemView> | null>(
    null,
  );
  const items = visiblePlaylistItems(serverItems, serverOrderKey, draft);
  const mosaicCoverUrls = useMemo(
    () =>
      takeFirstPlaylistItemCoverUrls(
        items.map((item) =>
          getProductCoverDisplayUrl(
            item.coverUrl,
            item.updatedAt,
            item.coverImage,
            168,
            "sm",
          ),
        ),
      ),
    [items],
  );
  const itemsCount = items.length;
  const uniqueAuthorCount = useMemo(() => {
    const ids = new Set(
      items
        .map((item) => item.authorId)
        .filter((id): id is string => Boolean(id)),
    );
    return ids.size;
  }, [items]);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems = items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const softCountWarning = itemsCount > 0 && itemsCount < 7;
  const diversityHint = detail.diversityHint;

  function refresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  function hasMetadataChanges() {
    const nextDescription = description.trim() || null;
    const previousDescription = detail.playlist.description?.trim() || null;

    return (
      title !== detail.playlist.title ||
      nextDescription !== previousDescription ||
      (!slugLocked && slug.trim() !== (detail.playlist.slug ?? ""))
    );
  }

  function hasTopicChanges() {
    return (
      topicKeys.length !== detail.topicKeys.length ||
      topicKeys.some((key, index) => key !== detail.topicKeys[index])
    );
  }

  async function saveMetadata() {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      if (hasMetadataChanges()) {
        const body: Record<string, unknown> = {
          title,
          description: description.trim() || null,
        };

        if (!slugLocked && slug.trim()) {
          body.slug = slug.trim();
        }

        const response = await fetch(`/api/playlists/${detail.playlist.id}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };

        if (!response.ok) {
          if (data.error === "slug_conflict") {
            setFormError("Такой адрес плейлиста уже занят.");
            return;
          }

          if (data.error === "slug_locked") {
            setFormError("Адрес плейлиста закреплён после первой публикации.");
            return;
          }

          setFormError(data.message || "Не удалось сохранить изменения.");
          return;
        }
      }

      if (hasTopicChanges()) {
        const response = await fetch(
          `/api/playlists/${detail.playlist.id}/topics`,
          {
            method: "PUT",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topicKeys }),
          },
        );

        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };

        if (!response.ok) {
          setFormError(data.message || "Не удалось сохранить темы.");
          return;
        }
      }

      refresh();
    } catch {
      setFormError("Не удалось сохранить изменения.");
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePublish() {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch(`/api/playlists/${detail.playlist.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visibility: published ? "private" : "public",
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setFormError(data.message || "Не удалось изменить публикацию.");
        return;
      }

      refresh();
    } catch {
      setFormError("Не удалось изменить публикацию.");
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.size <= 0 || file.size > COVER_MAX_BYTES) {
      setFormError("Файл обложки слишком большой.");
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch(`/api/playlists/${detail.playlist.id}/cover`, {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      });

      const data = (await response.json().catch(() => ({}))) as {
        coverUrl?: string | null;
        message?: string;
      };

      if (!response.ok) {
        setFormError(data.message || "Не удалось сохранить обложку.");
        return;
      }

      setCoverUrl(data.coverUrl ?? null);
      setHasCustomCover(true);
      refresh();
    } catch {
      setFormError("Не удалось сохранить обложку.");
    } finally {
      setSubmitting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function deleteCover() {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch(`/api/playlists/${detail.playlist.id}/cover`, {
        method: "DELETE",
        credentials: "same-origin",
      });

      if (!response.ok && response.status !== 204) {
        const data = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        setFormError(data.message || "Не удалось удалить обложку.");
        return;
      }

      setCoverUrl(null);
      setHasCustomCover(false);
      refresh();
    } catch {
      setFormError("Не удалось удалить обложку.");
    } finally {
      setSubmitting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function persistMove(
    practiceId: string,
    audioItemId: string | null,
    direction: "up" | "down",
    targetPosition?: number,
  ) {
    const response = await fetch(
      `/api/playlists/${detail.playlist.id}/items/${practiceId}/move`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          audioItemId,
          ...(targetPosition != null ? { targetPosition } : {}),
        }),
      },
    );

    if (!response.ok) {
      throw new Error("move_failed");
    }
  }

  async function moveItem(
    practiceId: string,
    audioItemId: string | null,
    direction: "up" | "down",
  ) {
    if (movingPracticeId) {
      return;
    }

    setMovingPracticeId(playlistItemKey(practiceId, audioItemId));
    setListError(null);

    try {
      await persistMove(practiceId, audioItemId, direction);
      refresh();
    } catch {
      setListError("Не удалось изменить порядок.");
    } finally {
      setMovingPracticeId(null);
    }
  }

  async function reorderItems(fromIndex: number, toIndex: number) {
    const absoluteFrom = page * PAGE_SIZE + fromIndex;
    const absoluteTo = page * PAGE_SIZE + toIndex;
    const request = playlistItemReorderRequest(items, absoluteFrom, absoluteTo);

    if (!request || movingPracticeId) {
      return;
    }

    const previous = items;
    setDraft({
      orderKey: serverOrderKey,
      items: movePlaylistItems(items, absoluteFrom, absoluteTo),
    });
    setMovingPracticeId(
      playlistItemKey(request.item.practiceId, request.item.audioItemId),
    );
    setListError(null);

    try {
      await persistMove(
        request.item.practiceId,
        request.item.audioItemId,
        request.direction,
        request.targetPosition,
      );
      refresh();
    } catch {
      setDraft({ orderKey: serverOrderKey, items: previous });
      setListError("Не удалось изменить порядок.");
    } finally {
      setMovingPracticeId(null);
    }
  }

  async function removeItem(practiceId: string, audioItemId: string | null) {
    setListError(null);

    try {
      const response = await fetch(
        `/api/playlists/${detail.playlist.id}/items/${practiceId}${playlistItemQuery(audioItemId)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
        },
      );

      if (!response.ok) {
        setListError("Не удалось удалить материал.");
        return;
      }

      setRemovedIds((current) => {
        const next = new Set(current);
        next.add(playlistItemKey(practiceId, audioItemId));
        return next;
      });
      refresh();
    } catch {
      setListError("Не удалось удалить материал.");
    }
  }

  return (
    <div className="px-5 pb-12 pt-6">
      <Link
        href="/editorial/playlists"
        className="text-sm font-medium text-[#7042c5]"
      >
        ← К открытым плейлистам
      </Link>

      <div className="mt-4 flex flex-col gap-5 sm:flex-row">
        <div className="mx-auto flex w-[160px] shrink-0 flex-col items-center gap-2 sm:mx-0 sm:items-start">
          <input
            ref={fileInputRef}
            type="file"
            accept={COVER_ACCEPT}
            onChange={(event) => void uploadCover(event)}
            className="sr-only"
            tabIndex={-1}
          />
          <div className="h-[160px] w-[160px] overflow-hidden rounded-[24px]">
            <PlaylistCover
              title={title || detail.playlist.title}
              customCoverUrl={hasCustomCover ? coverUrl : null}
              mosaicCoverUrls={mosaicCoverUrls}
              gradientClassName={`bg-gradient-to-br ${coverGradientForId(detail.playlist.id)}`}
              className="h-full w-full rounded-[24px]"
              editable
              onCoverClick={() => {
                if (!submitting) {
                  fileInputRef.current?.click();
                }
              }}
              coverActionLabel="Изменить обложку"
              coverAriaLabel={
                hasCustomCover ? "Заменить обложку" : "Загрузить обложку"
              }
            />
          </div>
          {hasCustomCover ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void deleteCover()}
              className="text-sm font-medium text-[#7042c5] disabled:opacity-60"
            >
              Вернуть автообложку
            </button>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[#7042c5]">
            {published ? "Опубликован" : "Draft"}
          </p>
          <h1 className="mt-1 text-[28px] font-semibold leading-8">
            {detail.playlist.title}
          </h1>
          <p className="mt-2 text-sm text-[#7d70a2]">Владелец: Аудиолад</p>
          {detail.directionName ? (
            <p className="mt-1 text-sm text-[#7d70a2]">
              Направление: {detail.directionName}
            </p>
          ) : null}
          {detail.creatorName ? (
            <p className="mt-1 text-sm text-[#7d70a2]">
              Создал: {detail.creatorName}
            </p>
          ) : null}
          {detail.playlist.first_published_at ? (
            <p className="mt-1 text-sm text-[#7d70a2]">
              Первая публикация:{" "}
              {formatEditorialDateTime(detail.playlist.first_published_at)}
            </p>
          ) : null}
        </div>
      </div>

      <section className="mt-8 rounded-[24px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-[21px] font-semibold">Данные</h2>

        <div className="mt-5 space-y-4">
          <label className="block" htmlFor={titleId}>
            <span className="mb-2 block text-sm font-medium">Название</span>
            <input
              id={titleId}
              value={title}
              maxLength={PLAYLIST_TITLE_MAX_LENGTH}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-[18px] border border-[#ddcfef] px-4 py-3 text-sm outline-none focus:border-[#7042c5]"
            />
          </label>

          <label className="block" htmlFor={slugId}>
            <span className="mb-2 block text-sm font-medium">
              Адрес плейлиста
            </span>
            <input
              id={slugId}
              value={slug}
              disabled={slugLocked}
              onChange={(event) => setSlug(event.target.value)}
              className="w-full rounded-[18px] border border-[#ddcfef] px-4 py-3 text-sm outline-none focus:border-[#7042c5] disabled:bg-[#faf6ff] disabled:text-[#7d70a2]"
            />
            <span className="mt-2 block text-xs text-[#7d70a2]">
              {slugLocked
                ? "Адрес плейлиста закреплён"
                : "После первой публикации адрес плейлиста изменить нельзя."}
            </span>
          </label>

          <label className="block" htmlFor={descriptionId}>
            <span className="mb-2 block text-sm font-medium">Описание</span>
            <textarea
              id={descriptionId}
              value={description}
              maxLength={PLAYLIST_DESCRIPTION_MAX_LENGTH}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="w-full min-h-[4.5rem] resize-y rounded-[18px] border border-[#ddcfef] px-4 py-2.5 text-sm outline-none focus:border-[#7042c5]"
            />
            <span className="mt-2 block text-xs text-[#7d70a2]">
              {description.length}/{PLAYLIST_DESCRIPTION_MAX_LENGTH}
            </span>
          </label>

          <div>
            <span className="mb-2 block text-sm font-medium">Темы</span>
            <TopicSelector
              options={detail.topicOptions}
              value={topicKeys}
              limit={PLAYLIST_TOPIC_LIMIT}
              hint={`Выберите до ${PLAYLIST_TOPIC_LIMIT} тем, которые лучше всего описывают этот плейлист.`}
              disabled={submitting}
              onChange={setTopicKeys}
            />
          </div>
        </div>

        {formError ? (
          <p className="mt-4 text-sm text-[#b34f63]" role="alert">
            {formError}
          </p>
        ) : null}

        {softCountWarning ? (
          <p className="mt-4 text-sm text-[#8a6a2a]">
            Для страницы прослушивания рекомендуется не менее 7 позиций.
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void saveMetadata()}
            className="rounded-[18px] bg-[#7042c5] px-4 py-3 font-semibold text-white disabled:opacity-50"
          >
            Сохранить
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void togglePublish()}
            className="rounded-[18px] border border-[#ddcfef] px-4 py-3 font-medium text-[#7042c5] disabled:opacity-50"
          >
            {published ? "Снять с публикации" : "Опубликовать"}
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-[24px] border border-[#eadff8] bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-[21px] font-semibold">Состав</h2>
            <p className="mt-1 text-sm text-[#7d70a2]">
              {itemsCount} позиций · {uniqueAuthorCount} авторов · {itemsCount}/
              {PLAYLIST_MAX_ITEMS}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setReplacePracticeId(null);
              setPickerOpen(true);
            }}
            className="rounded-full bg-[#7042c5] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Добавить
          </button>
        </div>

        {diversityHint ? (
          <p className="mt-3 text-sm text-[#8a6a2a]">
            {diversityHint.count} из первых 7 позиций принадлежат одному автору.
          </p>
        ) : null}

        {listError ? (
          <p className="mt-3 text-sm text-[#b34f63]" role="alert">
            {listError}
          </p>
        ) : null}

        <div className="mt-4">
          <PlaylistItemsSortableList
            items={pageItems}
            className="space-y-2"
            disabled={movingPracticeId !== null}
            onReorder={({ fromIndex, toIndex }) => {
              void reorderItems(fromIndex, toIndex);
            }}
            renderRow={({ item, index, dragHandle }) => {
              const absoluteIndex = page * PAGE_SIZE + index;

              return (
                <PlaylistItemRow
                  item={{
                    practiceId: item.practiceId,
                    audioItemId: item.audioItemId,
                    title: item.title,
                    authorName: item.authorName,
                    authorSlug: item.authorSlug,
                    coverUrl: item.coverUrl,
                    coverImage: item.coverImage,
                    updatedAt: item.updatedAt,
                    formatLabel: `${item.productKindLabel}${item.metaLabel ? ` · ${item.metaLabel}` : ""}`,
                    metaLabel: item.available ? "Доступен" : "Недоступен",
                    available: item.available,
                    href: item.listenHref,
                    listenHref: item.listenHref,
                  }}
                  index={absoluteIndex}
                  leadingControls={dragHandle}
                  trailingControls={
                    <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        onClick={() => {
                          setReplacePracticeId(item.practiceId);
                          setReplaceAudioItemId(item.audioItemId);
                          setPickerOpen(true);
                        }}
                        className="rounded-full px-2 py-1 text-[11px] font-medium text-[#7042c5]"
                      >
                        Заменить
                      </button>
                      <button
                        type="button"
                        disabled={absoluteIndex === 0 || movingPracticeId !== null}
                        onClick={() =>
                          void moveItem(item.practiceId, item.audioItemId, "up")
                        }
                        className="rounded-full px-2 py-1 text-[11px] font-medium text-[#7042c5] disabled:opacity-30"
                        aria-label="Выше"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={
                          absoluteIndex === items.length - 1 ||
                          movingPracticeId !== null
                        }
                        onClick={() =>
                          void moveItem(item.practiceId, item.audioItemId, "down")
                        }
                        className="rounded-full px-2 py-1 text-[11px] font-medium text-[#7042c5] disabled:opacity-30"
                        aria-label="Ниже"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void removeItem(item.practiceId, item.audioItemId)
                        }
                        className="rounded-full px-2 py-1 text-[11px] font-medium text-[#b34f63]"
                      >
                        Удалить
                      </button>
                    </div>
                  }
                />
              );
            }}
          />
        </div>

        {pageCount > 1 ? (
          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              className="font-medium text-[#7042c5] disabled:opacity-40"
            >
              Назад
            </button>
            <span className="text-[#7d70a2]">
              {page + 1} / {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount - 1}
              onClick={() =>
                setPage((current) => Math.min(pageCount - 1, current + 1))
              }
              className="font-medium text-[#7042c5] disabled:opacity-40"
            >
              Дальше
            </button>
          </div>
        ) : null}
      </section>

      {detail.canManageCollaborators ? (
        <div className="mt-6">
          <EditorialCollaboratorsSection playlistId={detail.playlist.id} />
        </div>
      ) : null}

      {detail.auditEvents.length > 0 ? (
        <section className="mt-6 rounded-[24px] border border-[#eadff8] bg-white p-5">
          <h2 className="text-[21px] font-semibold">Последние изменения</h2>
          <ul className="mt-4 space-y-3">
            {detail.auditEvents.map((event) => (
              <li key={event.id} className="text-sm leading-6 text-[#5c4f82]">
                <span className="font-medium text-[#25135c]">
                  {editorialAuditActionLabel(event.action)}
                </span>
                {event.actorName ? ` · ${event.actorName}` : ""}
                {event.createdAt
                  ? ` · ${formatEditorialUpdatedAt(event.createdAt)}`
                  : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <EditorialPracticePickerSheet
        playlistId={detail.playlist.id}
        open={pickerOpen}
        mode={replacePracticeId ? "replace" : "add"}
        replacePracticeId={replacePracticeId}
        replaceAudioItemId={replaceAudioItemId}
        onClose={() => {
          setPickerOpen(false);
          setReplacePracticeId(null);
          setReplaceAudioItemId(null);
        }}
        onAdded={refresh}
        onReplaced={refresh}
      />
    </div>
  );
}
