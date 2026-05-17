# Trace Design

## Goal

Add minimal end-to-end traceability for the full assessment lifecycle so one user action can be stitched across:

- frontend actions
- API boundaries
- conversation state preparation
- baseline reads/writes
- assessment execution
- behavior event reporting
- team-notify requests

## Trace model

The system now uses a lightweight `TraceContext`:

```ts
interface TraceContext {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  flow: 'assessment' | 'baseline' | 'history' | 'team_notify' | 'behavior_event';
  started_at: string;
}
```

Defined in [src/types/index.ts](../src/types/index.ts).

## Propagation strategy

### Frontend

Frontend creates root traces per user flow and child spans per action:

- assessment conversation: [src/components/chat/ConversationAssessment.tsx](../src/components/chat/ConversationAssessment.tsx)
- history flow: [src/components/App.tsx](../src/components/App.tsx)
- profile / baseline flow: [src/components/profile/ProfilePage.tsx](../src/components/profile/ProfilePage.tsx)
- team notify flow: [src/components/App.tsx](../src/components/App.tsx)

Shared helpers live in [src/lib/trace.ts](../src/lib/trace.ts).

### Client transport

`SabaClient` forwards trace context in request headers:

- `X-Trace-Id`
- `X-Span-Id`
- `X-Parent-Span-Id`
- `X-Trace-Flow`

Implementation: [src/client.ts](../src/client.ts)

### Backend

Workers handler reads incoming trace headers, creates fallback traces if absent, and returns child traces in key responses.

Implementation: [src/api/handler.ts](../src/api/handler.ts)

### Service layer

Assessment pipeline and conversation-state preserve trace through request preparation and assessment finalization.

Key files:

- [src/services/assess-pipeline.ts](../src/services/assess-pipeline.ts)
- [src/services/conversation-state.ts](../src/services/conversation-state.ts)

## Current traced flows

### 1. Assessment flow

- root trace created in conversation UI
- passed into `AssessRequest.trace`
- forwarded through `client.ts`
- read by `/api/v1/assess`
- child trace attached to `AssessResponse.trace`

### 2. Baseline flow

- profile page baseline read/write creates `baseline` trace
- conversation baseline submit also creates `baseline` trace
- `/api/v1/baseline` returns child trace in response

### 3. History flow

- history page uses `history` trace for list load and detail load
- returned assessment summaries/details include child trace where available

### 4. Behavior event flow

- behavior event calls create child spans of the current user flow
- `/api/v1/events` returns trace context for correlation

### 5. Team notify flow

- team notify request uses `team_notify` trace
- `/api/v1/team/notify` returns a child trace in the response

## What this enables

With `trace_id`, you can correlate:

1. user submitted assessment
2. baseline was saved or fetched
3. assessment API executed
4. result was produced or clarification returned
5. behavior events were emitted
6. team notify request was created

This is enough to diagnose issues like:

- baseline saved but not used on next assess
- history detail opened but wrong result shown
- result displayed but event tracking missing
- notify request created without associated assessment flow

## Current limits

1. D1 tables do not yet persist trace fields as first-class columns.
2. dev-api is not fully aligned with Workers trace behavior yet.
3. there is no dedicated trace query/debug endpoint yet.
4. console logs are not yet standardized around trace ids.

## Recommended next steps

1. persist `trace_id` / `span_id` in assessment, baseline, event, and notify storage
2. add a dev-only `/api/v1/debug/trace/:trace_id` endpoint
3. standardize structured logs around trace ids
4. add trace assertions in integration tests
