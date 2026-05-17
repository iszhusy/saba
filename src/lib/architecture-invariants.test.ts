import { describe, expect, it } from 'vitest';
import { checkAssessResponseArchitecture } from './architecture-invariants.js';
import type { AssessResponse, AssessRequest } from '../types/index.js';

const baseRequest: AssessRequest = {
  user_id: 'arch-test',
  input: '测试',
};

function createResponse(partial: Partial<AssessResponse>): AssessResponse {
  return {
    user_id: baseRequest.user_id,
    risk_level: 'low',
    risk_score: 10,
    immediate_action: '观察',
    triggered_rules: [],
    metadata: {
      processing_time_ms: 1,
      model_version: 'test',
      rules_version: '1.0.0',
    },
    ...partial,
  };
}

describe('checkAssessResponseArchitecture', () => {
  it('passes when executive and reasoning surfaces agree on mode', () => {
    const response = createResponse({
      executive_summary: { status: 'clarification_required', summary: '需澄清', final_mode: 'structured_intake' },
      reasoning_surfaces: {
        intent_framing: {
          conversation_goal: 'unclear',
          interaction_mode: 'structured_intake',
          answerability: 'needs_clarification',
          is_possible_emergency: false,
          is_medication_boundary: false,
          is_follow_up: false,
          rationale: '需继续收集信息',
          framing_kind: 'rule_fallback',
        },
      },
    });
    expect(checkAssessResponseArchitecture(response)).toEqual([]);
  });

  it('fails when executive mode and intent surface disagree', () => {
    const response = createResponse({
      executive_summary: { status: 'clarification_required', summary: '需澄清', final_mode: 'clarify' },
      reasoning_surfaces: {
        intent_framing: {
          conversation_goal: 'unclear',
          interaction_mode: 'structured_intake',
          answerability: 'needs_clarification',
          is_possible_emergency: false,
          is_medication_boundary: false,
          is_follow_up: false,
          rationale: '需继续收集信息',
          framing_kind: 'rule_fallback',
        },
      },
    });
    const violations = checkAssessResponseArchitecture(response);
    expect(violations.some((v) => v.code === 'arch_mode_surface_mismatch')).toBe(true);
  });

  it('fails when reasoning_surfaces is missing', () => {
    const response = createResponse({
      executive_summary: { status: 'completed', summary: '完成', final_mode: 'conclusive_assessment' },
    });
    const violations = checkAssessResponseArchitecture(response);
    expect(violations.some((v) => v.code === 'arch_missing_reasoning_surfaces')).toBe(true);
  });

  it('fails when executive_summary is missing', () => {
    const response = createResponse({
      reasoning_surfaces: {
        intent_framing: {
          conversation_goal: 'unclear',
          interaction_mode: 'structured_intake',
          answerability: 'needs_clarification',
          is_possible_emergency: false,
          is_medication_boundary: false,
          is_follow_up: false,
          rationale: '需继续收集信息',
          framing_kind: 'rule_fallback',
        },
      },
    });
    const violations = checkAssessResponseArchitecture(response);
    expect(violations.some((v) => v.code === 'arch_missing_executive_summary')).toBe(true);
  });

  it('fails when legacy response_mode is still present', () => {
    const response = {
      ...createResponse({
        executive_summary: { status: 'completed', summary: '完成', final_mode: 'conclusive_assessment' },
        reasoning_surfaces: {
          intent_framing: {
            conversation_goal: 'symptom_assessment',
            interaction_mode: 'conclusive_assessment',
            answerability: 'ready',
            is_possible_emergency: false,
            is_medication_boundary: false,
            is_follow_up: false,
            rationale: '信息充分',
            framing_kind: 'llm_primary',
          },
        },
      }),
      response_mode: 'conclusive_assessment',
    } as AssessResponse & { response_mode: string };
    const violations = checkAssessResponseArchitecture(response);
    expect(violations.some((v) => v.code === 'arch_legacy_response_mode_present')).toBe(true);
  });

  it('fails when legacy decision_mode is still present', () => {
    const response = {
      ...createResponse({
        executive_summary: {
          status: 'completed',
          summary: '完成',
          final_mode: 'conclusive_assessment',
          decision_mode: 'conclusive',
        },
        reasoning_surfaces: {
          intent_framing: {
            conversation_goal: 'symptom_assessment',
            interaction_mode: 'conclusive_assessment',
            answerability: 'ready',
            is_possible_emergency: false,
            is_medication_boundary: false,
            is_follow_up: false,
            rationale: '信息充分',
            framing_kind: 'llm_primary',
          },
        },
      }),
      decision_mode: 'conclusive',
    } as AssessResponse & { decision_mode: string };
    const violations = checkAssessResponseArchitecture(response);
    expect(violations.some((v) => v.code === 'arch_legacy_decision_mode_present')).toBe(true);
  });
});
