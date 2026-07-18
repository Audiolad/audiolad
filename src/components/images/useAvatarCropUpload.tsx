"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import AvatarCropperModal from "@/components/images/AvatarCropperModal";
import { AVATAR_ERROR_MESSAGES } from "@/lib/images/avatar-constants";
import {
  createOrientedPreviewUrl,
  validateAvatarSourceFile,
} from "@/lib/images/avatar-source-validation";

type UseAvatarCropUploadOptions = {
  disabled?: boolean;
  onUpload: (file: File) => Promise<void>;
};

export function useAvatarCropUpload({
  disabled = false,
  onUpload,
}: UseAvatarCropUploadOptions) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [isSavingCrop, setIsSavingCrop] = useState(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);

  const revokePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      revokePreviewUrl();
    };
  }, [revokePreviewUrl]);

  const closeCropper = useCallback(() => {
    if (isSavingCrop) {
      return;
    }

    setIsCropOpen(false);
    setCropImageSrc(null);
    setSourceFile(null);
    revokePreviewUrl();
  }, [isSavingCrop, revokePreviewUrl]);

  const openPicker = useCallback(() => {
    if (disabled || isSavingCrop) {
      return;
    }

    fileInputRef.current?.click();
  }, [disabled, isSavingCrop]);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";

      if (!file || disabled || isSavingCrop) {
        return;
      }

      setError(null);

      const validationError = await validateAvatarSourceFile(file);

      if (validationError) {
        setError(validationError);
        return;
      }

      revokePreviewUrl();

      try {
        const previewUrl = await createOrientedPreviewUrl(file);
        previewUrlRef.current = previewUrl;
        setSourceFile(file);
        setCropImageSrc(previewUrl);
        setIsCropOpen(true);
      } catch {
        setError(AVATAR_ERROR_MESSAGES.readFailed);
      }
    },
    [disabled, isSavingCrop, revokePreviewUrl],
  );

  const handleCropConfirm = useCallback(
    async (croppedFile: File) => {
      setIsSavingCrop(true);
      setError(null);

      try {
        await onUpload(croppedFile);
        closeCropper();
      } catch {
        setError(AVATAR_ERROR_MESSAGES.saveFailed);
      } finally {
        setIsSavingCrop(false);
      }
    },
    [closeCropper, onUpload],
  );

  const cropper = (
    <AvatarCropperModal
      imageSrc={cropImageSrc ?? ""}
      sourceBlob={sourceFile ?? new Blob()}
      sourceMime={sourceFile?.type}
      isOpen={isCropOpen && Boolean(cropImageSrc && sourceFile)}
      isSaving={isSavingCrop}
      onCancel={closeCropper}
      onConfirm={handleCropConfirm}
    />
  );

  return {
    fileInputRef,
    error,
    setError,
    openPicker,
    handleFileChange,
    cropper,
    isCropOpen,
    isSavingCrop,
    sourceFile,
  };
}

export function appendAvatarCacheBuster(
  url: string | null | undefined,
  cacheBuster?: string | number,
): string | null {
  if (!url?.trim()) {
    return null;
  }

  if (cacheBuster === undefined) {
    return url;
  }

  try {
    const nextUrl = new URL(url);
    nextUrl.searchParams.set("v", String(cacheBuster));
    return nextUrl.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}v=${encodeURIComponent(String(cacheBuster))}`;
  }
}
