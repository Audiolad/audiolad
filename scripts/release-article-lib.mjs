#!/usr/bin/env node
/**
 * Shared helpers for deploy/scripts/release-article.sh
 * Commands:
 *   expect --git-workdir <dir> --sha <sha> --url <url>
 *   expect --source <file> --url <url>
 *   smoke --html <file> --expect <json-file>
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

function fail(message) {
  process.stderr.write(`BLOCKED: ${message}\n`);
  process.exit(1);
}

function extractQuoted(source, key) {
  const re = new RegExp(`\\b${key}\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`);
  const match = source.match(re);
  if (!match) return null;
  return JSON.parse(`"${match[1]}"`);
}

function extractAllQuoted(source, key) {
  const re = new RegExp(`\\b${key}\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "g");
  const values = [];
  let match;
  while ((match = re.exec(source))) {
    values.push(JSON.parse(`"${match[1]}"`));
  }
  return values;
}

function parseUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    fail(`invalid URL ${rawUrl}`);
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "audiolad.ru" && host !== "www.audiolad.ru") {
    fail(`URL host must be audiolad.ru, got ${parsed.hostname}`);
  }
  const parts = parsed.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts.length !== 2 || !["listens", "articles"].includes(parts[0])) {
    fail(`URL must be /listens/<slug> or /articles/<slug>, got ${parsed.pathname}`);
  }
  return {
    url: `https://audiolad.ru/${parts[0]}/${parts[1]}`,
    kind: parts[0] === "listens" ? "listen" : "article",
    slug: parts[1],
  };
}

function contentPath(kind, slug) {
  return kind === "listen"
    ? `src/lib/seo/listens/content/${slug}.ts`
    : `src/lib/seo/articles/content/${slug}.ts`;
}

function loadSource({ gitWorkdir, sha, sourcePath, kind, slug }) {
  if (sourcePath) return readFileSync(sourcePath, "utf8");
  if (!gitWorkdir || !sha) fail("expect needs --source or --git-workdir and --sha");
  const path = contentPath(kind, slug);
  try {
    return execFileSync("git", ["-C", gitWorkdir, "show", `${sha}:${path}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    fail(`no content file ${path} at ${sha}`);
  }
}

function buildExpect(source, page) {
  const { kind, slug, url } = page;
  if (kind === "listen") {
    const h1 = extractQuoted(source, "h1");
    const title = extractQuoted(source, "title");
    const description = extractQuoted(source, "description");
    const playlistSlug = extractQuoted(source, "playlistSlug");
    if (!h1 || !title || !description || !playlistSlug) {
      fail("listen definition is missing h1/title/description/playlistSlug");
    }
    const introMatch = source.match(/intro\s*:\s*\[\s*"((?:\\.|[^"\\])*)"/);
    const intro0 = introMatch ? JSON.parse(`"${introMatch[1]}"`) : null;
    const sectionTitles = [];
    const sectionBlock = source.split(/sections\s*:\s*\[/)[1] || "";
    for (const value of extractAllQuoted(sectionBlock, "title")) {
      sectionTitles.push(value);
    }
    const faqBlock = source.split(/faq\s*:\s*\[/)[1] || "";
    const faqQuestions = extractAllQuoted(faqBlock, "question");
    const hrefs = extractAllQuoted(source, "href").filter((href) =>
      href.startsWith("/listens/") || href.startsWith("/articles/") || href.startsWith("https://audiolad.ru/listens/") || href.startsWith("https://audiolad.ru/articles/")
    );
    const indexableRaw = source.match(/\bindexable\s*:\s*(true|false)/);
    return {
      kind,
      slug,
      url,
      h1,
      title,
      description,
      playlistSlug,
      intro0,
      section0: sectionTitles[0] || null,
      faqQuestions,
      hrefs,
      indexable: indexableRaw ? indexableRaw[1] === "true" : true,
    };
  }

  const h1 = extractQuoted(source, "title");
  const title = extractQuoted(source, "metaTitle");
  const description = extractQuoted(source, "metaDescription");
  if (!h1 || !title || !description) {
    fail("article definition is missing title/metaTitle/metaDescription");
  }
  const faqBlock = source.split(/faq\s*:\s*\[/)[1] || "";
  const faqQuestions = extractAllQuoted(faqBlock, "question");
  const hrefs = extractAllQuoted(source, "href").filter((href) =>
    href.startsWith("/listens/") || href.startsWith("/articles/") || href.startsWith("https://audiolad.ru/")
  );
  const lead = extractQuoted(source, "leadBeforeAudio");
  return {
    kind,
    slug,
    url,
    h1,
    title,
    description,
    playlistSlug: null,
    intro0: lead,
    section0: null,
    faqQuestions,
    hrefs,
    indexable: true,
  };
}

function firstMatch(html, patterns) {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function status(cond) {
  return cond ? "OK" : "FAILED";
}

function smoke(html, expect) {
  const titleText = firstMatch(html, [/<title>([\s\S]*?)<\/title>/i]);
  const canonical = firstMatch(html, [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i,
  ]);
  const description = firstMatch(html, [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i,
  ]);
  const robots = (firstMatch(html, [
    /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']robots["']/i,
  ]) || "").toLowerCase();

  const h1Ok = html.includes(expect.h1);
  const titleOk = Boolean(titleText && titleText.trim() === expect.title);
  const descOk = Boolean(description && description.trim() === expect.description);
  const canonOk = Boolean(canonical && canonical.replace(/\/+$/, "") === expect.url);
  const robotsOk = expect.indexable
    ? robots.includes("index") && robots.includes("follow") && !robots.includes("noindex")
    : robots.includes("noindex");
  const ssrOk = h1Ok && (!expect.intro0 || html.includes(expect.intro0)) && (!expect.section0 || html.includes(expect.section0));
  const faqOk = expect.faqQuestions.length
    ? expect.faqQuestions.every((question) => html.includes(question))
    : null;
  const hrefOk = expect.hrefs.length
    ? expect.hrefs.every((href) => {
        const path = href.replace("https://audiolad.ru", "");
        return html.includes(`href="${path}"`) || html.includes(`href="${href}"`) || html.includes(`href="https://audiolad.ru${path}"`);
      })
    : null;

  const jsonldNeeded = ['"Article"', '"WebPage"', '"Organization"', '"FAQPage"', '"BreadcrumbList"'];
  const jsonldOk = jsonldNeeded.every((token) => html.includes(token));
  const breadcrumbOk = html.includes("BreadcrumbList");

  let playlist = "NOT_AVAILABLE";
  let listenAll = "NOT_AVAILABLE";
  let jsonld = status(jsonldOk);
  if (expect.kind === "listen") {
    const embedOk = html.includes('data-public-playlist-embed="true"');
    const slugOk = html.includes(`data-playlist-slug="${expect.playlistSlug}"`);
    playlist = status(embedOk && slugOk);
    listenAll = status(html.includes("Слушать всё"));
    const forbidden = ["MusicPlaylist", "AudioObject", "primaryPractice"];
    jsonld = status(jsonldOk && html.includes('"ItemList"') && !forbidden.some((token) => html.includes(token)));
  }

  return {
    H1: status(h1Ok),
    METADATA: status(titleOk && descOk),
    CANONICAL: status(canonOk),
    ROBOTS: status(robotsOk),
    SSR: status(ssrOk),
    PLAYLIST: playlist,
    PLAYLIST_SLUG: expect.playlistSlug || "NOT_AVAILABLE",
    LISTEN_ALL: listenAll,
    FAQ: faqOk === null ? "NOT_AVAILABLE" : status(faqOk),
    JSONLD: jsonld,
    BREADCRUMB: status(breadcrumbOk),
    INTERNAL_LINKS: hrefOk === null ? "NOT_AVAILABLE" : status(hrefOk),
  };
}

const command = process.argv[2];
if (command === "expect") {
  const url = arg("--url");
  if (!url) fail("missing --url");
  const page = parseUrl(url);
  const source = loadSource({
    gitWorkdir: arg("--git-workdir"),
    sha: arg("--sha"),
    sourcePath: arg("--source"),
    kind: page.kind,
    slug: page.slug,
  });
  process.stdout.write(`${JSON.stringify(buildExpect(source, page), null, 2)}\n`);
  process.exit(0);
}

if (command === "smoke") {
  const htmlPath = arg("--html");
  const expectPath = arg("--expect");
  if (!htmlPath || !expectPath) fail("smoke needs --html and --expect");
  const html = readFileSync(htmlPath, "utf8");
  const expect = JSON.parse(readFileSync(expectPath, "utf8"));
  const report = smoke(html, expect);
  for (const [key, value] of Object.entries(report)) {
    process.stdout.write(`${key}=${value}\n`);
  }
  process.exit(0);
}

fail("usage: release-article-lib.mjs expect|smoke ...");
