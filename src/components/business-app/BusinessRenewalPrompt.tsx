"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  BUSINESS_RENEWAL_CHANGE_LABEL,
  BUSINESS_RENEWAL_CONFIRM_CANCEL,
  BUSINESS_RENEWAL_CONFIRM_TEXT,
  BUSINESS_RENEWAL_CONFIRM_YES,
  BUSINESS_RENEWAL_IMPROVEMENT_QUESTION,
  BUSINESS_RENEWAL_IMPROVEMENT_SEND,
  BUSINESS_RENEWAL_NO_LABEL,
  BUSINESS_RENEWAL_NOTE_ERROR,
  BUSINESS_RENEWAL_NOTE_MAX,
  BUSINESS_RENEWAL_NOTE_SENT,
  BUSINESS_RENEWAL_QUESTION,
  BUSINESS_RENEWAL_RETRY_LABEL,
  BUSINESS_RENEWAL_THANKS_DEVICE,
  BUSINESS_RENEWAL_THANKS_OWNER,
  BUSINESS_RENEWAL_THANKS_YES,
  BUSINESS_RENEWAL_YES_LABEL,
  normalizeRenewalNote,
  parseRenewalChoiceHash,
  type BusinessRenewalAnswer,
} from "@/lib/business/renewal-choice";

export type BusinessRenewalPhase = "ask" | "confirm" | "thanks";

export function BusinessRenewalAsk({
  onYes,
  onNo,
}: {
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="space-y-3" data-testid="biz-renewal-question">
      <p className="text-[1.05rem] text-[var(--biz-text)]">{BUSINESS_RENEWAL_QUESTION}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="business-app-btn business-app-btn-primary business-app-focus-ring" onClick={onYes} data-testid="biz-renewal-yes">
          {BUSINESS_RENEWAL_YES_LABEL}
        </button>
        <button type="button" className="business-app-btn business-app-btn-secondary business-app-focus-ring" onClick={onNo} data-testid="biz-renewal-no">
          {BUSINESS_RENEWAL_NO_LABEL}
        </button>
      </div>
    </div>
  );
}

export function BusinessRenewalConfirm({
  onYes,
  onCancel,
}: {
  onYes: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="business-app-card space-y-3" role="dialog" aria-modal="true" data-testid="biz-renewal-confirm">
      <p className="text-[1.05rem] text-[var(--biz-text)]">{BUSINESS_RENEWAL_CONFIRM_TEXT}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="business-app-btn business-app-btn-primary business-app-focus-ring" onClick={onYes} data-testid="biz-renewal-confirm-yes">
          {BUSINESS_RENEWAL_CONFIRM_YES}
        </button>
        <button type="button" className="business-app-btn business-app-btn-secondary business-app-focus-ring" onClick={onCancel} data-testid="biz-renewal-confirm-cancel">
          {BUSINESS_RENEWAL_CONFIRM_CANCEL}
        </button>
      </div>
    </div>
  );
}

function BusinessRenewalChange({ onChange }: { onChange: () => void }) {
  return (
    <button
      type="button"
      className="business-app-focus-ring text-sm text-[var(--biz-text-muted)] underline"
      onClick={onChange}
      data-testid="biz-renewal-change"
    >
      {BUSINESS_RENEWAL_CHANGE_LABEL}
    </button>
  );
}

export function BusinessRenewalThanksYes({ onChange }: { onChange: () => void }) {
  return (
    <div className="space-y-2" data-testid="biz-renewal-thanks-yes">
      <p className="text-[1.05rem] text-[var(--biz-text)]">{BUSINESS_RENEWAL_THANKS_YES}</p>
      <BusinessRenewalChange onChange={onChange} />
    </div>
  );
}

export function BusinessRenewalThanks({
  surface,
  onNote,
  onChange,
}: {
  surface: "owner" | "device";
  /** Resolves true once the note is saved; false shows an error with a retry. */
  onNote: (note: string) => Promise<boolean>;
  onChange?: () => void;
}) {
  const [note, setNote] = useState("");
  const [noteState, setNoteState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const sent = noteState === "sent";
  return (
    <div className="space-y-3" data-testid="biz-renewal-thanks">
      <p className="text-[1.05rem] text-[var(--biz-text)]">
        {surface === "owner" ? BUSINESS_RENEWAL_THANKS_OWNER : BUSINESS_RENEWAL_THANKS_DEVICE}
      </p>
      {sent ? (
        <p className="text-sm text-[var(--biz-text-muted)]" role="status" data-testid="biz-renewal-feedback-sent">
          {BUSINESS_RENEWAL_NOTE_SENT}
        </p>
      ) : (
        <>
          <label className="block space-y-2" data-testid="biz-renewal-feedback">
            <span className="text-sm text-[var(--biz-text-muted)]">{BUSINESS_RENEWAL_IMPROVEMENT_QUESTION}</span>
            <textarea
              className="business-app-input w-full"
              style={{ minHeight: "88px", paddingTop: "0.6rem", paddingBottom: "0.6rem" }}
              maxLength={BUSINESS_RENEWAL_NOTE_MAX}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {noteState === "error" ? (
            <p className="text-sm text-[var(--biz-text)]" role="alert" data-testid="biz-renewal-feedback-error">
              {BUSINESS_RENEWAL_NOTE_ERROR}
            </p>
          ) : null}
          <button
            type="button"
            className="business-app-btn business-app-btn-secondary business-app-focus-ring"
            disabled={!normalizeRenewalNote(note) || noteState === "sending"}
            onClick={() => {
              const next = normalizeRenewalNote(note);
              if (!next) return;
              setNoteState("sending");
              void onNote(next).then(
                (ok) => setNoteState(ok ? "sent" : "error"),
                () => setNoteState("error"),
              );
            }}
            data-testid={noteState === "error" ? "biz-renewal-feedback-retry" : "biz-renewal-feedback-send"}
          >
            {noteState === "error" ? BUSINESS_RENEWAL_RETRY_LABEL : BUSINESS_RENEWAL_IMPROVEMENT_SEND}
          </button>
        </>
      )}
      {onChange ? <BusinessRenewalChange onChange={onChange} /> : null}
    </div>
  );
}

async function saveRenewalChoice(answer: BusinessRenewalAnswer, note?: string): Promise<boolean> {
  const response = await fetch("/api/business/subscription/renewal-choice", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer, note: note ?? null }),
  });
  return response.ok;
}

function subscribeRenewalHash(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange);
  return () => window.removeEventListener("hashchange", onStoreChange);
}

function readRenewalHash(): BusinessRenewalAnswer | null {
  return parseRenewalChoiceHash(window.location.hash);
}

/** Drops «#prodlenie?otvet=…» after it is saved, so a reload does not overwrite a later change. */
function clearRenewalHash() {
  if (!parseRenewalChoiceHash(window.location.hash)) return;
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
}

export function BusinessRenewalController({
  surface,
  initialAnswer = null,
  onAnswer,
}: {
  surface: "owner" | "device";
  initialAnswer?: BusinessRenewalAnswer | null;
  onAnswer?: (answer: BusinessRenewalAnswer) => void;
}) {
  const hashChoice = useSyncExternalStore(subscribeRenewalHash, readRenewalHash, () => null);
  const [saved, setSaved] = useState<BusinessRenewalAnswer | null>(initialAnswer);
  const [editing, setEditing] = useState(false);
  const [confirmDismissed, setConfirmDismissed] = useState(false);
  const [wantsConfirm, setWantsConfirm] = useState(false);
  const posted = useRef(false);

  const commit = (choice: BusinessRenewalAnswer, fromHash = false) => {
    void saveRenewalChoice(choice).then((ok) => {
      if (!ok) {
        if (fromHash) posted.current = false;
        return;
      }
      if (fromHash) clearRenewalHash();
      onAnswer?.(choice);
      setSaved(choice);
      setEditing(false);
      setWantsConfirm(false);
    });
  };

  useEffect(() => {
    if (!hashChoice || posted.current) return;
    if (hashChoice === "no" && surface === "device") return;
    posted.current = true;
    const choice = hashChoice;
    void saveRenewalChoice(choice).then((ok) => {
      if (!ok) {
        posted.current = false;
        return;
      }
      clearRenewalHash();
      onAnswer?.(choice);
      setSaved(choice);
    });
  }, [hashChoice, onAnswer, surface]);

  const startEditing = () => {
    setEditing(true);
    setConfirmDismissed(false);
    setWantsConfirm(false);
  };

  const wantsDeviceConfirm =
    surface === "device" && !confirmDismissed && (wantsConfirm || hashChoice === "no");

  if (!editing && saved === "no") {
    return (
      <BusinessRenewalThanks
        surface={surface}
        onNote={(note) => saveRenewalChoice("no", note)}
        onChange={startEditing}
      />
    );
  }
  if (!editing && saved === "yes") {
    return <BusinessRenewalThanksYes onChange={startEditing} />;
  }
  if (wantsDeviceConfirm) {
    return (
      <BusinessRenewalConfirm
        onCancel={() => {
          setWantsConfirm(false);
          setConfirmDismissed(true);
        }}
        onYes={() => {
          posted.current = true;
          commit("no", hashChoice === "no");
        }}
      />
    );
  }
  return (
    <BusinessRenewalAsk
      onYes={() => commit("yes")}
      onNo={() => {
        if (surface === "device") {
          setConfirmDismissed(false);
          setWantsConfirm(true);
          return;
        }
        commit("no");
      }}
    />
  );
}
