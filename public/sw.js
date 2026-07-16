/* eslint-disable no-restricted-globals */
/**
 * Audiolad PWA service worker.
 * - Navigations and private pages: network-only (no HTML cache).
 * - Hashed Next.js assets: stale-while-revalidate.
 * - Explicit public PWA assets only: cache-first with background refresh.
 */

const CACHE_VERSION = "audiolad-pwa-v2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const NEVER_CACHE_PREFIXES = [
  "/api/",
  "/auth/",
  "/listen/",
  "/profile",
  "/my-practices",
  "/playlists",
  "/history",
  "/settings",
  "/checkout/",
  "/author-dashboard/",
];

const CACHEABLE_PUBLIC_PATHS = new Set([
  "/manifest.webmanifest",
  "/sw.js",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-1024.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/favicon-48x48.png",
  "/favicon-64x64.png",
]);

function shouldSkipCaching(url, request) {
  if (request.method !== "GET") {
    return true;
  }

  if (url.origin !== self.location.origin) {
    return true;
  }

  if (request.headers.get("range")) {
    return true;
  }

  if (request.credentials === "include" && request.mode === "navigate") {
    return true;
  }

  if (NEVER_CACHE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    return true;
  }

  return false;
}

function isHashedStaticAsset(pathname) {
  return pathname.startsWith("/_next/static/");
}

function isCacheablePublicAsset(pathname) {
  return CACHEABLE_PUBLIC_PATHS.has(pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("audiolad-pwa-") && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (shouldSkipCaching(url, request)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request));
    return;
  }

  if (isHashedStaticAsset(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);

        const networkFetch = fetch(request)
          .then((response) => {
            if (response.ok && response.type === "basic") {
              void cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);

        return cached || networkFetch;
      }),
    );
    return;
  }

  if (isCacheablePublicAsset(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);

        if (cached) {
          void fetch(request)
            .then((response) => {
              if (response.ok && response.type === "basic") {
                void cache.put(request, response.clone());
              }
            })
            .catch(() => undefined);

          return cached;
        }

        const response = await fetch(request);

        if (response.ok && response.type === "basic") {
          void cache.put(request, response.clone());
        }

        return response;
      }),
    );
  }
});
