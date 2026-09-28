# AI Company Dashboard v1

## Purpose

Create a founder-facing control panel inside Audiolad Admin.

GitHub remains the work engine/source for tasks and PR state. The dashboard is the human-readable company cockpit for Sergey.

Working name in Russian UI: **ИИ Компания**.

## Primary screen: "Компания сейчас"

### 1. Strategic Goal
Show:
- active main goal;
- nearest checkpoint;
- progress/status;
- current bottleneck;
- last meaningful movement.

Initial goal:
**Аудиолад Бизнес — первая полностью работающая платящая бизнес-точка.**

### 2. Agents
One card per active agent:
- role/name;
- state: Working / Waiting / Review / Blocked / Human Gate / Idle;
- current task;
- since when;
- next consumer;
- latest completed result;
- current weekly improvement goal.

Initial roles:
Orchestrator, Research, Product, UX, Engineering, QA, Analytics, Marketing & Sales.

### 3. Work in progress
Compact lanes/counts:
Idea / Research / Ready / In Progress / Review / Human Gate / Ready to Release / Production / Measuring / Done.

Show only meaningful active items by default, with drill-down.

### 4. Human Gates
Dedicated high-visibility block:
- decision title;
- why it matters;
- recommended option;
- A/B/Discuss action links where feasible.

If empty: **Решений от Сергея сейчас не требуется.**

### 5. Blockers / AI Andon
Show active stopped-flow events:
- problem;
- impact;
- owner;
- required action;
- age.

### 6. Ready to Release
PRs that passed checks/QA and await the configured human gate.

### 7. Last 24 hours
Meaningful results, not commits:
- delivered/accepted results;
- releases;
- measured outcomes;
- major learnings.

### 8. Next 24 hours
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

### Daily Brief
Archive of daily 18:30 MSK briefs and Friday Weekly Learning Reviews.

## Data design for v1

Do not create a second independent task system.

Use a normalized server-side read model that aggregates:
- GitHub Issues / PRs / checks / deploy state;
- Audiolad agent-runtime state when available;
- stored daily brief/performance records.

The UI reads the normalized read model.

## Realtime

"Realtime" means event-driven/short-poll freshness, not a permanently streaming UI requirement.

Target v1:
- refresh on page focus;
- manual Refresh;
- optional 30–60s polling while the page is open;
- timestamps on all status cards.

Later:
- webhook/event ingestion;
- live agent heartbeats;
- historical cycle-time metrics.

## Security

- Admin-only.
- No agent secrets/tokens in browser payloads.
- GitHub credentials stay server-side.
- Human Gate actions must be auditable.
- Production actions remain protected by existing release policy.

## Definition of Done — dashboard MVP

Sergey can open one admin page and answer within ~30 seconds:
1. Where is the company going?
2. Which agents are working right now?
3. On what?
4. What is blocked?
5. What needs my decision?
6. What became ready/released in the last day?
7. What will happen next?
