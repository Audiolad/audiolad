"use client";

import { useCallback, useMemo, useState } from "react";

import SunoLinkHowTo from "@/components/author-dashboard/business/SunoLinkHowTo";
import ExampleLightbox from "@/components/author-dashboard/business/ExampleLightbox";
import ConsentDocumentLink from "@/components/author-dashboard/business/ConsentDocumentLink";
import EvidenceFileField, { useEvidencePreviews } from "@/components/author-dashboard/business/EvidenceFileField";
import {
  EVIDENCE_COPY,
  type EvidenceUploadState,
  type StoredEvidenceFile,
} from "@/lib/business-rightsholder/evidence-display";
import {
  VERIFICATION_STATUS_TEXT,
  validateEvidenceFile,
  type RightsholderEvidenceKind,
  type RightsholderExample,
} from "@/lib/business-rightsholder/examples";
import { SUPPORT_MODE_CONSENT_NOTICE } from "@/lib/author-support/consent-guard";
import { createClient } from "@/lib/supabase/client";
import {
  PROVIDERS,
  PROVIDER_ORDER,
  buildDraftDetails,
  evidenceKindsToUpload,
  validateProviderValues,
  type RightsholderProvider,
} from "@/lib/business-rightsholder/providers";

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
  trackUrl: string | null;
  aiService: RightsholderProvider;
  aiServiceOther: string | null;
  providerDetails: Record<string, string>;
  attempts: number;
} | null;

type Props = {
  products: OwnProduct[];
  documents: ProgramDocument[];
  existing: ExistingVerification;
  /** Files of the latest submitted attempt (signed URLs), shown when the form is reopened. */
  storedEvidence?: StoredEvidenceFile[];
};

type Kinds<T> = Record<RightsholderEvidenceKind, T>;
const NO_UPLOADS: Kinds<EvidenceUploadState> = { generation: null, paid_period: null };

const EDITABLE = new Set(["draft", "needs_info", "rejected"]);
const EVIDENCE_BUCKET = "business-rightsholder-evidence";

async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export default function RightsholderVerificationForm({ products, documents, existing, storedEvidence = [] }: Props) {
  const [productId, setProductId] = useState(existing?.productId ?? products[0]?.id ?? "");
  const [audioItemId, setAudioItemId] = useState(existing?.audioItemId ?? products[0]?.tracks[0]?.id ?? "");
  const [trackTitle, setTrackTitle] = useState(existing?.trackTitle ?? "");
  const [trackUrl, setTrackUrl] = useState(existing?.trackUrl ?? "");
  const [provider, setProvider] = useState<RightsholderProvider>(existing?.aiService ?? "suno");
  const [fields, setFields] = useState<Record<string, string>>(() => ({
    ...(existing?.providerDetails ?? {}),
    ...(existing?.aiServiceOther ? { ai_service_other: existing.aiServiceOther } : {}),
  }));
  const [files, setFiles] = useState<Kinds<File | null>>({ generation: null, paid_period: null });
  const [uploads, setUploads] = useState<Kinds<EvidenceUploadState>>(NO_UPLOADS);
  const { previews, setPreview, clearPreviews } = useEvidencePreviews();
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
  const cfg = PROVIDERS[provider];
  const values = { provider, trackTitle, trackUrl, fields, files };
  // Stored files belong to the provider they were submitted with.
  const storedFor = (kind: RightsholderEvidenceKind) =>
    existing && existing.aiService === provider ? storedEvidence.find((e) => e.kind === kind) ?? null : null;

  function selectFile(kind: RightsholderEvidenceKind, file: File | null) {
    setPreview(kind, file);
    setFiles((prev) => ({ ...prev, [kind]: file }));
    setUploads((prev) => ({ ...prev, [kind]: null }));
    setErrors((prev) => {
      if (!prev[kind]) return prev;
      const next = { ...prev };
      delete next[kind];
      return next;
    });
  }

  // After a successful submit (or for a closed case) the chosen / stored files stay visible read-only.
  const submittedSlots = cfg.evidence.filter((slot) => files[slot.kind] || storedFor(slot.kind));

  function validate() {
    const next: Record<string, string> = {};
    if (!productId || !audioItemId) next.track = "Выберите свой опубликованный трек";
    Object.assign(next, validateProviderValues(values, validateEvidenceFile));
    if (!acceptTerms) next.acceptTerms = "Отметьте согласие с условиями";
    if (!confirmRights) next.confirmRights = "Подтвердите права на музыку";
    if (!terms || !rights) next.form = "Документы программы ещё не опубликованы – отправка временно недоступна";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate() || !terms || !rights) return;
    setBusy(true);
    setUploads(NO_UPLOADS);
    let uploadingKind: RightsholderEvidenceKind | null = null;
    try {
      const supabase = createClient();
      const details = buildDraftDetails(values);
      const draft = await supabase.rpc("author_business_verification_draft_v2", {
        p_product_id: productId,
        p_audio_item_id: audioItemId,
        p_ai_service: provider,
        p_ai_service_other: details.aiServiceOther,
        p_service_track_title: trackTitle.trim(),
        p_service_track_url: details.serviceTrackUrl,
        p_provider_details: details.providerDetails,
      });
      if (draft.error) throw draft.error;
      const verificationId = draft.data as string;
      const evidenceIds: string[] = [];
      for (const kind of evidenceKindsToUpload(values)) {
        const file = files[kind]!;
        uploadingKind = kind;
        setUploads((prev) => ({ ...prev, [kind]: { phase: "uploading" } }));
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
        setUploads((prev) => ({ ...prev, [kind]: { phase: "uploaded" } }));
        uploadingKind = null;
      }
      const submitted = await supabase.rpc("author_business_verification_submit_v2", {
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
      const failedKind = uploadingKind;
      if (failedKind) setUploads((prev) => ({ ...prev, [failedKind]: { phase: "error", message: EVIDENCE_COPY.uploadFailed } }));
      const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
      setErrors({
        form: message.includes("support_mode_consent_forbidden")
          ? SUPPORT_MODE_CONSENT_NOTICE
          : `Не получилось отправить: ${message}. Проверьте данные и попробуйте ещё раз.`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold text-neutral-900">Подтверждение правообладателя</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Один пример на весь аккаунт: выберите один свой опубликованный продукт и трек и покажите, как он создан. Это не подтверждает права на весь каталог. При необходимости любой конкретный трек может быть проверен отдельно.
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

      {!editable && submittedSlots.length > 0 ? (
        <div className="mt-4 space-y-3" data-evidence-readonly>
          <p className="text-sm font-medium text-neutral-800">Файлы заявки</p>
          {submittedSlots.map(({ kind, example: ex }) => (
            <EvidenceFileField
              key={`readonly-${kind}`}
              kind={kind}
              inputId={`rightsholder-evidence-readonly-${kind}`}
              label={ex.label}
              required={false}
              hint={ex.hint}
              file={files[kind]}
              previewUrl={previews[kind] ?? null}
              stored={files[kind] ? null : storedFor(kind)}
              upload={files[kind] ? { phase: "uploaded" } : null}
              readOnly
            />
          ))}
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

          <fieldset className="space-y-2" data-provider-choice>
            <legend className="text-sm font-medium text-neutral-800">Где сделана музыка</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {PROVIDER_ORDER.map((id) => (
                <label key={id} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${provider === id ? "border-neutral-900 bg-neutral-50" : "border-neutral-300"}`}>
                  <input type="radio" name="rightsholder-provider" value={id} checked={provider === id}
                    onChange={() => { setProvider(id); setFiles({ generation: null, paid_period: null }); clearPreviews(); setUploads(NO_UPLOADS); setErrors({}); }} />
                  <span>{PROVIDERS[id].label}</span>
                </label>
              ))}
            </div>
            <p className="text-sm text-neutral-600" data-provider-intro={provider}>{cfg.intro}</p>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-neutral-800">{cfg.titleLabel}</span>
              <input className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2" value={trackTitle}
                onChange={(e) => setTrackTitle(e.target.value)} placeholder={cfg.titlePlaceholder} />
              {errors.trackTitle ? <span className="mt-1 block text-red-600">{errors.trackTitle}</span> : null}
            </label>
            <div className="text-sm">
              <label className="block">
                <span className="font-medium text-neutral-800">{cfg.link.label}</span>
                <input className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2" value={trackUrl ?? ""} inputMode="url"
                  onChange={(e) => setTrackUrl(e.target.value)} placeholder={cfg.link.placeholder} />
                <span className="mt-1 block text-xs text-neutral-500">{cfg.link.hint}</span>
                {errors.trackUrl ? <span className="mt-1 block text-red-600">{errors.trackUrl}</span> : null}
              </label>
              {provider === "suno" ? <SunoLinkHowTo /> : null}
            </div>
          </div>

          {cfg.fields.map((f) => {
            const id = `rightsholder-field-${f.key}`;
            const common = {
              id,
              className: "mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2",
              value: fields[f.key] ?? "",
              placeholder: f.placeholder,
              "aria-required": f.required,
            };
            return (
              <div key={`${provider}-${f.key}`} className="text-sm" data-provider-field={f.key}>
                <label htmlFor={id} className="font-medium text-neutral-800">
                  {f.label}{f.required ? " *" : ""}
                </label>
                {f.multiline ? (
                  <textarea {...common} rows={3} onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))} />
                ) : (
                  <input {...common} onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))} />
                )}
                <span className="mt-1 block text-xs text-neutral-500">{f.hint}</span>
                {errors[`field:${f.key}`] ? <span className="mt-1 block text-red-600">{errors[`field:${f.key}`]}</span> : null}
              </div>
            );
          })}

          {cfg.evidence.map(({ kind, required, example: ex }) => (
            <EvidenceFileField
              key={`${provider}-${kind}`}
              kind={kind}
              inputId={`rightsholder-evidence-${kind}`}
              label={ex.label}
              required={required}
              hint={ex.hint}
              onShowExample={() => setExample(ex)}
              file={files[kind]}
              previewUrl={previews[kind] ?? null}
              stored={storedFor(kind)}
              upload={uploads[kind]}
              error={errors[kind]}
              disabled={busy}
              onSelect={(file) => selectFile(kind, file)}
            />
          ))}

          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <input id="rightsholder-accept-terms" type="checkbox" className="mt-1 h-5 w-5" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
              <span>
                <label htmlFor="rightsholder-accept-terms">Я принимаю</label>{" "}
                <ConsentDocumentLink documentKey="business_program_terms" dbVersion={terms?.version} dbUrl={terms?.url}>условия программы АудиоЛад Бизнес</ConsentDocumentLink>
                {errors.acceptTerms ? <span className="block text-red-600">{errors.acceptTerms}</span> : null}
              </span>
            </div>
            <div className="flex items-start gap-3">
              <input id="rightsholder-confirm-rights" type="checkbox" className="mt-1 h-5 w-5" checked={confirmRights} onChange={(e) => setConfirmRights(e.target.checked)} />
              <span>
                <label htmlFor="rightsholder-confirm-rights">Я подтверждаю</label>{" "}
                <ConsentDocumentLink documentKey="business_music_rights_declaration" dbVersion={rights?.version} dbUrl={rights?.url}>заявление о правах на музыку</ConsentDocumentLink>
                {errors.confirmRights ? <span className="block text-red-600">{errors.confirmRights}</span> : null}
              </span>
            </div>
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
