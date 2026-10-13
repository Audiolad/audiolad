"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

import { bindDictation, speechRecognitionCtor } from "@/lib/admin/voice-dictation";

const noSubscribe = () => () => undefined;

/**
 * Microphone button for a comment field (7a6fc09c): press, speak Russian, the recognized text is inserted at the
 * caret (or the end) and stays editable. Second press stops. Hidden when the browser has no Web Speech API.
 * The session ends when the button becomes disabled (form busy), when the field's form is submitted, and on
 * unmount; one dictation on the page at a time. No audio reaches this app; only text is written into the field.
 */
export function VoiceDictationButton({
  field,
  fieldRef,
  onChange,
  disabled = false,
}: {
  field: string;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  // Client-only capability check: false on the server, so the button never renders where it cannot work.
  const supported = useSyncExternalStore(noSubscribe, () => speechRecognitionCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const changeRef = useRef(onChange);
  const binding = useRef<ReturnType<typeof bindDictation> | null>(null);

  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);
  // Form busy / disabled: end the session at once (late results are ignored).
  useEffect(() => {
    binding.current?.setDisabled(disabled);
  }, [disabled]);
  // Submit of the field's form ends the session too.
  useEffect(() => {
    const form = fieldRef.current?.form;
    if (!form) return;
    const onSubmit = () => binding.current?.submit();
    form.addEventListener("submit", onSubmit, true);
    return () => form.removeEventListener("submit", onSubmit, true);
  }, [fieldRef]);
  // Unmount: stop the microphone.
  useEffect(() => () => binding.current?.dispose(), []);

  function bind() {
    if (binding.current) return binding.current;
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return null;
    binding.current = bindDictation({
      Ctor,
      getField: () => fieldRef.current,
      isFocused: () => typeof document !== "undefined" && document.activeElement === fieldRef.current,
      onChange: (next) => changeRef.current(next),
      onInterim: setInterim,
      onListening: setListening,
      onError: setError,
    });
    return binding.current;
  }

  return (
    <span className="inline-flex flex-col items-start" data-voice-field={field}>
      {supported ? (
        <button
          type="button"
          disabled={disabled}
          aria-pressed={listening}
          aria-label={listening ? "Остановить диктовку" : "Надиктовать голосом"}
          title={listening ? "Остановить диктовку" : "Надиктовать голосом"}
          data-voice-button={field}
          onMouseDown={() => bind()?.rememberCaret()}
          onClick={() => {
            setError(null);
            bind()?.toggle();
          }}
          className={`mt-1 inline-flex min-h-9 items-center gap-1 rounded-lg border px-3 py-1 text-sm font-semibold disabled:opacity-60 ${
            listening ? "border-[#9f1239] bg-[#fff1f2] text-[#9f1239]" : "border-[#d9cdf0] bg-white text-[#4b2a8a]"
          }`}
        >
          {listening ? (
            <>
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#e11d48]" aria-hidden="true" /> Идёт запись — нажмите, чтобы остановить
            </>
          ) : (
            <>🎤 Голосом</>
          )}
        </button>
      ) : null}
      {listening && interim ? (
        <span className="mt-1 text-xs italic text-[#796ba0]" data-voice-interim>
          {interim}
        </span>
      ) : null}
      {error ? (
        <span className="mt-1 text-xs text-[#9f1239]" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
