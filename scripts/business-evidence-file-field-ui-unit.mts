// Evidence file fields (Скриншот генерации / Квитанция о подписке): preview, status,
// «Заменить» / «Удалить», stored files on reopen, Jazz & Coffee tokens, en dashes only.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import * as fieldModule from "../src/components/author-dashboard/business/EvidenceFileField";
import * as formModule from "../src/components/author-dashboard/business/RightsholderVerificationForm";
import {
  EVIDENCE_COPY,
  EVIDENCE_SIGNED_URL_TTL_SECONDS,
  evidenceDoneText,
  formatEvidenceDate,
  formatEvidenceSize,
  parseAttemptEvidence,
} from "../src/lib/business-rightsholder/evidence-display";
import { validateEvidenceFile } from "../src/lib/business-rightsholder/examples";

// tsx ESM↔CJS interop: default export may arrive wrapped once.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unwrap = (m: any): any => (typeof m.default === "function" ? m.default : m.default?.default);
const Field = unwrap(fieldModule);
const Form = unwrap(formModule);
const read = (p: string) => readFileSync(p, "utf8");

// 1. Copy helpers.
assert.equal(evidenceDoneText("image/png"), "✓ Скриншот загружен");
assert.equal(evidenceDoneText("image/webp", true), "✓ Скриншот загружен ранее");
assert.equal(evidenceDoneText("application/pdf"), "✓ PDF загружен");
assert.equal(EVIDENCE_COPY.loading, "Загружается…");
assert.equal(EVIDENCE_COPY.replace, "Заменить");
assert.equal(EVIDENCE_COPY.remove, "Удалить");
assert.equal(formatEvidenceSize(19_381), "19 КБ");
assert.equal(formatEvidenceSize(2.5 * 1024 * 1024), "2,5 МБ");
assert.equal(formatEvidenceSize(0), "");
assert.equal(formatEvidenceDate("2026-10-14T21:30:00Z"), "15.10.2026", "dates are shown in Moscow time");
assert.equal(formatEvidenceDate("nope"), "");
assert.equal(validateEvidenceFile(new File([new Uint8Array(11 * 1024 * 1024)], "big.png", { type: "image/png" })),
  "Файл больше 10 МБ – сожмите его или сделайте скриншот");

// 2. Attempt snapshot parsing: latest row per kind, junk ignored.
const parsed = parseAttemptEvidence({
  evidence: [
    { kind: "generation", object_path: "u/v/old", mime_type: "image/png", size_bytes: 10, created_at: "2026-10-01T00:00:00Z" },
    { kind: "generation", object_path: "u/v/new", mime_type: "image/webp", size_bytes: 20, created_at: "2026-10-02T00:00:00Z" },
    { kind: "paid_period", object_path: "u/v/pdf", mime_type: "application/pdf", size_bytes: 30, created_at: "2026-10-02T00:00:00Z" },
    { kind: "paid_period", object_path: "u/v/exe", mime_type: "application/x-msdownload", size_bytes: 1 },
    { kind: "other", object_path: "u/v/x", mime_type: "image/png" },
    null,
    { kind: "generation", mime_type: "image/png" },
  ],
});
assert.deepEqual(parsed.map((e) => [e.kind, e.objectPath, e.mimeType, e.sizeBytes]), [
  ["generation", "u/v/new", "image/webp", 20],
  ["paid_period", "u/v/pdf", "application/pdf", 30],
]);
assert.deepEqual(parseAttemptEvidence(null), []);
assert.deepEqual(parseAttemptEvidence({ evidence: "x" }), []);

// 3. Field states (server render = first paint).
const base = { kind: "generation", inputId: "f", label: "Скриншот генерации", required: true, hint: "h", onShowExample: () => {} };
const render = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(Field, { ...base, file: null, ...props }));
const png = new File([new Uint8Array(2048)], "Снимок экрана.png", { type: "image/png" });
const pdf = new File([new Uint8Array(4096)], "receipt.pdf", { type: "application/pdf" });

const empty = render({});
assert.match(empty, /data-biz-theme="jazz-coffee"/);
assert.match(empty, /data-evidence-state="empty"/);
assert.match(empty, />Выбрать файл</);
assert.match(empty, /PNG, JPG, WEBP или PDF, до 10 МБ/);
assert.match(empty, /id="f" type="file" accept="image\/png,image\/jpeg,image\/webp,application\/pdf"/);
assert.doesNotMatch(empty, /Удалить|Заменить/);
assert.match(empty, /<label for="f"[^>]*>Скриншот генерации \*<\/label>/);

// Image: thumbnail from the object URL, «Загружается…» until the image decodes.
const img = render({ file: png, previewUrl: "blob:local-1" });
assert.match(img, /<img[^>]*src="blob:local-1"/);
assert.match(img, /Загружается…/);
assert.match(img, /Снимок экрана\.png/);
assert.match(img, /2 КБ/);
assert.match(img, />Заменить</);
assert.match(img, />Удалить</);

// PDF: icon + name, done immediately, honest note that it is sent with the application.
const pdfHtml = render({ file: pdf });
assert.match(pdfHtml, />PDF<\/text>/);
assert.doesNotMatch(pdfHtml, /<img/);
assert.match(pdfHtml, /✓ PDF загружен/);
assert.match(pdfHtml, /data-evidence-status="ok"/);
assert.match(pdfHtml, /Файл отправится на проверку вместе с заявкой/);
assert.match(pdfHtml, /receipt\.pdf/);

// Readable errors: validation, upload failure, form-level message.
const big = render({ file: new File([new Uint8Array(11 * 1024 * 1024)], "big.png", { type: "image/png" }), previewUrl: null });
assert.match(big, /data-evidence-status="error"/);
assert.match(big, /Файл больше 10 МБ – сожмите его/);
assert.match(big, /role="alert"/);
const failed = render({ file: pdf, upload: { phase: "error", message: EVIDENCE_COPY.uploadFailed } });
assert.match(failed, /Не удалось загрузить файл – проверьте интернет/);
const uploading = render({ file: pdf, upload: { phase: "uploading" } });
assert.match(uploading, /Загружается…/);
assert.match(uploading, /animate-spin/);
const uploaded = render({ file: pdf, upload: { phase: "uploaded" } });
assert.match(uploaded, /✓ PDF загружен/);
assert.doesNotMatch(uploaded, /отправится на проверку/);
assert.match(render({ error: "Добавьте файл" }), /Добавьте файл/);
assert.match(render({ disabled: true }), /disabled=""/);

// Stored file (reopened form): signed URL thumbnail, «ранее», «Заменить» only (storage is append-only).
const stored = { kind: "generation", mimeType: "image/png", sizeBytes: 19_381, createdAt: "2026-10-14T15:31:00Z", url: "https://example.test/signed?token=1" };
const reopened = render({ stored });
assert.match(reopened, /<img[^>]*src="https:\/\/example\.test\/signed\?token=1"/);
assert.match(reopened, /✓ Скриншот загружен ранее/);
assert.match(reopened, /от 14\.10\.2026/);
assert.match(reopened, />Заменить</);
assert.doesNotMatch(reopened, />Удалить</);
assert.match(reopened, /выберите файл ещё раз/);
assert.match(reopened, /href="https:\/\/example\.test\/signed\?token=1" target="_blank" rel="noopener noreferrer"/);
const unsigned = render({ stored: { ...stored, url: null } });
assert.match(unsigned, /предпросмотр сейчас недоступен/);
assert.doesNotMatch(unsigned, /<img|<a /);
// A newly chosen file wins over the stored one.
assert.match(render({ stored, file: pdf }), /receipt\.pdf/);

// Read-only (closed case): no input, no actions, no example button.
const ro = render({ stored, readOnly: true });
assert.doesNotMatch(ro, /type="file"|Заменить|Удалить|Посмотреть пример/);
assert.match(ro, /Файл из последней отправленной заявки/);

// 4. Form wiring: one shared field per slot; stored files shown for the submitted provider.
const products = [{ id: "p1", title: "Альбом", tracks: [{ id: "t1", title: "Трек" }] }];
const existing = { status: "needs_info", reason: null, productId: "p1", audioItemId: "t1", trackTitle: "T", trackUrl: "https://suno.com/s/abc", aiService: "suno", aiServiceOther: null, providerDetails: {}, attempts: 1 };
const storedEvidence = [stored, { ...stored, kind: "paid_period", mimeType: "application/pdf" }];
const formHtml = renderToStaticMarkup(createElement(Form, { products, documents: [], existing, storedEvidence }));
assert.equal((formHtml.match(/data-evidence-field="/g) ?? []).length, 2);
assert.equal((formHtml.match(/data-biz-theme="jazz-coffee"/g) ?? []).length, 2);
assert.match(formHtml, /✓ Скриншот загружен ранее/);
assert.match(formHtml, /✓ PDF загружен ранее/);
const otherProvider = renderToStaticMarkup(createElement(Form, { products, documents: [], existing: { ...existing, aiService: "musicgpt" }, storedEvidence }));
assert.match(otherProvider, /data-provider-intro="musicgpt"/);
assert.match(otherProvider, /ранее/, "stored files are shown for the provider of the submitted case");
const closed = renderToStaticMarkup(createElement(Form, { products, documents: [], existing: { ...existing, status: "submitted" }, storedEvidence }));
assert.match(closed, /data-evidence-readonly/);
assert.match(closed, /Файлы заявки/);
assert.doesNotMatch(closed, /type="file"/);
const fresh = renderToStaticMarkup(createElement(Form, { products, documents: [], existing: null }));
assert.equal((fresh.match(/>Выбрать файл</g) ?? []).length, 2);

// 5. Source contracts.
const fieldSrc = read("src/components/author-dashboard/business/EvidenceFileField.tsx");
const formSrc = read("src/components/author-dashboard/business/RightsholderVerificationForm.tsx");
const pageSrc = read("src/app/(platform)/author-dashboard/business/page.tsx");
const helperSrc = read("src/lib/business-rightsholder/evidence-display.ts");
assert.match(fieldSrc, /URL\.createObjectURL\(file\)/);
assert.match(fieldSrc, /URL\.revokeObjectURL\(previous\)/);
assert.match(fieldSrc, /useEffect\(\(\) => \(\) => \{/, "object URLs revoked on unmount");
assert.doesNotMatch(formSrc, /type="file"/, "the form uses the shared field only");
assert.match(formSrc, /<EvidenceFileField/);
// Upload flow unchanged: reserve RPC + storage upload + submit_v2.
assert.match(formSrc, /author_business_evidence_reserve/);
assert.match(formSrc, /storage\.from\(EVIDENCE_BUCKET\)\.upload\(row\.object_path, file, \{ contentType: file\.type \}\)/);
assert.match(pageSrc, /createSignedUrls\(rows\.map\(\(r\) => r\.objectPath\), EVIDENCE_SIGNED_URL_TTL_SECONDS\)/);
assert.match(pageSrc, /business_rightsholder_verification_attempts/);
assert.doesNotMatch(pageSrc, /createServiceRoleClient/, "owner reads with their own session");
assert.match(pageSrc, /import "@\/components\/business-app\/theme\/business-theme\.css";/);
assert.equal(EVIDENCE_SIGNED_URL_TTL_SECONDS, 600);
for (const [name, src] of [["field", fieldSrc], ["form", formSrc], ["helpers", helperSrc], ["page", pageSrc]] as const) {
  assert.doesNotMatch(src, /—/, `${name}: use en dashes (–), never em dashes`);
}
// Every --biz-* token used by the field is defined by the Jazz & Coffee theme block.
const themeCss = read("src/components/business-app/theme/business-theme.css");
const block = themeCss.slice(themeCss.indexOf('[data-biz-theme="jazz-coffee"] {'), themeCss.indexOf("\n}", themeCss.indexOf('[data-biz-theme="jazz-coffee"] {')));
const used = new Set([...fieldSrc.matchAll(/var\((--biz-[a-z0-9-]+)\)/g)].map((m) => m[1]));
assert.ok(used.size >= 10);
for (const t of used) assert.match(block, new RegExp(`\\s${t}:`), `${t} not defined in the jazz-coffee block`);
assert.doesNotMatch(fieldSrc, /#[0-9a-f]{6}\b/i, "no hard-coded colours");

console.log("business-evidence-file-field-ui-unit: ok");
