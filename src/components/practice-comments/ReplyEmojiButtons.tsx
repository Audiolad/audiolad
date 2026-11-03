"use client";

import type { RefObject } from "react";
import { flushSync } from "react-dom";

import { AUTHOR_REPLY_EMOJIS } from "@/lib/practice-comments/copy";
import { insertImpressionEmoji } from "@/lib/practice-comments/text";

export default function ReplyEmojiButtons({
  textareaRef,
  onChange,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
}) {
  function insertEmoji(emoji: string) {
    const field = textareaRef.current;
    if (!field || field.disabled || field.readOnly) return;
    const focused = field.ownerDocument.activeElement === field;
    const next = insertImpressionEmoji({
      body: field.value,
      emoji,
      selectionStart: focused ? field.selectionStart : null,
      selectionEnd: focused ? field.selectionEnd : null,
      maxLength: field.maxLength < 0 ? Infinity : field.maxLength,
    });
    if (next) {
      // Commit the controlled value before restoring the UTF-16 caret position.
      flushSync(() => onChange(next.body));
    }
    field.focus();
    if (next) field.setSelectionRange(next.caret, next.caret);
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {AUTHOR_REPLY_EMOJIS.map(({ emoji, label }) => (
        <button
          key={emoji}
          type="button"
          aria-label={label}
          title={label}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[#e4d7f4] bg-white px-2 text-xl leading-none text-[#7042c5] hover:bg-[#f7f3fc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => insertEmoji(emoji)}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
