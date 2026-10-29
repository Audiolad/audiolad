"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import { useBusinessEntry, usePointMode } from "@/components/business-app/BusinessPointMode";

type EntryOption = {
  id: "person" | "venue";
  label: string;
  /** Screen reader name when the visible label is a placeholder. */
  ariaLabel?: string;
  testId: string;
  selected: boolean;
  onSelect: () => void;
};

/**
 * Header dropdown: the person's name and the venue name. Guests do not see it.
 * The trigger shows the current choice (cut with an ellipsis); the list shows full names.
 */
export default function BusinessEntrySwitcher() {
  const domain = useBusinessDomain();
  const point = usePointMode();
  const { entry, setEntry } = useBusinessEntry();
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

  if (domain.status !== "authenticated" || !domain.location) return null;

  const person = domain.owner.firstName.trim();
  const venue = domain.location.name.trim() || "Кофейня";
  const personOn = !point && entry === "person";
  const venueOn = point || entry === "venue";

  const options: EntryOption[] = [
    {
      id: "person",
      label: person || "–",
      ariaLabel: person ? undefined : "Имя не указано",
      testId: "biz-entry-person",
      selected: personOn,
      onSelect: () => {
        if (point) {
          setHint("Войдите со своего телефона. Это устройство только играет музыку в зале.");
          return;
        }
        setHint(null);
        setEntry("person");
      },
    },
    {
      id: "venue",
      label: venue,
      testId: "biz-entry-venue",
      selected: venueOn,
      onSelect: () => {
        setHint(null);
        if (!point) setEntry("venue");
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
    option.onSelect();
    close(true);
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
        <span className="business-entry-switcher__value">{current.label}</span>
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
              <span className="business-entry-switcher__option-label">{option.label}</span>
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
          {hint}{" "}
          <a href="https://audiolad.ru/auth/sign-in">Войти</a>
        </p>
      ) : null}
    </div>
  );
}
