import type { TraceContext } from '../types/index';

function randomId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

export function createTraceContext(flow: TraceContext['flow']): TraceContext {
  return {
    trace_id: randomId(),
    span_id: randomId(),
    flow,
    started_at: new Date().toISOString(),
  };
}

export function createChildTraceContext(
  parent: TraceContext,
  flow: TraceContext['flow'] = parent.flow,
): TraceContext {
  return {
    trace_id: parent.trace_id,
    span_id: randomId(),
    parent_span_id: parent.span_id,
    flow,
    started_at: new Date().toISOString(),
  };
}
