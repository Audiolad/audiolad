# Company Knowledge v1

## Purpose

Audiolad AI Company must not rely on chat history as its source of truth.

Every agent receives authoritative context from a versioned Company Knowledge layer before it starts meaningful work.

## Context hierarchy

Each task is assembled from three levels:

### Level 1 — Company

Always available:
- Audiolad AI Company operating model;
- Golden Path / Result Contract;
- Human Gates;
- security model;
- active Strategic Goals;
- agent role/permissions;
- current company-wide architecture decisions.

### Level 2 — Product

Only the relevant product knowledge is injected.

Examples:
- Audiolad Business Product Bible;
- core Audiolad Bible;
- MAX product rules;
- Sergey & Zoya product rules.

Product Bibles outrank ordinary Issues and task-local assumptions.

If a task conflicts with a canonical Bible, trigger **AI Andon** and stop until the conflict is resolved or the Bible is explicitly changed through the appropriate Human Gate.

### Level 3 — Task

Only the context required for the current work:
- Issue / Task Packet;
- linked Issues;
- relevant PRs;
- research/artifacts;
- analytics;
- decisions;
- acceptance criteria;
- consumer/handoff context.

Do not inject months of unrelated chat history into every agent.

## Canonical document storage

The full internal Bibles must live in a **private Company Knowledge store**, not in the public Audiolad repository.

Recommended v1 location:
- private Company Core repository under `knowledge/`, or
- a dedicated private `Audiolad/company-knowledge` repository when convenient.

The public `Audiolad/audiolad` repository contains only:
- operating contracts;
- non-secret cross-project architecture;
- knowledge manifests/pointers that are safe to expose;
- Issues/PRs referencing canonical knowledge by document/version ID.

## Source + machine-readable representation

For every canonical Bible keep:

1. **Source artifact**
   - original DOCX/PDF supplied/approved by Sergey;
   - immutable versioned copy.

2. **Normalized text representation**
   - Markdown preferred;
   - stable headings/anchors;
   - suitable for retrieval and agent context assembly.

3. **Knowledge manifest**
   - document_id
   - title
   - product/scope
   - version
   - status: draft / canonical / superseded
   - approved_by
   - approved_at
   - source_artifact reference
   - normalized_artifact reference
   - checksum
   - supersedes version
   - effective_from

The normalized version must preserve the source meaning; agents must not silently rewrite the Bible while converting formats.

## Initial canonical sources

### Company

Document:
**Audiolad AI Company**

Role:
Defines governance, Orchestrator, agent operating model, Result Contract, Human Gates, learning/performance system, Golden Path, GitHub Operating System and Company MVP.

### Product

Document:
**Audiolad Business Bible**

Role:
Canonical product truth for Audiolad Business, including product meaning, ecosystem/personas, sound system, UX surfaces, rights, proof-of-play, creator economy, business model, international architecture, market/technology direction and non-negotiable principles.

## Retrieval rule

Before work starts, the Context Assembler resolves:
- active Strategic Goal;
- producer agent;
- relevant product/area;
- canonical Company docs;
- canonical Product Bible/version;
- task-local evidence.

It returns a compact context bundle with citations/anchors back to canonical documents.

## Required task metadata

Every significant task must record:

- Knowledge Scope
- Canonical Product Bible
- Bible Version
- Relevant Sections / Anchors
- Source Decision IDs where applicable

For generic company tasks the Product Bible may be `None`, but Company operating rules are still mandatory.

## Required agent checks

Before execution:

> Which canonical documents govern this task?

> Which Bible sections are directly relevant?

> Does the requested work conflict with any approved principle?

Before handoff:

> Did the result remain consistent with the canonical Company and Product knowledge?

The handoff records:

**Bible Compliance:** PASS / ANDON

If ANDON, include the conflict and required decision owner.

## Versioning

Never overwrite a canonical Bible without preserving history.

A new approved revision:
1. receives a new version;
2. records what changed;
3. marks the prior version superseded;
4. invalidates/reindexes affected retrieval chunks;
5. emits a `knowledge_version_changed` event;
6. asks Orchestrator to identify active tasks potentially affected by the change.

## Runtime indexing

Company Core may create retrieval/index representations for fast agent access.

Recommended persistent entities:

### knowledge_documents
- id
- document_key
- title
- scope
- product
- version
- status
- checksum
- source_artifact_id
- normalized_artifact_id
- approved_by
- approved_at
- effective_from
- supersedes_id

### knowledge_sections
- id
- document_id
- section_key / heading path
- content
- ordinal
- content_hash
- embedding/index metadata when used

### task_knowledge_refs
- task_id
- document_id
- section_id
- reason / relevance

The database index is a retrieval layer. It does **not** replace the canonical source artifact/version.

## Security

Internal Bibles are confidential Company Knowledge.

Do not publish full internal Bibles to the public repository.

Agents receive only the documents/sections they are authorized to read.

Knowledge access is auditable.

Secrets/credentials must never be embedded in Bibles or retrieval chunks.

## Definition of Done — Knowledge v1

Knowledge v1 is operational when:

1. the two initial approved documents are stored privately as versioned canonical sources;
2. normalized Markdown/text versions exist;
3. manifests/checksums identify the exact active versions;
4. Company DB can resolve canonical documents and sections;
5. Orchestrator/Context Assembler can build Company → Product → Task context;
6. every task records the Bible/version used;
7. agent handoff includes Bible Compliance;
8. Bible changes can identify affected active tasks.
