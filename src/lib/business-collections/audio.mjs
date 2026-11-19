const PRIVATE = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Stream existing private recordings without disclosing storage URLs.
 * @param {Request} request
 * @param {{hostAllowed: boolean, authorize: (collection:string,track:string)=>Promise<unknown>, sign: (track:string)=>Promise<{ok:boolean,url?:string}>, fetchAudio: typeof fetch}} deps
 */
export async function serveCollectionAudio(request, deps) {
  const denied = () => new Response(null, { status: 404, headers: PRIVATE });
  if (!deps.hostAllowed) return denied();
  const query = new URL(request.url).searchParams;
  const collection = query.get("collection") ?? "";
  const track = query.get("track") ?? "";
  if (!UUID.test(collection) || !UUID.test(track)) return denied();
  const range = request.headers.get("range");
  if (range && !/^bytes=\d*-\d*$/.test(range)) return new Response(null, { status: 416, headers: PRIVATE });
  try {
    if (!await deps.authorize(collection, track)) return denied();
    const signed = await deps.sign(track);
    if (!signed.ok || !signed.url) return denied();
    const upstream = await deps.fetchAudio(signed.url, {
      headers: range ? { Range: range } : {}, cache: "no-store", signal: request.signal,
    });
    if (![200, 206, 416].includes(upstream.status)) {
      await upstream.body?.cancel();
      return denied();
    }
    const headers = new Headers(PRIVATE);
    for (const key of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"]) {
      const value = upstream.headers.get(key);
      if (value) headers.set(key, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch { return denied(); }
}

/** Same live capability gate as audio; cover bytes are proxied, never redirected.
 * @param {Request} request
 * @param {{hostAllowed:boolean, authorize:(collection:string,track:string)=>Promise<{cover_ref:string|null,album_id:string}|null>, read:(ref:string,album:string)=>Promise<{body:Uint8Array,contentType:string}|null>}} deps
 */
export async function serveCollectionCover(request, deps) {
  const denied = () => new Response(null, { status: 404, headers: PRIVATE });
  const query = new URL(request.url).searchParams;
  const collection = query.get("collection") ?? "";
  const track = query.get("track") ?? "";
  if (!deps.hostAllowed || !UUID.test(collection) || !UUID.test(track)) return denied();
  try {
    const row = await deps.authorize(collection, track);
    if (!row?.cover_ref) return denied();
    const file = await deps.read(row.cover_ref, row.album_id);
    if (!file) return denied();
    return new Response(new Uint8Array(file.body), { headers: { ...PRIVATE, "Content-Type": file.contentType } });
  } catch { return denied(); }
}
