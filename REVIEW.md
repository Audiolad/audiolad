# Independent review – PR #1161 (fresh checkout /workspace/coffee-docs-review, diff + spec only)
Verdict: APPROVE, no blockers.
- Root cause matches spec: target=_blank in standalone PWA spawns a new app window -> launch splash. Removed on all document cards.
- Soft nav via next/link stays inside business-app/layout.tsx -> player not unmounted. Same pattern already used by the playback-report next/form (action="/documents"), so host rewrite /documents -> /business-app/documents works for client navigation.
- Hrefs unchanged (clientDocumentHref(id), BUSINESS_OFFER_HREF, annex.href) -> consent/legal targets identical.
- No visible text added; no em dash in diff. No CTA colour change. No migration, no secrets/PII.
- Non-blocking: payment/profile consent links still use target=_blank on purpose (keeps the checkout form); could show the splash too – follow-up if owner wants.
