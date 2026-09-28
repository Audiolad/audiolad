# Audiolad AI Company

This directory is the version-controlled operating system for Audiolad AI Company.

## Purpose

Audiolad is built as an AI-native company. Sergey and Oriy define strategy, product principles, architecture and Human Gates. The operating system routes approved work through specialized agents without Sergey acting as a manual message bus.

## Cloud-first operating decision

The permanent runtime of the AI company lives in a dedicated **Audiolad Company Core** cloud environment, separate from Audiolad production.

Sergey's MacBook, phone and other devices are control interfaces only. Company operations must continue when those devices are offline.

Audiolad AI Company is designed as:

**Cloud-first + Event-driven + API-first.**

## Active operating model

- Strategy and product truth live in approved Bibles and strategic-goal records.
- GitHub remains the collaboration/code contour for Issues, PRs and checks.
- Company Core persists runtime state, agent state, events, approvals, heartbeats and costs.
- Orchestrator manages flow, WIP, dependencies and escalations from Company Core.
- Agents produce explicit results for explicit internal consumers.
- Significant work follows: Goal -> Human Outcome -> Market/Reference Check -> Result Contract -> Execution -> Self QA -> Handoff -> Consumer Acceptance -> Measurement -> Learning.
- Production merge/deploy remain human-gated in v1.

## Core documents

- `COMPANY_CORE.md` — cloud runtime architecture.
- `DATA_MODEL_V1.md` — persistent company state.
- `SECURITY_MODEL_V1.md` — identities, least privilege and approvals.
- `ORCHESTRATOR.md` — control-plane behavior.
- `HUMAN_GATES.md` — decisions agents may not take autonomously.
- `TASK_CONTRACT.md` — required task/result/handoff contract.
- `DASHBOARD_V1.md` — founder-facing AI Company dashboard.
- `STRATEGIC_GOALS.md` — current company goals.

## Initial agents

1. Orchestrator
2. Research
3. Product
4. UX
5. Engineering
6. QA
7. Analytics
8. Marketing & Sales

## v1 success criterion

Audiolad AI Company v1 is working when an approved strategic objective can advance for at least one full day without Sergey's laptop or manual task-routing being required, while the system stops only at real Human Gates and produces a useful Daily Brief.
