# AI Runtime

Python runtime for governed model calls, retrieval, generation, evaluation, and traces. It returns results through controlled APIs and events; it does not write business state directly.

## Integrated modules

- `model-gateway`: provider adapters, enabled deployment routing, Prompt versions, tool policy, budget settlement and AI Trace emission.
- `content-ai`: topic planning, drafting, revision, visual planning and platform adaptation. Human approval remains in Java.
- `customer-service-ai`: evidence-grounded answer candidates, voice-turn streaming, fact candidates, quiz generation and advisory grading.

Retrieval, memory and MCP are ports, not mandatory storage choices. Until configured, their adapters return `DEPENDENCY_NOT_CONNECTED`; they must not return invented knowledge or successful index states.
