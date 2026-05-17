import { describe, expect, it } from 'vitest';
import { createBehaviorEventRequest } from './assessment-observability.js';

describe('createBehaviorEventRequest', () => {
  it('maps the UI payload into the API event contract', () => {
    const request = createBehaviorEventRequest({
      event: 'assessment_submitted',
      userId: 'user-123',
      assessmentId: 'assessment-1',
      sessionId: 'session-1',
      metadata: {
        source: 'conversation',
        input_length: 42,
      },
    });

    expect(request).toEqual({
      event: 'assessment_submitted',
      user_id: 'user-123',
      assessment_id: 'assessment-1',
      session_id: 'session-1',
      metadata: {
        source: 'conversation',
        input_length: 42,
      },
    });
  });

  it('preserves optional identifiers as undefined when absent', () => {
    const request = createBehaviorEventRequest({
      event: 'assessment_started',
      userId: 'user-123',
    });

    expect(request.event).toBe('assessment_started');
    expect(request.user_id).toBe('user-123');
    expect(request.assessment_id).toBeUndefined();
    expect(request.session_id).toBeUndefined();
    expect(request.metadata).toBeUndefined();
  });

  it('supports extended observability metadata', () => {
    const request = createBehaviorEventRequest({
      event: 'assessment_baseline_submitted',
      userId: 'user-123',
      metadata: {
        source: 'conversation',
        treatment_category: 'chemotherapy',
        clarification_question_count: 3,
        baseline_question_count: 2,
      },
    });

    expect(request.metadata).toEqual({
      source: 'conversation',
      treatment_category: 'chemotherapy',
      clarification_question_count: 3,
      baseline_question_count: 2,
    });
  });
});
