# AI Business Control

Java/Spring Boot deployment unit for authoritative task, approval, session, work-order, and audit state.

Its modules are `asset-control`, `content-operations`, and `customer-service`. Model inference stays outside this service.

## Integrated modules

- `asset-control`: asset versions, copyright/retention, ASR and clip-plan tasks, derived-media lineage, sales material metadata.
- `content-operations`: content briefs, immutable content versions, human review, calendar events, media intents, platform variants, publish intents.
- `customer-service`: knowledge releases, text/voice sessions, human handoff, work orders, quizzes, attempts, AI-grade candidates, final human reviews.

This service creates `ai-task.v1` envelopes and validates `ai-task-result.v1`. It never accepts tenant identity from a task payload sent by a browser, and Python workers never write its tables directly.
