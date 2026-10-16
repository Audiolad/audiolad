"use client";

import { useCallback, useMemo, useState } from "react";

import ExampleLightbox from "@/components/author-dashboard/business/ExampleLightbox";
import {
  RIGHTSHOLDER_EXAMPLES,
  SUNO_LINK_RE,
  VERIFICATION_STATUS_TEXT,
  validateEvidenceFile,
  type RightsholderEvidenceKind,
  type RightsholderExample,
} from "@/lib/business-rightsholder/examples";
import { createClient } from "@/lib/supabase/client";

export type OwnProduct = {
  id: string;
  title: string;
  tracks: { id: string; title: string }[];
};

export type ProgramDocument = {
  key: "business_program_terms" | "business_music_rights_declaration";
  version: string;
  url: string | null;
};

export type ExistingVerification = {
  status: string;
  reason: string | null;
  productId: string;
  audioItemId: string;
  trackTitle: string;
  trackUrl: string;
  attempts: number;
} | null;

type Props = {
  products: OwnProduct[];
  documents: ProgramDocument[];
  existing: ExistingVerification;
};

const EDITABLE = new Set(["draft", "needs_info", "rejected"]);
const EVIDENCE_BUCKET = "business-rightsholder-evidence";

async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function RightsholderVerificationForm({ products, documents, existing }: Props) {
  const [productId, setProductId] = useState(existing?.productId ?? products[0]?.id ?? "");
  const [audioItemId, setAudioItemId] = useState(existing?.audioItemId ?? products[0]?.tracks[0]?.id ?? "");
  const [trackTitle, setTrackTitle] = useState(existing?.trackTitle ?? "");
  const [trackUrl, setTrackUrl] = useState(existing?.trackUrl ?? "");
  const [files, setFiles] = useState<Record<RightsholderEvidenceKind, File | null>>({ generation: null, paid_period: null });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [confirmRights, setConfirmRights] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(existing?.status ?? null);
  const [example, setExample] = useState<RightsholderExample | null>(null);
  const closeExample = useCallback(() => setExample(null), []);

  const product = useMemo(() => products.find((p) => p.id === productId), [products, productId]);
  const terms = documents.find((d) => d.key === "business_program_terms");
  const rights = documents.find((d) => d.key === "business_music_rights_declaration");
  const editable = status === null || EDITABLE.has(status);

  function validate() {
    const next: Record<string, string> = {};
    if (!productId || !audioItemId) next.track = "Выберите свой опубликованный трек";
    if (!trackTitle.trim()) next.trackTitle = "Укажите название трека в Suno";
    if (!SUNO_LINK_RE.test(trackUrl.trim())) next.trackUrl = "Нужна ссылка вида https://suno.com/s/…";
    for (const kind of ["generation", "paid_period"] as const) {
      const message = validateEvidenceFile(files[kind]);
      if (message) next[kind] = message;
    }
    if (!acceptTerms) next.acceptTerms = "Отметьте согласие с условиями";
    if (!confirmRights) next.confirmRights = "Подтвердите права на музыку";
    if (!terms || !rights) next.form = "Документы программы ещё не опубликованы — отправка временно недоступна";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate() || !terms || !rights) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const draft = await supabase.rpc("author_business_verification_draft", {
        p_product_id: productId,
        p_audio_item_id: audioItemId,
        p_ai_service: "suno",
        p_ai_service_other: null,
        p_service_track_title: trackTitle.trim(),
        p_service_track_url: trackUrl.trim(),
      });
      if (draft.error) throw draft.error;
      const verificationId = draft.data as string;
      const evidenceIds: string[] = [];
      for (const kind of ["generation", "paid_period"] as const) {
        const file = files[kind]!;
        const reserved = await supabase.rpc("author_business_evidence_reserve", {
          p_verification_id: verificationId,
          p_kind: kind,
          p_mime_type: file.type,
          p_size_bytes: file.size,
          p_sha256: await sha256Hex(file),
        });
        if (reserved.error) throw reserved.error;
        const row = reserved.data as { id: string; object_path: string };
        const upload = await supabase.storage.from(EVIDENCE_BUCKET).upload(row.object_path, file, { contentType: file.type });
        if (upload.error) throw upload.error;
        evidenceIds.push(row.id);
      }
      const submitted = await supabase.rpc("author_business_verification_submit", {
        p_verification_id: verificationId,
        p_evidence_ids: evidenceIds,
        p_accept_terms: acceptTerms,
        p_confirm_rights: confirmRights,
        p_terms_version: terms.version,
        p_rights_version: rights.version,
        p_user_agent: navigator.userAgent.slice(0, 500),
      });
      if (submitted.error) throw submitted.error;
      setStatus("submitted");
      setErrors({});
    } catch (error) {
      const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
      setErrors({ form: `Не получилось отправить: ${message}. Проверьте данные и попробуйте ещё раз.` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold text-neutral-900">Подтверждение правообладателя</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Один пример на весь аккаунт: покажите, что вы создали один свой трек в Suno по платной подписке. Это не подтверждает права на весь каталог — каждый трек проверяется отдельно.
      </p>

      {status ? (
        <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm" role="status">
          <p className="font-medium text-neutral-900">{VERIFICATION_STATUS_TEXT[status] ?? status}</p>
          {existing?.reason && (status === "rejected" || status === "needs_info") ? (
            <p className="mt-1 text-neutral-700">Комментарий модератора: {existing.reason}</p>
          ) : null}
          {existing && existing.attempts > 0 ? (
            <p className="mt-1 text-neutral-500">Отправок: {existing.attempts}</p>
          ) : null}
        </div>
      ) : null}

      {editable ? (
        <form className="mt-5 space-y-5" onSubmit={onSubmit} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-neutral-800">Ваш продукт</span>
              <select
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  setAudioItemId(products.find((p) => p.id === e.target.value)?.tracks[0]?.id ?? "");
                }}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-neutral-800">Трек</span>
              <select
                className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
                value={audioItemId}
                onChange={(e) => setAudioItemId(e.target.value)}
              >
                {(product?.tracks ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
              {errors.track ? <span className="mt-1 block text-red-600">{errors.track}</span> : null}
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-neutral-800">Название трека в Suno</span>
              <input className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2" value={trackTitle}
                onChange={(e) => setTrackTitle(e.target.value)} placeholder="Spa relaxation jazz background" />
              {errors.trackTitle ? <span className="mt-1 block text-red-600">{errors.trackTitle}</span> : null}
            </label>
            <label className="block text-sm">
              <span className="font-medium text-neutral-800">Ссылка на трек в Suno</span>
              <input className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2" value={trackUrl} inputMode="url"
                onChange={(e) => setTrackUrl(e.target.value)} placeholder="https://suno.com/s/…" />
              {errors.trackUrl ? <span className="mt-1 block text-red-600">{errors.trackUrl}</span> : null}
            </label>
          </div>

          {(["generation", "paid_period"] as const).map((kind) => {
            const ex = RIGHTSHOLDER_EXAMPLES[kind];
            const inputId = `rightsholder-evidence-${kind}`;
            return (
              <div key={kind} className="rounded-xl border border-dashed border-neutral-300 p-4" data-evidence-field={kind}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor={inputId} className="text-sm font-medium text-neutral-800">{ex.label}</label>
                  <button type="button" onClick={() => setExample(ex)}
                    className="min-h-11 rounded-lg px-2 text-sm font-medium text-indigo-700 underline underline-offset-4 hover:text-indigo-900"
                    aria-haspopup="dialog">
                    Посмотреть пример
                  </button>
                </div>
                <p className="mt-1 text-sm text-neutral-600">{ex.hint}</p>
                <input id={inputId} type="file" accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="mt-3 block w-full text-sm"
                  onChange={(e) => setFiles((prev) => ({ ...prev, [kind]: e.target.files?.[0] ?? null }))} />
                <p className="mt-1 text-xs text-neutral-500">PNG, JPG, WEBP или PDF, до 10 МБ</p>
                {errors[kind] ? <p className="mt-1 text-sm text-red-600">{errors[kind]}</p> : null}
              </div>
            );
          })}

          <div className="space-y-3 text-sm">
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
              <span>
                Я принимаю{" "}
                {terms?.url ? <a className="underline" href={terms.url} target="_blank" rel="noreferrer">условия программы АудиоЛад Бизнес</a> : "условия программы АудиоЛад Бизнес"}
                {terms ? ` (редакция ${terms.version})` : ""}
                {errors.acceptTerms ? <span className="block text-red-600">{errors.acceptTerms}</span> : null}
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={confirmRights} onChange={(e) => setConfirmRights(e.target.checked)} />
              <span>
                Я подтверждаю{" "}
                {rights?.url ? <a className="underline" href={rights.url} target="_blank" rel="noreferrer">заявление о правах на музыку</a> : "заявление о правах на музыку"}
                {rights ? ` (редакция ${rights.version})` : ""}
                {errors.confirmRights ? <span className="block text-red-600">{errors.confirmRights}</span> : null}
              </span>
            </label>
          </div>

          {errors.form ? <p className="text-sm text-red-600" role="alert">{errors.form}</p> : null}
          <button type="submit" disabled={busy}
            className="min-h-11 w-full rounded-xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto">
            {busy ? "Отправляем…" : status === "rejected" || status === "needs_info" ? "Исправить и отправить снова" : "Отправить на проверку"}
          </button>
        </form>
      ) : null}

      <ExampleLightbox example={example} onClose={closeExample} />
    </section>
  );
}
