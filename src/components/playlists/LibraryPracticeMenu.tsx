"use client";

import { useEffect, useId, useRef, useState } from "react";

import AddToPlaylistSheet from "@/components/playlists/AddToPlaylistSheet";

type LibraryPracticeMenuProps = {
  practiceId: string;
  practiceTitle: string;
};

export default function LibraryPracticeMenu({
  practiceId,
  practiceTitle,
}: LibraryPracticeMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuButtonId = useId();

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;

      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [menuOpen]);

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          ref={triggerRef}
          type="button"
          id={menuButtonId}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Дополнительное меню"
          className="px-2 text-2xl leading-none text-[#8f82ad] hover:text-[#7042c5]"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((open) => !open);
          }}
        >
          ···
        </button>

        {menuOpen ? (
          <div
            role="menu"
            aria-labelledby={menuButtonId}
            className="absolute bottom-full right-0 z-20 mb-2 min-w-[200px] overflow-hidden rounded-[16px] border border-[#eadff8] bg-white shadow-[0_12px_28px_rgba(91,62,145,0.16)]"
          >
            <button
              type="button"
              role="menuitem"
              className="block w-full px-4 py-3 text-left text-sm hover:bg-[#f7f1fc]"
              onClick={() => {
                setMenuOpen(false);
                setSheetOpen(true);
              }}
            >
              Добавить в плейлист
            </button>
          </div>
        ) : null}
      </div>

      <AddToPlaylistSheet
        practiceId={practiceId}
        practiceTitle={practiceTitle}
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          queueMicrotask(() => triggerRef.current?.focus());
        }}
      />
    </>
  );
}
