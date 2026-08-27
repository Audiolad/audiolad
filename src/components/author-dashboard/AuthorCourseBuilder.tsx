"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AudioDragHandle } from "@/components/author-dashboard/AudioDragHandle";
import { usePointerReorder } from "@/components/author-dashboard/usePointerReorder";
import {
  COURSE_BUILDER_ADD_LESSON_LABEL,
  COURSE_BUILDER_AUDIO_HINT,
  COURSE_BUILDER_COMPLETION_CTA_TITLE,
  COURSE_BUILDER_EMPTY_TITLE,
  COURSE_BUILDER_LEGACY_AUDIO_NOTICE,
  COURSE_BUILDER_PDF_HINT,
  COURSE_BUILDER_SECTION_TITLE,
  countCoursePublishContentFromLessons,
  getCourseBuilderAudioUploadError,
  getCourseBuilderErrorMessage,
  getCourseBuilderPdfErrorMessage,
  resolveCourseBuilderPanes,
  validateCourseBuilderAudioFile,
  validateCourseBuilderPdfFile,
  type CourseBuilderBlockDto,
  type CourseBuilderLessonDto,
  type CourseBuilderSnapshot,
  type CourseCompletionCtaDto,
  type CoursePublishContentSnapshot,
} from "@/lib/author-products/course-builder-shared";

type AuthorCourseBuilderProps = {
  practiceId: string | null;
  getPracticeId: () => Promise<string | null>;
  disabled?: boolean;
  onContentSnapshotChange?: (snapshot: CoursePublishContentSnapshot) => void;
};

function formatDurationLong(seconds: number | null): string {
  if (!seconds || seconds <= 0) {
    return "—";
  }

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes} мин ${secs} сек`;
}

function formatFileSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);

  if (megabytes >= 0.1) {
    return `${megabytes.toLocaleString("ru-RU", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} МБ`;
  }

  return `${(bytes / 1024).toLocaleString("ru-RU", {
    maximumFractionDigits: 0,
  })} КБ`;
}

function emptyCta(publicationId: string): CourseCompletionCtaDto {
  return {
    publication_id: publicationId,
    title: "",
    description: "",
    button_text: "",
    url: "",
    enabled: false,
    created_at: "",
    updated_at: "",
  };
}

export default function AuthorCourseBuilder({
  practiceId,
  getPracticeId,
  disabled = false,
  onContentSnapshotChange,
}: AuthorCourseBuilderProps) {
  const [lessons, setLessons] = useState<CourseBuilderLessonDto[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const [cta, setCta] = useState<CourseCompletionCtaDto | null>(null);
  const [orphanAudioCount, setOrphanAudioCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedForIdRef = useRef<string | null>(null);

  const selectedLesson = useMemo(
    () => lessons.find((lesson) => lesson.id === selectedLessonId) ?? null,
    [lessons, selectedLessonId],
  );

  const emitSnapshot = useCallback(
    (nextLessons: CourseBuilderLessonDto[]) => {
      onContentSnapshotChange?.(countCoursePublishContentFromLessons(nextLessons));
    },
    [onContentSnapshotChange],
  );

  const applySnapshot = useCallback(
    (snapshot: CourseBuilderSnapshot) => {
      setLessons(snapshot.lessons);
      setCta(snapshot.completion_cta);
      setOrphanAudioCount(snapshot.orphan_audio_item_count);
      emitSnapshot(snapshot.lessons);
      setSelectedLessonId((current) => {
        if (current && snapshot.lessons.some((lesson) => lesson.id === current)) {
          return current;
        }

        return snapshot.lessons[0]?.id ?? null;
      });
    },
    [emitSnapshot],
  );

  const loadSnapshot = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/author/products/${id}/course/lessons`);
        const payload = (await response.json()) as CourseBuilderSnapshot & {
          error?: string;
          message?: string;
        };

        if (!response.ok) {
          setError(
            payload.message ?? getCourseBuilderErrorMessage(payload.error),
          );
          return;
        }

        applySnapshot(payload);
      } catch {
        setError("Не удалось загрузить содержание курса.");
      } finally {
        setLoading(false);
      }
    },
    [applySnapshot],
  );

  useEffect(() => {
    if (!practiceId || loadedForIdRef.current === practiceId) {
      return;
    }

    loadedForIdRef.current = practiceId;
    void loadSnapshot(practiceId);
  }, [loadSnapshot, practiceId]);

  const persistLessonOrder = useCallback(
    async (nextLessons: CourseBuilderLessonDto[]) => {
      const id = practiceId;
      const previous = lessons;
      const ordered = nextLessons.map((lesson, index) => ({
        ...lesson,
        position: index,
      }));

      setLessons(ordered);
      emitSnapshot(ordered);

      if (!id) {
        return;
      }

      const response = await fetch(
        `/api/author/products/${id}/course/lessons/reorder`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: ordered.map((lesson) => ({
              id: lesson.id,
              position: lesson.position,
            })),
          }),
        },
      );

      if (!response.ok) {
        setLessons(previous);
        emitSnapshot(previous);
        setError("Не удалось сохранить порядок уроков.");
        return;
      }

      const payload = (await response.json()) as CourseBuilderSnapshot;
      applySnapshot(payload);
    },
    [applySnapshot, emitSnapshot, lessons, practiceId],
  );

  const lessonReorder = usePointerReorder({
    items: lessons,
    disabled: disabled || busy,
    onReorder: persistLessonOrder,
  });

  async function resolvePracticeId() {
    return practiceId || (await getPracticeId());
  }

  async function addLesson() {
    if (disabled || busy) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const id = await resolvePracticeId();

      if (!id) {
        setError("Не удалось создать урок.");
        return;
      }

      const response = await fetch(`/api/author/products/${id}/course/lessons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as {
        lesson?: CourseBuilderLessonDto;
        error?: string;
        message?: string;
      };

      if (!response.ok || !payload.lesson) {
        setError(payload.message ?? getCourseBuilderErrorMessage(payload.error));
        return;
      }

      const next = [...lessons, payload.lesson];
      setLessons(next);
      emitSnapshot(next);
      setSelectedLessonId(payload.lesson.id);
      setMobileEditorOpen(true);
    } catch {
      setError("Не удалось добавить урок.");
    } finally {
      setBusy(false);
    }
  }

  async function renameLesson(lessonId: string, title: string) {
    if (!practiceId || disabled) {
      return;
    }

    const current = lessons.find((lesson) => lesson.id === lessonId);

    if (!current || current.title === title.trim()) {
      return;
    }

    const response = await fetch(
      `/api/author/products/${practiceId}/course/lessons/${lessonId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      },
    );
    const payload = (await response.json()) as {
      lesson?: CourseBuilderLessonDto;
      error?: string;
      message?: string;
    };

    if (!response.ok || !payload.lesson) {
      setError(payload.message ?? getCourseBuilderErrorMessage(payload.error));
      return;
    }

    setLessons((currentLessons) =>
      currentLessons.map((lesson) =>
        lesson.id === lessonId ? { ...lesson, ...payload.lesson, blocks: lesson.blocks } : lesson,
      ),
    );
  }

  async function deleteLesson(lesson: CourseBuilderLessonDto) {
    if (!practiceId || disabled || busy) {
      return;
    }

    if (lesson.blocks.length > 0) {
      const confirmed = window.confirm(
        `Удалить урок «${lesson.title}» вместе с блоками?`,
      );

      if (!confirmed) {
        return;
      }
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/author/products/${practiceId}/course/lessons/${lesson.id}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as CourseBuilderSnapshot & {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setError(payload.message ?? getCourseBuilderErrorMessage(payload.error));
        return;
      }

      applySnapshot(payload);
      setMobileEditorOpen(false);
    } catch {
      setError("Не удалось удалить урок.");
    } finally {
      setBusy(false);
    }
  }

  function openLesson(lessonId: string) {
    setSelectedLessonId(lessonId);
    setMobileEditorOpen(true);
  }

  const { showList, showEditor } = resolveCourseBuilderPanes({
    mobileEditorOpen,
    selectedLessonId: selectedLesson?.id ?? null,
  });

  return (
    <section
      data-author-course-builder
      className="space-y-4 rounded-[24px] border border-[#eadff8] bg-white p-5"
    >
      <h2 className="text-[20px] font-semibold">{COURSE_BUILDER_SECTION_TITLE}</h2>

      {orphanAudioCount > 0 ? (
        <p className="rounded-[18px] border border-[#eee6f7] bg-[#fbf8ff] px-4 py-3 text-sm text-[#7d70a2]">
          {COURSE_BUILDER_LEGACY_AUDIO_NOTICE}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3 text-sm text-[#9b3d3d]">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[#7d70a2]">Загрузка уроков…</p>
      ) : lessons.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-[#d9c9ef] bg-[#fbf8ff] px-5 py-8 text-center">
          <p className="text-sm font-medium text-[#3f3560]">
            {COURSE_BUILDER_EMPTY_TITLE}
          </p>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void addLesson()}
            className="mt-4 rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {COURSE_BUILDER_ADD_LESSON_LABEL}
          </button>
        </div>
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)] lg:gap-5">
          <div className={showList ? "block" : "hidden lg:block"}>
            <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
              {lessons.map((lesson, index) => (
                <div
                  key={lesson.id}
                  ref={(element) => lessonReorder.setItemElement(lesson.id, element)}
                  className={`flex items-center gap-2 rounded-[18px] border px-3 py-2 ${
                    selectedLessonId === lesson.id
                      ? "border-[#9a74d8] bg-[#f8f4ff]"
                      : lessonReorder.dragOverIndex === index && lessonReorder.draggingId
                        ? "border-[#9a74d8] ring-2 ring-[#d9c9ef]"
                        : "border-[#eee6f7] bg-[#fbf8ff]"
                  } ${lessonReorder.draggingId === lesson.id ? "opacity-70" : ""}`}
                >
                  <AudioDragHandle
                    ariaLabel="Перетащить урок"
                    disabled={disabled || busy}
                    isDragging={lessonReorder.draggingId === lesson.id}
                    onPointerDown={(event) =>
                      lessonReorder.handlePointerDown(lesson.id, event)
                    }
                    onPointerMove={lessonReorder.handlePointerMove}
                    onPointerUp={lessonReorder.handlePointerUp}
                    onPointerCancel={lessonReorder.handlePointerCancel}
                  />
                  <button
                    type="button"
                    onClick={() => openLesson(lesson.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="mr-2 text-xs font-semibold text-[#8c79b6]">
                      {index + 1}.
                    </span>
                    <span className="text-sm font-medium text-[#3f3560]">
                      {lesson.title}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={disabled || busy}
                    onClick={() => void deleteLesson(lesson)}
                    className="shrink-0 text-xs font-semibold text-[#9b3d3d] disabled:opacity-50"
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => void addLesson()}
              className="mt-3 rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
            >
              {COURSE_BUILDER_ADD_LESSON_LABEL}
            </button>
          </div>

          <div className={showEditor ? "block" : "hidden lg:block"}>
            {selectedLesson ? (
              <AuthorCourseLessonEditor
                key={selectedLesson.id}
                practiceId={practiceId}
                lesson={selectedLesson}
                disabled={disabled || busy}
                onBack={() => setMobileEditorOpen(false)}
                onRename={(title) => void renameLesson(selectedLesson.id, title)}
                onLessonChange={(nextLesson) => {
                  setLessons((current) => {
                    const next = current.map((lesson) =>
                      lesson.id === nextLesson.id ? nextLesson : lesson,
                    );
                    emitSnapshot(next);
                    return next;
                  });
                }}
                onSnapshot={applySnapshot}
                onError={setError}
              />
            ) : (
              <p className="hidden text-sm text-[#7d70a2] lg:block">
                Выберите урок слева, чтобы редактировать содержимое.
              </p>
            )}
          </div>
        </div>
      )}

      <AuthorCourseCompletionCta
        practiceId={practiceId}
        cta={cta}
        disabled={disabled || busy}
        onChange={setCta}
        onError={setError}
      />
    </section>
  );
}

function AuthorCourseLessonEditor({
  practiceId,
  lesson,
  disabled,
  onBack,
  onRename,
  onLessonChange,
  onSnapshot,
  onError,
}: {
  practiceId: string | null;
  lesson: CourseBuilderLessonDto;
  disabled: boolean;
  onBack: () => void;
  onRename: (title: string) => void;
  onLessonChange: (lesson: CourseBuilderLessonDto) => void;
  onSnapshot: (snapshot: CourseBuilderSnapshot) => void;
  onError: (message: string | null) => void;
}) {
  const [title, setTitle] = useState(lesson.title);

  const persistBlockOrder = useCallback(
    async (nextBlocks: CourseBuilderBlockDto[]) => {
      if (!practiceId) {
        return;
      }

      const previous = lesson;
      const ordered = nextBlocks.map((block, index) => ({
        ...block,
        position: index,
      }));
      onLessonChange({ ...lesson, blocks: ordered });

      const response = await fetch(
        `/api/author/products/${practiceId}/course/lessons/${lesson.id}/blocks/reorder`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: ordered.map((block) => ({
              id: block.id,
              position: block.position,
            })),
          }),
        },
      );

      if (!response.ok) {
        onLessonChange(previous);
        onError("Не удалось сохранить порядок блоков.");
        return;
      }

      const payload = (await response.json()) as {
        lesson?: CourseBuilderLessonDto;
      };

      if (payload.lesson) {
        onLessonChange(payload.lesson);
      }
    },
    [lesson, onError, onLessonChange, practiceId],
  );

  const blockReorder = usePointerReorder({
    items: lesson.blocks,
    disabled,
    onReorder: persistBlockOrder,
  });

  async function addBlock(type: "text" | "audio" | "file", file?: File) {
    if (!practiceId || disabled) {
      return;
    }

    onError(null);

    if (file) {
      const pdfCheck = validateCourseBuilderPdfFile(file);
      if (!pdfCheck.ok) {
        onError(getCourseBuilderPdfErrorMessage(pdfCheck.code));
        return;
      }
    }

    const url = `/api/author/products/${practiceId}/course/lessons/${lesson.id}/blocks`;
    const response = file
      ? await fetch(url, (() => {
          const formData = new FormData();
          formData.set("type", type);
          formData.set("file", file);
          return { method: "POST", body: formData };
        })())
      : await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            type === "text" ? { type, payload: { text: "" } } : { type },
          ),
        });

    const payload = (await response.json()) as {
      block?: CourseBuilderBlockDto;
      error?: string;
      message?: string;
    };

    if (!response.ok || !payload.block) {
      onError(payload.message ?? getCourseBuilderErrorMessage(payload.error));
      return;
    }

    onLessonChange({
      ...lesson,
      blocks: [...lesson.blocks, payload.block],
    });
  }

  async function patchBlock(
    blockId: string,
    body: Record<string, unknown> | FormData,
  ) {
    if (!practiceId) {
      return null;
    }

    if (body instanceof FormData) {
      const file = body.get("file");
      if (file instanceof File) {
        const pdfCheck = validateCourseBuilderPdfFile(file);
        if (!pdfCheck.ok) {
          onError(getCourseBuilderPdfErrorMessage(pdfCheck.code));
          return null;
        }
      }
    }

    const response = await fetch(
      `/api/author/products/${practiceId}/course/lessons/${lesson.id}/blocks/${blockId}`,
      body instanceof FormData
        ? { method: "PATCH", body }
        : {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
    );
    const payload = (await response.json()) as {
      block?: CourseBuilderBlockDto;
      error?: string;
      message?: string;
    };

    if (!response.ok || !payload.block) {
      onError(payload.message ?? getCourseBuilderErrorMessage(payload.error));
      return null;
    }

    const nextBlock = payload.block;

    onLessonChange({
      ...lesson,
      blocks: lesson.blocks.map((block) =>
        block.id === blockId
          ? {
              ...nextBlock,
              position: block.position,
              audio: nextBlock.audio ?? block.audio,
              file: nextBlock.file ?? block.file,
            }
          : block,
      ),
    });

    return payload.block;
  }

  async function deleteBlock(block: CourseBuilderBlockDto) {
    if (!practiceId || disabled) {
      return;
    }

    const response = await fetch(
      `/api/author/products/${practiceId}/course/lessons/${lesson.id}/blocks/${block.id}`,
      { method: "DELETE" },
    );
    const payload = (await response.json()) as CourseBuilderSnapshot & {
      error?: string;
      message?: string;
    };

    if (!response.ok) {
      onError(payload.message ?? getCourseBuilderErrorMessage(payload.error));
      return;
    }

    onSnapshot(payload);
  }

  async function uploadAudio(block: CourseBuilderBlockDto, file: File) {
    if (!practiceId || !block.asset_id) {
      return;
    }

    const clientError = validateCourseBuilderAudioFile(file);

    if (clientError) {
      onError(clientError);
      return;
    }

    const formData = new FormData();
    formData.set("file", file);
    const response = await fetch(
      `/api/author/products/${practiceId}/audio/${block.asset_id}/upload`,
      { method: "POST", body: formData },
    );
    const payload = (await response.json()) as {
      duration_seconds?: number;
      error?: string;
      message?: string;
    };

    if (!response.ok) {
      onError(
        getCourseBuilderAudioUploadError(
          payload.error,
          response.status,
          payload.message,
        ),
      );
      return;
    }

    onLessonChange({
      ...lesson,
      blocks: lesson.blocks.map((item) =>
        item.id === block.id
          ? {
              ...item,
              audio: item.audio
                ? {
                    ...item.audio,
                    duration_seconds: payload.duration_seconds ?? item.audio.duration_seconds,
                    audio_path: item.audio.audio_path ?? "uploaded",
                    original_file_name: file.name,
                  }
                : item.audio,
            }
          : item,
      ),
    });
  }

  async function openPdf(block: CourseBuilderBlockDto) {
    if (!practiceId || !block.asset_id) {
      return;
    }

    const response = await fetch(
      `/api/author/products/${practiceId}/course/files/${block.asset_id}`,
    );
    const payload = (await response.json()) as {
      url?: string;
      error?: string;
      message?: string;
    };

    if (!response.ok || !payload.url) {
      onError(payload.message ?? "Не удалось открыть PDF.");
      return;
    }

    window.open(payload.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-4 rounded-[20px] border border-[#eee6f7] bg-[#fbf8ff] p-4">
      <button
        type="button"
        onClick={onBack}
        className="text-sm font-semibold text-[#7042c5] lg:hidden"
      >
        ← К списку уроков
      </button>

      <label className="block">
        <span className="mb-2 block text-sm font-medium">Название урока</span>
        <input
          value={title}
          disabled={disabled}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => onRename(title)}
          className="w-full rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 outline-none focus:border-[#9a74d8]"
        />
      </label>

      <div className="space-y-3">
        {lesson.blocks.map((block, index) => (
          <article
            key={block.id}
            ref={(element) => blockReorder.setItemElement(block.id, element)}
            className={`rounded-[18px] border bg-white p-4 ${
              blockReorder.draggingId === block.id
                ? "border-[#9a74d8] opacity-70"
                : blockReorder.dragOverIndex === index && blockReorder.draggingId
                  ? "border-[#9a74d8] ring-2 ring-[#d9c9ef]"
                  : "border-[#eee6f7]"
            }`}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AudioDragHandle
                  ariaLabel="Перетащить блок"
                  disabled={disabled}
                  isDragging={blockReorder.draggingId === block.id}
                  onPointerDown={(event) =>
                    blockReorder.handlePointerDown(block.id, event)
                  }
                  onPointerMove={blockReorder.handlePointerMove}
                  onPointerUp={blockReorder.handlePointerUp}
                  onPointerCancel={blockReorder.handlePointerCancel}
                />
                <span className="text-xs font-semibold uppercase tracking-wide text-[#8c79b6]">
                  {block.type === "text"
                    ? "Текст"
                    : block.type === "audio"
                      ? "Аудио"
                      : "PDF"}
                </span>
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => void deleteBlock(block)}
                className="text-xs font-semibold text-[#9b3d3d] disabled:opacity-50"
              >
                Удалить
              </button>
            </div>

            {block.type === "text" ? (
              <textarea
                defaultValue={
                  block.payload &&
                  typeof block.payload === "object" &&
                  "text" in block.payload &&
                  typeof block.payload.text === "string"
                    ? block.payload.text
                    : ""
                }
                disabled={disabled}
                rows={6}
                onBlur={(event) =>
                  void patchBlock(block.id, {
                    payload: { text: event.target.value },
                  })
                }
                className="w-full rounded-[16px] border border-[#e4d7f4] px-3 py-2 text-sm outline-none focus:border-[#9a74d8]"
              />
            ) : null}

            {block.type === "audio" ? (
              <div className="space-y-3">
                <input
                  defaultValue={block.audio?.title ?? ""}
                  disabled={disabled}
                  onBlur={(event) =>
                    void patchBlock(block.id, { title: event.target.value })
                  }
                  placeholder="Название аудио"
                  className="w-full rounded-[16px] border border-[#e4d7f4] px-3 py-2 text-sm outline-none focus:border-[#9a74d8]"
                />
                <p className="text-sm text-[#7d70a2]">
                  {block.audio?.original_file_name ?? "Файл не загружен"} ·{" "}
                  {formatDurationLong(block.audio?.duration_seconds ?? null)}
                </p>
                <label className="inline-flex cursor-pointer rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white">
                  {block.audio?.audio_path ? "Заменить MP3" : "Загрузить MP3"}
                  <input
                    type="file"
                    accept="audio/mpeg,.mp3"
                    className="hidden"
                    disabled={disabled}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) {
                        void uploadAudio(block, file);
                      }
                    }}
                  />
                </label>
              </div>
            ) : null}

            {block.type === "file" ? (
              <div className="space-y-3">
                <p className="text-sm text-[#3f3560]">
                  {block.file?.original_name ?? "PDF"} ·{" "}
                  {block.file ? formatFileSize(block.file.size_bytes) : "—"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => void openPdf(block)}
                    className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
                  >
                    Открыть PDF
                  </button>
                  <label className="inline-flex cursor-pointer rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white">
                    Заменить PDF
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      disabled={disabled}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) {
                          return;
                        }

                        const formData = new FormData();
                        formData.set("file", file);
                        void patchBlock(block.id, formData);
                      }}
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => void addBlock("audio")}
            className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
          >
            Добавить аудио
          </button>
          <span className="text-xs text-[#8c79b6]">{COURSE_BUILDER_AUDIO_HINT}</span>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void addBlock("text")}
          className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
        >
          Добавить текст
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]">
            Добавить PDF
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              disabled={disabled}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) {
                  void addBlock("file", file);
                }
              }}
            />
          </label>
          <span className="text-xs text-[#8c79b6]">{COURSE_BUILDER_PDF_HINT}</span>
        </div>
      </div>
    </div>
  );
}

function AuthorCourseCompletionCta({
  practiceId,
  cta,
  disabled,
  onChange,
  onError,
}: {
  practiceId: string | null;
  cta: CourseCompletionCtaDto | null;
  disabled: boolean;
  onChange: (cta: CourseCompletionCtaDto) => void;
  onError: (message: string | null) => void;
}) {
  const value = cta ?? emptyCta(practiceId ?? "");
  const saveTimerRef = useRef<number | null>(null);

  function update(partial: Partial<CourseCompletionCtaDto>) {
    const next = { ...value, ...partial };
    onChange(next);

    if (!practiceId) {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void persist(next);
    }, 400);
  }

  async function persist(next: CourseCompletionCtaDto) {
    const response = await fetch(
      `/api/author/products/${practiceId}/course/completion-cta`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: next.title,
          description: next.description,
          button_text: next.button_text,
          url: next.url,
          enabled: next.enabled,
        }),
      },
    );
    const payload = (await response.json()) as {
      completion_cta?: CourseCompletionCtaDto;
      error?: string;
      message?: string;
    };

    if (!response.ok || !payload.completion_cta) {
      onError(payload.message ?? getCourseBuilderErrorMessage(payload.error));
      return;
    }

    onChange(payload.completion_cta);
  }

  return (
    <div
      data-author-course-completion-cta
      className="space-y-4 border-t border-[#eee6f7] pt-5"
    >
      <h3 className="text-[18px] font-semibold">
        {COURSE_BUILDER_COMPLETION_CTA_TITLE}
      </h3>
      <label className="flex cursor-pointer items-start gap-3 rounded-[18px] border border-[#eee6f7] bg-[#fbf8ff] px-4 py-3">
        <input
          type="checkbox"
          checked={value.enabled}
          disabled={disabled}
          onChange={(event) => update({ enabled: event.target.checked })}
          className="mt-1 h-4 w-4 shrink-0 rounded border-[#c6afe6] text-[#7042c5] focus:ring-[#9a74d8]"
        />
        <span className="text-sm font-medium text-[#3f3560]">
          Показывать кнопку после курса
        </span>
      </label>
      <div
        className={`space-y-4 ${value.enabled ? "" : "pointer-events-none opacity-50"}`}
      >
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Заголовок</span>
          <input
            value={value.title ?? ""}
            disabled={disabled || !value.enabled}
            onChange={(event) => update({ title: event.target.value })}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-platform-surface"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Описание</span>
          <textarea
            value={value.description ?? ""}
            disabled={disabled || !value.enabled}
            rows={3}
            onChange={(event) => update({ description: event.target.value })}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-platform-surface"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Текст кнопки</span>
          <input
            value={value.button_text ?? ""}
            disabled={disabled || !value.enabled}
            onChange={(event) => update({ button_text: event.target.value })}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-platform-surface"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Ссылка</span>
          <input
            type="url"
            value={value.url ?? ""}
            disabled={disabled || !value.enabled}
            placeholder="https://"
            onChange={(event) => update({ url: event.target.value })}
            className="w-full rounded-[18px] border border-[#e4d7f4] px-4 py-3 outline-none focus:border-[#9a74d8] disabled:bg-platform-surface"
          />
        </label>
      </div>
    </div>
  );
}
