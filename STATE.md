# coffee «Документы» – logo splash on document open

## Root cause
`src/app/business-app/documents/page.tsx` rendered every document card (offer + CLIENT_DOCUMENTS) as a plain
`<a href="/documents/…" target="_blank" rel="noopener noreferrer">`. The coffee cabinet is installed as a PWA
(`display: "standalone"`, business manifest with the leather-lotus icon on a cream background,
see `src/lib/business-app/brand-icons.ts`). In standalone mode `target="_blank"` to an in-scope URL makes the
OS open a NEW app window/instance, which shows the PWA launch screen (manifest icon + background colour) and
does a full cold load (session bootstrap) before the document renders. That is the "exit and re-enter" splash.
Not a loading.tsx, not cross-origin – the hrefs are same-origin `/documents/<id>` and `/documents/business-offer`.
It also left the hall player behind in the other window.

## Fix
Document cards, "Все документы" back links and offer annex links are now `next/link` (no target):
soft client navigation inside the same `business-app/layout.tsx`, so no new window, no splash, and the
layout-mounted player keeps playing. Hrefs unchanged (consent/legal targets identical).
Out of scope, unchanged: checkout/profile consent links (`target=_blank` keeps the payment form) and guest start CTA.

## Status
Branch fix/coffee-docs-no-splash. No migration. Not merged, not deployed. Rollback = prod 55e164c8.
