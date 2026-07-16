"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import type { AuthorProductDetail } from "@/lib/author-products/types";
import { validateCoverFile } from "@/lib/author-products/cover-validation-client";
import { buildCoverDisplayUrl } from "@/lib/author-products/utils";

export type CoverUploadResult = {
  coverUrl: string | null;
  product?: AuthorProductDetail;
};

export type UseCoverUploadOptions = {
  coverUrl: string | null;
  coverVersion: string | null;
  buildUploadUrl: (practiceId: string) => string;
  buildDeleteUrl: (practiceId: string) => string;
  getPracticeId: () => Promise<string | null>;
  onUpdated?: (result: CoverUploadResult) => void;
  deleteConfirmMessage?: string;
  disabled?: boolean;
};

export function useCoverUpload({
  coverUrl,
  coverVersion,
  buildUploadUrl,
  buildDeleteUrl,
  getPracticeId,
  onUpdated,
  deleteConfirmMessage = "Удалить обложку?",
  disabled = false,
}: UseCoverUploadOptions) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const [previewFailureKey, setPreviewFailureKey] = useState<string | null>(
    null,
  );

  const displaySrc = useMemo(
    () => buildCoverDisplayUrl(coverUrl, coverVersion),
    [coverUrl, coverVersion],
  );

  const previewKey = `${coverUrl ?? ""}:${coverVersion ?? ""}`;
  const previewFailed = previewFailureKey === previewKey;
  const showPreview = Boolean(displaySrc) && !previewFailed;

  const openPicker = useCallback(() => {
    if (disabled || uploading || deleting) {
      return;
    }

    fileInputRef.current?.click();
  }, [deleting, disabled, uploading]);

  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      setDisplayError(null);
      setPreviewFailureKey(null);

      const validationError = await validateCoverFile(file);

      if (validationError) {
        setError(validationError);
        setUploading(false);
        return;
      }

      try {
        const practiceId = await getPracticeId();

        if (!practiceId) {
          setError("Не удалось загрузить обложку.");
          return;
        }

        const formData = new FormData();
        formData.set("file", file);

        const response = await fetch(buildUploadUrl(practiceId), {
          method: "POST",
          body: formData,
        });

        let payload: {
          product?: AuthorProductDetail;
          cover_url?: string;
          message?: string;
          error?: string;
        } | null = null;

        if (response.status === 413) {
          setError(
            "Файл слишком большой. Максимальный размер обложки — 3 МБ.",
          );
          return;
        }

        const responseText = await response.text();

        if (responseText) {
          try {
            payload = JSON.parse(responseText) as {
              product?: AuthorProductDetail;
              cover_url?: string;
              message?: string;
              error?: string;
            };
          } catch {
            if (!response.ok) {
              setError("Не удалось загрузить обложку.");
              return;
            }
          }
        }

        if (!response.ok) {
          if (payload?.message) {
            setError(payload.message);
          } else {
            setError("Не удалось загрузить обложку.");
          }
          return;
        }

        const nextCoverUrl =
          payload?.cover_url ??
          payload?.product?.practice.cover_url ??
          coverUrl;

        onUpdated?.({
          coverUrl: nextCoverUrl ?? null,
          product: payload?.product,
        });

        setError(null);
        setDisplayError(null);
        setPreviewFailureKey(null);
      } catch {
        setError("Не удалось загрузить обложку.");
      } finally {
        setUploading(false);
      }
    },
    [coverUrl, buildUploadUrl, getPracticeId, onUpdated],
  );

  const deleteCover = useCallback(async () => {
    if (!coverUrl) {
      return;
    }

    if (!window.confirm(deleteConfirmMessage)) {
      return;
    }

    setDeleting(true);
    setError(null);
    setDisplayError(null);

    try {
      const practiceId = await getPracticeId();

      if (!practiceId) {
        setError("Не удалось удалить обложку.");
        return;
      }

      const response = await fetch(buildDeleteUrl(practiceId), {
        method: "DELETE",
      });

      let payload: {
        product?: AuthorProductDetail;
        cover_url?: string | null;
      } | null = null;

      const responseText = await response.text();

      if (responseText) {
        try {
          payload = JSON.parse(responseText) as {
            product?: AuthorProductDetail;
            cover_url?: string | null;
          };
        } catch {
          if (!response.ok) {
            setError("Не удалось удалить обложку.");
            return;
          }
        }
      }

      if (!response.ok) {
        setError("Не удалось удалить обложку.");
        return;
      }

      onUpdated?.({
        coverUrl: payload?.cover_url ?? null,
        product: payload?.product,
      });

      setPreviewFailureKey(null);
      setDisplayError(null);
      setError(null);
    } catch {
      setError("Не удалось удалить обложку.");
    } finally {
      setDeleting(false);
    }
  }, [coverUrl, buildDeleteUrl, deleteConfirmMessage, getPracticeId, onUpdated]);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";

      if (file) {
        void uploadFile(file);
      }
    },
    [uploadFile],
  );

  const handlePreviewLoad = useCallback(() => {
    setPreviewFailureKey(null);
    setDisplayError(null);
  }, []);

  const handlePreviewError = useCallback(() => {
    setPreviewFailureKey(previewKey);
    setDisplayError(
      "Не удалось отобразить обложку. Попробуйте загрузить файл ещё раз.",
    );
  }, [previewKey]);

  return {
    fileInputRef,
    uploading,
    deleting,
    error,
    displayError,
    displaySrc,
    showPreview,
    openPicker,
    deleteCover,
    handleFileChange,
    handlePreviewLoad,
    handlePreviewError,
    isBusy: uploading || deleting,
  };
}
