# AI Company Dashboard v1

## Purpose

Create a founder-facing control panel inside Audiolad Admin at:

`/admin/company`

The dashboard is the human-readable company cockpit for Sergey.

The browser does **not** talk directly to GitHub or agent workers. It reads a normalized Company API backed by Company Core.

Working name in Russian UI: **ИИ Компания**.

## Primary screen: "Компания сейчас"

### 1. Company Core Health

Show:
- Core status;
- API status;
- Orchestrator status;
- Scheduler status;
- active/idle workers;
- last heartbeat;
- queue depth;
- last GitHub sync/event;
- infrastructure/AI spend summary.

### 2. Strategic Goal

Show:
- active main goal;
- nearest checkpoint;
- progress/status;
- current bottleneck;
- last meaningful movement.

Initial goal:
**Аудиолад Бизнес — первая полностью работающая платящая бизнес-точка.**

### 3. Agents

One card per active agent:
- role/name;
- state: Working / Waiting / Review / Blocked / Human Gate / Idle;
- current task;
- since when;
- next consumer;
- latest completed result;
- current weekly improvement goal;
- last heartbeat.

Initial roles:
Orchestrator, Research, Product, UX, Engineering, QA, Analytics, Marketing & Sales.

### 4. Work in progress

Compact lanes/counts:
Idea / Research / Ready / In Progress / Review / Human Gate / Ready to Release / Production / Measuring / Done.

Show only meaningful active items by default, with drill-down.

### 5. Human Gates

Dedicated high-visibility block:
- decision title;
- why it matters;
- recommended option;
- requested approver;
- audit state.

If empty: **Решений от Сергея сейчас не требуется.**

### 6. Blockers / AI Andon

Show active stopped-flow events:
- problem;
- impact;
- owner;
- required action;
- age.

### 7. Ready to Release

PRs that passed checks/QA and await the configured human gate.

### 8. Last 24 hours

Meaningful results, not commits:
- delivered/accepted results;
- releases;
- measured outcomes;
- major learnings;
- failed/retried runs;
- material cost events.

### 9. Next 24 hours

What Orchestrator plans to advance autonomously.

## Secondary views

### Agents

Weekly performance per agent:
- self / consumer / orchestrator scores;
- First Pass Acceptance;
- clarification/rework signals;
- improvement goals;
- learning log highlights.

No ranking between agents.

### Flow

Visualize handoff quality and bottlenecks between:
Research -> Product
Product -> Engineering
Product -> Marketing
UX -> Engineering
Engineering -> QA
QA -> Release
Analytics -> Product/Marketing
Marketing -> Product

### Goals

Strategic goals, checkpoints and linked Epics/Issues.

### Costs

Show:
- AI spend by day/week;
- spend by agent;
- spend by task/run;
- provider/model split where available;
- infrastructure baseline.

### Daily Brief

Archive of daily 18:30 MSK briefs and Friday Weekly Learning Reviews.

## Data design for v1

Do not create a second independent task-management UI.

Use Company Core as the normalized operational state layer.

Company Core aggregates:
- GitHub Issues / PRs / checks / deploy observations;
- agent/task/task-run state;
- approvals;
- heartbeats;
- costs;
- daily brief/performance records.

The Admin UI reads **Company API only**.

GitHub remains authoritative for code collaboration artifacts; Company DB remains authoritative for agent runtime/execution state.

## Realtime

"Realtime" means event-driven/near-real-time freshness, not a permanently streaming browser connection requirement.

Target v1:
- Company Core consumes events/polls external systems server-side;
- refresh on page focus;
- manual Refresh;
- optional 30–60s polling while page is open;
- timestamps on all status cards.

Later:
- webhooks;
- push updates/SSE if useful;
- richer historical cycle-time metrics.

## Security

- Admin-only.
- No agent secrets/tokens in browser payloads.
- GitHub credentials stay in Company Core/server-side secret storage.
- No direct browser SSH access.
- Human Gate actions must be auditable.
- Production actions remain protected by existing release policy.
- Company Core and Audiolad production use separate identities/credentials.

## Definition of Done — dashboard MVP

Sergey can open one admin page and answer within ~30 seconds:
1. Is Company Core healthy?
2. Where is the company going?
3. Which agents are working right now?
4. On what?
5. What is blocked?
6. What needs my decision?
7. What became ready/released in the last day?
8. What will happen next?
9. What is the current AI/infrastructure spend?
