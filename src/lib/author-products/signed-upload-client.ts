/**
 * Supabase storage-js 2.110.1 serializes Blob/File uploads as multipart and
 * uses the Blob/File type for the part MIME. The contentType option alone is
 * not enough when the browser reports an empty or application/octet-stream
 * type, so wrap the bytes in a File with the canonical MIME before upload.
 */
export function fileForSignedAuthorAudioUpload(
  file: Blob,
  filename: string,
  mime: string,
): File {
  const base =
    filename
      .split(/[/\\\\]/)
      .pop()
      ?.replace(/[\u0000-\u001f]/g, "")
      .trim() || "audio";

  return new File([file], base.slice(0, 180), { type: mime });
}
