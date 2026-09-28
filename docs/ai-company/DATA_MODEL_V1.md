# Company Core Data Model v1

The company state must not live only in chat history.

PostgreSQL is the source of persistent operational state for Company Core.

## Core entities

### agents

Logical employees/roles.

Minimum fields:
- id
- slug
- role
- status
- autonomy_level
- current_task_id
- last_heartbeat_at
- enabled
- created_at
- updated_at

### tasks

A unit of work.

Minimum fields:
- id
- external_key
- title
- strategic_goal_id
- status
- priority
- producer_agent_id
- result_consumer_agent_id
- human_gate
- blocked_reason
- expected_output
- consumer_need
- next_action
- github_issue_url
- created_at
- updated_at

### task_runs

Each execution attempt.

Minimum fields:
- id
- task_id
- agent_id
- execution_level (L0/L1/L2)
- status
- started_at
- finished_at
- model/provider metadata
- input_artifact_id
- output_artifact_id
- error_summary
- cost_id

### agent_events

Immutable operational event stream.

Examples:
- task_created
- task_started
- handoff_created
- consumer_accepted
- consumer_returned
- human_gate_requested
- approval_granted
- approval_denied
- pr_created
- checks_passed
- deployment_observed
- knowledge_version_changed
- heartbeat
- failure

### decisions

Important company/product/architecture decisions.

Fields include:
- decision owner
- context
- options
- recommendation
- final decision
- human_gate
- source task
- decided_at

### artifacts

Durable references to produced work:
- report
- specification
- PR
- code diff
- QA result
- research output
- daily brief
- weekly review
- canonical source document
- normalized knowledge document

Store references/metadata, not arbitrary secrets.

### approvals

Sensitive action approvals.

Minimum:
- action_type
- requested_by
- requested_at
- approver_identity
- approved/denied
- decided_at
- target reference
- audit metadata

### costs

Operational cost ledger.

Track at least:
- task_run
- agent
- provider
- model
- token/input/output usage where available
- external API cost
- infrastructure allocation if known
- currency
- amount
- recorded_at

### heartbeats

Runtime health / liveness.

Track:
- service/worker identity
- observed_at
- state
- version/build
- current task
- health metadata

### knowledge_documents

Canonical Company/Product documents.

Minimum fields:
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
- created_at
- updated_at

### knowledge_sections

Retrievable sections of canonical knowledge.

Minimum fields:
- id
- document_id
- section_key
- heading_path
- content
- ordinal
- content_hash
- retrieval/index metadata
- created_at

### task_knowledge_refs

Explicit evidence of which canonical knowledge governed a task.

Minimum fields:
- task_id
- document_id
- section_id
- reason
- created_at

## Design principles

- UUID primary keys.
- UTC timestamps.
- append-only events where possible.
- explicit task state transitions.
- approvals auditable.
- external IDs stored separately from internal IDs.
- canonical knowledge is versioned; old versions are never silently overwritten.
- no private keys, passphrases or raw long-lived credentials in DB records intended for application-level access.
- secrets belong in the deployment secret store/environment, not task artifacts or knowledge documents.

## Source-of-truth split

GitHub remains the code/work collaboration system for Issues, PRs and checks.

Company DB owns:
- runtime state;
- agent state;
- task execution history;
- approvals;
- event history;
- cost accounting;
- heartbeats;
- dashboard read model;
- knowledge index and task-to-knowledge references.

Private canonical source artifacts remain authoritative for Company/Product Bibles. The DB is their retrieval/index layer.

GitHub references are synchronized into Company Core rather than replacing Company DB.
