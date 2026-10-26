export function listenerImpressionInFeed(row: { kind?: unknown } | null | undefined): boolean {
  return row?.kind === "impression";
}

export function openListenerCommentAvatar(input: {
  feed: { kind: string } | null;
  image: { bytes: Uint8Array; contentType: string } | null;
}): Response {
  if (!listenerImpressionInFeed(input.feed) || !input.image || input.image.bytes.byteLength === 0) {
    return new Response(null, { status: 404 });
  }
  return new Response(Buffer.from(input.image.bytes), {
    status: 200,
    headers: {
      "content-type": input.image.contentType || "image/webp",
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
