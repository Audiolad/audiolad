# AI Company Command Center

## Назначение
`/admin/ai-company` — read-only управленческое табло Сергея.

GitHub остаётся source of truth. Command Center не создаёт вторую систему задач.

## v1 показывает
- North Star / Strategic Goal;
- Ready / Active / Human Gate / Blocked;
- первый штат агентов и их текущее состояние;
- AI Company Issues;
- Human Gates;
- Next Action;
- открытые PR;
- время последнего чтения GitHub.

Данные читаются сервером из GitHub с коротким cache window.

## Почему read-only сначала
Сначала доказываем корректность потока:

`Goal → Issue → Agent → Handoff → Consumer → QA → Outcome`.

Только после стабильной работы добавляем действия из интерфейса, чтобы не получить два расходящихся источника истины.

## v2
После первого автономного цикла можно добавить:
- timeline handoffs;
- Agent Performance cards;
- Friday Learning Review;
- flow/lead-time графики;
- bottleneck history;
- Human Gate decisions;
- запуск/пауза задач через Orchestrator.
