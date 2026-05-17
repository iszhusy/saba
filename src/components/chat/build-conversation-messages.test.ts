import { describe, expect, it } from 'vitest';
import { buildMessagesFromAssessmentDetail } from './build-conversation-messages';
import type { AssessmentDetail } from '../../types/index';

describe('buildMessagesFromAssessmentDetail', () => {
  it('rebuilds user and assistant bubbles from persisted assessment fields', () => {
    const detail = {
      assessment_id: 'a-1',
      user_id: 'user-123',
      raw_input: '今天开始恶心',
      immediate_action: '建议先观察并记录进食情况。',
      risk_level: 'low',
      risk_score: 20,
      triggered_rules: [],
      metadata: {
        processing_time_ms: 1,
        model_version: 'test',
        rules_version: '1.0.0',
      },
    } as AssessmentDetail;

    const messages = buildMessagesFromAssessmentDetail(detail);
    expect(messages.some((m) => m.role === 'user' && m.text.includes('恶心'))).toBe(true);
    expect(messages.some((m) => m.role === 'assistant' && m.text.includes('建议先观察'))).toBe(true);
  });
});
