# Trace Query Workflow

## Debug endpoint

The system now exposes a trace query endpoint:

- Workers: `GET /api/v1/debug/trace/:trace_id`
- dev-api: `GET /api/v1/debug/trace/:trace_id`

The response shape is `TraceChainSnapshot` from [src/types/index.ts](../src/types/index.ts).

## What the endpoint returns

For a single `trace_id`, the endpoint stitches together:

- `assessments`
- `behavior_events`
- `baselines`
- `notifications`
- derived ids:
  - `session_ids`
  - `episode_ids`
  - `assessment_ids`

This lets you answer questions like:

- was baseline actually written?
- did the next assess read and produce a result under the same trace?
- did behavior events fire for this same chain?
- was a team notify request created from the same flow?

## Main implementation points

### Workers
- route registration: [src/api/handler.ts](../src/api/handler.ts)
- handler: `handleGetTraceChain`
- trace aggregation repository: [src/storage/repository.ts](../src/storage/repository.ts)

### dev-api
- route registration and local in-memory stitching: [src/dev-api/middleware.ts](../src/dev-api/middleware.ts)

## Storage participation

The trace query depends on trace persistence in:

- assessments: [src/storage/repository.ts](../src/storage/repository.ts)
- behavior events: [src/storage/repository.ts](../src/storage/repository.ts)
- baselines: [src/storage/patient-baseline-repository.ts](../src/storage/patient-baseline-repository.ts)
- notifications: [src/storage/conversation-repository.ts](../src/storage/conversation-repository.ts)

Schema fields are defined in [src/storage/schema.sql](../src/storage/schema.sql).

## Example workflow

1. user starts an assessment
2. frontend creates root trace context
3. request/response and child events propagate same `trace_id`
4. user saves baseline
5. later the engineer queries:

```text
GET /api/v1/debug/trace/<trace_id>
```

6. response shows the full chain for that flow

## Current limit

The trace endpoint is currently a debug-oriented internal interface. It is intended for investigation and developer tooling, not end-user product UI.
