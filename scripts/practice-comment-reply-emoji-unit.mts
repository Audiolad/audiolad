#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { AUTHOR_REPLY_EMOJIS } from "../src/lib/practice-comments/copy";
import { insertImpressionEmoji } from "../src/lib/practice-comments/text";

assert.deepEqual(AUTHOR_REPLY_EMOJIS, [
  { emoji: "❤️", label: "Вставить сердечко" },
  { emoji: "🔥", label: "Вставить огонёк" },
  { emoji: "🙏", label: "Вставить смайлик благодарности" },
]);

for (const { emoji, label } of AUTHOR_REPLY_EMOJIS) {
  assert.match(label, /^Вставить [а-яё ]+$/u);
  assert.equal(emoji.length, 2);

  for (const [selectionStart, selectionEnd, body, caret] of [
    [2, 2, `аб${emoji}вг`, 4],
    [0, 0, `${emoji}абвг`, 2],
    [4, 4, `абвг${emoji}`, 6],
    [null, null, `абвг${emoji}`, 6],
    [undefined, undefined, `абвг${emoji}`, 6],
    [1, null, `абвг${emoji}`, 6],
    [null, 2, `абвг${emoji}`, 6],
    [1, 3, `а${emoji}г`, 3],
    [0, 4, emoji, 2],
  ] as const) {
    assert.deepEqual(
      insertImpressionEmoji({
        body: "абвг",
        emoji,
        selectionStart,
        selectionEnd,
        maxLength: 2000,
      }),
      { body, caret },
    );
  }

  assert.deepEqual(
    insertImpressionEmoji({
      body: "🔥🙏",
      emoji,
      selectionStart: 2,
      selectionEnd: 4,
      maxLength: 2000,
    }),
    { body: `🔥${emoji}`, caret: 4 },
  );

  for (const length of [1999, 2000]) {
    assert.equal(
      insertImpressionEmoji({
        body: "а".repeat(length),
        emoji,
        selectionStart: length,
        selectionEnd: length,
        maxLength: 2000,
      }),
      null,
    );
  }

  assert.deepEqual(
    insertImpressionEmoji({
      body: "а".repeat(1998),
      emoji,
      selectionStart: null,
      selectionEnd: null,
      maxLength: 2000,
    }),
    { body: "а".repeat(1998) + emoji, caret: 2000 },
  );
  assert.deepEqual(
    insertImpressionEmoji({
      body: "а".repeat(2000),
      emoji,
      selectionStart: 1998,
      selectionEnd: 2000,
      maxLength: 2000,
    }),
    { body: "а".repeat(1998) + emoji, caret: 2000 },
  );
}

assert.equal(AUTHOR_REPLY_EMOJIS[0].emoji.charCodeAt(1), 0xfe0f);
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const buttons = read("src/components/practice-comments/ReplyEmojiButtons.tsx");
assert.match(buttons, /type="button"/);
assert.match(buttons, /aria-label=\{label\}/);
assert.match(buttons, /min-h-11 min-w-11/);
assert.match(buttons, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/);
assert.match(buttons, /setSelectionRange\(next\.caret, next\.caret\)/);
const cabinet = read("src/components/author-dashboard/AuthorListenerFeedback.tsx");
assert.match(cabinet, /<ReplyEmojiButtons textareaRef=\{replyRef\} onChange=\{setReply\} \/>/);
assert.match(cabinet, /ref=\{replyRef\}/);
assert.doesNotMatch(read("src/components/products/practice-page/PracticeComments.tsx"), /ReplyEmojiButtons/);
assert.doesNotMatch(buttons, /—/);

console.log("practice-comment-reply-emoji-unit: ok");
