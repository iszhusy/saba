import { describe, expect, it } from 'vitest';
import type { AssessResponse, ClarificationQuestion } from '../types/index.js';
import { runAssessPipeline } from './assess-pipeline.js';
import { ConversationStateService } from './conversation-state.js';
import { MemoryEpisodeRepository, MemorySessionRepository } from '../dev-api/memory-conversation-store.js';
import { MemoryPatientBaselineRepository } from '../dev-api/memory-patient-baseline-store.js';

function clarificationResponse(questions: ClarificationQuestion[]): AssessResponse {
  return {
    user_id: 'baseline-user',
    risk_level: 'low',
    risk_score: 0,
    immediate_action: '请先补充治疗背景。',
    triggered_rules: [],
    metadata: {
      processing_time_ms: 1,
      model_version: 'test',
      rules_version: '1.0.0',
    },
    executive_summary: {
      status: 'clarification_required',
      summary: '缺少基线信息',
      final_mode: 'clarify',
      decision_mode: 'insufficient',
    },
    clarification_questions: questions,
  };
}

function completedResponse(): AssessResponse {
  return {
    user_id: 'baseline-user',
    risk_level: 'medium',
    risk_score: 42,
    immediate_action: '请联系医生团队确认。',
    triggered_rules: [{ id: 'R1', name: '恶心持续', confidence: 1, source: 'rule' }],
    metadata: {
      processing_time_ms: 1,
      model_version: 'test',
      rules_version: '1.0.0',
    },
    executive_summary: {
      status: 'completed',
      summary: '信息已足够',
      final_mode: 'conclusive_assessment',
      decision_mode: 'conclusive',
    },
  };
}

describe('runAssessPipeline baseline refresh', () => {
  it('re-reads saved baseline before persisting clarification state', async () => {
    const baselineRepo = new MemoryPatientBaselineRepository();
    const stateService = new ConversationStateService({
      sessionRepo: new MemorySessionRepository(),
      episodeRepo: new MemoryEpisodeRepository(),
      baselineRepo,
    });

    const responses = [
      clarificationResponse([
        { question_id: 'baseline_treatment_category', text: '治疗类型？' },
        { question_id: 'baseline_treatment_anchor', text: '治疗时间？' },
      ]),
      completedResponse(),
    ];

    const executive = {
      async execute() {
        const next = responses.shift();
        if (!next) {
          throw new Error('Unexpected extra execute call');
        }
        return next;
      },
    };

    await baselineRepo.upsert({
      user_id: 'baseline-user',
      treatment_category: 'chemotherapy',
      treatment_anchor: '化疗第2周期第3天',
      updated_at: new Date().toISOString(),
    });

    const result = await runAssessPipeline({
      request: {
        user_id: 'baseline-user',
        input: '还是恶心，今天更明显',
      },
      stateService,
      executive: executive as never,
    });

    expect(result.executive_summary?.status).toBe('completed');
    expect(result.assessment_id).toBeTruthy();
    expect(result.conversation_context?.baseline_complete).toBe(true);
  });
});
