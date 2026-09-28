import assert from "node:assert/strict";

import {
  isAiCompanyIssue,
  parseAiCompanyContract,
  requiresHumanGate,
} from "../src/lib/ai-company/contract";

const body = `<!-- ai-company-task:v1 -->

## Status
In Progress

## Priority
P1

## Strategic Goal
Первая платящая бизнес-точка

## Why
Проверить поток.

## Ideal Outcome Scene
Клиент получает результат.

## Expected Output
Рабочая функция.

## Deliverable Format
Draft PR.

## Producer
Engineering

## Result Consumer
QA

## Consumer Need
Проверить функцию.

## Acceptance Criteria
- PASS

## Market / Reference Check
BENCHMARK & BUILD

## Human Gate
None

## Blocked
No

## Next Action
QA review
`;

const parsed = parseAiCompanyContract(body);
assert.equal(parsed.status, "In Progress");
assert.equal(parsed.priority, "P1");
assert.equal(parsed.producer, "Engineering");
assert.equal(parsed.resultConsumer, "QA");
assert.equal(parsed.nextAction, "QA review");
assert.equal(isAiCompanyIssue("Обычное название", body), true);
assert.equal(isAiCompanyIssue("[AI] Test", ""), true);
assert.equal(requiresHumanGate("None"), false);
assert.equal(requiresHumanGate("Sergey"), true);

const issueFormBody = `### Status

Ready

### Strategic Goal

North Star

### Result Consumer

Product
`;

assert.equal(parseAiCompanyContract(issueFormBody).status, "Ready");
assert.equal(isAiCompanyIssue("Task", issueFormBody), true);

console.log("ai-company-contract-unit: ok");
