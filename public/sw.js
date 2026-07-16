/* eslint-disable no-restricted-globals */
/**
 * Audiolad PWA service worker — deploy-safe caching policy.
 *
 * Network-only (SW does not intercept):
 * - HTML navigation
 * - RSC / flight data
 * - Server Actions
 * - /_next/static/* (browser HTTP cache only; no SW stale chunks)
 * - /api/*, auth, Supabase, personalized routes
 *
 * Cache-first (public immutable assets only):
 * - manifest, icons, favicons
 */

const CACHE_VERSION = "audiolad-pwa-v3";
const STATIC_CACHE = `${CACHE_VERSION}-public`;

const NEVER_CACHE_PREFIXES = [
  "/api/",
  "/auth/",
  "/rest/v1/",
  "/storage/v1/",
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

function isRscRequest(request) {
  if (request.headers.get("RSC") === "1") {
    return true;
  }

  if (request.headers.get("Next-Router-State-Tree")) {
    return true;
  }

  if (request.headers.get("Next-Action")) {
    return true;
  }

  const accept = request.headers.get("Accept") ?? "";

  return accept.includes("text/x-component");
}

function shouldBypassServiceWorker(url, request) {
  if (request.method !== "GET") {
    return true;
  }

  if (url.origin !== self.location.origin) {
    return true;
  }

  if (request.headers.get("range")) {
    return true;
  }

  if (request.mode === "navigate") {
    return true;
  }

  if (isRscRequest(request)) {
    return true;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    return true;
  }

  if (url.pathname.startsWith("/_next/data/")) {
    return true;
  }

  if (NEVER_CACHE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    return true;
  }

  return false;
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
            .filter((key) => key.startsWith("audiolad-pwa-"))
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

  if (shouldBypassServiceWorker(url, request)) {
    return;
  }

  if (!isCacheablePublicAsset(url.pathname)) {
    return;
  }

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
});
