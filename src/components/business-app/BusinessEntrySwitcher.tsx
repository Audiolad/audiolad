"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useBusinessHostname, useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import { businessCabinetHomePath, normalizeBusinessAppPathname } from "@/lib/business-app/host";

import Link from "next/link";

import { useBusinessCabinetMode, useBusinessEntry } from "@/components/business-app/BusinessPointMode";
import { BUSINESS_OWNER_UNLOCK_PATH } from "@/lib/business-app/cabinet-mode";
import { businessEntrySwitchAction, type BusinessEntry } from "@/lib/business-app/live-refresh";
import {
  BUSINESS_OWNER_NAME_PLACEHOLDER,
  BUSINESS_PROFILE_NAME_HREF,
  focusBusinessOwnerNameField,
} from "@/lib/business-app/profile";

type EntryOption = {
  id: "person" | "venue";
  label: string;
  /** Screen reader name when the visible label is a placeholder. */
  ariaLabel?: string;
  /** The label is a hint («Ваше имя»), not a real name. */
  placeholder?: boolean;
  testId: string;
  selected: boolean;
  /** `true` – focus moved elsewhere (the profile name field); do not return it to the trigger. */
  onSelect: () => boolean | void;
};

/**
 * Header dropdown: the person's name and the venue name. Guests do not see it.
 * The trigger shows the current choice (cut with an ellipsis); the list shows full names.
 */
export default function BusinessEntrySwitcher() {
  const domain = useBusinessDomain();
  const hostname = useBusinessHostname();
  const cabinet = useBusinessCabinetMode();
  // The hall device (also while the owner unlock lasts): no preview switch on it.
  const point = cabinet.pointReports;
  const { entry, setEntry } = useBusinessEntry();
  const router = useRouter();
  const pathname = normalizeBusinessAppPathname(usePathname() ?? "");
  const [hint, setHint] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;

  const close = useCallback((focusTrigger: boolean) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  if (cabinet.mode === "point") {
    // Hall device: the venue name and the way into the owner cabinet (password again, cabinet-mode.ts).
    const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    return (
      <div className="business-entry-switcher business-entry-switcher--point" data-testid="biz-entry-switcher" data-mode="point">
        <span className="business-entry-switcher__value" data-testid="biz-point-venue">{cabinet.pointVenueName || "Кофейня"}</span>
        <Link
          href={`${BUSINESS_OWNER_UNLOCK_PATH}${next}`}
          className="business-entry-switcher__owner-link business-app-focus-ring"
          data-testid="biz-owner-unlock-link"
        >
          Кабинет владельца
        </Link>
      </div>
    );
  }

  if (domain.status !== "authenticated" || !domain.location) return null;

  /**
   * The switch used to change only client state that the home screen reads, so on any other
   * screen nothing changed and on home the top of the page looked the same. Now the cabinet
   * opens home for the chosen side (or re-reads it at once when already there) and scrolls up.
   */
  const switchTo = (next: BusinessEntry) => {
    setEntry(next);
    const action = businessEntrySwitchAction(pathname);
    if (action.kind === "navigate") {
      router.push(action.href === "/" ? businessCabinetHomePath(hostname) : action.href);
      return;
    }
    window.scrollTo({ top: 0 });
    router.refresh();
  };

  const person = domain.owner.firstName.trim();
  const venue = domain.location.name.trim() || "Кофейня";
  const personOn = point || entry === "person";
  const venueOn = !point && entry === "venue";

  /**
   * No name yet: the row reads «Ваше имя» and opens «Профиль» with the name field focused,
   * so the owner sees where to set it. The person side is chosen too.
   */
  const openNameField = (): true => {
    setEntry("person");
    if (pathname === "/profile" && focusBusinessOwnerNameField()) return true;
    router.push(BUSINESS_PROFILE_NAME_HREF);
    return true;
  };

  const options: EntryOption[] = [
    {
      id: "person",
      label: person || BUSINESS_OWNER_NAME_PLACEHOLDER,
      ariaLabel: person ? undefined : "Ваше имя – указать в профиле",
      placeholder: !person,
      testId: "biz-entry-person",
      selected: personOn,
      onSelect: () => {
        setHint(null);
        if (!person) return openNameField();
        switchTo("person");
      },
    },
    {
      id: "venue",
      label: venue,
      // Owner phone: the venue side is a preview of the hall device menu (same table, no reports).
      ariaLabel: `${venue} – как видит точка`,
      testId: "biz-entry-venue",
      selected: venueOn,
      onSelect: () => {
        if (point) {
          setHint("Это устройство в зале. Чтобы вернуть его в режим точки, нажмите «Вернуть режим точки».");
          return;
        }
        setHint(null);
        switchTo("venue");
      },
    },
  ];
  const current = options.find((option) => option.selected) ?? options[0];
  const currentIndex = Math.max(0, options.indexOf(current));

  const openList = (index: number) => {
    setActiveIndex(index);
    setOpen(true);
  };

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    // The name field keeps the focus: returning it to the trigger would stop typing.
    const focusMoved = option.onSelect() === true;
    close(!focusMoved);
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openList(currentIndex);
    }
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => (index >= last ? 0 : index + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => (index <= 0 ? last : index - 1));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(last);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(activeIndex);
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className="business-entry-switcher" data-testid="biz-entry-switcher" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="business-entry-switcher__trigger"
        data-testid="biz-entry-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Что открыто: ${current.ariaLabel ?? current.label}`}
        title={current.ariaLabel ?? current.label}
        onClick={() => (open ? close(false) : openList(currentIndex))}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="business-entry-switcher__value" data-placeholder={current.placeholder ? "true" : undefined}>{current.label}</span>
        <svg
          className="business-entry-switcher__chevron"
          viewBox="0 0 20 20"
          width="16"
          height="16"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label="Что открыто"
          aria-activedescendant={`${baseId}-opt-${options[activeIndex]?.id ?? current.id}`}
          className="business-entry-switcher__menu"
          data-testid="biz-entry-menu"
          onKeyDown={onListKeyDown}
        >
          {options.map((option, index) => (
            <li
              key={option.id}
              id={`${baseId}-opt-${option.id}`}
              role="option"
              aria-selected={option.selected}
              aria-label={option.ariaLabel}
              className="business-entry-switcher__option"
              data-checked={option.selected ? "true" : "false"}
              data-active={index === activeIndex ? "true" : "false"}
              data-testid={option.testId}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
            >
              <span className="business-entry-switcher__option-label" data-placeholder={option.placeholder ? "true" : undefined}>
                {option.label}
              </span>
              {option.selected ? (
                <svg
                  className="business-entry-switcher__check"
                  viewBox="0 0 20 20"
                  width="16"
                  height="16"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M4.5 10.5 8.5 14.5 15.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {hint ? (
        <p className="business-entry-switcher__hint" role="status" data-testid="biz-entry-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
