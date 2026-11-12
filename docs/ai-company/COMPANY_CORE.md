# Audiolad Company Core v1

## Architectural decision

Audiolad AI Company is **Cloud-first, Event-driven and API-first**.

The permanent runtime of the AI company lives on a dedicated cloud host that is physically and logically separate from Audiolad production.

Sergey's MacBook, phone and other personal devices are **control interfaces only**. Turning them off, changing Wi-Fi or using a VPN must not stop company operations.

## Runtime boundary

```
Sergey / Oriy
      |
Company Dashboard
      |
Company API
      |
Company Core
  |-- Orchestrator
  |-- Scheduler
  |-- Worker Pool
  |-- Company DB
  |-- GitHub Integration
  |-- Watchdog / Heartbeats
  |-- Cost Accounting
      |
External systems
  |-- GitHub
  |-- AI model APIs
  |-- Audiolad production APIs
  |-- analytics / research services
```

Audiolad production must not be used as the execution environment for AI agents.

## v1 infrastructure

Start with one dedicated Linux VM and Docker Compose.

Logical services:

- `company-api`
- `orchestrator`
- `scheduler`
- `worker`
- `postgres`
- optional later `redis`
- GitHub integration
- watchdog / heartbeat
- logging
- cost accounting

Do not introduce Kubernetes in v1.

## Agent model

Eight agents are logical roles, not eight servers.

A worker receives a task, invokes the required tools/model, persists the result and releases compute.

Initial roles:

1. Orchestrator
2. Research
3. Product
4. UX
5. Engineering
6. QA
7. Analytics
8. Marketing & Sales

## Event-driven execution

Agents must not repeatedly call LLMs merely to ask whether work exists.

Use three execution levels:

### L0 — deterministic code

Use for:
- event ingestion;
- GitHub polling/webhooks;
- schedules;
- queue state;
- SHA/status checks;
- heartbeat;
- dependency checks;
- retries;
- cost counters;
- approval state.

### L1 — economical model

Use for:
- classification;
- routing;
- short summaries;
- routine normalization;
- low-risk administrative reasoning.

### L2 — strong model

Use for:
- architecture;
- complex coding;
- code review;
- research synthesis;
- product decisions;
- difficult analysis.

The Orchestrator should always prefer the lowest sufficient level.

## Scaling path

Stage 1:
`1 Company Core -> shared worker pool`

Stage 2:
`Company Core -> multiple parallel workers`

Stage 3:
separate code / browser / audio workers.

Later:
GPU workers, extra regions or additional nodes.

The central task/agent/event model must remain stable across these stages.
