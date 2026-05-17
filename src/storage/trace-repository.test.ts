import { describe, expect, it, vi } from 'vitest';
import { TraceRepository } from '../storage/repository.js';
import type { AssessmentDetail } from '../types/index.js';

function createAssessment(traceId: string): AssessmentDetail {
  return {
    assessment_id: 'assessment-1',
    user_id: 'user-1',
    session_id: 'session-1',
    episode_id: 'episode-1',
    risk_level: 'medium',
    risk_score: 42,
    immediate_action: '联系医生',
    triggered_rules: [],
    metadata: {
      model_version: 'test',
      rules_version: '1.0.0',
      processing_time_ms: 1,
    },
    created_at: '2026-05-18T00:00:00.000Z',
    trace: {
      trace_id: traceId,
      span_id: 'span-1',
      flow: 'assessment',
      started_at: '2026-05-18T00:00:00.000Z',
    },
  };
}

describe('TraceRepository', () => {
  it('returns a stitched trace chain snapshot', async () => {
    const traceId = 'trace-123';
    const repo = new TraceRepository({} as never);

    vi.spyOn(TraceRepository.prototype, 'getTraceChain').mockResolvedValue({
      trace_id: traceId,
      assessments: [createAssessment(traceId)],
      behavior_events: [
        {
          event_id: 'event-1',
          event: 'assessment_submitted',
          user_id: 'user-1',
          created_at: '2026-05-18T00:00:01.000Z',
          trace: {
            trace_id: traceId,
            span_id: 'span-2',
            parent_span_id: 'span-1',
            flow: 'behavior_event',
            started_at: '2026-05-18T00:00:01.000Z',
          },
        },
      ],
      baselines: [
        {
          user_id: 'user-1',
          treatment_category: 'chemotherapy',
          treatment_anchor: '化疗第2周期第3天',
          updated_at: '2026-05-18T00:00:02.000Z',
          trace: {
            trace_id: traceId,
            span_id: 'span-3',
            flow: 'baseline',
            started_at: '2026-05-18T00:00:02.000Z',
          },
        },
      ],
      notifications: [
        {
          notification_id: 'notify-1',
          assessment_id: 'assessment-1',
          patient_id: 'user-1',
          notification_type: 'team_contact',
          recipients: ['team_oncall_queue'],
          created_at: '2026-05-18T00:00:03.000Z',
          status: 'queued',
          trace: {
            trace_id: traceId,
            span_id: 'span-4',
            flow: 'team_notify',
            started_at: '2026-05-18T00:00:03.000Z',
          },
        },
      ],
      session_ids: ['session-1'],
      episode_ids: ['episode-1'],
      assessment_ids: ['assessment-1'],
    });

    const chain = await repo.getTraceChain(traceId);

    expect(chain.trace_id).toBe(traceId);
    expect(chain.assessments).toHaveLength(1);
    expect(chain.behavior_events).toHaveLength(1);
    expect(chain.baselines).toHaveLength(1);
    expect(chain.notifications).toHaveLength(1);
    expect(chain.session_ids).toEqual(['session-1']);
    expect(chain.episode_ids).toEqual(['episode-1']);
    expect(chain.assessment_ids).toEqual(['assessment-1']);
  });
});
