#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { authorApplicationScreenName } from "../src/lib/author-applications/screen-name.ts";
import {
  AUTHOR_SLUG_CONFIRM_ERROR,
  AUTHOR_SLUG_PREVIEW_ERROR,
  STALE_SERVER_ACTION_MESSAGE,
  authorSlugUpdatedMessage,
  isStaleServerActionError,
} from "../src/app/(platform)/admin/authors/slug/state.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

assert.equal(authorSlugUpdatedMessage("staryy", "novyy"), "Slug обновлён: staryy – novyy");
assert.equal(authorSlugUpdatedMessage("staryy", "novyy").includes("\u2014"), false);
assert.equal(STALE_SERVER_ACTION_MESSAGE, "Сайт обновился – перезагрузите страницу");
assert.equal(STALE_SERVER_ACTION_MESSAGE.includes("\u2014"), false);
assert.equal(isStaleServerActionError(new Error('Failed to find Server Action "abc".')), true);
assert.equal(isStaleServerActionError(new Error("network")), false);
assert.equal(AUTHOR_SLUG_PREVIEW_ERROR.includes("\u2014"), false);
assert.equal(AUTHOR_SLUG_CONFIRM_ERROR.includes("\u2014"), false);

assert.equal(
  authorApplicationScreenName({
    status: "approved",
    displayName: "Старое имя",
    authorName: "Новое имя",
  }),
  "Новое имя",
);
assert.equal(
  authorApplicationScreenName({
    status: "submitted",
    displayName: "Заявка",
    authorName: "Чужое",
  }),
  "Заявка",
);
assert.equal(
  authorApplicationScreenName({
    status: "approved",
    displayName: "Заявка",
    authorName: "  ",
  }),
  "Заявка",
);

const actions = read("src/app/(platform)/admin/authors/slug/actions.ts");
assert.match(actions, /^"use server";/);
assert.doesNotMatch(actions, /export\s+(?:const|let|var|type|class)\b/);
assert.match(actions, /authorSlugUpdatedMessage/);
assert.match(actions, /unstable_rethrow/);
assert.match(actions, /AUTHOR_SLUG_PREVIEW_ERROR/);
assert.match(actions, /AUTHOR_SLUG_CONFIRM_ERROR/);

const form = read("src/components/admin/ChangeAuthorSlugForm.tsx");
assert.match(form, /STALE_SERVER_ACTION_MESSAGE/);
assert.match(form, /buildAuthorPublicPath\(done\.slug\)/);
assert.match(form, /Открыть страницу автора/);
assert.doesNotMatch(form, /https?:\/\//);
assert.doesNotMatch(form, /\u2014/);
assert.doesNotMatch(form, /→/);

const profile = read("src/app/api/author/profile/route.ts");
assert.match(profile, /syncApprovedAuthorApplicationDisplayName/);
const sync = read("src/lib/author-applications/sync-approved-display-name.server.ts");
assert.match(sync, /\.eq\("status", "approved"\)/);
assert.match(sync, /display_name: displayName/);
assert.doesNotMatch(sync, /email|phone|contact_details/);

const queries = read("src/lib/admin/queries.ts");
assert.match(queries, /authorApplicationScreenName/);
const detail = read("src/app/(platform)/admin/author-applications/[id]/page.tsx");
const review = read("src/components/admin/AuthorApplicationReviewForm.tsx");
assert.match(detail, /authorApplicationScreenName/);
assert.match(review, /authorApplicationScreenName/);

const suggestion = read("src/components/author-dashboard/AuthorProfileClient.tsx");
assert.match(suggestion, /canSuggestAuthorSlug/);
assert.match(suggestion, /\/admin\/authors\/slug\?lookup=/);
assert.match(suggestion, /Название изменилось – адрес страницы можно привести к/);

console.log("author-slug-admin-unit: ok");
