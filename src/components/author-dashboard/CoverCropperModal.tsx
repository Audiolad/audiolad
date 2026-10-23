"use client";

import AvatarCropperModal from "@/components/images/AvatarCropperModal";
import {
  COVER_CROP_MAX_OUTPUT,
  MIN_COVER_DIMENSION,
} from "@/lib/author-products/cover-validation-client";

type CoverCropperModalProps = {
  imageSrc: string;
  sourceFile: File;
  isOpen: boolean;
  isSaving?: boolean;
  externalError?: string | null;
  onCancel: () => void;
  onConfirm: (file: File) => void | Promise<void>;
};

export default function CoverCropperModal({
  imageSrc,
  sourceFile,
  isOpen,
  isSaving = false,
  externalError = null,
  onCancel,
  onConfirm,
}: CoverCropperModalProps) {
  return (
    <AvatarCropperModal
      imageSrc={imageSrc}
      sourceBlob={sourceFile}
      sourceMime={sourceFile.type}
      isOpen={isOpen}
      isSaving={isSaving}
      title="Кадрирование обложки"
      description="Перемещайте изображение пальцем или мышью и меняйте масштаб жестом или ползунком. Предпросмотр – квадрат 1:1, который сохранится в карточке и на странице продукта."
      confirmLabel="Использовать обложку"
      frameLabel="Предпросмотр"
      externalError={externalError}
      minCropSourcePx={MIN_COVER_DIMENSION}
      maxOutputSize={COVER_CROP_MAX_OUTPUT}
      outputFileBase="cover"
      cropKind="cover"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
