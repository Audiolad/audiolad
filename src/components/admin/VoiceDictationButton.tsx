"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

import { createDictation, insertDictation, speechRecognitionCtor } from "@/lib/admin/voice-dictation";

const noSubscribe = () => () => undefined;

/**
 * Microphone button for a comment field (7a6fc09c): press, speak Russian, the recognized text is inserted at the
 * caret (or the end) and stays editable. Second press stops. Hidden when the browser has no Web Speech API.
 * No audio reaches this app; only text is written into the field.
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
  const dictation = useRef<ReturnType<typeof createDictation> | null>(null);

  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);
  useEffect(() => () => dictation.current?.abort(), []);

  function session() {
    if (dictation.current) return dictation.current;
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return null;
    dictation.current = createDictation(Ctor, {
      onInterim: setInterim,
      onListening: setListening,
      onError: setError,
      onFinal: (text) => {
        const area = fieldRef.current;
        if (!area) return;
        const caret = area.dataset.voiceCaret ? Number(area.dataset.voiceCaret) : null;
        // The controlled textarea's DOM value is the current field value.
        const next = insertDictation(area.value, caret, text);
        area.dataset.voiceCaret = String(next.caret);
        changeRef.current(next.value);
      },
    });
    return dictation.current;
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
          onMouseDown={() => {
            // remember the caret before the textarea loses focus
            const area = fieldRef.current;
            if (area && document.activeElement === area) area.dataset.voiceCaret = String(area.selectionStart);
            else if (area) delete area.dataset.voiceCaret;
          }}
          onClick={() => {
            setError(null);
            const d = session();
            if (!d) return;
            if (listening) d.stop();
            else d.start();
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
