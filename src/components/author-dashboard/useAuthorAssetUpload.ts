"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  appendAvatarCacheBuster,
  useAvatarCropUpload,
} from "@/components/images/useAvatarCropUpload";
import {
  AUTHOR_BANNER_ERROR_MESSAGES,
  AUTHOR_BANNER_UPLOAD_HINT,
  validateAuthorBannerFile,
} from "@/lib/authors/banner-validation-client";
import { AVATAR_ERROR_MESSAGES, AVATAR_UPLOAD_HINT } from "@/lib/images/avatar-constants";

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
  const bannerFileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  const displaySrc =
    localPreviewUrl ?? (assetUrl?.trim() || null);
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
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

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
                : AVATAR_ERROR_MESSAGES.saveFailed),
          );
        }

        const payload = (await response.json()) as { url?: string | null };
        const nextUrl = appendAvatarCacheBuster(
          payload.url ?? null,
          Date.now(),
        );
        if (kind === "banner") {
          clearLocalPreview();
        }
        onUpdated?.({ url: nextUrl });
      } finally {
        setUploading(false);
      }
    },
    [authorId, clearLocalPreview, kind, onUpdated],
  );

  const {
    fileInputRef: avatarFileInputRef,
    error: avatarCropError,
    openPicker: openAvatarPicker,
    handleFileChange: handleAvatarFileChange,
    cropper,
    isSavingCrop,
  } = useAvatarCropUpload({
    disabled: disabled || isBusy,
    onUpload: uploadAsset,
  });

  const openPicker = useCallback(() => {
    if (disabled || isBusy || isSavingCrop) {
      return;
    }

    if (kind === "avatar") {
      openAvatarPicker();
      return;
    }

    bannerFileInputRef.current?.click();
  }, [disabled, isBusy, isSavingCrop, kind, openAvatarPicker]);

  const deleteAsset = useCallback(async () => {
    if (disabled || isBusy || isSavingCrop) {
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
  }, [assetUrl, authorId, disabled, isBusy, isSavingCrop, kind, onUpdated]);

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
    uploading: uploading || isSavingCrop,
    deleting,
    error: kind === "avatar" ? avatarCropError ?? error : error,
    displaySrc,
    showPreview,
    openPicker,
    deleteAsset,
    handleFileChange:
      kind === "avatar" ? handleAvatarFileChange : handleBannerFileChange,
    isBusy: isBusy || isSavingCrop,
    setPreviewFailed,
    cropper: kind === "avatar" ? cropper : null,
    uploadHint:
      kind === "avatar" ? AVATAR_UPLOAD_HINT : AUTHOR_BANNER_UPLOAD_HINT,
  };
}
