import type {
  AssessmentDetail,
  BehaviorEventRequest,
  TraceChainSnapshot,
  TraceContext,
} from '../types/index.js';

export function traceIdOf(trace?: TraceContext): string | undefined {
  return trace?.trace_id;
}

export function matchesTraceId(trace: TraceContext | undefined, traceId: string): boolean {
  return trace?.trace_id === traceId;
}

export function buildTraceChainSnapshot(params: {
  traceId: string;
  assessments: AssessmentDetail[];
  behavior_events: Array<BehaviorEventRequest & { event_id: string; created_at: string }>;
}): TraceChainSnapshot {
  const sessionIds = [
    ...new Set(
      params.assessments
        .map((item) => item.session_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const episodeIds = [
    ...new Set(
      params.assessments
        .map((item) => item.episode_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const assessmentIds = [
    ...new Set(
      params.assessments
        .map((item) => item.assessment_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  return {
    trace_id: params.traceId,
    assessments: params.assessments,
    behavior_events: params.behavior_events,
    baselines: [],
    notifications: [],
    session_ids: sessionIds,
    episode_ids: episodeIds,
    assessment_ids: assessmentIds,
  };
}
