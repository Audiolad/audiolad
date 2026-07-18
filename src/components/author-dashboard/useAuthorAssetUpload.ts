"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { validateCoverFile } from "@/lib/author-products/cover-validation-client";
import {
  AUTHOR_BANNER_ERROR_MESSAGES,
  AUTHOR_BANNER_UPLOAD_HINT,
  validateAuthorBannerFile,
} from "@/lib/authors/banner-validation-client";

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
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  const displaySrc =
    kind === "banner"
      ? localPreviewUrl ?? (assetUrl?.trim() || null)
      : assetUrl?.trim() || null;
  const showPreview = Boolean(displaySrc) && !previewFailed;
  const isBusy = uploading || deleting;

  const clearLocalPreview = useCallback(() => {
    setLocalPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return null;
    });
  }, []);

  useEffect(() => {
    if (kind !== "banner") {
      return;
    }

    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [kind, localPreviewUrl]);

  const uploadAsset = useCallback(
    async (file: File) => {
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
          const payload = (await response.json().catch(() => null)) as
            | { message?: string }
            | null;
          throw new Error(
            payload?.message ??
              (kind === "banner"
                ? AUTHOR_BANNER_ERROR_MESSAGES.saveFailed
                : "Не удалось загрузить изображение."),
          );
        }

        const payload = (await response.json()) as { url?: string | null };
        if (kind === "banner") {
          clearLocalPreview();
        }
        onUpdated?.({ url: payload.url ?? null });
      } finally {
        setUploading(false);
      }
    },
    [authorId, clearLocalPreview, kind, onUpdated],
  );

  const openPicker = useCallback(() => {
    if (disabled || isBusy) {
      return;
    }

    if (kind === "avatar") {
      avatarFileInputRef.current?.click();
      return;
    }

    bannerFileInputRef.current?.click();
  }, [disabled, isBusy, kind]);

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

      if (kind === "banner") {
        clearLocalPreview();
      }

      onUpdated?.({ url: null });
    } catch {
      setError("Не удалось удалить изображение.");
    } finally {
      setDeleting(false);
    }
  }, [assetUrl, authorId, clearLocalPreview, disabled, isBusy, kind, onUpdated]);

  const handleAvatarFileChange = useCallback(
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

      setError(null);
      setPreviewFailed(false);

      try {
        await uploadAsset(file);
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "Не удалось загрузить изображение.",
        );
      }
    },
    [disabled, isBusy, uploadAsset],
  );

  const handleBannerFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";

      if (!file || disabled || isBusy) {
        return;
      }

      const validationError = await validateAuthorBannerFile(file);

      if (validationError) {
        setError(validationError);
        return;
      }

      setError(null);
      setPreviewFailed(false);

      const nextPreviewUrl = URL.createObjectURL(file);
      setLocalPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }

        return nextPreviewUrl;
      });

      try {
        await uploadAsset(file);
      } catch (uploadError) {
        clearLocalPreview();
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : AUTHOR_BANNER_ERROR_MESSAGES.saveFailed,
        );
      }
    },
    [clearLocalPreview, disabled, isBusy, uploadAsset],
  );

  return {
    fileInputRef: kind === "avatar" ? avatarFileInputRef : bannerFileInputRef,
    uploading,
    deleting,
    error,
    displaySrc,
    showPreview,
    openPicker,
    deleteAsset,
    handleFileChange:
      kind === "avatar" ? handleAvatarFileChange : handleBannerFileChange,
    isBusy,
    setPreviewFailed,
    uploadHint: kind === "banner" ? AUTHOR_BANNER_UPLOAD_HINT : undefined,
  };
}
