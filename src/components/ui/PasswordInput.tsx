"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";

import {
  getPasswordToggleAriaLabel,
  resolvePasswordInputType,
} from "@/components/ui/password-input-toggle";

type PasswordInputProps = Omit<ComponentPropsWithoutRef<"input">, "type">;

const toggleButtonClassName =
  "absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-[#7d70a2] transition-colors hover:text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] disabled:cursor-not-allowed disabled:opacity-50";

const iconClassName = "h-5 w-5 shrink-0";

const strokeProps = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClassName}
      aria-hidden="true"
      focusable="false"
    >
      <path
        {...strokeProps}
        d="M2.5 12.5s3.2-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.2 5.5-9.5 5.5-9.5-5.5-9.5-5.5Z"
      />
      <circle {...strokeProps} cx="12" cy="12.5" r="2.75" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className={iconClassName}
      aria-hidden="true"
      focusable="false"
    >
      <path
        {...strokeProps}
        d="M3 3.5 20.5 21M10.2 10.7A2.75 2.75 0 0 0 12 15.25c1.05 0 1.97-.58 2.45-1.45"
      />
      <path
        {...strokeProps}
        d="M6.4 6.9C4.55 8.2 3.2 10.1 2.5 12.5c0 0 3.2 5.5 9.5 5.5 1.55 0 2.95-.35 4.2-.95M9.7 5.45C10.45 5.3 11.2 5.25 12 5.25c6.3 0 9.5 5.5 9.5 5.5a11.6 11.6 0 0 1-2.35 3.05"
      />
    </svg>
  );
}

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, disabled, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const pendingSelectionRef = useRef<{
      start: number | null;
      end: number | null;
    } | null>(null);

    const setRefs = useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;

        if (typeof ref === "function") {
          ref(node);
          return;
        }

        if (ref) {
          ref.current = node;
        }
      },
      [ref],
    );

    useEffect(() => {
      const input = inputRef.current;
      const selection = pendingSelectionRef.current;

      if (!input || !selection) {
        return;
      }

      input.setSelectionRange(selection.start, selection.end);
      pendingSelectionRef.current = null;
    }, [visible]);

    function handleToggleVisibility() {
      const input = inputRef.current;

      if (input) {
        pendingSelectionRef.current = {
          start: input.selectionStart,
          end: input.selectionEnd,
        };
      }

      setVisible((current) => !current);
    }

    const inputClassName = [className, "pr-12"].filter(Boolean).join(" ");

    return (
      <div className="relative w-full">
        <input
          {...props}
          ref={setRefs}
          type={resolvePasswordInputType(visible)}
          disabled={disabled}
          className={inputClassName}
        />

        <button
          type="button"
          disabled={disabled}
          aria-label={getPasswordToggleAriaLabel(visible)}
          aria-pressed={visible}
          onClick={handleToggleVisibility}
          className={toggleButtonClassName}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    );
  },
);

export default PasswordInput;
