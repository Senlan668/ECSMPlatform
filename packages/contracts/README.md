# Shared Contracts

Put versioned API definitions, event schemas, error codes, and telemetry contracts here. Do not add database entities, repositories, or domain business logic.

Current cross-runtime contracts:

- `api/ai-task.v1.schema.json`: trusted Java control-plane task envelope for Python runtimes.
- `api/ai-task-result.v1.schema.json`: validated Python result or classified failure.
- `observability/ai-trace.v1.schema.json`: content-free execution trace based on IDs and hashes.
- `events/knowledge-release-published.v1.schema.json`: immutable knowledge release event with an optional, rebuildable index projection.

The caller cannot supply a trusted tenant context directly from a browser request. The Java control plane resolves authorization and injects `tenant_context` before dispatch. Python workers return candidates only; the control plane validates the schema and state transition before creating a business version.
