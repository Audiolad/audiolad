"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  AUTHOR_BANNER_ERROR_MESSAGES,
  AUTHOR_BANNER_UPLOAD_HINT,
  validateAuthorBannerFile,
} from "@/lib/authors/banner-validation-client";
import {
  getDefaultBannerPosition,
  normalizeStoredBannerPosition,
  type BannerPosition,
} from "@/lib/authors/banner-position";
import type { AuthorProfileDetail } from "@/lib/authors/profile";

export type AuthorBannerUploadResult = {
  url: string | null;
  bannerPosition: BannerPosition;
};

function readBannerPositionFromProfile(
  profile: AuthorProfileDetail | undefined,
): BannerPosition {
  if (!profile) return getDefaultBannerPosition();
  return normalizeStoredBannerPosition({
    banner_position_x: profile.banner_position_x,
    banner_position_y: profile.banner_position_y,
  });
}

export function useAuthorBannerUpload({
  assetUrl,
  authorId,
  onUpdated,
  onUploadComplete,
  disabled = false,
}: {
  assetUrl: string | null;
  authorId: string;
  onUpdated?: (result: AuthorBannerUploadResult) => void;
  onUploadComplete?: (result: AuthorBannerUploadResult) => void;
  disabled?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  const displaySrc = localPreviewUrl ?? (assetUrl?.trim() || null);
  const showPreview = Boolean(displaySrc) && !previewFailed;
  const isBusy = uploading || deleting;

  const clearLocalPreview = useCallback(() => {
    setLocalPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, []);

  useEffect(
    () => () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    },
    [localPreviewUrl],
  );

  const uploadBanner = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      setPreviewFailed(false);
      try {
        const formData = new FormData();
        formData.set("author_id", authorId);
        formData.set("file", file);
        const response = await fetch("/api/author/profile/banner", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { message?: string }
            | null;
          throw new Error(
            payload?.message ?? AUTHOR_BANNER_ERROR_MESSAGES.saveFailed,
          );
        }
        const payload = (await response.json()) as {
          url?: string | null;
          profile?: AuthorProfileDetail;
        };
        const result: AuthorBannerUploadResult = {
          url: payload.url ?? null,
          bannerPosition: readBannerPositionFromProfile(payload.profile),
        };
        clearLocalPreview();
        onUpdated?.(result);
        onUploadComplete?.(result);
      } finally {
        setUploading(false);
      }
    },
    [authorId, clearLocalPreview, onUpdated, onUploadComplete],
  );

  const openPicker = useCallback(() => {
    if (disabled || isBusy) return;
    fileInputRef.current?.click();
  }, [disabled, isBusy]);

  const deleteAsset = useCallback(async () => {
    if (disabled || isBusy || !assetUrl) return;
    if (!window.confirm("Удалить баннер?")) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/author/profile/banner?author_id=${encodeURIComponent(authorId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("delete_failed");
      const payload = (await response.json()) as { profile?: AuthorProfileDetail };
      clearLocalPreview();
      onUpdated?.({
        url: null,
        bannerPosition: readBannerPositionFromProfile(payload.profile),
      });
    } catch {
      setError("Не удалось удалить изображение.");
    } finally {
      setDeleting(false);
    }
  }, [assetUrl, authorId, clearLocalPreview, disabled, isBusy, onUpdated]);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || disabled || isBusy) return;
      const validationError = await validateAuthorBannerFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setError(null);
      setPreviewFailed(false);
      const nextPreviewUrl = URL.createObjectURL(file);
      setLocalPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextPreviewUrl;
      });
      try {
        await uploadBanner(file);
      } catch (uploadError) {
        clearLocalPreview();
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : AUTHOR_BANNER_ERROR_MESSAGES.saveFailed,
        );
      }
    },
    [clearLocalPreview, disabled, isBusy, uploadBanner],
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
    uploadHint: AUTHOR_BANNER_UPLOAD_HINT,
  };
}
