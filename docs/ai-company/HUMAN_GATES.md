# Human Gates v1

## Sergey required

Agents must stop and escalate before approving:
- business-model changes;
- prices, payouts or royalty rules;
- major strategic direction changes;
- launch of a new major product line;
- material spending commitments;
- legal/commercial obligations or strategic partnerships.

## Sergey or Oriy required

Agents must stop and escalate before:
- fundamental architecture changes;
- new core domain entities with broad consequences;
- changes to approved product Bibles;
- critical or irreversible migrations/data changes;
- material production-risk changes;
- changes to the Human Gate policy itself.

## Privileged infrastructure gate

Explicit approval is required before:
- granting sudo/root-equivalent capability to an agent;
- granting Docker socket access;
- changing host firewall/network exposure;
- rotating or distributing administrative SSH credentials;
- destructive Company DB operations;
- giving Company Core broad shell access to Audiolad production;
- changing secret-management policy;
- increasing infrastructure spend beyond approved bounds.

These actions must use dedicated identities and produce an auditable approval/event record.

## Autonomous by default

Within approved strategy and guardrails, agents may:
- research;
- benchmark existing market solutions;
- prepare product/UX specifications;
- create Issues and Task Packets;
- implement code;
- write/update tests;
- create Draft PRs;
- perform QA;
- write documentation;
- run analytics;
- prepare marketing/sales research and draft assets;
- perform non-privileged Company Core L0 health/state processing.

## v1 release boundary

MERGE = NO by default.  
DEPLOY = NO by default.

An agent may advance work to Ready to Release with evidence (checks, QA, migration/risk summary), but production release requires the configured Human Gate.
