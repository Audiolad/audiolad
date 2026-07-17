"use client";

import { useCallback, useRef, useState } from "react";

import { validateCoverFile } from "@/lib/author-products/cover-validation-client";

export type AuthorAssetUploadResult = {
  url: string | null;
};

type UseAuthorAssetUploadOptions = {
  assetUrl: string | null;
  authorId: string;
  kind: "avatar" | "banner";
  onUpdated?: (result: AuthorAssetUploadResult) => void;
  disabled?: boolean;
};

export function useAuthorAssetUpload({
  assetUrl,
  authorId,
  kind,
  onUpdated,
  disabled = false,
}: UseAuthorAssetUploadOptions) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  const displaySrc = assetUrl?.trim() || null;
  const showPreview = Boolean(displaySrc) && !previewFailed;
  const isBusy = uploading || deleting;

  const openPicker = useCallback(() => {
    if (disabled || isBusy) {
      return;
    }

    fileInputRef.current?.click();
  }, [disabled, isBusy]);

  const deleteAsset = useCallback(async () => {
    if (disabled || isBusy) {
      return;
    }

    if (!assetUrl) {
      return;
    }

    if (!window.confirm(kind === "avatar" ? "Удалить фото?" : "Удалить баннер?")) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/author/profile/${kind}?author_id=${encodeURIComponent(authorId)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error("delete_failed");
      }

      onUpdated?.({ url: null });
    } catch {
      setError("Не удалось удалить изображение.");
    } finally {
      setDeleting(false);
    }
  }, [assetUrl, authorId, disabled, isBusy, kind, onUpdated]);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";

      if (!file || disabled || isBusy) {
        return;
      }

      const validationError = await validateCoverFile(file);

      if (validationError) {
        setError(validationError);
        return;
      }

      setUploading(true);
      setError(null);
      setPreviewFailed(false);

      try {
        const formData = new FormData();
        formData.set("author_id", authorId);
        formData.set("file", file);

        const response = await fetch(`/api/author/profile/${kind}`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("upload_failed");
        }

        const payload = (await response.json()) as { url?: string | null };
        onUpdated?.({ url: payload.url ?? null });
      } catch {
        setError("Не удалось загрузить изображение.");
      } finally {
        setUploading(false);
      }
    },
    [authorId, disabled, isBusy, kind, onUpdated],
  );

  return {
    fileInputRef,
    uploading,
    deleting,
    error,
    displaySrc,
    showPreview,
    openPicker,
    deleteAsset,
    handleFileChange,
    isBusy,
    setPreviewFailed,
  };
}
