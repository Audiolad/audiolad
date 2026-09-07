"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import AvatarCropperModal from "@/components/images/AvatarCropperModal";
import { AVATAR_ERROR_MESSAGES } from "@/lib/images/avatar-constants";
import {
  AvatarSourceResolutionError,
  createOrientedPreviewUrl,
  peekAvatarSourceDimensions,
  shouldUseServerAvatarPreview,
  validateAvatarSourceFile,
} from "@/lib/images/avatar-source-validation";

type UseAvatarCropUploadOptions = {
  disabled?: boolean;
  onUpload: (file: File) => Promise<void>;
};

async function requestServerAvatarPreview(file: File): Promise<File> {
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch("/api/images/avatar-preview", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;
    throw new Error(payload?.message || AVATAR_ERROR_MESSAGES.processFailed);
  }

  const blob = await response.blob();

  if (!blob.size) {
    throw new Error(AVATAR_ERROR_MESSAGES.processFailed);
  }

  return new File([blob], "avatar-preview.jpg", {
    type: blob.type || "image/jpeg",
    lastModified: Date.now(),
  });
}

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
  const [isPreparingSource, setIsPreparingSource] = useState(false);
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
    if (isSavingCrop || isPreparingSource) {
      return;
    }

    setIsCropOpen(false);
    setCropImageSrc(null);
    setSourceFile(null);
    revokePreviewUrl();
  }, [isPreparingSource, isSavingCrop, revokePreviewUrl]);

  const openPicker = useCallback(() => {
    if (disabled || isSavingCrop || isPreparingSource) {
      return;
    }

    fileInputRef.current?.click();
  }, [disabled, isPreparingSource, isSavingCrop]);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";

      if (!file || disabled || isSavingCrop || isPreparingSource) {
        return;
      }

      setError(null);

      const validationError = await validateAvatarSourceFile(file);

      if (validationError) {
        setError(validationError);
        return;
      }

      revokePreviewUrl();
      setIsPreparingSource(true);

      try {
        const headerDimensions = await peekAvatarSourceDimensions(file);
        const useServerPreview = shouldUseServerAvatarPreview(file, headerDimensions);
        let previewSource = file;

        if (useServerPreview) {
          previewSource = await requestServerAvatarPreview(file);
        } else {
          try {
            const previewUrl = await createOrientedPreviewUrl(file);
            previewUrlRef.current = previewUrl;
            setSourceFile(file);
            setCropImageSrc(previewUrl);
            setIsCropOpen(true);
            return;
          } catch (previewError) {
            if (previewError instanceof AvatarSourceResolutionError) {
              throw previewError;
            }

            previewSource = await requestServerAvatarPreview(file);
          }
        }

        const previewUrl = await createOrientedPreviewUrl(previewSource);
        previewUrlRef.current = previewUrl;
        setSourceFile(previewSource);
        setCropImageSrc(previewUrl);
        setIsCropOpen(true);
      } catch (previewError) {
        setError(
          previewError instanceof Error && previewError.message.trim()
            ? previewError.message
            : AVATAR_ERROR_MESSAGES.processFailed,
        );
      } finally {
        setIsPreparingSource(false);
      }
    },
    [disabled, isPreparingSource, isSavingCrop, revokePreviewUrl],
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
    isPreparingSource,
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
