# Task Contract v1

A task may enter Ready only when it has a useful result, a consumer, a strategic connection and known governing knowledge.

## Required Task Packet

### Strategic Goal
What company goal does this advance?

### Why
Why does the task exist now?

### Ideal Outcome Scene
In plain human language: if this works perfectly, what happens in the real user's life?

### Contribution
How does this task move the Strategic Goal?

### Governing Knowledge
Which canonical Company/Product documents govern this task?

Record:
- Knowledge Scope
- Canonical Product Bible
- Bible Version
- Relevant Sections / Anchors
- Source Decision IDs where applicable

### Market / Reference Check
Who already solves this well? Buy / Integrate / Benchmark & Build / Build?

### Task
What is the smallest complete unit of work?

### Expected Output
What exact result must be produced?

### Deliverable Format
Code, report, UX flow, benchmark, PR, analysis, etc.

### Producer
Which agent produces the result?

### Result Consumer
Who uses it next?

### Consumer Need
What must the consumer be able to do because of this result?

### Acceptance Criteria
Observable checks for completion.

### Dependencies
Required prior work/decisions.

### Human Gate
None / Sergey / Oriy.

### Next Action
What should happen after acceptance?

## Before execution

The agent must answer:

> Which canonical documents govern this task?

> Which sections are directly relevant?

> Does the requested work conflict with any approved principle?

If there is a material conflict with a canonical Bible, trigger AI Andon.

## Best Result Check

Before work:
> How can I perform this task in the best way for the strategic goal, real user and next consumer, with maximum value and minimum necessary complexity?

Before handoff:
> Is this the best result I can reasonably pass on, or is there an obvious improvement that materially helps the consumer?

## Handoff

Every meaningful handoff records:
- Task
- Strategic Goal
- Ideal Outcome Scene
- Governing Bible/version
- Relevant knowledge refs
- Expected Output
- Actual Result
- Deliverables
- Result Consumer
- Consumer Need
- Acceptance Criteria status
- Bible Compliance: PASS / ANDON
- Best Result Check
- Risks
- Open Questions
- Next Action

## Acceptance

The consumer responds ACCEPT or RETURN.

A task is not truly complete at "produced". The flow is:

Produced -> Verified -> Accepted -> Used.

## Performance record

For significant tasks capture:
- Self score 1–5 + reason
- Consumer score 1–5 + reason
- Orchestrator score 1–5 + reason
- Objective evidence
- Lesson
- Improvement candidate
