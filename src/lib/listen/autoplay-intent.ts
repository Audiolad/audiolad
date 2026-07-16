export const LISTEN_AUTOPLAY_QUERY_PARAM = "autoplay";
export const LISTEN_AUTOPLAY_QUERY_VALUE = "1";

export function parseListenAutoplayIntent(
  value: string | null | undefined,
): boolean {
  return value === LISTEN_AUTOPLAY_QUERY_VALUE;
}

export function hasListenAutoplayIntent(searchParams: URLSearchParams): boolean {
  return parseListenAutoplayIntent(
    searchParams.get(LISTEN_AUTOPLAY_QUERY_PARAM),
  );
}

export function shouldRequestListenAutoplay(options?: {
  autoplay?: boolean;
}): boolean {
  return options?.autoplay === true;
}
