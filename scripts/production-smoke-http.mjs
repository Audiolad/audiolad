#!/usr/bin/env node
/**
 * Lightweight HTTP smoke for deploy pipeline (no browser).
 *
 * Env:
 *   AUDIOLAD_SMOKE_BASE_URL — default https://audiolad.ru
 */
const BASE = (process.env.AUDIOLAD_SMOKE_BASE_URL ?? "https://audiolad.ru").replace(
  /\/$/,
  "",
);
const TIMEOUT_MS = Number(process.env.AUDIOLAD_SMOKE_TIMEOUT_MS ?? 30_000);

const results = [];
const pass = (name) => results.push({ name, ok: true });
const fail = (name, detail) => results.push({ name, ok: false, detail });

const IPHONE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

async function fetchResponse(path, { accept = "text/html,application/json", ua } = {}) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers = { Accept: accept };
    if (ua) {
      headers["User-Agent"] = ua;
    }
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers,
    });
    const body = await response.text();
    return {
      url,
      status: response.status,
      body,
      contentType: response.headers.get("content-type") ?? "",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(path) {
  return fetchResponse(path);
}

async function checkRoute(name, path, { status = 200, includes = [] } = {}) {
  const { url, status: got, body } = await fetchText(path);
  if (got !== status) {
    fail(name, `expected HTTP ${status}, got ${got} for ${url}`);
    return;
  }
  for (const needle of includes) {
    if (!body.includes(needle)) {
      fail(name, `body missing "${needle}" at ${url}`);
      return;
    }
  }
  pass(name);
}

async function main() {
  await checkRoute("health_build", "/api/health/build", { status: 200 });
  await checkRoute("guest_home", "/", {
    status: 200,
    includes: ["Аудио, которое помогает вернуться к себе"],
  });
  await checkRoute("catalog", "/catalog", { status: 200 });
  const catalog = await fetchResponse("/catalog", { ua: IPHONE_SAFARI_UA });
  if (catalog.status !== 200) {
    fail("iphone_catalog", `expected HTTP 200, got ${catalog.status}`);
  } else if (
    !catalog.body.includes('aria-label="Основная навигация"') ||
    !catalog.body.includes("bottom-nav bottom-nav--default")
  ) {
    fail(
      "iphone_catalog_ssr_bottom_nav",
      "catalog SSR HTML missing BottomNav",
    );
  } else {
    pass("iphone_catalog");
    pass("iphone_catalog_ssr_bottom_nav");
  }
  await checkRoute("privacy", "/privacy", { status: 200 });

  const home = await fetchResponse("/", { ua: IPHONE_SAFARI_UA });
  if (home.status !== 200) {
    fail("iphone_home", `expected HTTP 200, got ${home.status}`);
  } else {
    pass("iphone_home");
    if (
      !home.body.includes('aria-label="Основная навигация"') ||
      !home.body.includes("bottom-nav bottom-nav--default")
    ) {
      fail(
        "iphone_home_ssr_bottom_nav",
        "SSR HTML missing BottomNav (aria-label / bottom-nav--default)",
      );
    } else {
      pass("iphone_home_ssr_bottom_nav");
    }
    const cssHrefs = [
      ...home.body.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g),
    ].map((match) => match[1]);
    const jsSrcs = [
      ...home.body.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g),
    ].map((match) => match[1]);
    const uniqueCss = [...new Set(cssHrefs)];
    const uniqueJs = [...new Set(jsSrcs)];

    if (uniqueCss.length === 0) {
      fail("home_css_urls", "home HTML has no stylesheet href");
    }

    for (const href of uniqueCss) {
      const asset = await fetchResponse(href, {
        accept: "text/css,*/*;q=0.1",
        ua: IPHONE_SAFARI_UA,
      });
      if (asset.status !== 200 || !asset.contentType.includes("text/css")) {
        fail(
          `css:${href}`,
          `status=${asset.status} content-type=${asset.contentType}`,
        );
      } else {
        pass(`css:${href}`);
      }
    }

    for (const src of uniqueJs) {
      const asset = await fetchResponse(src, {
        accept: "application/javascript,*/*;q=0.1",
        ua: IPHONE_SAFARI_UA,
      });
      if (asset.status !== 200) {
        fail(`js:${src}`, `status=${asset.status}`);
      } else {
        pass(`js:${src}`);
      }
    }
  }

  const logo = await fetchResponse(
    "/_next/image?url=%2Fbrand%2Faudiolad-logo-horizontal.png&w=640&q=75",
    { accept: "image/webp,image/png,image/*;q=0.8", ua: IPHONE_SAFARI_UA },
  );
  if (logo.status !== 200 || !logo.contentType.startsWith("image/")) {
    fail("logo_image", `status=${logo.status} content-type=${logo.contentType}`);
  } else {
    pass("logo_image");
  }

  const sw = await fetchResponse("/sw.js", {
    accept: "*/*",
    ua: IPHONE_SAFARI_UA,
  });
  if (sw.status !== 200 || !sw.contentType.includes("javascript")) {
    fail("sw.js", `status=${sw.status} content-type=${sw.contentType}`);
  } else {
    pass("sw.js");
  }

  const manifest = await fetchResponse("/manifest.webmanifest", {
    accept: "application/manifest+json",
    ua: IPHONE_SAFARI_UA,
  });
  if (manifest.status !== 200) {
    fail("manifest", `status=${manifest.status}`);
  } else {
    pass("manifest");
  }

  const listen = await fetchResponse(
    "/listen/sergey-and-zoya/vozvraschenie-k-sebe-posle-razvoda",
    { ua: IPHONE_SAFARI_UA },
  );
  if (listen.status !== 200) {
    fail("iphone_listen", `expected HTTP 200, got ${listen.status}`);
  } else if (
    !listen.body.includes('aria-label="Основная навигация"') ||
    !listen.body.includes("bottom-nav bottom-nav--player")
  ) {
    fail(
      "iphone_listen_ssr_bottom_nav",
      "listen SSR HTML missing player BottomNav",
    );
  } else {
    pass("iphone_listen");
    pass("iphone_listen_ssr_bottom_nav");
  }

  const schoolHost = new URL(BASE).hostname;
  if (schoolHost === "audiolad.ru" || schoolHost === "www.audiolad.ru") {
    const school = await fetchResponse("https://school.audiolad.ru/", {
      ua: IPHONE_SAFARI_UA,
    });
    if (school.status !== 200) {
      fail("school_home", `expected HTTP 200, got ${school.status}`);
    } else if (school.body.includes('aria-label="Основная навигация"')) {
      fail(
        "school_no_bottom_nav",
        "school host SSR HTML must not include BottomNav",
      );
    } else {
      pass("school_home");
      pass("school_no_bottom_nav");
    }
  } else {
    pass("school_bottom_nav_skipped_non_prod");
  }

  pass("auth_scenario_skipped_http");

  const failed = results.filter((item) => !item.ok);
  console.log(JSON.stringify({ base: BASE, mode: "http", results }, null, 2));

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  fail("smoke_http", error instanceof Error ? error.message : String(error));
  console.log(JSON.stringify({ base: BASE, mode: "http", results }, null, 2));
  process.exit(1);
});
