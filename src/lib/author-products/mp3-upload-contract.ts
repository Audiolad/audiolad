/**
 * Compatibility shim. Prefer `product-audio-upload-contract` for source formats.
 * Prefer product-audio-upload-contract for live ordinary formats.
 */
export {
  PRACTICE_AUDIO_BUCKET,
  MAX_PRODUCT_AUDIO_BYTES,
  PRODUCT_AUDIO_MAX_MB,
  PRODUCT_AUDIO_TOO_LARGE_MESSAGE,
  PRODUCT_AUDIO_WRONG_TYPE_MESSAGE,
  PRODUCT_AUDIO_SIZE_HINT,
  ALLOWED_PRODUCT_MP3_MIME_TYPES,
  isAllowedProductMp3Name,
  isAllowedProductMp3Mime,
  isAllowedProductMp3Type,
  isProductMp3SizeAllowed,
  validateProductMp3Descriptor,
  validateProductMp3FileClient,
  validateProductAudioFileClient,
  PRODUCT_AUDIO_FILE_ACCEPT,
  buildVersionedProductAudioPath,
  isOwnedVersionedProductAudioPath,
  hasExistingMusicCurrentAudio,
  shouldBlockProductAudioReplacement,
  shouldBlockMusicAudioReplacement,
  canAbandonProductAudioUploadPath,
  type ProductAudioDescriptor as ProductMp3Descriptor,
  type ProductAudioValidationCode as ProductMp3ValidationCode,
  type MusicCurrentAudioPointers,
} from "@/lib/author-products/product-audio-upload-contract";
