"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  canUseInteractiveCoverCrop,
  COVER_NOT_SQUARE_MESSAGE,
  decideCoverUploadAction,
  isCoverSquare,
  readCoverImageDimensions,
  validateCoverFile,
} from "@/lib/author-products/cover-validation-client";
import type { AuthorProductDetail } from "@/lib/author-products/types";
import { buildProductCoverResponsiveProps } from "@/lib/products/cover-display";

export type CoverUploadResult = {
  coverUrl: string | null;
  coverImage?: unknown;
  product?: AuthorProductDetail;
};

export type UseCoverUploadOptions = {
  coverUrl: string | null;
  coverVersion: string | null;
  coverImage?: unknown;
  previewWidth?: number;
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
  coverImage,
  previewWidth = 112,
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
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const localPreviewUrlRef = useRef<string | null>(null);
  const cropUrlRef = useRef<string | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropSourceFile, setCropSourceFile] = useState<File | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [isSavingCrop, setIsSavingCrop] = useState(false);
  const [isPreparingCrop, setIsPreparingCrop] = useState(false);

  const resolvedCover = useMemo(
    () =>
      buildProductCoverResponsiveProps(
        coverUrl,
        coverImage,
        coverVersion,
        previewWidth,
      ),
    [coverImage, coverUrl, coverVersion, previewWidth],
  );

  const previewKey = `${coverUrl ?? ""}:${coverVersion ?? ""}:${localPreviewUrl ?? ""}`;
  const previewFailed = previewFailureKey === previewKey;
  const displaySrc = localPreviewUrl ?? resolvedCover.src;
  const showPreview = Boolean(displaySrc) && !previewFailed;
  const useManifestPreview = Boolean(resolvedCover.src) && !localPreviewUrl;

  useEffect(() => {
    return () => {
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
        localPreviewUrlRef.current = null;
      }

      if (cropUrlRef.current) {
        URL.revokeObjectURL(cropUrlRef.current);
        cropUrlRef.current = null;
      }
    };
  }, []);

  const clearLocalPreview = useCallback(() => {
    if (localPreviewUrlRef.current) {
      URL.revokeObjectURL(localPreviewUrlRef.current);
      localPreviewUrlRef.current = null;
    }

    setLocalPreviewUrl(null);
  }, []);

  const openPicker = useCallback(() => {
    if (disabled || uploading || deleting || isPreparingCrop || isSavingCrop || isCropOpen) {
      return;
    }

    fileInputRef.current?.click();
  }, [deleting, disabled, isCropOpen, isPreparingCrop, isSavingCrop, uploading]);

  const revokeCropUrl = useCallback(() => {
    if (cropUrlRef.current) {
      URL.revokeObjectURL(cropUrlRef.current);
      cropUrlRef.current = null;
    }
  }, []);

  const closeCropper = useCallback(() => {
    if (isSavingCrop || uploading) {
      return;
    }

    setIsCropOpen(false);
    setCropImageSrc(null);
    setCropSourceFile(null);
    revokeCropUrl();
  }, [isSavingCrop, revokeCropUrl, uploading]);

  const uploadFile = useCallback(
    async (file: File): Promise<boolean> => {
      setUploading(true);
      setError(null);
      setDisplayError(null);
      setPreviewFailureKey(null);

      const validationError = await validateCoverFile(file);

      if (validationError) {
        setError(validationError);
        setUploading(false);
        return false;
      }

      try {
        const { width, height } = await readCoverImageDimensions(file);

        if (!isCoverSquare(width, height)) {
          setError(COVER_NOT_SQUARE_MESSAGE);
          setUploading(false);
          return false;
        }
      } catch {
        setError(
          "Не удалось прочитать изображение. Проверьте файл и попробуйте снова.",
        );
        setUploading(false);
        return false;
      }

      clearLocalPreview();
      const objectUrl = URL.createObjectURL(file);
      localPreviewUrlRef.current = objectUrl;
      setLocalPreviewUrl(objectUrl);
      let saved = false;

      try {
        const practiceId = await getPracticeId();

        if (!practiceId) {
          setError("Не удалось загрузить обложку.");
          return false;
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
          cover_image?: unknown;
          message?: string;
          error?: string;
        } | null = null;

        if (response.status === 413) {
          setError(
            "Файл слишком большой. Максимальный размер обложки – 3 МБ.",
          );
          return false;
        }

        const responseText = await response.text();

        if (responseText) {
          try {
            payload = JSON.parse(responseText) as {
              product?: AuthorProductDetail;
              cover_url?: string;
              cover_image?: unknown;
              message?: string;
              error?: string;
            };
          } catch {
            if (!response.ok) {
              setError("Не удалось загрузить обложку.");
              return false;
            }
          }
        }

        if (!response.ok) {
          if (payload?.message) {
            setError(payload.message);
          } else {
            setError("Не удалось загрузить обложку.");
          }
          return false;
        }

        const nextCoverUrl =
          payload?.cover_url ??
          payload?.product?.practice.cover_url ??
          coverUrl;
        const nextCoverImage =
          payload?.cover_image ??
          payload?.product?.practice.cover_image ??
          coverImage;

        clearLocalPreview();

        onUpdated?.({
          coverUrl: nextCoverUrl ?? null,
          coverImage: nextCoverImage ?? null,
          product: payload?.product,
        });

        setError(null);
        setDisplayError(null);
        setPreviewFailureKey(null);
        saved = true;
        return true;
      } catch {
        setError("Не удалось загрузить обложку.");
        return false;
      } finally {
        if (!saved) {
          // A failed upload must not leave the unsaved file as the preview.
          clearLocalPreview();
        }
        setUploading(false);
      }
    },
    [
      buildUploadUrl,
      clearLocalPreview,
      coverImage,
      coverUrl,
      getPracticeId,
      onUpdated,
    ],
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
        cover_image?: unknown;
      } | null = null;

      const responseText = await response.text();

      if (responseText) {
        try {
          payload = JSON.parse(responseText) as {
            product?: AuthorProductDetail;
            cover_url?: string | null;
            cover_image?: unknown;
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

      clearLocalPreview();

      onUpdated?.({
        coverUrl: payload?.cover_url ?? null,
        coverImage: payload?.cover_image ?? null,
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
  }, [
    buildDeleteUrl,
    clearLocalPreview,
    coverUrl,
    deleteConfirmMessage,
    getPracticeId,
    onUpdated,
  ]);

  const openCropper = useCallback(
    (file: File) => {
      revokeCropUrl();
      const objectUrl = URL.createObjectURL(file);
      cropUrlRef.current = objectUrl;
      setCropSourceFile(file);
      setCropImageSrc(objectUrl);
      setIsCropOpen(true);
    },
    [revokeCropUrl],
  );

  const handleCropConfirm = useCallback(
    async (file: File) => {
      setIsSavingCrop(true);

      try {
        const saved = await uploadFile(file);

        if (saved) {
          setIsCropOpen(false);
          setCropImageSrc(null);
          setCropSourceFile(null);
          revokeCropUrl();
        }
      } finally {
        setIsSavingCrop(false);
      }
    },
    [revokeCropUrl, uploadFile],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";

      if (!file || disabled || uploading || deleting || isSavingCrop) {
        return;
      }

      setError(null);
      setDisplayError(null);
      setIsPreparingCrop(true);

      void (async () => {
        try {
          const validationError = await validateCoverFile(file);

          if (validationError) {
            setError(validationError);
            return;
          }

          const { width, height } = await readCoverImageDimensions(file);
          const decision = decideCoverUploadAction(
            width,
            height,
            canUseInteractiveCoverCrop(),
          );

          if (decision.action === "reject") {
            setError(decision.message);
            return;
          }

          if (decision.action === "upload") {
            await uploadFile(file);
            return;
          }

          openCropper(file);
        } catch {
          setError(
            "Не удалось прочитать изображение. Проверьте файл и попробуйте снова.",
          );
        } finally {
          setIsPreparingCrop(false);
        }
      })();
    },
    [
      deleting,
      disabled,
      isSavingCrop,
      openCropper,
      uploadFile,
      uploading,
    ],
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
    resolvedCover,
    useManifestPreview,
    showPreview,
    openPicker,
    deleteCover,
    handleFileChange,
    handlePreviewLoad,
    handlePreviewError,
    isPreparingCrop,
    isCropOpen,
    isBusy: uploading || deleting || isPreparingCrop || isSavingCrop,
    cropImageSrc,
    cropSourceFile,
    isSavingCrop,
    closeCropper,
    handleCropConfirm,
  };
}
