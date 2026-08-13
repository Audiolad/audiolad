# SEO operational data

This directory is the versioned operational source for article publication.
It is deliberately outside `tmp/` so SEO work remains independent of other
worktrees.

## Files

- `SEO_OPERATIONAL_MASTER.json` — current registry reconciliation, a
  conservative Next Queue, and Practice Forecast.
- `VERIFIED_AUDIT.json` — per-article validation ledger.
- `RECONCILIATION_REPORT.md` — provenance, counts, and known reconciliation
  limits.

## Data rules

- The production-compatible article registry is the source of truth for
  `PUBLISHED` articles.
- Historical snapshot data can confirm individual metadata fields only; it
  must not overwrite current publication, queue, or forecast status.
- `ID_PENDING_RECONCILIATION` is explicit unknown data, not an article ID.
- `RECONSTRUCTED_FROM_PRODUCTION` is not `VALIDATE PASS`. Replace it only
  after a recorded publication smoke check.
- Add an article to Next Queue only from a committed plan or research artifact
  that records its stable ID, primary query, frequency evidence, hub, and
  practice mapping.

## Article IDs

- Historical `ART_planXX` IDs are preserved without changes.
- An article absent from the historical Editorial Master receives an immutable
  ID in the form `ART_new_<YYYYMMDD>_<slug>`, using its first Operational
  Master entry date and final Latin SEO slug.
- Never reuse an ID. A merged, held, cancelled, or deleted article retains its
  original ID; only its status changes.
- Do not reconstruct an unknown historical ID retroactively without evidence.

Run `npx tsx scripts/seo-operational-master-unit.mts` after any update.
