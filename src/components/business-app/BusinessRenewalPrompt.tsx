"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  BUSINESS_RENEWAL_CONFIRM_CANCEL,
  BUSINESS_RENEWAL_CONFIRM_TEXT,
  BUSINESS_RENEWAL_CONFIRM_YES,
  BUSINESS_RENEWAL_IMPROVEMENT_QUESTION,
  BUSINESS_RENEWAL_IMPROVEMENT_SEND,
  BUSINESS_RENEWAL_NO_LABEL,
  BUSINESS_RENEWAL_NOTE_MAX,
  BUSINESS_RENEWAL_QUESTION,
  BUSINESS_RENEWAL_THANKS_DEVICE,
  BUSINESS_RENEWAL_THANKS_OWNER,
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

export function BusinessRenewalThanks({
  surface,
  onNote,
}: {
  surface: "owner" | "device";
  onNote: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <div className="space-y-3" data-testid="biz-renewal-thanks">
      <p className="text-[1.05rem] text-[var(--biz-text)]">
        {surface === "owner" ? BUSINESS_RENEWAL_THANKS_OWNER : BUSINESS_RENEWAL_THANKS_DEVICE}
      </p>
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
      {sent ? null : (
        <button
          type="button"
          className="business-app-btn business-app-btn-secondary business-app-focus-ring"
          disabled={!normalizeRenewalNote(note)}
          onClick={() => {
            const next = normalizeRenewalNote(note);
            if (!next) return;
            onNote(next);
            setSent(true);
          }}
          data-testid="biz-renewal-feedback-send"
        >
          {BUSINESS_RENEWAL_IMPROVEMENT_SEND}
        </button>
      )}
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
  const [confirmDismissed, setConfirmDismissed] = useState(false);
  const [wantsConfirm, setWantsConfirm] = useState(false);
  const posted = useRef(false);

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
      onAnswer?.(choice);
      setSaved(choice);
    });
  }, [hashChoice, onAnswer, surface]);

  const phase: BusinessRenewalPhase =
    saved === "no"
      ? "thanks"
      : surface === "device" && !confirmDismissed && (wantsConfirm || hashChoice === "no")
        ? "confirm"
        : "ask";

  if (phase === "confirm") {
    return (
      <BusinessRenewalConfirm
        onCancel={() => {
          setWantsConfirm(false);
          setConfirmDismissed(true);
        }}
        onYes={() => {
          void saveRenewalChoice("no").then((ok) => {
            if (!ok) return;
            onAnswer?.("no");
            setSaved("no");
          });
        }}
      />
    );
  }
  if (phase === "thanks") {
    return (
      <BusinessRenewalThanks
        surface={surface}
        onNote={(note) => {
          void saveRenewalChoice("no", note);
        }}
      />
    );
  }
  return (
    <BusinessRenewalAsk
      onYes={() => {
        void saveRenewalChoice("yes").then((ok) => {
          if (!ok) return;
          onAnswer?.("yes");
        });
      }}
      onNo={() => {
        if (surface === "device") {
          setWantsConfirm(true);
          return;
        }
        void saveRenewalChoice("no").then((ok) => {
          if (!ok) return;
          onAnswer?.("no");
          setSaved("no");
        });
      }}
    />
  );
}
