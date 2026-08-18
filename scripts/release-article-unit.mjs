#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIB = join(ROOT, "scripts/release-article-lib.mjs");
const SHA = "abe09717518b9bcdb738f8c041e68f05c1b9d289";
const LISTEN_URL = "https://audiolad.ru/listens/meditatsiya-na-izobilie-slushat-onlayn-besplatno";

function run(args) {
  return execFileSync("node", [LIB, ...args], { encoding: "utf8" });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const listen = JSON.parse(
  run(["expect", "--git-workdir", ROOT, "--sha", SHA, "--url", LISTEN_URL]),
);
assert(listen.kind === "listen", "kind");
assert(listen.h1 === "Медитация на изобилие: слушать онлайн бесплатно", "h1");
assert(listen.title === listen.h1, "title === h1");
assert(
  listen.description ===
    "Слушайте медитации на изобилие онлайн бесплатно на АудиоЛаде. Выберите подходящую практику из подборки и начните прослушивание.",
  "description",
);
assert(listen.playlistSlug === "meditaciya-na-dengi", "playlistSlug");
assert(listen.faqQuestions.length === 8, "faq count");
assert(listen.hrefs.includes("/listens/meditatsiya-na-dengi-slushat-onlayn-besplatno"), "dengi href");
assert(listen.hrefs.includes("/listens/denezhnaya-meditatsiya-slushat-onlayn-besplatno"), "denezhnaya href");

const article = JSON.parse(
  run([
    "expect",
    "--git-workdir",
    ROOT,
    "--sha",
    SHA,
    "--url",
    "https://audiolad.ru/articles/meditatsiya-na-izobilie",
  ]),
);
assert(article.kind === "article", "article kind");
assert(article.title.includes("АудиоЛад"), "article metaTitle");
assert(article.playlistSlug === null, "article has no playlist");

let failed = false;
try {
  run(["expect", "--git-workdir", ROOT, "--sha", SHA, "--url", "https://audiolad.ru/listens/missing-slug"]);
} catch {
  failed = true;
}
assert(failed, "missing slug is blocked");

console.log("release-article-unit: 3/3 OK");
